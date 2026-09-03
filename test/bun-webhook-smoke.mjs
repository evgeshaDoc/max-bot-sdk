import assert from 'node:assert/strict';
import { connect } from 'node:net';

import { Bot } from '../dist/bot.js';
import { session } from '../dist/session.js';
import { createWebhookHandler } from '../dist/webhook.js';
import { serveWebhook } from '../dist/webhook-server.js';

const botInfo = '{"user_id":1,"first_name":"Bot","username":"bot",'
  + '"is_bot":true,"name":"Bot"}';
const unsafeBody = '{"update_type":"message_created","timestamp":9223372036854775807,'
  + '"message":{"recipient":{"chat_id":9007199254740993,"chat_type":"chat",'
  + '"user_id":null},"timestamp":9007199254740994,"body":{"mid":"mid",'
  + '"seq":116328147937082782,"text":"hello","attachments":null}}}';

async function initializedBot() {
  const bot = new Bot('token', {
    clientOptions: { fetch: async () => new Response(botInfo) },
  });
  await bot.initialize();
  return bot;
}

async function directHandlerSmoke() {
  const sequences = [];
  const bot = await initializedBot();
  bot.on('message_created', (context) => {
    sequences.push(context.message.body.seq);
  });
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    idleTimeout: 31,
    fetch: createWebhookHandler(bot, { secret: false }),
  });

  try {
    const response = await fetch(`http://127.0.0.1:${server.port}/direct`, {
      method: 'POST',
      body: unsafeBody,
    });
    assert.equal(response.status, 200);
    assert.deepEqual(sequences, ['116328147937082782']);
  } finally {
    await server.stop(false);
  }
}

async function standaloneServerSmoke() {
  const values = new Map();
  const sequences = [];
  const bot = await initializedBot();
  bot.use(session({
    storage: {
      read(key) {
        const value = values.get(key);
        return value && { ...value };
      },
      write(key, value) {
        values.set(key, { ...value });
      },
      delete(key) {
        values.delete(key);
      },
    },
    getSessionKey(context) {
      return context.chatId;
    },
    initial() {
      return { messages: 0 };
    },
  }));
  bot.on('message_created', (context) => {
    sequences.push(context.message.body.seq);
    context.session.messages += 1;
  });

  const controller = new AbortController();
  const server = await serveWebhook(bot, {
    secret: false,
    hostname: '127.0.0.1',
    path: '/max-hook',
    port: 0,
    runtime: 'bun',
    signal: controller.signal,
  });

  assert.equal(server.runtime, 'bun');
  assert.equal((await fetch(new URL('/other', server.url))).status, 404);
  const responses = await Promise.all(Array.from({ length: 20 }, () => fetch(server.url, {
    method: 'POST',
    body: unsafeBody,
  })));
  assert.deepEqual(responses.map((response) => response.status), Array(20).fill(200));
  assert.deepEqual(sequences, Array(20).fill('116328147937082782'));
  assert.equal(values.get('9007199254740993').messages, 20);

  controller.abort();
  await server.finished;
  assert.strictEqual(server.close(), server.finished);
}

await directHandlerSmoke();
await standaloneServerSmoke();

// Opt-in runtime regression: Bun 1.3.14 delivers the status but ignores TCP close here.
async function unreadSocketProbe() {
  let dispatches = 0;
  const bot = await initializedBot();
  bot.use(() => { dispatches += 1; });
  const server = await serveWebhook(bot, {
    hostname: '127.0.0.1', port: 0,
    runtime: process.env.BUN_WEBHOOK_SOCKET_PROBE === 'node' ? 'node' : 'bun',
    secret: 'valid_secret', maxBodyBytes: 512,
  });
  const failures = [];
  try {
    for (const [method, path, secret, size, status] of [
      ['POST', '/wrong', 'valid_secret', 100, 404],
      ['PUT', '/webhook', 'valid_secret', 100, 405],
      ['POST', '/webhook', 'wrong', 100, 401],
      ['POST', '/webhook', 'valid_secret', 513, 413],
    ]) {
      const result = await new Promise((resolve, reject) => {
        const chunks = [];
        const socket = connect(Number(server.url.port), '127.0.0.1', () => {
          socket.write(`${method} ${path} HTTP/1.1\r\nHost: ${server.url.host}\r\n`
            + `X-Max-Bot-Api-Secret: ${secret}\r\nContent-Length: ${size}\r\n`
            + 'Connection: keep-alive\r\n\r\nx');
        });
        let settled = false;
        function finish(closed) {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          socket.destroy();
          resolve({ raw: Buffer.concat(chunks).toString(), closed });
        }
        const timeout = setTimeout(() => finish(false), 1_500);
        socket.on('data', (chunk) => { chunks.push(chunk); });
        socket.once('end', () => finish(true));
        socket.once('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
      assert.match(result.raw, new RegExp(`^HTTP/1\\.1 ${status} `));
      assert.equal(result.raw.slice(result.raw.indexOf('\r\n\r\n') + 4), '');
      if (!result.closed) failures.push(`${status}: TCP connection remained open after 1500ms`);
    }
    assert.equal(dispatches, 0);
  } finally {
    await server.close();
  }
  assert.deepEqual(failures, []);
}

if (process.env.BUN_WEBHOOK_SOCKET_PROBE) await unreadSocketProbe();
