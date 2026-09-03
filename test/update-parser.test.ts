import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

import { createClient } from '../src/core/network/api/client';
import { MaxUpdateParseError } from '../src/core/network/api/error';
import { parseLosslessJson } from '../src/core/network/api/json';
import { parseUpdate, parseUpdatesResponse } from '../src/core/network/api/parse-update';
import { KnownUpdateTypes } from '../src/core/network/api/types/update';
import { normalizeWireValue } from '../src/core/network/api/wire-descriptors';

const fixtureDirectory = 'test/fixtures/updates';

test('all 15 documented update fixtures are attributed and lossless', async () => {
  const manifest = JSON.parse(await readFile(`${fixtureDirectory}/manifest.json`, 'utf8')) as {
    fixtures: Record<string, string>;
  };
  const files = (await readdir(fixtureDirectory)).filter((file) => file.endsWith('.json')
    && file !== 'manifest.json');

  assert.equal(files.length, 15);
  assert.deepEqual(files.map((file) => file.replace('.json', '')).sort(), [...KnownUpdateTypes].sort());

  for (const file of files) {
    const raw = await readFile(`${fixtureDirectory}/${file}`, 'utf8');
    assert.equal(createHash('sha256').update(raw).digest('hex'), manifest.fixtures[file]);
    const parsed = parseUpdate(raw);
    assert.equal(parsed.kind, 'known');
    if (parsed.kind === 'known') {
      assert.equal(typeof parsed.update.timestamp, 'string');
      assert.equal(parsed.update.update_type, file.replace('.json', ''));
    }
  }

  const created = parseUpdate(await readFile(`${fixtureDirectory}/message_created.json`, 'utf8'));
  assert.equal(created.kind, 'known');
  if (created.kind === 'known' && created.update.update_type === 'message_created') {
    assert.equal(created.update.message.body?.seq, '116328147937082782');
    assert.equal(created.update.message.recipient.chat_id, '9007199254740993');
  }
});

test('unknown updates discard payload before unsafe-number normalization', () => {
  assert.deepEqual(
    parseUpdate('{"update_type":"future_event","future_id":9223372036854775808}'),
    { kind: 'unknown', updateType: 'future_event' },
  );
  assert.deepEqual(
    parseUpdate('{"update_type":"message_chat_created","value":9007199254740993}'),
    { kind: 'unknown', updateType: 'message_chat_created' },
  );
});

test('callback and bot-start payload types are identical for webhook and polling input', async () => {
  const callbackFixture = await readFile(`${fixtureDirectory}/message_callback.json`, 'utf8');
  const botStartedFixture = await readFile(`${fixtureDirectory}/bot_started.json`, 'utf8');
  const accepted = [
    callbackFixture.replace(',"payload":"ok"', ''),
    callbackFixture.replace('"payload":"ok"', '"payload":""'),
    callbackFixture,
    botStartedFixture.replace(',"payload":"start"', ''),
    botStartedFixture.replace('"payload":"start"', '"payload":null'),
    botStartedFixture.replace('"payload":"start"', '"payload":""'),
    botStartedFixture,
  ];
  const rejected = [
    ...['null', '0', 'false', '{}', '[]'].map((payload) => {
      return callbackFixture.replace('"payload":"ok"', `"payload":${payload}`);
    }),
    ...['0', 'false', '{}', '[]'].map((payload) => {
      return botStartedFixture.replace('"payload":"start"', `"payload":${payload}`);
    }),
  ];

  for (const raw of accepted) {
    assert.equal(parseUpdate(raw).kind, 'known');
    assert.equal(parseUpdatesResponse(`{"updates":[${raw}],"marker":null}`).updates[0].kind, 'known');
  }
  for (const raw of rejected) {
    assert.throws(() => parseUpdate(raw), MaxUpdateParseError);
    assert.throws(
      () => parseUpdatesResponse(`{"updates":[${raw}],"marker":null}`),
      MaxUpdateParseError,
    );
  }
});

test('known int64 paths accept only bare canonical signed int64 numbers', () => {
  const valid = parseUpdate(
    '{"update_type":"message_removed","timestamp":-9223372036854775808,'
    + '"message_id":"m","chat_id":0,"user_id":9223372036854775807}',
  );
  assert.equal(valid.kind, 'known');

  const invalid = [
    '{"update_type":"message_removed","timestamp":"9223372036854775807","message_id":"m","chat_id":0,"user_id":1}',
    '{"update_type":"message_removed","timestamp":9223372036854775808,"message_id":"m","chat_id":0,"user_id":1}',
    '{"update_type":"message_removed","timestamp":1.5,"message_id":"m","chat_id":0,"user_id":1}',
    '{"update_type":"message_removed","timestamp":1e3,"message_id":"m","chat_id":0,"user_id":1}',
    '{"update_type":"message_removed","timestamp":-0,"message_id":"m","chat_id":0,"user_id":1}',
  ];
  for (const raw of invalid) assert.throws(() => parseUpdate(raw), MaxUpdateParseError);
  assert.throws(() => parseUpdate('{"update_type":"message_removed","timestamp":01}'));
});

test('safe non-int64 numbers stay numbers and unsafe ones fail on known shapes', () => {
  assert.deepEqual(normalizeWireValue(parseLosslessJson('{"safe":1.5}')), { safe: 1.5 });
  assert.throws(
    () => normalizeWireValue(parseLosslessJson('{"unsafe":9007199254740993}')),
  );
});

test('known updates reject stale nested discriminants', () => {
  const base = '{"update_type":"message_created","timestamp":1,"message":'
    + '{"recipient":{"chat_id":2,"chat_type":"not-a-chat","user_id":null},"timestamp":3,'
    + '"body":{"mid":"m","seq":4,"text":null,"attachments":null}}}';
  assert.throws(() => parseUpdate(base), MaxUpdateParseError);
  assert.throws(() => parseUpdate(base.replace('"not-a-chat"', '"chat"').replace(
    '"attachments":null',
    '"attachments":[{"type":"future_attachment"}]',
  )), MaxUpdateParseError);
  const inlineReplyButton = base.replace('"not-a-chat"', '"chat"').replace(
    '"attachments":null',
    '"attachments":[{"type":"inline_keyboard","payload":{"buttons":'
      + '[[{"type":"user_contact","text":"Share"}]]}}]',
  );
  assert.throws(() => parseUpdate(inlineReplyButton), MaxUpdateParseError);
  const staleIntent = base.replace('"not-a-chat"', '"chat"').replace(
    '"attachments":null',
    '"attachments":[{"type":"inline_keyboard","payload":{"buttons":'
      + '[[{"type":"callback","text":"Run","payload":"go","intent":"stale"}]]}}]',
  );
  assert.throws(() => parseUpdate(staleIntent), MaxUpdateParseError);
  const chatButton = base.replace('"not-a-chat"', '"chat"').replace(
    '"attachments":null',
    '"attachments":[{"type":"inline_keyboard","payload":{"buttons":'
      + '[[{"type":"chat","text":"Open","chat_title":"Support",'
      + '"uuid":"018f5f1e-7b84-7c3c-9bd8-df7b467216a6"}]]}}]',
  );
  assert.equal(parseUpdate(chatButton).kind, 'known');
  assert.throws(
    () => parseUpdate(chatButton.replace('"018f5f1e-7b84-7c3c-9bd8-df7b467216a6"', '1')),
    MaxUpdateParseError,
  );
  assert.throws(
    () => parseUpdate(chatButton.replace('018f5f1e-7b84-7c3c-9bd8-df7b467216a6', 'not-a-uuid')),
    MaxUpdateParseError,
  );
  const replyButton = base.replace('"not-a-chat"', '"chat"').replace(
    '"attachments":null',
    '"attachments":[{"type":"reply_keyboard","buttons":'
      + '[[{"type":"user_contact","text":"Share"}]]}]',
  );
  assert.equal(parseUpdate(replyButton).kind, 'known');
});

test('polling response uses the webhook classifier and preserves marker order', () => {
  const page = parseUpdatesResponse(
    '{"updates":[{"update_type":"future_event","id":9223372036854775808},'
    + '{"update_type":"message_removed","timestamp":1,"message_id":"m","chat_id":2,"user_id":3}],'
    + '"marker":9223372036854775807}',
  );
  assert.deepEqual(page.updates[0], { kind: 'unknown', updateType: 'future_event' });
  assert.equal(page.updates[1].kind, 'known');
  assert.equal(page.marker, '9223372036854775807');
});

test('outbound descriptors serialize int64 bare and preserve digit-like text', async () => {
  let requestBody = '';
  const fetchMock: typeof fetch = async (_input, init) => {
    requestBody = String(init?.body);
    return new Response('{"message":{"recipient":{"chat_id":1,"chat_type":"chat",'
      + '"user_id":null},"timestamp":2,"body":{"mid":"m","seq":3,"text":null,'
      + '"attachments":null}}}', { status: 200 });
  };
  const client = createClient('token', { fetch: fetchMock });
  await client.call({
    path: 'messages',
    options: {
      method: 'POST',
      query: { chat_id: '9007199254740993' },
      body: {
        text: '9007199254740993',
        attachments: [
          { type: 'contact', payload: { contact_id: '9223372036854775807' } },
          { type: 'reply_keyboard', direct_user_id: null, buttons: [] },
        ],
        link: null,
      },
    },
  });
  assert.match(requestBody, /"text":"9007199254740993"/);
  assert.match(requestBody, /"contact_id":9223372036854775807/);
  assert.match(requestBody, /"direct_user_id":null/);
});

test('required update and polling root fields must be own properties', () => {
  for (const raw of [
    '{"__proto__":{"update_type":"future_event"}}',
    '{"__proto__":{"update_type":"message_removed"},"timestamp":1,"message_id":"m","chat_id":2,"user_id":3}',
  ]) {
    assert.throws(() => parseUpdate(raw), MaxUpdateParseError);
    assert.throws(() => parseUpdatesResponse(`{"updates":[${raw}],"marker":null}`), MaxUpdateParseError);
  }
  for (const raw of [
    '{"__proto__":{"updates":[]},"marker":null}',
    '{"updates":[],"__proto__":{"marker":null}}',
    '{"updates":[],"__proto__":{"marker":1}}',
  ]) assert.throws(() => parseUpdatesResponse(raw), MaxUpdateParseError);
  assert.deepEqual(
    parseUpdate('{"update_type":"future_event","__proto__":{"update_type":"message_removed"}}'),
    { kind: 'unknown', updateType: 'future_event' },
  );
});
