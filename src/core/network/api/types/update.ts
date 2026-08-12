import type { Int64 } from './int64';
import type { Message } from './message';
import type { User, UserLocale } from './user';

/** Current update discriminants documented by MAX. */
export const KnownUpdateTypes = [
  'bot_added',
  'bot_started',
  'bot_stopped',
  'bot_removed',
  'chat_title_changed',
  'dialog_cleared',
  'dialog_muted',
  'dialog_unmuted',
  'dialog_removed',
  'message_callback',
  'message_created',
  'message_edited',
  'message_removed',
  'user_added',
  'user_removed',
] as const;

export type UpdateType = (typeof KnownUpdateTypes)[number];

type MakeUpdate<Kind extends UpdateType, Payload extends object> = {
  update_type: Kind;
  timestamp: Int64;
} & Payload;

/** Callback data delivered when a user presses an inline button. */
export interface Callback {
  timestamp: Int64;
  callback_id: string;
  payload?: string;
  user: User;
}

export type MessageCallbackUpdate = MakeUpdate<'message_callback', {
  callback: Callback;
  message: Message | null;
  user_locale?: UserLocale | null;
}>;

export type MessageCreatedUpdate = MakeUpdate<'message_created', {
  message: Message;
  user_locale?: UserLocale | null;
}>;

export type MessageRemovedUpdate = MakeUpdate<'message_removed', {
  message_id: string;
  chat_id: Int64;
  user_id: Int64;
}>;

export type MessageEditedUpdate = MakeUpdate<'message_edited', { message: Message }>;

type ChatMembershipUpdate<Kind extends 'bot_added' | 'bot_removed'> = MakeUpdate<Kind, {
  chat_id: Int64;
  user: User;
  is_channel: boolean;
}>;

export type BotAddedUpdate = ChatMembershipUpdate<'bot_added'>;
export type BotRemovedUpdate = ChatMembershipUpdate<'bot_removed'>;

export type UserAddedUpdate = MakeUpdate<'user_added', {
  chat_id: Int64;
  user: User;
  inviter_id?: Int64 | null;
  is_channel: boolean;
}>;

export type UserRemovedUpdate = MakeUpdate<'user_removed', {
  chat_id: Int64;
  user: User;
  admin_id?: Int64 | null;
  is_channel: boolean;
}>;

type DialogUserUpdate<Kind extends
| 'bot_started'
| 'bot_stopped'
| 'dialog_cleared'
| 'dialog_removed'
| 'dialog_unmuted'> = MakeUpdate<Kind, {
  chat_id: Int64;
  user: User;
  user_locale?: UserLocale;
}>;

export type BotStartedUpdate = DialogUserUpdate<'bot_started'> & { payload?: string | null };
export type BotStoppedUpdate = DialogUserUpdate<'bot_stopped'>;
export type DialogClearedUpdate = DialogUserUpdate<'dialog_cleared'>;
export type DialogRemovedUpdate = DialogUserUpdate<'dialog_removed'>;
export type DialogUnmutedUpdate = DialogUserUpdate<'dialog_unmuted'>;
export type DialogMutedUpdate = MakeUpdate<'dialog_muted', {
  chat_id: Int64;
  user: User;
  muted_until: Int64;
  user_locale?: UserLocale;
}>;

export type ChatTitleChangedUpdate = MakeUpdate<'chat_title_changed', {
  chat_id: Int64;
  user: User;
  title: string;
}>;

/** Every update kind currently documented by MAX. */
export type Update =
  | BotAddedUpdate
  | BotStartedUpdate
  | BotStoppedUpdate
  | BotRemovedUpdate
  | ChatTitleChangedUpdate
  | DialogClearedUpdate
  | DialogMutedUpdate
  | DialogUnmutedUpdate
  | DialogRemovedUpdate
  | MessageCallbackUpdate
  | MessageCreatedUpdate
  | MessageEditedUpdate
  | MessageRemovedUpdate
  | UserAddedUpdate
  | UserRemovedUpdate;

export type FilteredUpdate<Kind extends UpdateType> = Extract<Update, { update_type: Kind }>;

/** Lossless result of classifying one raw MAX update. */
export type ParsedUpdate =
  | { readonly kind: 'known'; readonly update: Update }
  | { readonly kind: 'unknown'; readonly updateType: string };
