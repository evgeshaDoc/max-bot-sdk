import { MaxUpdateParseError } from './error';
import { parseLosslessJson } from './json';
import { updateDescriptor } from './wire-contracts';
import { normalizeWireValue } from './wire-descriptors';
import { assertMessageShape, assertUserShape } from './wire-shapes';
import { assertInt64, type Int64 } from './types/int64';
import {
  KnownUpdateTypes,
  type ParsedUpdate,
  type Update,
  type UpdateType,
} from './types/update';

const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
const knownUpdateTypes = new Set<string>(KnownUpdateTypes);

type UnknownRecord = Record<string, unknown>;

function decodeBody(rawBody: string | Uint8Array): string {
  return typeof rawBody === 'string' ? rawBody : utf8Decoder.decode(rawBody);
}

function expectRecord(value: unknown): UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('Expected an object');
  }
  return value as UnknownRecord;
}

function expectString(value: unknown): string {
  if (typeof value !== 'string') throw new TypeError('Expected a string');
  return value;
}

function expectBoolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new TypeError('Expected a boolean');
  return value;
}

function expectInt64(value: unknown): Int64 {
  assertInt64(value);
  return value;
}

function normalizeOptionalInt64(value: unknown): Int64 | null | undefined {
  if (value === undefined || value === null) return value;
  return expectInt64(value);
}

function normalizeUser(value: unknown): UnknownRecord {
  const user = expectRecord(value);
  assertUserShape(user);
  return user;
}

function normalizeMessage(value: unknown): UnknownRecord {
  const message = expectRecord(value);
  assertMessageShape(message);
  return message;
}

function normalizeCallback(value: unknown): UnknownRecord {
  const callback = expectRecord(value);
  if (callback.payload !== undefined) expectString(callback.payload);
  return {
    ...callback,
    timestamp: expectInt64(callback.timestamp),
    callback_id: expectString(callback.callback_id),
    user: normalizeUser(callback.user),
  };
}

function normalizeKnownUpdate(root: UnknownRecord, updateType: UpdateType): UnknownRecord {
  if (root.user_locale !== undefined && root.user_locale !== null) {
    expectString(root.user_locale);
  }
  const update = {
    ...root,
    update_type: updateType,
    timestamp: expectInt64(root.timestamp),
  };

  switch (updateType) {
    case 'message_callback':
      return {
        ...update,
        callback: normalizeCallback(root.callback),
        message: root.message === null ? null : normalizeMessage(root.message),
      };
    case 'message_created':
    case 'message_edited':
      return { ...update, message: normalizeMessage(root.message) };
    case 'message_removed':
      return {
        ...update,
        message_id: expectString(root.message_id),
        chat_id: expectInt64(root.chat_id),
        user_id: expectInt64(root.user_id),
      };
    case 'dialog_muted':
      return {
        ...normalizeUserUpdate(update, root),
        muted_until: expectInt64(root.muted_until),
      };
    case 'bot_added':
    case 'bot_removed':
      return {
        ...normalizeUserUpdate(update, root),
        is_channel: expectBoolean(root.is_channel),
      };
    case 'user_added':
      return {
        ...normalizeUserUpdate(update, root),
        is_channel: expectBoolean(root.is_channel),
        inviter_id: normalizeOptionalInt64(root.inviter_id),
      };
    case 'user_removed':
      return {
        ...normalizeUserUpdate(update, root),
        is_channel: expectBoolean(root.is_channel),
        admin_id: normalizeOptionalInt64(root.admin_id),
      };
    case 'chat_title_changed':
      return {
        ...normalizeUserUpdate(update, root),
        title: expectString(root.title),
      };
    case 'bot_started':
      if (root.payload !== undefined && root.payload !== null) expectString(root.payload);
      return normalizeUserUpdate(update, root);
    case 'bot_stopped':
    case 'dialog_cleared':
    case 'dialog_unmuted':
    case 'dialog_removed':
      return normalizeUserUpdate(update, root);
    default:
      throw new TypeError(`Unsupported known update: ${updateType satisfies never}`);
  }
}

function normalizeUserUpdate(update: UnknownRecord, root: UnknownRecord): UnknownRecord {
  return {
    ...update,
    chat_id: expectInt64(root.chat_id),
    user: normalizeUser(root.user),
  };
}

/**
 * Losslessly parses and classifies a raw MAX webhook or polling update.
 * Unknown payload data is discarded before descriptor normalization.
 * @param rawBody - UTF-8 JSON text or bytes received from MAX.
 * @returns A known typed update or a minimal future/legacy update tag.
 * @throws {MaxUpdateParseError} If the payload is malformed or a known shape is invalid.
 */
export function parseUpdate(rawBody: string | Uint8Array): ParsedUpdate {
  try {
    return classifyUpdate(parseLosslessJson(decodeBody(rawBody)));
  } catch (error) {
    if (error instanceof MaxUpdateParseError) throw error;
    throw new MaxUpdateParseError(error);
  }
}

/** Parses one raw GET /updates response with the same classifier used for webhooks. */
export function parseUpdatesResponse(rawBody: string): {
  readonly updates: ParsedUpdate[];
  readonly marker: Int64 | null;
} {
  try {
    const root = expectRecord(parseLosslessJson(rawBody));
    if (!Array.isArray(root.updates)) throw new TypeError('Expected updates array');
    for (const [key, value] of Object.entries(root)) {
      if (key !== 'updates' && key !== 'marker') normalizeWireValue(value);
    }
    return {
      updates: root.updates.map(classifyUpdate),
      marker: root.marker === null
        ? null
        : expectInt64(normalizeWireValue(root.marker, true)),
    };
  } catch (error) {
    if (error instanceof MaxUpdateParseError) throw error;
    throw new MaxUpdateParseError(error);
  }
}

function classifyUpdate(value: unknown): ParsedUpdate {
  const root = expectRecord(value);
  const updateType = expectString(root.update_type);
  if (updateType.length === 0) throw new TypeError('Expected a non-empty update type');
  if (!knownUpdateTypes.has(updateType)) return { kind: 'unknown', updateType };
  const normalizedUpdate = expectRecord(normalizeWireValue(root, updateDescriptor));

  return {
    kind: 'known',
    update: normalizeKnownUpdate(normalizedUpdate, updateType as UpdateType) as Update,
  };
}
