import type { Rec } from '@tsofist/stem';
import { keysOf } from '@tsofist/stem/lib/object/keys';

import type { Guard } from './core/helpers/types';
import type { Attachment } from './core/network/api/types/attachment';
import { KnownUpdateTypes, type Update } from './core/network/api/types/update';
import type { FilterQuery, FilterQueryUpdate } from './filter-query-types';

export type {
  AttachmentQueryType,
  FilteredUpdateFor,
  FilterQuery,
  FilterQueryUpdate,
} from './filter-query-types';

const AttachmentQueryTypes = {
  image: true,
  video: true,
  audio: true,
  file: true,
  sticker: true,
  contact: true,
  inline_keyboard: true,
  reply_keyboard: true,
  share: true,
  location: true,
  data: true,
} as const satisfies Rec<true, Attachment['type']>;

const UpdateTypeSet = new Set<string>(KnownUpdateTypes);
const AttachmentQueryTypeSet = new Set<string>(keysOf(AttachmentQueryTypes));
const MessageUpdateTypeSet = new Set<string>(['message_created', 'message_edited']);

/** Compiles one validated MAX filter query into an update predicate. */
export function compileFilterQuery<Query extends FilterQuery>(
  query: Query,
): Guard<Update, FilterQueryUpdate<Update, Query>> {
  if (typeof query !== 'string') {
    throw new TypeError(
      `Invalid MAX filter query ${String(query)}. Expected an update type, `
      + 'message text/attachment refinement, callback payload/message, or bot start payload.',
    );
  }
  const segments = query.split(':');
  if (!isValidQuery(segments)) {
    throw new TypeError(
      `Invalid MAX filter query ${String(query)}. Expected an update type, `
      + 'message text/attachment refinement, callback payload/message, or bot start payload.',
    );
  }

  function matchesFilterQuery(
    update: Update,
  ): update is FilterQueryUpdate<Update, Query> {
    if (update.update_type !== segments[0]) return false;
    if (segments.length === 1) return true;

    if (update.update_type === 'message_created' || update.update_type === 'message_edited') {
      const { body } = update.message;
      if (body === null) return false;
      if (segments[1] === 'text') return body.text !== null;
      if (body.attachments === null || body.attachments.length === 0) return false;
      return segments.length === 2
        || body.attachments.some((attachment) => attachment.type === segments[2]);
    }

    if (update.update_type === 'message_callback') {
      return segments[1] === 'payload'
        ? update.callback.payload !== undefined
        : update.message !== null;
    }

    return update.update_type === 'bot_started'
      && update.payload !== undefined
      && update.payload !== null;
  }

  return matchesFilterQuery;
}

function isValidQuery(segments: string[]): boolean {
  if (segments.length === 1) return UpdateTypeSet.has(segments[0]);
  if (segments.length > 3 || !MessageUpdateTypeSet.has(segments[0])) {
    return segments.length === 2 && (
      (segments[0] === 'message_callback'
        && (segments[1] === 'payload' || segments[1] === 'message'))
      || (segments[0] === 'bot_started' && segments[1] === 'payload')
    );
  }
  if (segments[1] === 'text') return segments.length === 2;
  if (segments[1] !== 'attachment') return false;
  return segments.length === 2
    || (segments.length === 3 && AttachmentQueryTypeSet.has(segments[2]));
}
