import assert from 'node:assert/strict';
import test from 'node:test';

import type { Api } from '../src/api';
import { Bot } from '../src/bot';
import { BotNotInitializedError } from '../src/core/network/api/error';
import { parseUpdate } from '../src/core/network/api/parse-update';
import type { Int64 } from '../src/core/network/api/types/int64';
import type { ParsedUpdate, Update } from '../src/core/network/api/types/update';
import type { GetUpdatesOptions } from '../src/core/network/api/modules/subscriptions/types';
import { Polling } from '../src/core/network/polling';
import { createWebhookHandler } from '../src/webhook';

const botInfo = '{"user_id":9007199254740993,"first_name":"Bot","username":"test_bot",'
  + '"is_bot":true,"name":"Bot"}';
const update = parseUpdate(
  '{"update_type":"message_removed","timestamp":1,"message_id":"m","chat_id":2,"user_id":3}',
);
if (update.kind !== 'known') throw new Error('Test update must be known');

test('initialize is single-flight, dispatch is offline, and catch stays polling-only', async () => {
  let requests = 0;
  const fetchMock: typeof fetch = async () => {
    requests += 1;
    return new Response(botInfo, { status: 200 });
  };
  const bot = new Bot('token', { clientOptions: { fetch: fetchMock } });

  await assert.rejects(bot.dispatchUpdate(update.update), BotNotInitializedError);
  assert.equal(requests, 0);
  const [first, second] = await Promise.all([bot.initialize(), bot.initialize()]);
  assert.equal(first, second);
  assert.equal(requests, 1);

  const expected = new Error('middleware failed');
  let catcherCalls = 0;
  bot.catch(() => {
    catcherCalls += 1;
  });
  bot.use(() => {
    throw expected;
  });
  await assert.rejects(bot.dispatchUpdate(update.update), (error) => error === expected);
  assert.equal(catcherCalls, 0);
  assert.equal(requests, 1);
});

test('failed initialize is not cached', async () => {
  let requests = 0;
  const fetchMock: typeof fetch = async () => {
    requests += 1;
    return requests === 1
      ? new Response('{"code":"temporary"}', { status: 500 })
      : new Response(botInfo, { status: 200 });
  };
  const bot = new Bot('token', { clientOptions: { fetch: fetchMock } });
  await assert.rejects(bot.initialize());
  await bot.initialize();
  assert.equal(requests, 2);
});

test('polling uses its catcher while the default preserves error identity', async () => {
  const page = '{"updates":[{"update_type":"message_removed","timestamp":1,'
    + '"message_id":"m","chat_id":2,"user_id":3}],"marker":4}';
  const fetchMock: typeof fetch = async (input) => new Response(
    new URL(String(input)).pathname === '/me' ? botInfo : page,
    { status: 200 },
  );
  const expected = new Error('polling middleware failed');
  const defaultBot = new Bot('token', { clientOptions: { fetch: fetchMock } });
  defaultBot.use(() => {
    throw expected;
  });
  await assert.rejects(defaultBot.start(), (error) => error === expected);

  const caughtBot = new Bot('token', { clientOptions: { fetch: fetchMock } });
  let caught: unknown;
  caughtBot.use(() => {
    throw expected;
  });
  caughtBot.catch((error) => {
    caught = error;
    caughtBot.stop();
  });
  await caughtBot.start();
  assert.equal(caught, expected);
});

test('polling skips unknown updates and advances their page marker', async () => {
  const markers: Array<Int64 | null | undefined> = [];
  const pages: Array<{ updates: ParsedUpdate[]; marker: Int64 | null }> = [
    { updates: [{ kind: 'unknown', updateType: 'future_event' }], marker: '10' },
    { updates: [update], marker: '20' },
  ];
  const api = {
    async getUpdates(_types: unknown, options: GetUpdatesOptions) {
      markers.push(options.marker);
      const page = pages.shift();
      if (!page) throw new Error('Unexpected polling request');
      return page;
    },
  } as unknown as Api;
  const polling = new Polling(api);
  const handled: Update[] = [];
  await polling.loop(async (item) => {
    handled.push(item);
    polling.stop();
  });

  assert.deepEqual(markers, [undefined, '10']);
  assert.deepEqual(handled, [update.update]);
});

test('polling does not advance a mixed page after an escaped known failure', async () => {
  const markers: Array<Int64 | null | undefined> = [];
  let requests = 0;
  const api = {
    async getUpdates(_types: unknown, options: GetUpdatesOptions) {
      markers.push(options.marker);
      requests += 1;
      return {
        updates: [{ kind: 'unknown', updateType: 'future_event' }, update],
        marker: String(requests) as Int64,
      };
    },
  } as unknown as Api;
  const polling = new Polling(api);
  const expected = new Error('dispatch failed');
  await assert.rejects(polling.loop(async () => {
    throw expected;
  }), (error) => error === expected);

  await polling.loop(async () => {
    polling.stop();
  });
  assert.deepEqual(markers, [undefined, undefined]);
});

test('webhook handler is directly usable as a Web Fetch transport', async () => {
  const fetchMock: typeof fetch = async () => new Response(botInfo, { status: 200 });
  const bot = new Bot('token', { clientOptions: { fetch: fetchMock } });
  await bot.initialize();
  let handled = 0;
  let seenTimestamp: Int64 | undefined;
  bot.use((context) => {
    handled += 1;
    seenTimestamp = context.update.timestamp;
    if (context.update.update_type === 'message_removed'
      && context.update.message_id === 'explode') {
      throw new Error('escaped webhook middleware error');
    }
  });
  assert.throws(() => createWebhookHandler(bot, { secret: 'bad!' }));
  const handler = createWebhookHandler(bot, { secret: 'valid_secret' });
  const body = '{"update_type":"message_removed","timestamp":116328147937082782,'
    + '"message_id":"m","chat_id":116328147937082783,"user_id":116328147937082784}';

  const methodResponse = await handler(new Request('https://bot.test', { method: 'GET' }));
  assert.equal(methodResponse.status, 405);
  assert.equal(methodResponse.headers.get('allow'), 'POST');

  let unauthorizedBodyReads = 0;
  const unauthorized = new Request('https://bot.test', {
    method: 'POST', body, headers: { 'x-max-bot-api-secret': 'wrong' },
  });
  Object.defineProperty(unauthorized, 'arrayBuffer', {
    value: async () => {
      unauthorizedBodyReads += 1;
      throw new Error('unauthorized body must not be read');
    },
  });
  assert.equal((await handler(unauthorized)).status, 401);
  assert.equal(unauthorizedBodyReads, 0);
  assert.equal((await handler(new Request('https://bot.test', {
    method: 'POST', body: '{', headers: { 'x-max-bot-api-secret': 'valid_secret' },
  }))).status, 400);
  assert.equal((await handler(new Request('https://bot.test', {
    method: 'POST', body, headers: { 'x-max-bot-api-secret': 'valid_secret' },
  }))).status, 200);
  assert.equal(seenTimestamp, '116328147937082782');
  assert.equal((await handler(new Request('https://bot.test', {
    method: 'POST',
    body: '{"update_type":"future_event","unsafe":9223372036854775808}',
    headers: { 'x-max-bot-api-secret': 'valid_secret' },
  }))).status, 200);
  assert.equal((await handler(new Request('https://bot.test', {
    method: 'POST',
    body: body.replace('"message_id":"m"', '"message_id":"explode"'),
    headers: { 'x-max-bot-api-secret': 'valid_secret' },
  }))).status, 500);
  assert.equal(handled, 2);
});
