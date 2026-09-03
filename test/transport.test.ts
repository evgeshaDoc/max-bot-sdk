import assert from 'node:assert/strict';
import fs from 'node:fs';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import type { AddressInfo } from 'node:net';
import { createServer } from 'node:http';
import test from 'node:test';

import { Api } from '../src/api';
import { createClient } from '../src/core/network/api/client';
import { MaxError, MaxErrorKind } from '../src/core/network/api/error';
import { RawApi } from '../src/core/network/api/raw-api';

type Mode = 'bot' | 'empty' | 'invalid' | 'error400' | 'error500' | 'redirect' | 'slow';

test('authenticated calls reject absolute routes and URL parser tricks before fetch', async () => {
  let requests = 0;
  const client = createClient('secret', {
    baseUrl: 'https://api.test/base',
    fetch: async () => { requests += 1; return new Response('{}'); },
  });
  for (const path of [
    'https://attacker.invalid/collect', 'https://api.test/collect', '//attacker.invalid',
    '//api.test/collect', '\\\\attacker.invalid', '/\\attacker.invalid',
    ' https://attacker.invalid', 'https:\\attacker.invalid', 'ht\ntps://attacker.invalid',
  ]) {
    await assert.rejects(client.call({ path, options: {} }), (error) => {
      assert.ok(error instanceof MaxError);
      assert.equal(error.kind, MaxErrorKind.Protocol);
      assert.equal(error.ambiguousOutcome, false);
      return true;
    });
  }
  assert.equal(requests, 0);
  await client.call({ path: '/custom', options: {} });
  assert.equal(requests, 1);
});

test('uploads do not open paths before URL retrieval and close supplied streams on failure', async (context) => {
  const directory = await fs.promises.mkdtemp(join(tmpdir(), 'max-upload-'));
  const file = join(directory, 'payload.txt');
  await fs.promises.writeFile(file, 'payload');
  const opened: fs.ReadStream[] = [];
  const { createReadStream } = fs;
  context.mock.method(fs, 'createReadStream', (...args: Parameters<typeof fs.createReadStream>) => {
    const stream = createReadStream(...args);
    opened.push(stream);
    return stream;
  });
  context.after(async () => {
    for (const stream of opened) stream.destroy();
    await fs.promises.rm(directory, { recursive: true, force: true });
  });
  const api = new Api(createClient('token', {
    fetch: async () => new Response('{}', { status: 500 }),
  }));
  for (let index = 0; index < 3; index += 1) {
    await assert.rejects(api.upload.file({ source: file }), hasKind(MaxErrorKind.Http));
  }
  assert.equal(opened.length, 0);
  const supplied = fs.createReadStream(file);
  await once(supplied, 'open');
  await assert.rejects(api.upload.file({ source: supplied }), hasKind(MaxErrorKind.Http));
  assert.equal(supplied.destroyed, true);
});

test('uploads close streams after success and an aborted upload request', async (context) => {
  const directory = await fs.promises.mkdtemp(join(tmpdir(), 'max-upload-'));
  const file = join(directory, 'payload.txt');
  await fs.promises.writeFile(file, 'payload');
  context.after(() => fs.promises.rm(directory, { recursive: true, force: true }));
  for (const fail of [false, true]) {
    const source = fs.createReadStream(file);
    await once(source, 'open');
    context.after(() => source.destroy());
    const api = new Api(createClient('token', {
      fetch: async (url, init) => {
        if (String(url).includes('/uploads?')) return new Response('{"url":"https://upload.test"}');
        if (fail) {
          await new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
          });
        }
        for await (const chunk of init?.body as unknown as Readable) assert.ok(chunk.length > 0);
        return new Response('{"token":"uploaded"}');
      },
    }));
    const pending = api.upload.file({ source, timeout: 10 });
    if (fail) await assert.rejects(pending, hasKind(MaxErrorKind.Timeout));
    else assert.equal((await pending).token, 'uploaded');
    assert.equal(source.destroyed, true);
  }
});

test('automatic upload URLs require credential-free absolute HTTP(S) destinations', async () => {
  for (const url of [
    'data:text/plain,payload', 'file:///tmp/upload', '/relative',
    'https://user:password@upload.test', 'https://upload.test/#fragment',
  ]) {
    let requests = 0;
    const api = new Api(createClient('token', {
      fetch: async () => {
        requests += 1;
        return new Response(requests === 1 ? JSON.stringify({ url }) : '{"token":"uploaded"}');
      },
    }));
    await assert.rejects(api.upload.file({ source: Buffer.from('private') }), (error) => {
      assert.ok(error instanceof MaxError);
      assert.equal(error.kind, MaxErrorKind.Protocol);
      assert.equal(error.ambiguousOutcome, false);
      return true;
    });
    assert.equal(requests, 1);
  }
});

test('public Client.call preserves custom wire descriptors, parser, and injected fetch', async () => {
  const requests: Array<{ readonly url: string; readonly init?: RequestInit }> = [];
  const fetchMock: typeof fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    return requests.length === 1
      ? new Response('{"object_id":116328147937082782}', { status: 201 })
      : new Response('custom response', { status: 200 });
  };
  const client = createClient('token', {
    baseUrl: 'https://api.test/base',
    fetch: fetchMock,
  });

  const described = await client.call({
    path: 'objects/{object_id}',
    options: {
      method: 'POST',
      path: { object_id: 'a/b' },
      query: { enabled: false, empty: '' },
      body: { object_id: '116328147937082782' },
      requestDescriptor: { object_id: true },
      responseDescriptor: { object_id: true },
    },
  });
  assert.equal(described.status, 201);
  assert.deepEqual(described.data, { object_id: '116328147937082782' });
  assert.equal(requests[0]?.url, 'https://api.test/base/objects/a%2Fb?enabled=false&empty=');
  assert.equal(requests[0]?.init?.body, '{"object_id":116328147937082782}');

  const parsed = await client.call({
    path: 'custom',
    options: {
      parseResponse(text) {
        return { text };
      },
    },
  });
  assert.deepEqual(parsed.data, { text: 'custom response' });
  assert.equal(requests.length, 2);
});

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
