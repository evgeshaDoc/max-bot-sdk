import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import type { Api } from '../src/api';
import { Composer } from '../src/composer';
import { Context } from '../src/context';
import type { Attachment } from '../src/core/network/api/types/attachment';
import type { Message } from '../src/core/network/api/types/message';
import type {
  MessageCallbackUpdate,
  MessageCreatedUpdate,
  MessageEditedUpdate,
  Update,
} from '../src/core/network/api/types/update';
import { KnownUpdateTypes } from '../src/core/network/api/types/update';
import { compileFilterQuery } from '../src/filter-query';
import { findAttachment } from '../src/filters';
import { parseUpdate } from '../src/core/network/api/parse-update';

const api: Api = undefined as never;

test('all 15 L1 queries match their exact update and reject a sibling', async () => {
  const updates = await loadFixtureUpdates();
  for (let index = 0; index < KnownUpdateTypes.length; index += 1) {
    const query = KnownUpdateTypes[index];
    const sibling = KnownUpdateTypes[(index + 1) % KnownUpdateTypes.length];
    assert.equal(compileFilterQuery(query)(updates.get(query)!), true, query);
    assert.equal(compileFilterQuery(query)(updates.get(sibling)!), false, sibling);
  }
});

test('text and attachment refinements distinguish null, empty, and present values', () => {
  for (const kind of ['message_created', 'message_edited'] as const) {
    const update = createMessageUpdate(kind);
    const text = compileFilterQuery(`${kind}:text`);
    const attachment = compileFilterQuery(`${kind}:attachment`);

    update.message.body = null;
    assert.equal(text(update), false);
    assert.equal(attachment(update), false);
    update.message.body = createMessageBody(null, null);
    assert.equal(text(update), false);
    assert.equal(attachment(update), false);
    update.message.body.text = '';
    update.message.body.attachments = [];
    assert.equal(text(update), true);
    assert.equal(attachment(update), false);
    update.message.body.attachments = [attachments[0]];
    assert.equal(attachment(update), true);
  }
});

test('every attachment refinement matches existence without narrowing all elements', () => {
  const update = createMessageUpdate('message_created');
  if (!update.message.body) throw new Error('Message body fixture is required');
  update.message.body.attachments = [...attachments];

  for (const attachment of attachments) {
    assert.equal(
      compileFilterQuery(`message_created:attachment:${attachment.type}`)(update),
      true,
      attachment.type,
    );
    assert.equal(findAttachment(update.message, attachment.type)?.type, attachment.type);
  }
});

test('callback and start payload queries count empty values as present', async () => {
  const updates = await loadFixtureUpdates();
  const callback = updates.get('message_callback');
  const started = updates.get('bot_started');
  if (callback?.update_type !== 'message_callback' || started?.update_type !== 'bot_started') {
    throw new Error('Callback and start fixtures are required');
  }
  const payload = compileFilterQuery('message_callback:payload');
  const message = compileFilterQuery('message_callback:message');
  const startPayload = compileFilterQuery('bot_started:payload');

  callback.callback.payload = '';
  assert.equal(payload(callback), true);
  delete callback.callback.payload;
  assert.equal(payload(callback), false);
  assert.equal(message(callback), false);
  callback.message = createMessage();
  assert.equal(message(callback), true);

  started.payload = '';
  assert.equal(startPayload(started), true);
  started.payload = null;
  assert.equal(startPayload(started), false);
  delete started.payload;
  assert.equal(startPayload(started), false);
});

test('Composer compiles query arrays once and uses OR semantics', async () => {
  const composer = new Composer<Context>();
  const seen: string[] = [];
  composer.on(['message_created:text', 'message_callback:payload'], (context) => {
    seen.push(context.updateType);
  });
  await run(composer, new Context(createMessageUpdate('message_created'), api));
  await run(composer, new Context(createCallbackUpdate(''), api));
  await run(composer, new Context(createCallbackUpdate(undefined), api));
  assert.deepEqual(seen, ['message_created', 'message_callback']);
});

test('invalid query shapes fail synchronously without payload data', () => {
  const invalid = [
    '',
    'future_event',
    'message_created:future',
    'message_created:attachment:future',
    'message_created:attachment:image:extra',
    'message_callback:text',
    'bot_started:attachment',
    42,
  ];
  for (const query of invalid) {
    assert.throws(
      () => Reflect.apply(compileFilterQuery, undefined, [query]),
      (error) => error instanceof TypeError
        && error.message.includes(String(query))
        && !error.message.includes('secret-update-payload'),
    );
  }
});

async function loadFixtureUpdates(): Promise<Map<string, Update>> {
  const updates = new Map<string, Update>();
  for (const type of KnownUpdateTypes) {
    const raw = await readFile(`test/fixtures/updates/${type}.json`, 'utf8');
    const parsed = parseUpdate(raw);
    if (parsed.kind !== 'known') throw new Error(`Known fixture required for ${type}`);
    updates.set(type, parsed.update);
  }
  return updates;
}

async function run(composer: Composer<Context>, context: Context): Promise<void> {
  await composer.middleware()(context, async () => undefined);
}

function createMessageUpdate(
  kind: 'message_created' | 'message_edited',
): MessageCreatedUpdate | MessageEditedUpdate {
  const message = createMessage();
  return kind === 'message_created'
    ? { update_type: 'message_created', timestamp: '1', message }
    : { update_type: 'message_edited', timestamp: '1', message };
}

function createMessage(): Message {
  return {
    recipient: { chat_id: '2', chat_type: 'chat', user_id: null },
    timestamp: '1',
    body: createMessageBody('', null),
  };
}

function createMessageBody(text: string | null, messageAttachments: Attachment[] | null) {
  return {
    mid: 'message',
    seq: '1' as const,
    text,
    attachments: messageAttachments,
  };
}

function createCallbackUpdate(payload: string | undefined): MessageCallbackUpdate {
  return {
    update_type: 'message_callback',
    timestamp: '1',
    callback: {
      timestamp: '1',
      callback_id: 'callback',
      payload,
      user: {
        user_id: '7',
        first_name: 'User',
        username: null,
        is_bot: false,
        name: 'User',
      },
    },
    message: null,
  };
}

const attachments: Attachment[] = [
  { type: 'image', payload: { url: 'url', token: 'token', photo_id: '1' } },
  { type: 'video', payload: { url: 'url', token: 'token' } },
  { type: 'audio', payload: { url: 'url', token: 'token' } },
  {
    type: 'file', payload: { url: 'url', token: 'token' }, filename: 'file', size: '1',
  },
  {
    type: 'sticker', payload: { url: 'url', code: 'code' }, width: 1, height: 1,
  },
  { type: 'contact', payload: {} },
  { type: 'inline_keyboard', payload: { buttons: [] } },
  { type: 'reply_keyboard', buttons: [] },
  { type: 'share', payload: {} },
  { type: 'location', latitude: 1, longitude: 1 },
  { type: 'data', data: 'data' },
];
