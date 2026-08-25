import type { URec } from '@tsofist/stem';
import { isUUIDString } from '@tsofist/stem/lib/crypto/uuid/guards';

import { assertInt64 } from './types/int64';

const attachmentTypes = [
  'image', 'video', 'audio', 'file', 'sticker', 'contact', 'share', 'location',
  'inline_keyboard', 'reply_keyboard', 'data',
] as const;
const inlineButtonTypes = [
  'callback', 'link', 'request_contact', 'request_geo_location', 'message',
  'chat', 'open_app', 'clipboard',
] as const;
const replyButtonTypes = ['message', 'user_geo_location', 'user_contact'] as const;
const markupTypes = [
  'strong', 'emphasized', 'monospaced', 'link', 'strikethrough', 'underline',
  'heading', 'highlighted', 'quote', 'user_mention',
] as const;

export function assertUserShape(value: unknown): asserts value is URec {
  const user = expectObject(value);
  expectInt64(user.user_id);
  expectString(user.first_name);
  expectNullableString(user.username);
  expectBoolean(user.is_bot);
  expectNullableString(user.name);
  if (user.last_name !== undefined) expectNullableString(user.last_name);
  if (user.last_activity_time !== undefined) expectInt64(user.last_activity_time);
  if (user.description !== undefined) expectNullableString(user.description);
  if (user.avatar_url !== undefined) expectString(user.avatar_url);
  if (user.full_avatar_url !== undefined) expectString(user.full_avatar_url);
}

export function assertMessageShape(value: unknown): asserts value is URec {
  const message = expectObject(value);
  if (message.sender !== undefined && message.sender !== null) assertUserShape(message.sender);
  const recipient = expectObject(message.recipient);
  if (!('chat_id' in recipient) || !('user_id' in recipient)) fail();
  if (recipient.chat_id !== null) expectInt64(recipient.chat_id);
  if (recipient.user_id !== null) expectInt64(recipient.user_id);
  expectEnum(recipient.chat_type, ['dialog', 'chat', 'channel']);
  expectInt64(message.timestamp);
  if (message.link !== undefined && message.link !== null) assertLink(message.link);
  if (message.body !== null) assertMessageBody(message.body);
  if (message.stat !== undefined && message.stat !== null) {
    expectNumber(expectObject(message.stat).views);
  }
  if (message.url !== undefined) expectNullableString(message.url);
}

function assertMessageBody(value: unknown): void {
  const body = expectObject(value);
  expectString(body.mid);
  expectInt64(body.seq);
  expectNullableString(body.text);
  if (body.attachments !== null) {
    for (const attachment of expectArray(body.attachments)) assertAttachment(attachment);
  }
  if (body.markup !== undefined && body.markup !== null) {
    for (const markup of expectArray(body.markup)) assertMarkup(markup);
  }
}

function assertLink(value: unknown): void {
  const link = expectObject(value);
  expectEnum(link.type, ['forward', 'reply']);
  if (link.sender !== undefined && link.sender !== null) assertUserShape(link.sender);
  if (link.chat_id !== undefined) expectInt64(link.chat_id);
  assertMessageBody(link.message);
}

function assertAttachment(value: unknown): void {
  const attachment = expectObject(value);
  const type = expectEnum(attachment.type, attachmentTypes);
  switch (type) {
    case 'image': {
      const payload = assertMediaPayload(attachment.payload);
      expectInt64(payload.photo_id);
      break;
    }
    case 'video':
      assertMediaPayload(attachment.payload);
      if (attachment.thumbnail !== undefined && attachment.thumbnail !== null) {
        expectString(expectObject(attachment.thumbnail).url);
      }
      expectOptionalNullableNumber(attachment.width);
      expectOptionalNullableNumber(attachment.height);
      expectOptionalNullableNumber(attachment.duration);
      break;
    case 'audio':
      assertMediaPayload(attachment.payload);
      if (attachment.transcription !== undefined) {
        expectNullableString(attachment.transcription);
      }
      break;
    case 'file':
      assertMediaPayload(attachment.payload);
      expectString(attachment.filename);
      expectInt64(attachment.size);
      break;
    case 'sticker': {
      const payload = expectObject(attachment.payload);
      expectString(payload.url);
      expectString(payload.code);
      expectNumber(attachment.width);
      expectNumber(attachment.height);
      break;
    }
    case 'contact': {
      const payload = expectObject(attachment.payload);
      if (payload.vcf_info !== undefined) expectNullableString(payload.vcf_info);
      if (payload.max_info !== undefined && payload.max_info !== null) {
        assertUserShape(payload.max_info);
      }
      break;
    }
    case 'share': {
      const payload = expectObject(attachment.payload);
      if (payload.url !== undefined) expectNullableString(payload.url);
      if (payload.token !== undefined) expectNullableString(payload.token);
      if (attachment.title !== undefined) expectNullableString(attachment.title);
      if (attachment.description !== undefined) expectNullableString(attachment.description);
      if (attachment.image_url !== undefined) expectNullableString(attachment.image_url);
      break;
    }
    case 'location':
      expectNumber(attachment.latitude);
      expectNumber(attachment.longitude);
      break;
    case 'inline_keyboard':
      assertButtonRows(expectObject(attachment.payload).buttons, 'inline');
      break;
    case 'reply_keyboard':
      assertButtonRows(attachment.buttons, 'reply');
      break;
    case 'data':
      expectString(attachment.data);
      break;
    default:
      fail();
  }
}

function assertMediaPayload(value: unknown): URec {
  const payload = expectObject(value);
  expectString(payload.url);
  expectString(payload.token);
  return payload;
}

function assertButtonRows(value: unknown, keyboard: 'inline' | 'reply'): void {
  for (const row of expectArray(value)) {
    for (const valueButton of expectArray(row)) {
      const button = expectObject(valueButton);
      const type = expectEnum(
        button.type,
        keyboard === 'inline' ? inlineButtonTypes : replyButtonTypes,
      );
      expectString(button.text);
      if (type === 'callback' || type === 'clipboard') expectString(button.payload);
      if (type === 'callback' && button.intent !== undefined) {
        expectEnum(button.intent, ['default', 'positive', 'negative']);
      }
      if (type === 'link') expectString(button.url);
      if (type === 'request_geo_location' && button.quick !== undefined) {
        expectBoolean(button.quick);
      }
      if (type === 'message') {
        if (button.payload !== undefined) expectNullableString(button.payload);
        if (button.intent !== undefined) {
          expectEnum(button.intent, ['default', 'positive', 'negative']);
        }
      }
      if (type === 'chat') {
        expectString(button.chat_title);
        if (button.chat_description !== undefined) expectNullableString(button.chat_description);
        if (button.start_payload !== undefined) expectNullableString(button.start_payload);
        if (button.uuid !== undefined && button.uuid !== null && !isUUIDString(button.uuid)) {
          fail();
        }
      }
      if (type === 'open_app') {
        expectString(button.web_app);
        if (button.contact_id !== undefined && button.contact_id !== null) {
          expectInt64(button.contact_id);
        }
        if (button.payload !== undefined) expectNullableString(button.payload);
      }
      if (type === 'user_geo_location') {
        if (button.payload !== undefined) expectNullableString(button.payload);
        if (button.quick !== undefined) expectBoolean(button.quick);
      }
      if (type === 'user_contact' && button.payload !== undefined) {
        expectNullableString(button.payload);
      }
    }
  }
}

function assertMarkup(value: unknown): void {
  const markup = expectObject(value);
  const type = expectEnum(markup.type, markupTypes);
  expectInteger(markup.from);
  expectInteger(markup.length);
  if (type === 'link') expectString(markup.url);
  if (type === 'user_mention') {
    if (markup.user_link !== undefined) expectNullableString(markup.user_link);
    if (markup.user_id !== undefined && markup.user_id !== null) expectInt64(markup.user_id);
  }
}

function expectObject(value: unknown): URec {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail();
  return value as URec;
}

function expectArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) fail();
  return value;
}

function expectString(value: unknown): string {
  if (typeof value !== 'string') fail();
  return value;
}

function expectNullableString(value: unknown): void {
  if (value !== null) expectString(value);
}

function expectBoolean(value: unknown): void {
  if (typeof value !== 'boolean') fail();
}

function expectNumber(value: unknown): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail();
}

function expectInteger(value: unknown): void {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) fail();
}

function expectOptionalNullableNumber(value: unknown): void {
  if (value !== undefined && value !== null) expectNumber(value);
}

function expectInt64(value: unknown): void {
  assertInt64(value);
}

function expectEnum<const Allowed extends readonly string[]>(
  value: unknown,
  allowed: Allowed,
): Allowed[number] {
  if (typeof value !== 'string' || !allowed.includes(value)) fail();
  return value as Allowed[number];
}

function fail(): never {
  throw new TypeError('Expected current MAX message shape');
}
