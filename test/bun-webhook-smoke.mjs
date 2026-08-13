import assert from 'node:assert/strict';

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
    fetch: createWebhookHandler(bot),
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
