import assert from 'node:assert/strict';
import nodeHttp, { Agent, createServer, request as createRequest } from 'node:http';
import { connect, type AddressInfo } from 'node:net';
import test from 'node:test';

import { Bot } from '../src/bot';
import type { Int64 } from '../src/core/network/api/types/int64';
import { serveWebhook } from '../src/webhook-server';
import type { WebhookServerRuntime } from '../src/webhook-types';

const botInfo = '{"user_id":1,"first_name":"Bot","username":"bot",'
  + '"is_bot":true,"name":"Bot"}';
const unsafeBody = '{"update_type":"message_created","timestamp":9223372036854775807,'
  + '"message":{"recipient":{"chat_id":9007199254740993,"chat_type":"chat",'
  + '"user_id":null},"timestamp":9007199254740994,"body":{"mid":"mid",'
  + '"seq":116328147937082782,"text":"hello","attachments":null}}}';

async function createInitializedBot(
  onSequence?: (sequence: Int64) => Promise<void> | void,
): Promise<Bot> {
  const bot = new Bot('token', {
    clientOptions: { fetch: async () => new Response(botInfo) },
  });
  if (onSequence) {
    bot.on('message_created', async (context) => {
      if (context.message.body) await onSequence(context.message.body.seq);
    });
  }
  await bot.initialize();
  return bot;
}

function withTimeout<Value>(promise: Promise<Value>, message: string): Promise<Value> {
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      setTimeout(() => reject(new Error(message)), 2_000).unref();
    }),
  ]);
}

function keepAliveRequest(url: URL, agent: Agent): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = createRequest(url, { agent, method: 'POST' }, (response) => {
      response.resume();
      response.once('end', () => resolve(response.statusCode ?? 0));
    });
    request.once('error', reject);
    request.end(unsafeBody);
  });
}

function wrongPathKeepAliveRequest(
  url: URL,
  agent: Agent,
): Promise<{ readonly reusedSocket: boolean; readonly status: number }> {
  return new Promise((resolve, reject) => {
    const request = createRequest(url, { agent }, (response) => {
      response.resume();
      response.once('end', () => resolve({
        reusedSocket: request.reusedSocket,
        status: response.statusCode ?? 0,
      }));
    });
    request.once('error', reject);
    request.end();
  });
}

function sendIncompleteRequest(url: URL, request: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const socket = connect(Number(url.port), url.hostname, () => socket.write(request));
    socket.on('data', (chunk: Buffer) => chunks.push(chunk));
    socket.once('end', () => resolve(Buffer.concat(chunks).toString('latin1')));
    socket.once('error', reject);
  });
}

async function listenOccupiedPort(): Promise<{
  readonly close: () => Promise<void>;
  readonly port: number;
}> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  return {
    port,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }),
  };
}

test('Node server binds port zero and applies exact routing through the canonical processor', async () => {
  const sequences: Int64[] = [];
  const bot = await createInitializedBot((sequence) => { sequences.push(sequence); });
  const server = await serveWebhook(bot, {
    hostname: '127.0.0.1',
    path: '/max-hook',
    port: 0,
    runtime: 'node',
    secret: 'valid_secret',
  });

  try {
    assert.equal(server.runtime, 'node');
    assert.equal(server.url.hostname, '127.0.0.1');
    assert.notEqual(server.url.port, '0');
    assert.equal(server.url.pathname, '/max-hook');
    assert.equal((await fetch(new URL('/max-hook/extra', server.url))).status, 404);
    assert.equal((await fetch(new URL('/other', server.url))).status, 404);
    assert.equal((await fetch(server.url)).status, 405);
    assert.equal((await fetch(server.url, { method: 'POST', body: unsafeBody })).status, 401);
    assert.equal((await fetch(server.url, {
      method: 'POST',
      body: '{',
      headers: { 'x-max-bot-api-secret': 'valid_secret' },
    })).status, 400);

    const responses = await Promise.all(Array.from({ length: 12 }, () => fetch(server.url, {
      method: 'POST',
      body: unsafeBody,
      headers: { 'x-max-bot-api-secret': 'valid_secret' },
    })));
    assert.deepEqual(responses.map((response) => response.status), Array(12).fill(200));
    assert.deepEqual(sequences, Array(12).fill('116328147937082782'));
  } finally {
    await server.close();
  }
});

test('Node wrong-path responses close unread bodies without sacrificing complete keep-alive reuse', async () => {
  const bot = await createInitializedBot();
  const server = await serveWebhook(bot, {
    hostname: '127.0.0.1',
    path: '/max-hook',
    port: 0,
    runtime: 'node',
  });
  const wrongPath = new URL('/wrong', server.url);

  const rawRequest = `POST /wrong HTTP/1.1\r\nHost: ${wrongPath.host}\r\n`
    + 'Connection: keep-alive\r\nContent-Length: 10\r\n\r\nx';
  const rawResponse = await withTimeout(
    sendIncompleteRequest(wrongPath, rawRequest),
    'wrong-path response did not close its unread request',
  );
  const separator = rawResponse.indexOf('\r\n\r\n');
  assert.notEqual(separator, -1);
  assert.match(rawResponse.slice(0, separator), /^HTTP\/1\.1 404 /u);
  assert.match(rawResponse.slice(0, separator), /\r\nConnection: close\r\n/iu);
  assert.equal(rawResponse.slice(separator + 4), '');

  const agent = new Agent({ keepAlive: true, maxSockets: 1 });
  try {
    const first = await wrongPathKeepAliveRequest(wrongPath, agent);
    const second = await wrongPathKeepAliveRequest(wrongPath, agent);
    assert.deepEqual(first, { reusedSocket: false, status: 404 });
    assert.deepEqual(second, { reusedSocket: true, status: 404 });
  } finally {
    agent.destroy();
    await withTimeout(server.close(), 'wrong-path request blocked server close');
  }
});

test('Node outer failures use the adapter for an exact 500 and unread-body cleanup', async () => {
  const nativeCreateServer = nodeHttp.createServer;
  Reflect.set(nodeHttp, 'createServer', (
    listener: nodeHttp.RequestListener,
  ) => nativeCreateServer((request, response) => {
    const nativeEnd = response.end.bind(response);
    let failFirstEnd = true;
    Reflect.set(response, 'end', (...arguments_: Parameters<typeof response.end>) => {
      if (failFirstEnd) {
        failFirstEnd = false;
        throw new Error('test response fault');
      }
      return nativeEnd(...arguments_);
    });
    listener(request, response);
  }));

  const bot = await createInitializedBot();
  const server = await serveWebhook(bot, {
    hostname: '127.0.0.1', port: 0, runtime: 'node',
  });
  Reflect.set(nodeHttp, 'createServer', nativeCreateServer);
  const rawRequest = `GET /webhook HTTP/1.1\r\nHost: ${server.url.host}\r\n`
    + 'Connection: keep-alive\r\nContent-Length: 10\r\n\r\nx';

  try {
    const rawResponse = await withTimeout(
      sendIncompleteRequest(server.url, rawRequest),
      'outer failure did not deliver 500 and close unread input',
    );
    const separator = rawResponse.indexOf('\r\n\r\n');
    assert.notEqual(separator, -1);
    assert.match(rawResponse.slice(0, separator), /^HTTP\/1\.1 500 /u);
    assert.match(rawResponse.slice(0, separator), /\r\nConnection: close\r\n/iu);
    assert.equal(rawResponse.slice(separator + 4), '');
  } finally {
    await withTimeout(server.close(), 'outer failure blocked server close');
  }
});

test('Node and Bun listeners configure at least the MAX delivery timeout window', async () => {
  const bot = await createInitializedBot();
  const nativeCreateServer = nodeHttp.createServer;
  let observedServer: ReturnType<typeof nativeCreateServer> | undefined;
  Reflect.set(nodeHttp, 'createServer', (...arguments_: Parameters<typeof nativeCreateServer>) => {
    observedServer = nativeCreateServer(...arguments_);
    return observedServer;
  });

  try {
    const server = await serveWebhook(bot, {
      hostname: '127.0.0.1', port: 0, runtime: 'node',
    });
    await server.close();
  } finally {
    Reflect.set(nodeHttp, 'createServer', nativeCreateServer);
  }
  assert.ok(observedServer && observedServer.requestTimeout >= 31_000);

  const bunDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'Bun');
  let observedIdleTimeout = 0;
  Object.defineProperty(globalThis, 'Bun', {
    configurable: true,
    value: {
      serve(options: { readonly idleTimeout: number }) {
        observedIdleTimeout = options.idleTimeout;
        return { port: 3000, stop: () => undefined };
      },
    },
  });
  try {
    const server = await serveWebhook(bot, { runtime: 'bun' });
    await server.close();
  } finally {
    if (bunDescriptor) Object.defineProperty(globalThis, 'Bun', bunDescriptor);
    else Reflect.deleteProperty(globalThis, 'Bun');
  }
  assert.ok(observedIdleTimeout >= 31);
});

test('Node server rejects invalid configuration and listen conflicts without returning a handle', async () => {
  const bot = await createInitializedBot();
  const aborted = new AbortController();
  aborted.abort();
  const invalidOptions = [
    { hostname: '' },
    { hostname: 'bad host' },
    { port: -1 },
    { port: 1.5 },
    { port: 65_536 },
    { path: 'webhook' as `/${string}` },
    { path: '/webhook?secret=x' as `/${string}` },
    { path: '/bad path' as `/${string}` },
    { path: '/bad\\path' as `/${string}` },
    { path: '/bad\0path' as `/${string}` },
    { path: '/bad%' as `/${string}` },
    { runtime: 'deno' as WebhookServerRuntime },
    { signal: aborted.signal },
    { maxBodyBytes: 0 },
  ];

  for (const options of invalidOptions) {
    await assert.rejects(serveWebhook(bot, {
      ...options,
      hostname: options.hostname ?? '127.0.0.1',
      port: options.port ?? 0,
      runtime: options.runtime ?? 'node',
    }));
  }

  const occupied = await listenOccupiedPort();
  try {
    await assert.rejects(serveWebhook(bot, {
      hostname: '127.0.0.1',
      port: occupied.port,
      runtime: 'node',
    }), (error: unknown) => {
      assert.equal((error as NodeJS.ErrnoException).code, 'EADDRINUSE');
      return true;
    });
  } finally {
    await occupied.close();
  }
});

test('Node close drains active work and remains idempotent under explicit and signal shutdown', async () => {
  let releaseRequest: (() => void) | undefined;
  const requestReleased = new Promise<void>((resolve) => { releaseRequest = resolve; });
  let markStarted: (() => void) | undefined;
  const requestStarted = new Promise<void>((resolve) => { markStarted = resolve; });
  const bot = await createInitializedBot(async () => {
    markStarted?.();
    await requestReleased;
  });
  const controller = new AbortController();
  const server = await serveWebhook(bot, {
    hostname: '127.0.0.1',
    port: 0,
    runtime: 'node',
    signal: controller.signal,
  });

  const response = fetch(server.url, { method: 'POST', body: unsafeBody });
  await withTimeout(requestStarted, 'request did not enter middleware');
  const close = server.close();
  assert.strictEqual(server.close(), close);
  let closed = false;
  close.then(() => { closed = true; }, () => undefined);
  await new Promise((resolve) => { setImmediate(resolve); });
  assert.equal(closed, false);
  releaseRequest?.();
  assert.equal((await response).status, 200);
  await withTimeout(close, 'server did not drain its active request');
  assert.strictEqual(server.finished, close);

  controller.abort();
  await server.finished;
});

test('Node close waits for middleware after the client disconnects', async () => {
  let releaseRequest: (() => void) | undefined;
  const requestReleased = new Promise<void>((resolve) => { releaseRequest = resolve; });
  let markStarted: (() => void) | undefined;
  const requestStarted = new Promise<void>((resolve) => { markStarted = resolve; });
  const bot = await createInitializedBot(async () => {
    markStarted?.();
    await requestReleased;
  });
  const server = await serveWebhook(bot, {
    hostname: '127.0.0.1', port: 0, runtime: 'node',
  });
  const request = createRequest(server.url, { method: 'POST' });
  request.once('error', () => undefined);
  request.end(unsafeBody);
  await withTimeout(requestStarted, 'request did not enter middleware');
  request.destroy();

  const close = server.close();
  let closed = false;
  close.then(() => { closed = true; }, () => undefined);
  await new Promise((resolve) => { setImmediate(resolve); });
  assert.equal(closed, false);
  releaseRequest?.();
  await withTimeout(close, 'client disconnect left middleware undrained');
});

test('Node close also drains a handler accepted after shutdown observes zero active requests', async () => {
  const nativeCreateServer = nodeHttp.createServer;
  let nativeServer: ReturnType<typeof nativeCreateServer> | undefined;
  Reflect.set(nodeHttp, 'createServer', (...arguments_: Parameters<typeof nativeCreateServer>) => {
    nativeServer = nativeCreateServer(...arguments_);
    return nativeServer;
  });

  let calls = 0;
  let releaseRequest: (() => void) | undefined;
  const requestReleased = new Promise<void>((resolve) => { releaseRequest = resolve; });
  let markStarted: (() => void) | undefined;
  const requestStarted = new Promise<void>((resolve) => { markStarted = resolve; });
  const bot = await createInitializedBot(async () => {
    calls += 1;
    if (calls === 1) return;
    markStarted?.();
    await requestReleased;
  });
  const server = await serveWebhook(bot, {
    hostname: '127.0.0.1', port: 0, runtime: 'node',
  });
  Reflect.set(nodeHttp, 'createServer', nativeCreateServer);
  assert.ok(nativeServer);

  const agent = new Agent({ keepAlive: true, maxSockets: 1 });
  assert.equal(await keepAliveRequest(server.url, agent), 200);

  const nativeClose = nativeServer.close.bind(nativeServer);
  const nativeCloseIdle = nativeServer.closeIdleConnections.bind(nativeServer);
  let closeCallback: ((error?: Error) => void) | undefined;
  Reflect.set(nativeServer, 'close', (callback?: (error?: Error) => void) => {
    closeCallback = callback;
    return nativeServer;
  });
  Reflect.set(nativeServer, 'closeIdleConnections', () => undefined);

  const close = server.close();
  assert.ok(closeCallback);
  const lateRequest = keepAliveRequest(server.url, agent).catch(() => 0);
  await withTimeout(requestStarted, 'late keep-alive request was not accepted');
  Reflect.set(nativeServer, 'close', nativeClose);
  Reflect.set(nativeServer, 'closeIdleConnections', nativeCloseIdle);
  nativeClose(closeCallback);
  nativeCloseIdle();
  agent.destroy();
  await lateRequest;

  let closed = false;
  close.then(() => { closed = true; }, () => undefined);
  await new Promise((resolve) => { setImmediate(resolve); });
  assert.equal(closed, false);
  releaseRequest?.();
  await withTimeout(close, 'late keep-alive handler outlived server close');
});

test('Node close waits for native shutdown after handlers drain first', async () => {
  const nativeCreateServer = nodeHttp.createServer;
  let nativeServer: ReturnType<typeof nativeCreateServer> | undefined;
  Reflect.set(nodeHttp, 'createServer', (...arguments_: Parameters<typeof nativeCreateServer>) => {
    nativeServer = nativeCreateServer(...arguments_);
    return nativeServer;
  });

  let releaseRequest: (() => void) | undefined;
  const requestReleased = new Promise<void>((resolve) => { releaseRequest = resolve; });
  let markStarted: (() => void) | undefined;
  const requestStarted = new Promise<void>((resolve) => { markStarted = resolve; });
  const bot = await createInitializedBot(async () => {
    markStarted?.();
    await requestReleased;
  });
  const server = await serveWebhook(bot, {
    hostname: '127.0.0.1', port: 0, runtime: 'node',
  });
  Reflect.set(nodeHttp, 'createServer', nativeCreateServer);
  assert.ok(nativeServer);

  const response = fetch(server.url, { method: 'POST', body: unsafeBody });
  await withTimeout(requestStarted, 'request did not enter middleware');
  const nativeClose = nativeServer.close.bind(nativeServer);
  const nativeCloseIdle = nativeServer.closeIdleConnections.bind(nativeServer);
  let closeCallback: ((error?: Error) => void) | undefined;
  let closeIdleCalls = 0;
  Reflect.set(nativeServer, 'close', (callback?: (error?: Error) => void) => {
    closeCallback = callback;
    return nativeServer;
  });
  Reflect.set(nativeServer, 'closeIdleConnections', () => { closeIdleCalls += 1; });

  const close = server.close();
  assert.equal(closeIdleCalls, 1);
  releaseRequest?.();
  assert.equal((await response).status, 200);
  await new Promise((resolve) => { setImmediate(resolve); });
  assert.equal(closeIdleCalls, 2);
  let closed = false;
  close.then(() => { closed = true; }, () => undefined);
  await new Promise((resolve) => { setImmediate(resolve); });
  assert.equal(closed, false);

  Reflect.set(nativeServer, 'close', nativeClose);
  Reflect.set(nativeServer, 'closeIdleConnections', nativeCloseIdle);
  nativeClose(closeCallback);
  nativeCloseIdle();
  await withTimeout(close, 'native close callback did not finish shutdown');
});

test('Node close terminates idle keep-alive connections after accepted requests drain', async () => {
  const bot = await createInitializedBot();
  const server = await serveWebhook(bot, {
    hostname: '127.0.0.1',
    port: 0,
    runtime: 'node',
  });
  const agent = new Agent({ keepAlive: true });

  try {
    assert.equal(await keepAliveRequest(server.url, agent), 200);
    await withTimeout(server.close(), 'idle keep-alive connection blocked close');
  } finally {
    agent.destroy();
    await server.close();
  }
});

test('AbortSignal uses the same idempotent Node shutdown completion', async () => {
  const bot = await createInitializedBot();
  const controller = new AbortController();
  const server = await serveWebhook(bot, {
    hostname: '127.0.0.1',
    port: 0,
    runtime: 'node',
    signal: controller.signal,
  });

  controller.abort();
  await withTimeout(server.finished, 'abort did not close the Node listener');
  assert.strictEqual(server.close(), server.finished);
});
