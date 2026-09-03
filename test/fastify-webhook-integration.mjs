import assert from 'node:assert/strict';

import Fastify from 'fastify';

import { Bot } from '../dist/bot.js';
import { webhookCallback } from '../dist/webhook.js';
import { fastifyWebhookAdapter } from '../dist/webhook-adapters.js';

const botInfo = '{"user_id":1,"first_name":"Bot","username":"bot",'
  + '"is_bot":true,"name":"Bot"}';
const unsafeBody = '{"update_type":"message_created","timestamp":9223372036854775807,'
  + '"message":{"recipient":{"chat_id":9007199254740993,"chat_type":"chat",'
  + '"user_id":null},"timestamp":9007199254740994,"body":{"mid":"mid",'
  + '"seq":116328147937082782,"text":"hello","attachments":null}}}';

const bot = new Bot('token', {
  clientOptions: { fetch: async () => new Response(botInfo) },
});
let seenSequence;
bot.on('message_created', (context) => {
  seenSequence = context.message.body?.seq;
});
await bot.initialize();

const app = Fastify();
app.setErrorHandler((error, _request, reply) => {
  if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
    reply.status(413).send();
    return;
  }
  reply.send(error);
});
app.addContentTypeParser('application/json', { parseAs: 'buffer', bodyLimit: 1024 },
  (_request, body, done) => done(null, body));
app.post('/webhook', webhookCallback(bot, fastifyWebhookAdapter, {
  secret: 'valid_secret', maxBodyBytes: 1024,
}));
const parsedApp = Fastify();
parsedApp.post('/webhook', webhookCallback(bot, fastifyWebhookAdapter, { secret: false }));
await app.listen({ host: '127.0.0.1', port: 0 });
await parsedApp.listen({ host: '127.0.0.1', port: 0 });

try {
  const address = app.server.address();
  assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}/webhook`;
  const accepted = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-max-bot-api-secret': 'valid_secret',
    },
    body: unsafeBody,
  });
  assert.equal(accepted.status, 200);
  assert.equal(seenSequence, '116328147937082782');

  assert.equal((await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: unsafeBody,
  })).status, 401);
  assert.equal((await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-max-bot-api-secret': 'valid_secret',
    },
    body: '{',
  })).status, 400);
  const oversized = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-max-bot-api-secret': 'valid_secret',
    },
    body: 'x'.repeat(1025),
  });
  assert.equal(oversized.status, 413);
  assert.equal(await oversized.text(), '');

  const parsedAddress = parsedApp.server.address();
  assert.ok(parsedAddress && typeof parsedAddress !== 'string');
  assert.equal((await fetch(`http://127.0.0.1:${parsedAddress.port}/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })).status, 500);
} finally {
  await Promise.all([app.close(), parsedApp.close()]);
}

process.stdout.write('Fastify webhook integration passed on Node >=20\n');
