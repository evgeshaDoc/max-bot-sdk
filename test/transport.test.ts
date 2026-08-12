import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createServer } from 'node:http';
import test from 'node:test';

import { Api } from '../src/api';
import { createClient } from '../src/core/network/api/client';
import { MaxError, MaxErrorKind } from '../src/core/network/api/error';
import { RawApi } from '../src/core/network/api/raw-api';

type Mode = 'bot' | 'empty' | 'invalid' | 'error400' | 'error500' | 'redirect' | 'slow';

test('real fetch transport covers protocol, HTTP, redirect, abort, timeout, and uploads', async (context) => {
  let mode: Mode = 'bot';
  let authorization: string | undefined;
  let uploadBytes = 0;
  const server = createServer((request, response) => {
    authorization = request.headers.authorization;
    if (request.url === '/upload') {
      request.on('data', (chunk: Buffer) => {
        uploadBytes += chunk.length;
      });
      request.on('end', () => {
        response.end('{"id":9223372036854775807,"token":"uploaded"}');
      });
      return;
    }
    if (request.url === '/uploads?type=file') {
      const address = server.address() as AddressInfo;
      response.end(`{"url":"http://127.0.0.1:${address.port}/upload"}`);
      return;
    }

    if (mode === 'empty') response.end();
    else if (mode === 'invalid') response.end('{');
    else if (mode === 'error400') {
      response.statusCode = 400;
      response.end('not json');
    } else if (mode === 'error500') {
      response.statusCode = 500;
      response.end('{"code":"server.failure","description":"private detail"}');
    } else if (mode === 'redirect') {
      response.statusCode = 302;
      response.setHeader('location', '/me');
      response.end();
    } else if (mode === 'slow') {
      setTimeout(() => response.end('{"user_id":1}'), 100);
    } else {
      response.end('{"user_id":9223372036854775807,"first_name":"Bot",'
        + '"username":"bot","is_bot":true,"name":"Bot"}');
    }
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  context.after(() => new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  }));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;
  const raw = new RawApi(createClient('transport-token', { baseUrl }));

  const bot = await raw.bots.getMyInfo();
  assert.equal(bot.user_id, '9223372036854775807');
  assert.equal(authorization, 'transport-token');

  mode = 'empty';
  await assert.rejects(raw.bots.getMyInfo(), hasKind(MaxErrorKind.Protocol));
  mode = 'invalid';
  await assert.rejects(raw.bots.getMyInfo(), (error) => {
    assert.ok(error instanceof MaxError);
    assert.equal(error.kind, MaxErrorKind.Protocol);
    assert.equal(error.method, 'GET');
    assert.equal(error.path, 'me');
    return true;
  });
  mode = 'error400';
  await assert.rejects(raw.bots.getMyInfo(), hasHttpStatus(400));
  mode = 'error500';
  await assert.rejects(raw.bots.getMyInfo(), (error) => {
    assert.ok(error instanceof MaxError);
    assert.equal(error.kind, MaxErrorKind.Http);
    assert.equal(error.status, 500);
    assert.equal(error.code, 'server.failure');
    assert.doesNotMatch(`${error.message}${JSON.stringify(error)}`, /private detail|transport-token/);
    return true;
  });
  mode = 'redirect';
  await assert.rejects(raw.bots.getMyInfo(), hasKind(MaxErrorKind.Network));

  mode = 'slow';
  const timeoutRaw = new RawApi(createClient('token', { baseUrl, timeoutMs: 10 }));
  await assert.rejects(timeoutRaw.bots.getMyInfo(), hasKind(MaxErrorKind.Timeout));

  const controller = new AbortController();
  const abortClient = createClient('token', { baseUrl });
  const pending = abortClient.call({ path: 'me', options: { signal: controller.signal } });
  controller.abort();
  await assert.rejects(pending, hasKind(MaxErrorKind.Abort));

  mode = 'bot';
  const api = new Api(createClient('token', { baseUrl }));
  const uploaded = await api.upload.file({ source: Buffer.from('payload') });
  assert.equal(uploaded.id, '9223372036854775807');
  assert.equal(uploaded.token, 'uploaded');
  assert.ok(uploadBytes > Buffer.byteLength('payload'));
});

test('mutation failures identify ambiguous delivery without retrying', async () => {
  let calls = 0;
  const networkRaw = new RawApi(createClient('secret-token', {
    fetch: async () => {
      calls += 1;
      throw new TypeError('socket closed with secret-token');
    },
  }));
  await assert.rejects(networkRaw.messages.delete({ message_id: 'm' }), (error) => {
    assert.ok(error instanceof MaxError);
    assert.equal(error.kind, MaxErrorKind.Network);
    assert.equal(error.ambiguousOutcome, true);
    assert.doesNotMatch(error.message, /secret-token|socket closed/);
    assert.equal((error as Error & { cause?: unknown }).cause, 'redacted');
    assert.equal(error.path, 'messages');
    return true;
  });
  assert.equal(calls, 1);

  const protocolRaw = new RawApi(createClient('token', {
    fetch: async () => new Response('{"message":"missing success"}', { status: 200 }),
  }));
  await assert.rejects(protocolRaw.messages.delete({ message_id: 'm' }), (error) => {
    assert.ok(error instanceof MaxError);
    assert.equal(error.kind, MaxErrorKind.Protocol);
    assert.equal(error.ambiguousOutcome, true);
    return true;
  });

  const httpRaw = new RawApi(createClient('token', {
    fetch: async () => new Response('{"code":"failed"}', { status: 500 }),
  }));
  await assert.rejects(httpRaw.messages.delete({ message_id: 'm' }), (error) => {
    assert.ok(error instanceof MaxError);
    assert.equal(error.kind, MaxErrorKind.Http);
    assert.equal(error.ambiguousOutcome, true);
    return true;
  });

  const controller = new AbortController();
  controller.abort();
  let abortedCalls = 0;
  const abortedRaw = new RawApi(createClient('token', {
    signal: controller.signal,
    fetch: async () => {
      abortedCalls += 1;
      return new Response('{"success":true}');
    },
  }));
  await assert.rejects(abortedRaw.messages.delete({ message_id: 'm' }), (error) => {
    assert.ok(error instanceof MaxError);
    assert.equal(error.kind, MaxErrorKind.Abort);
    assert.equal(error.ambiguousOutcome, false);
    return true;
  });
  assert.equal(abortedCalls, 0);

  let serializationCalls = 0;
  const serializationClient = createClient('token', {
    fetch: async () => {
      serializationCalls += 1;
      return new Response('{}');
    },
  });
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  await assert.rejects(serializationClient.call({
    path: 'custom',
    options: { method: 'POST', body: circular },
  }), (error) => {
    assert.ok(error instanceof MaxError);
    assert.equal(error.kind, MaxErrorKind.Protocol);
    assert.equal(error.ambiguousOutcome, false);
    assert.equal(error.path, 'custom');
    return true;
  });
  assert.equal(serializationCalls, 0);

  const unreadable400 = new Response(null, { status: 400 });
  Object.defineProperty(unreadable400, 'text', {
    value: async () => Promise.reject(new TypeError('private body read failure')),
  });
  const unreadableRaw = new RawApi(createClient('token', {
    fetch: async () => unreadable400,
  }));
  await assert.rejects(unreadableRaw.messages.delete({ message_id: 'm' }), (error) => {
    assert.ok(error instanceof MaxError);
    assert.equal(error.kind, MaxErrorKind.Http);
    assert.equal(error.status, 400);
    assert.equal(error.ambiguousOutcome, false);
    assert.equal(error.method, 'DELETE');
    assert.equal(error.path, 'messages');
    return true;
  });

  const invalidTimeout = createClient('token', { fetch: async () => new Response('{}') });
  await assert.rejects(invalidTimeout.call({
    path: 'me',
    options: { timeoutMs: 0 },
  }), (error) => {
    assert.ok(error instanceof MaxError);
    assert.equal(error.kind, MaxErrorKind.Protocol);
    assert.equal(error.method, 'GET');
    assert.equal(error.path, 'me');
    assert.equal(error.ambiguousOutcome, false);
    return true;
  });

  const unreadableUpload = new Response(null, { status: 200 });
  Object.defineProperty(unreadableUpload, 'arrayBuffer', {
    value: async () => Promise.reject(new TypeError('private upload body read failure')),
  });
  const uploadClient = createClient('token', { fetch: async () => unreadableUpload });
  await assert.rejects(uploadClient.request({
    url: 'https://upload.test',
    init: { method: 'POST', body: 'data' },
  }), (error) => {
    assert.ok(error instanceof MaxError);
    assert.equal(error.kind, MaxErrorKind.Protocol);
    assert.equal(error.status, 200);
    assert.equal(error.ambiguousOutcome, true);
    assert.equal(error.path, 'upload');
    return true;
  });
});

function hasKind(kind: MaxErrorKind): (error: unknown) => boolean {
  return (error) => error instanceof MaxError && error.kind === kind;
}

function hasHttpStatus(status: number): (error: unknown) => boolean {
  return (error) => error instanceof MaxError
    && error.kind === MaxErrorKind.Http
    && error.status === status
    && error.ambiguousOutcome === false;
}
