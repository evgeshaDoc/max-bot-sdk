import type { Rec, URec } from '@tsofist/stem';

import type { HttpMethod } from './transformer-types';
import { assertInt64 } from './types/int64';
import { KnownUpdateTypes } from './types/update';
import type { WireDescriptor } from './wire-descriptors';
import { assertMessageShape, assertUserShape } from './wire-shapes';

export interface WireContract {
  readonly path?: WireDescriptor;
  readonly query?: WireDescriptor;
  readonly body?: WireDescriptor;
  readonly response?: WireDescriptor;
  readonly validateResponse?: (value: unknown) => void;
}

const user = { user_id: true, last_activity_time: true } as const satisfies WireDescriptor;
const chatMember = {
  ...user,
  last_access_time: true,
  join_time: true,
} as const satisfies WireDescriptor;
const attachment = {
  payload: {
    photo_id: true,
    contact_id: true,
    max_info: user,
    buttons: [[{ contact_id: true }]],
  },
  size: true,
  buttons: [[{ contact_id: true }]],
} as const satisfies WireDescriptor;
const messageBody = {
  seq: true,
  attachments: [attachment],
  markup: [{ user_id: true }],
} as const satisfies WireDescriptor;
const message = {
  sender: user,
  recipient: { chat_id: true, user_id: true },
  timestamp: true,
  link: { sender: user, chat_id: true, message: messageBody },
  body: messageBody,
} as const satisfies WireDescriptor;
const chat = {
  chat_id: true,
  last_event_time: true,
  owner_id: true,
  participants: { kind: 'map', values: true },
  dialog_with_user: user,
  pinned_message: message,
} as const satisfies WireDescriptor;
const action = {
  failed_user_ids: [true],
  failed_user_details: [{ user_ids: [true] }],
} as const satisfies WireDescriptor;
const actionResponse = { response: action, validateResponse: validateActionResponse } as const;
const chatPath = { chat_id: true } as const satisfies WireDescriptor;
const newMessage = {
  attachments: [{
    payload: { contact_id: true, buttons: [[{ contact_id: true }]] },
    direct_user_id: true,
    buttons: [[{ contact_id: true }]],
  }],
} as const satisfies WireDescriptor;

const contracts: Readonly<Rec<WireContract>> = {
  'GET me': { response: user, validateResponse: validateUser },
  'PATCH me/commands': { validateResponse: validateCommands },
  'GET chats/{chat_id}': { path: chatPath, response: chat, validateResponse: validateChat },
  'PATCH chats/{chat_id}': { path: chatPath, response: chat, validateResponse: validateChat },
  'POST chats/{chat_id}/actions': { path: chatPath, ...actionResponse },
  'GET chats/{chat_id}/pin': {
    path: chatPath,
    response: { message },
    validateResponse: validatePinnedMessage,
  },
  'PUT chats/{chat_id}/pin': { path: chatPath, ...actionResponse },
  'DELETE chats/{chat_id}/pin': { path: chatPath, ...actionResponse },
  'GET chats/{chat_id}/members/me': {
    path: chatPath,
    response: chatMember,
    validateResponse: validateChatMember,
  },
  'DELETE chats/{chat_id}/members/me': { path: chatPath, ...actionResponse },
  'GET chats/{chat_id}/members/admins': {
    path: chatPath,
    response: { members: [chatMember], marker: true },
    validateResponse: validateMembers,
  },
  'POST chats/{chat_id}/members/admins': {
    path: chatPath,
    body: { admins: [{ user_id: true }] },
    ...actionResponse,
  },
  'DELETE chats/{chat_id}/members/admins/{user_id}': {
    path: { chat_id: true, user_id: true },
    ...actionResponse,
  },
  'GET chats/{chat_id}/members': {
    path: chatPath,
    query: { user_ids: [true], marker: true },
    response: { members: [chatMember], marker: true },
    validateResponse: validateMembers,
  },
  'POST chats/{chat_id}/members': {
    path: chatPath,
    body: { user_ids: [true] },
    ...actionResponse,
  },
  'DELETE chats/{chat_id}/members': {
    path: chatPath,
    query: { user_id: true },
    body: { user_id: true },
    ...actionResponse,
  },
  'GET subscriptions': {
    response: { subscriptions: [{ time: true }] },
    validateResponse: validateSubscriptions,
  },
  'POST subscriptions': actionResponse,
  'DELETE subscriptions': actionResponse,
  'GET updates': { query: { marker: true } },
  'POST uploads': { validateResponse: validateUploadUrl },
  'GET messages': {
    query: { chat_id: true, from: true, to: true },
    response: { messages: [message] },
    validateResponse: validateMessages,
  },
  'POST messages': {
    query: { user_id: true, chat_id: true },
    body: newMessage,
    response: { message },
    validateResponse: validateMessageWrapper,
  },
  'PUT messages': { body: newMessage, ...actionResponse },
  'DELETE messages': actionResponse,
  'GET messages/{message_id}': { response: message, validateResponse: validateMessage },
  'GET videos/{video_token}': {
    response: { thumbnail: { photo_id: true } },
    validateResponse: validateVideo,
  },
  'POST answers': { body: { message: newMessage }, ...actionResponse },
};

/** Returns the bounded descriptor contract for one documented MAX operation. */
export function getWireContract(method: HttpMethod, path: string): WireContract {
  return contracts[`${method} ${path}`] ?? {};
}

/** Shared descriptor used by webhook and long-poll update classifiers. */
export const updateDescriptor = {
  timestamp: true,
  chat_id: true,
  user_id: true,
  inviter_id: true,
  admin_id: true,
  muted_until: true,
  user,
  callback: { timestamp: true, user },
  message,
} as const satisfies WireDescriptor;

function validateActionResponse(value: unknown): void {
  const response = expectObject(value);
  if (!('success' in response) || typeof response.success !== 'boolean') {
    throw new TypeError('Expected MAX action success discriminant');
  }
  if (response.message !== undefined && typeof response.message !== 'string') {
    throw new TypeError('Expected MAX action response message');
  }
  if (response.failed_user_ids !== undefined && response.failed_user_ids !== null) {
    for (const userId of expectArray(response.failed_user_ids)) assertInt64(userId);
  }
  if (response.failed_user_details !== undefined && response.failed_user_details !== null) {
    for (const detailValue of expectArray(response.failed_user_details)) {
      const detail = expectObject(detailValue);
      expectEnum(detail.error_code, ['add.participant.privacy', 'add.participant.not.found']);
      for (const userId of expectArray(detail.user_ids)) assertInt64(userId);
    }
  }
}

function validateUser(value: unknown): void {
  assertUserShape(value);
  const userValue = expectObject(value);
  if (userValue.commands !== undefined && userValue.commands !== null) {
    validateCommandList(userValue.commands);
  }
}

function validateCommands(value: unknown): void {
  validateCommandList(expectObject(value).commands);
}

function validateCommandList(value: unknown): void {
  for (const command of expectArray(value)) {
    const commandValue = expectObject(command);
    expectString(commandValue.name);
    if (commandValue.description !== undefined) expectNullableString(commandValue.description);
  }
}

function validateChat(value: unknown): void {
  const chatValue = expectObject(value);
  assertInt64(chatValue.chat_id);
  expectEnum(chatValue.type, ['dialog', 'chat', 'channel']);
  expectEnum(chatValue.status, ['active', 'removed', 'left', 'closed']);
  expectNullableString(chatValue.title);
  if (chatValue.icon !== null) expectString(expectObject(chatValue.icon).url);
  assertInt64(chatValue.last_event_time);
  expectNumber(chatValue.participants_count);
  if (chatValue.owner_id !== undefined && chatValue.owner_id !== null) {
    assertInt64(chatValue.owner_id);
  }
  if (chatValue.participants !== undefined && chatValue.participants !== null) {
    for (const timestamp of Object.values(expectObject(chatValue.participants))) {
      assertInt64(timestamp);
    }
  }
  expectBoolean(chatValue.is_public);
  if (chatValue.link !== undefined) expectNullableString(chatValue.link);
  expectNullableString(chatValue.description);
  if (chatValue.dialog_with_user !== undefined && chatValue.dialog_with_user !== null) {
    assertUserShape(chatValue.dialog_with_user);
  }
  if (chatValue.messages_count !== undefined && chatValue.messages_count !== null) {
    expectNumber(chatValue.messages_count);
  }
  if (chatValue.pinned_message !== undefined && chatValue.pinned_message !== null) {
    assertMessageShape(chatValue.pinned_message);
  }
}

function validateChatMember(value: unknown): void {
  validateUser(value);
  const memberValue = expectObject(value);
  assertInt64(memberValue.last_access_time);
  expectBoolean(memberValue.is_owner);
  expectBoolean(memberValue.is_admin);
  assertInt64(memberValue.join_time);
  if (memberValue.permissions !== undefined && memberValue.permissions !== null) {
    for (const permission of expectArray(memberValue.permissions)) {
      expectEnum(permission, [
        'read_all_messages', 'add_remove_members', 'add_admins', 'change_chat_info',
        'pin_message', 'edit_link', 'write', 'edit', 'delete', 'can_call',
        'view_stats', 'edit_message', 'delete_message', 'post_edit_delete_message',
      ]);
    }
  }
  if (memberValue.alias !== undefined) expectString(memberValue.alias);
}

function validateMembers(value: unknown): void {
  const response = expectObject(value);
  for (const memberValue of expectArray(response.members)) {
    validateChatMember(memberValue);
  }
  if (response.marker !== undefined && response.marker !== null) assertInt64(response.marker);
}

function validatePinnedMessage(value: unknown): void {
  const messageValue = expectObject(value).message;
  if (messageValue !== null) validateMessage(messageValue);
}

function validateMessage(value: unknown): void {
  assertMessageShape(value);
}

function validateMessages(value: unknown): void {
  for (const messageValue of expectArray(expectObject(value).messages)) {
    validateMessage(messageValue);
  }
}

function validateMessageWrapper(value: unknown): void {
  validateMessage(expectObject(value).message);
}

function validateSubscriptions(value: unknown): void {
  for (const subscriptionValue of expectArray(expectObject(value).subscriptions)) {
    const subscription = expectObject(subscriptionValue);
    const url = new URL(expectString(subscription.url));
    if (url.protocol !== 'https:') throw new TypeError('Expected HTTPS subscription URL');
    assertInt64(subscription.time);
    if (subscription.update_types !== null) {
      for (const updateType of expectArray(subscription.update_types)) {
        expectEnum(updateType, KnownUpdateTypes);
      }
    }
  }
}

function validateUploadUrl(value: unknown): void {
  const response = expectObject(value);
  expectString(response.url);
  if (response.token !== undefined) expectString(response.token);
}

function validateVideo(value: unknown): void {
  const videoValue = expectObject(value);
  expectString(videoValue.token);
  expectNumber(videoValue.width);
  expectNumber(videoValue.height);
  expectNumber(videoValue.duration);
  if (videoValue.urls !== undefined && videoValue.urls !== null) {
    for (const url of Object.values(expectObject(videoValue.urls))) expectNullableString(url);
  }
  if (videoValue.thumbnail !== undefined && videoValue.thumbnail !== null) {
    const thumbnail = expectObject(videoValue.thumbnail);
    assertInt64(thumbnail.photo_id);
    expectString(thumbnail.token);
    expectString(thumbnail.url);
  }
}

function expectObject(value: unknown): URec {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('Expected MAX response object');
  }
  return value as URec;
}

function expectArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new TypeError('Expected MAX response array');
  return value;
}

function expectString(value: unknown): string {
  if (typeof value !== 'string') throw new TypeError('Expected MAX response string');
  return value;
}

function expectNullableString(value: unknown): void {
  if (value !== null) expectString(value);
}

function expectBoolean(value: unknown): void {
  if (typeof value !== 'boolean') throw new TypeError('Expected MAX response boolean');
}

function expectNumber(value: unknown): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError('Expected MAX response number');
  }
}

function expectEnum(value: unknown, allowed: readonly string[]): void {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new TypeError('Expected current MAX enum value');
  }
}
