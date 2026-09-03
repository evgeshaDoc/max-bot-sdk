import assert from 'node:assert/strict';
import { Agent, createServer, request as createRequest } from 'node:http';
import { connect } from 'node:net';
import type { AddressInfo } from 'node:net';
import test from 'node:test';

import express from 'express';
import type { NextFunction, Request, Response as ExpressResponse } from 'express';

import { Bot } from '../src/bot';
import type { Int64 } from '../src/core/network/api/types/int64';
import { createWebhookHandler, webhookCallback } from '../src/webhook';
import {
  expressWebhookAdapter,
  nodeHttpWebhookAdapter,
} from '../src/webhook-adapters';
import { WebhookBodyLimitError } from '../src/webhook-body-limit-error';
import type { WebhookAdapter, WebhookAdapterRequest } from '../src/webhook-types';

const botInfo = '{"user_id":1,"first_name":"Bot","username":"bot",'
  + '"is_bot":true,"name":"Bot"}';
const unsafeBody = '{"update_type":"message_created","timestamp":9223372036854775807,'
  + '"message":{"recipient":{"chat_id":9007199254740993,"chat_type":"chat",'
  + '"user_id":null},"timestamp":9007199254740994,"body":{"mid":"mid",'
  + '"seq":116328147937082782,"text":"hello","attachments":null}}}';
const secretHeader = { 'x-max-bot-api-secret': 'valid_secret' };

const emptyExpressBodyLimit = (
  error: unknown,
  _request: Request,
  response: ExpressResponse,
  next: NextFunction,
): void => {
  if (typeof error === 'object'
    && error !== null
    && Reflect.get(error, 'status') === 413) {
    response.status(413).end();
    return;
  }
  next(error);
};

async function createInitializedBot(onSequence?: (sequence: Int64) => void): Promise<Bot> {
  const bot = new Bot('token', {
    clientOptions: { fetch: async () => new Response(botInfo) },
  });
  if (onSequence) {
    bot.on('message_created', (context) => {
      if (context.message.body) onSequence(context.message.body.seq);
    });
  }
  await bot.initialize();
  return bot;
}

function responseAdapter(request: WebhookAdapterRequest): {
  readonly adapter: WebhookAdapter<readonly [], Response>;
  readonly getReads: () => number;
} {
  let reads = 0;
  return {
    adapter: () => ({
      request: {
        ...request,
        readBody(maxBytes) {
          reads += 1;
          return request.readBody(maxBytes);
        },
      },
      respond: (response) => response,
    }),
    getReads: () => reads,
  };
}

async function listen(server: ReturnType<typeof createServer>): Promise<URL> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo;
  return new URL(`http://127.0.0.1:${address.port}/webhook`);
}

function close(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => {
    server.closeIdleConnections();
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function withTimeout<Value>(promise: Promise<Value>, message: string): Promise<Value> {
  let timeout: NodeJS.Timeout | undefined;
  const rejected = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), 1_000);
  });
  try {
    return await Promise.race([promise, rejected]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function postFragmented(url: URL, body: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = createRequest(url, {
      method: 'POST',
      headers: secretHeader,
    }, (response) => {
      response.resume();
      response.once('end', () => resolve(response.statusCode ?? 0));
    });
    request.once('error', reject);
    request.setTimeout(1_000, () => request.destroy(new Error('fragmented request timed out')));
    const split = Math.floor(body.length / 2);
    request.write(body.slice(0, split));
    request.end(body.slice(split));
  });
}

type RawHttpResponse = {
  readonly body: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly status: number;
};

function parseRawResponse(chunks: readonly Buffer[]): RawHttpResponse {
  const raw = Buffer.concat(chunks).toString('latin1');
  const separator = raw.indexOf('\r\n\r\n');
  assert.notEqual(separator, -1);
  const head = raw.slice(0, separator);
  const lines = head.split('\r\n');
  const match = /^HTTP\/1\.1 (\d{3})/.exec(lines[0] ?? '');
  assert.ok(match);
  const headers: Record<string, string> = {};
  for (const line of lines.slice(1)) {
    const colon = line.indexOf(':');
    assert.notEqual(colon, -1);
    headers[line.slice(0, colon).toLowerCase()] = line.slice(colon + 1).trim();
  }
  return {
    body: raw.slice(separator + 4),
    headers,
    status: Number(match[1]),
  };
}

function sendIncompleteRequest(url: URL, rawRequest: string): Promise<RawHttpResponse> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const socket = connect(Number(url.port), url.hostname, () => socket.write(rawRequest));
    socket.on('data', (chunk: Buffer) => chunks.push(chunk));
    socket.once('end', () => resolve(parseRawResponse(chunks)));
    socket.once('error', reject);
  });
}

function closeNaturally(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function keepAlivePost(url: URL, agent: Agent): Promise<RawHttpResponse> {
  return new Promise((resolve, reject) => {
    const request = createRequest(url, {
      agent,
      headers: secretHeader,
      method: 'POST',
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.once('end', () => resolve({
        body: Buffer.concat(chunks).toString(),
        headers: Object.fromEntries(Object.entries(response.headers).flatMap(
          ([name, value]) => (typeof value === 'string' ? [[name, value]] : []),
        )),
        status: response.statusCode ?? 0,
      }));
    });
    request.once('error', reject);
    request.end(unsafeBody);
  });
}

test('processor validates options and applies the complete sanitized outcome table', async () => {
  const bot = await createInitializedBot();
  for (const maxBodyBytes of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => createWebhookHandler(bot, { secret: false, maxBodyBytes }), TypeError);
  }
  assert.doesNotThrow(() => createWebhookHandler(bot, { secret: false, maxBodyBytes: 1 }));

  const wrongMethod = responseAdapter({
    method: 'GET',
    secret: 'valid_secret',
    contentLength: 99,
    readBody: () => unsafeBody,
  });
  const methodResponse = await webhookCallback(
    bot,
    wrongMethod.adapter,
    { secret: 'valid_secret', maxBodyBytes: 1 },
  )();
  assert.equal(methodResponse.status, 405);
  assert.equal(methodResponse.headers.get('allow'), 'POST');
  assert.equal(wrongMethod.getReads(), 0);

  const wrongSecret = responseAdapter({
    method: 'POST',
    secret: 'wrong',
    contentLength: 99,
    readBody: () => unsafeBody,
  });
  assert.equal((await webhookCallback(
    bot,
    wrongSecret.adapter,
    { secret: 'valid_secret', maxBodyBytes: 1 },
  )()).status, 401);
  assert.equal(wrongSecret.getReads(), 0);

  const declaredLarge = responseAdapter({
    method: 'POST',
    secret: null,
    contentLength: 2,
    readBody: () => 'x',
  });
  assert.equal((await webhookCallback(
    bot,
    declaredLarge.adapter,
    { secret: false, maxBodyBytes: 1 },
  )()).status, 413);
  assert.equal(declaredLarge.getReads(), 0);

  const cases: ReadonlyArray<readonly [WebhookAdapterRequest, number]> = [
    [{
      method: 'POST',
      secret: null,
      contentLength: undefined,
      readBody: () => { throw new WebhookBodyLimitError(); },
    }, 413],
    [{
      method: 'POST',
      secret: null,
      contentLength: undefined,
      readBody: () => { throw new Error('private read failure'); },
    }, 500],
    [{
      method: 'POST',
      secret: null,
      contentLength: undefined,
      readBody: () => '{',
    }, 400],
    [{
      method: 'POST',
      secret: null,
      contentLength: undefined,
      readBody: () => '{"update_type":"future_event","unsafe":9223372036854775808}',
    }, 200],
  ];
  for (const [request, expectedStatus] of cases) {
    const configured = responseAdapter(request);
    const response = await webhookCallback(bot, configured.adapter, { secret: false })();
    assert.equal(response.status, expectedStatus);
    assert.equal(await response.text(), '');
  }

  const failingBot = await createInitializedBot();
  failingBot.use(() => { throw new Error('escaped middleware failure'); });
  assert.equal((await createWebhookHandler(failingBot, { secret: false })(new Request('https://bot.test', {
    method: 'POST', body: unsafeBody,
  }))).status, 500);
});

test('Fetch ingress cancels a stream as soon as the actual byte limit is exceeded', async () => {
  const bot = await createInitializedBot();
  let cancelled = 0;
  let pulls = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls += 1;
      controller.enqueue(new Uint8Array(4));
    },
    cancel() {
      cancelled += 1;
    },
  });
  const init: RequestInit & { readonly duplex: 'half' } = {
    method: 'POST', body: stream, duplex: 'half',
  };
  const response = await createWebhookHandler(bot, { secret: false, maxBodyBytes: 5 })(
    new Request('https://bot.test', init),
  );
  assert.equal(response.status, 413);
  assert.equal(cancelled, 1);
  assert.equal(pulls, 2);
});

test('native Node adapter preserves fragmented unsafe int64 and handles client abort', async () => {
  let seenSequence: Int64 | undefined;
  let handled = 0;
  const bot = await createInitializedBot((sequence) => {
    seenSequence = sequence;
    handled += 1;
  });
  const callback = webhookCallback(bot, nodeHttpWebhookAdapter, {
    secret: 'valid_secret',
    maxBodyBytes: 512,
  });
  let abortProcessingHandled: (() => void) | undefined;
  const abortProcessing = new Promise<void>((resolve) => { abortProcessingHandled = resolve; });
  let abortRequestAccepted: (() => void) | undefined;
  const accepted = new Promise<void>((resolve) => { abortRequestAccepted = resolve; });
  let duplicateResponseHandled: ((rejected: boolean) => void) | undefined;
  const duplicateResponse = new Promise<boolean>((resolve) => {
    duplicateResponseHandled = resolve;
  });
  const server = createServer(async (request, response) => {
    if (request.url === '/once') {
      const exchange = nodeHttpWebhookAdapter(request, response);
      const processorResponse = new Response(null, { status: 200 });
      exchange.respond(processorResponse);
      try {
        exchange.respond(processorResponse);
        duplicateResponseHandled?.(false);
      } catch {
        duplicateResponseHandled?.(true);
      }
      return;
    }
    if (request.url === '/abort') abortRequestAccepted?.();
    if (request.url === '/encoded') request.setEncoding('utf8');
    await callback(request, response);
    if (request.url === '/abort') abortProcessingHandled?.();
  });
  const url = await listen(server);
  try {
    assert.equal(await postFragmented(url, unsafeBody), 200);
    assert.equal(seenSequence, '116328147937082782');
    assert.equal(handled, 1);
    assert.equal(await postFragmented(url, 'x'.repeat(600)), 413);
    assert.equal(await postFragmented(new URL('/encoded', url), unsafeBody), 500);
    assert.equal(handled, 1);
    assert.equal((await fetch(new URL('/once', url))).status, 200);
    assert.equal(await withTimeout(duplicateResponse, 'duplicate response check did not settle'), true);

    const abortRequest = createRequest(new URL('/abort', url), {
      method: 'POST',
      headers: { 'content-length': '100' },
    });
    abortRequest.once('error', () => undefined);
    abortRequest.write('{');
    await withTimeout(accepted, 'abort request was not accepted');
    abortRequest.destroy();
    await withTimeout(abortProcessing, 'aborted request processing did not settle');
  } finally {
    await close(server);
  }
});

test('native Node adapter closes unread ingress only after delivering exact responses', async () => {
  const bot = await createInitializedBot();
  const callback = webhookCallback(bot, nodeHttpWebhookAdapter, {
    secret: 'valid_secret',
    maxBodyBytes: 512,
  });
  let connections = 0;
  const server = createServer(async (request, response) => {
    if (request.url === '/encoded') request.setEncoding('utf8');
    await callback(request, response);
  });
  server.on('connection', () => { connections += 1; });
  const url = await listen(server);

  const requestHead = `Host: ${url.host}\r\nConnection: keep-alive\r\n`;
  const cases: ReadonlyArray<readonly [string, number, string | undefined]> = [
    [`GET /webhook HTTP/1.1\r\n${requestHead}Content-Length: 10\r\n\r\nx`, 405, 'POST'],
    [`POST /webhook HTTP/1.1\r\n${requestHead}X-Max-Bot-Api-Secret: wrong\r\n`
      + 'Content-Length: 10\r\n\r\nx', 401, undefined],
    [`POST /webhook HTTP/1.1\r\n${requestHead}X-Max-Bot-Api-Secret: valid_secret\r\n`
      + 'Content-Length: 513\r\n\r\nx', 413, undefined],
    [`POST /webhook HTTP/1.1\r\n${requestHead}X-Max-Bot-Api-Secret: valid_secret\r\n`
      + `Transfer-Encoding: chunked\r\n\r\n201\r\n${'x'.repeat(513)}\r\n`, 413, undefined],
    [`POST /encoded HTTP/1.1\r\n${requestHead}X-Max-Bot-Api-Secret: valid_secret\r\n`
      + 'Transfer-Encoding: chunked\r\n\r\n1\r\n{\r\n', 500, undefined],
  ];

  try {
    for (const [rawRequest, status, allow] of cases) {
      const response = await withTimeout(
        sendIncompleteRequest(url, rawRequest),
        `incomplete request did not receive ${status} and EOF`,
      );
      assert.equal(response.status, status);
      assert.equal(response.body, '');
      assert.equal(response.headers.connection, 'close');
      assert.equal(response.headers.allow, allow);
    }

    const agent = new Agent({ keepAlive: true, maxSockets: 1 });
    const connectionsBeforeAccepted = connections;
    try {
      const first = await keepAlivePost(url, agent);
      const second = await keepAlivePost(url, agent);
      assert.equal(first.status, 200);
      assert.equal(second.status, 200);
      assert.notEqual(first.headers.connection, 'close');
      assert.notEqual(second.headers.connection, 'close');
      assert.equal(connections, connectionsBeforeAccepted + 1);
    } finally {
      agent.destroy();
    }
  } finally {
    await withTimeout(closeNaturally(server), 'unread requests blocked server.close');
  }
});

test('Express route-local raw parser preserves bytes and rejects parsed objects', async () => {
  let seenSequence: Int64 | undefined;
  const bot = await createInitializedBot((sequence) => { seenSequence = sequence; });
  const app = express();
  app.set('env', 'test');
  app.post(
    '/webhook',
    express.raw({ type: 'application/json', limit: 1024 }),
    webhookCallback(bot, expressWebhookAdapter, {
      secret: 'valid_secret', maxBodyBytes: 1024,
    }),
    emptyExpressBodyLimit,
  );
  app.post('/parsed', express.json(), webhookCallback(bot, expressWebhookAdapter, { secret: false }));
  const server = createServer(app);
  const url = await listen(server);
  try {
    const accepted = await fetch(url, {
      method: 'POST',
      headers: { ...secretHeader, 'content-type': 'application/json' },
      body: unsafeBody,
    });
    assert.equal(accepted.status, 200);
    assert.equal(seenSequence, '116328147937082782');

    assert.equal((await fetch(url, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{',
    })).status, 401);
    assert.equal((await fetch(url, {
      method: 'POST',
      headers: { ...secretHeader, 'content-type': 'application/json' },
      body: '{',
    })).status, 400);
    const oversized = await fetch(url, {
      method: 'POST',
      headers: { ...secretHeader, 'content-type': 'application/json' },
      body: 'x'.repeat(1025),
    });
    assert.equal(oversized.status, 413);
    assert.equal(await oversized.text(), '');
    assert.equal((await fetch(new URL('/parsed', url), {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    })).status, 500);
  } finally {
    await close(server);
  }
});

test('webhook authentication requires a secret or an explicit external-auth opt-out', async () => {
  let dispatched = 0;
  const bot = await createInitializedBot(() => { dispatched += 1; });
  assert.throws(() => createWebhookHandler(bot), /secret/u);
  assert.throws(() => createWebhookHandler(bot, { secret: undefined }), /secret/u);
  const authenticated = createWebhookHandler(bot, { secret: 'valid_secret' });
  assert.equal((await authenticated(new Request('https://bot.test', {
    method: 'POST', body: unsafeBody,
  }))).status, 401);
  assert.equal(dispatched, 0);
  const external = createWebhookHandler(bot, { secret: false });
  assert.equal((await external(new Request('https://bot.test', {
    method: 'POST', body: unsafeBody,
  }))).status, 200);
  assert.equal(dispatched, 1);
});

test('Fetch early rejections cancel unread bodies without waiting for cancellation', async () => {
  const bot = await createInitializedBot();
  const handler = createWebhookHandler(bot, { secret: 'valid_secret', maxBodyBytes: 512 });
  const cases = [
    { method: 'PUT', headers: secretHeader, status: 405 },
    { method: 'POST', headers: {}, status: 401 },
    { method: 'POST', headers: { ...secretHeader, 'content-length': '513' }, status: 413 },
  ];
  for (const { method, headers, status } of cases) {
    let cancellations = 0;
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        cancellations += 1;
        return new Promise(() => { /* Cancellation may never settle in an external stream. */ });
      },
    });
    const init: RequestInit & { readonly duplex: 'half' } = {
      method, headers, body, duplex: 'half',
    };
    const response = await withTimeout(
      handler(new Request('https://bot.test', init)),
      'untrusted stream cancellation blocked the response',
    );
    assert.equal(response.status, status);
    assert.equal(cancellations, 1);
    assert.equal(response.headers.get('connection'), 'close');
  }
});
