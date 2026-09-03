import {
  AudioAttachment,
  FileAttachment,
  ImageAttachment,
  VideoAttachment,
} from './core/helpers/attachments';
import type { MaybeArray } from './core/helpers/types';
import { Upload } from './core/helpers/upload';
import type {
  UploadAudioOptions,
  UploadFileOptions,
  UploadImageOptions,
  UploadVideoOptions,
} from './core/helpers/upload';
import type { Client } from './core/network/api/client-types';
import type { ApiTransformer } from './core/network/api/transformer-types';
import { MaxError, MaxErrorKind } from './core/network/api/error';
import type { BotCommand } from './core/network/api/types/bot';
import type { ChatAdmin, SenderAction } from './core/network/api/types/chat';
import type { Int64 } from './core/network/api/types/int64';
import { KnownUpdateTypes } from './core/network/api/types/update';
import type { UpdateType } from './core/network/api/types/update';
import type {
  EditChatExtra,
  GetChatMembersExtra,
  PinMessageExtra,
} from './core/network/api/modules/chats/types';
import type {
  AnswerOnCallbackExtra,
  DeleteMessageExtra,
  EditMessageExtra,
  GetMessagesExtra,
  SendMessageExtra,
} from './core/network/api/modules/messages/types';
import type {
  CreateSubscriptionInput,
  GetUpdatesOptions,
} from './core/network/api/modules/subscriptions/types';
import { RawApi } from './core/network/api/raw-api';

const KNOWN_UPDATE_TYPE_SET = new Set<string>(KnownUpdateTypes);
const SUBSCRIPTION_SECRET_PATTERN = /^[A-Za-z0-9_-]{5,256}$/;

function validateSubscriptionUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new MaxError('Subscription URL must be a valid HTTPS URL', {
      kind: MaxErrorKind.Protocol,
    });
  }

  const authority = value.slice('https://'.length).split(/[/?#]/, 1)[0];
  const hasExplicitPort = /:\d+$/.test(authority) || /\]:\d+$/.test(authority);
  if (url.protocol !== 'https:' || url.username || url.password || hasExplicitPort) {
    throw new MaxError('Subscription URL must use HTTPS without credentials or an explicit port', {
      kind: MaxErrorKind.Protocol,
    });
  }
}

function validateSubscriptionInput(input: CreateSubscriptionInput): void {
  validateSubscriptionUrl(input.url);
  if (input.secret !== undefined && !SUBSCRIPTION_SECRET_PATTERN.test(input.secret)) {
    throw new MaxError('Subscription secret must contain 5-256 URL-safe characters', {
      kind: MaxErrorKind.Protocol,
    });
  }
  if (input.update_types?.some((type) => !KNOWN_UPDATE_TYPE_SET.has(type))) {
    throw new MaxError('Subscription contains an unsupported update type', {
      kind: MaxErrorKind.Protocol,
    });
  }
}

/** Friendly API for all current MAX Bot API methods. */
export class Api {
  private readonly client: Client;

  readonly raw: RawApi;

  readonly upload: Upload;

  constructor(client: Client) {
    this.client = client;
    this.raw = new RawApi(client);
    this.upload = new Upload(this);
  }

  /** Adds global transformers for future API calls. */
  use(...transformers: ApiTransformer[]): this {
    this.client.use(...transformers);
    return this;
  }

  /** Returns the bot profile associated with the configured token. */
  async getMyInfo() {
    return this.raw.bots.getMyInfo();
  }

  /** Replaces the bot's command list. */
  async setMyCommands(commands: readonly BotCommand[]) {
    return this.raw.bots.editMyCommands({ commands });
  }

  /** Removes all bot commands. */
  async deleteMyCommands() {
    return this.raw.bots.editMyCommands({ commands: [] });
  }

  /** Returns a chat, channel or dialog by decimal chat ID. */
  async getChat(chatId: Int64) {
    return this.raw.chats.getById({ chat_id: chatId });
  }

  /** Updates selected chat or channel metadata. */
  async editChatInfo(chatId: Int64, extra: EditChatExtra) {
    return this.raw.chats.edit({ ...extra, chat_id: chatId });
  }

  /** Sends a message to a chat or channel. */
  async sendMessageToChat(chatId: Int64, text: string, extra: SendMessageExtra = {}) {
    const { message } = await this.raw.messages.send({
      attachments: null,
      link: null,
      ...extra,
      chat_id: chatId,
      user_id: undefined,
      text,
    });
    return message;
  }

  /** Sends a message to a user dialog. */
  async sendMessageToUser(userId: Int64, text: string, extra: SendMessageExtra = {}) {
    const { message } = await this.raw.messages.send({
      attachments: null,
      link: null,
      ...extra,
      user_id: userId,
      chat_id: undefined,
      text,
    });
    return message;
  }

  /** Returns messages from a chat or channel. */
  async getMessages(chatId: Int64, { message_ids, ...extra }: GetMessagesExtra = {}) {
    return this.raw.messages.get({
      ...extra,
      chat_id: chatId,
      message_ids: message_ids?.join(','),
    });
  }

  /** Returns one message by its string identifier. */
  async getMessage(messageId: string) {
    return this.raw.messages.getById({ message_id: messageId });
  }

  /** Edits an existing message or channel post. */
  async editMessage(messageId: string, extra: EditMessageExtra = {}) {
    return this.raw.messages.edit({
      text: null,
      attachments: null,
      link: null,
      ...extra,
      message_id: messageId,
    });
  }

  /** Deletes a message or channel post. */
  async deleteMessage(messageId: string, extra: DeleteMessageExtra = {}) {
    return this.raw.messages.delete({ ...extra, message_id: messageId });
  }

  /** Sends a message edit or notification in response to a callback. */
  async answerOnCallback(callbackId: string, extra: AnswerOnCallbackExtra = {}) {
    return this.raw.messages.answerOnCallback({ ...extra, callback_id: callbackId });
  }

  /** Returns the current bot's membership in a chat or channel. */
  async getChatMembership(chatId: Int64) {
    return this.raw.chats.getChatMembership({ chat_id: chatId });
  }

  /** Returns administrators of a chat or channel. */
  async getChatAdmins(chatId: Int64) {
    return this.raw.chats.getChatAdmins({ chat_id: chatId });
  }

  /** Assigns current documented administrator permissions. */
  async setChatAdmins(chatId: Int64, admins: readonly ChatAdmin[]) {
    return this.raw.chats.setChatAdmins({ chat_id: chatId, admins });
  }

  /** Revokes administrator rights without removing the member. */
  async revokeChatAdmin(chatId: Int64, userId: Int64) {
    return this.raw.chats.revokeChatAdmin({ chat_id: chatId, user_id: userId });
  }

  /** Adds users to a group chat. */
  async addChatMembers(chatId: Int64, userIds: readonly Int64[]) {
    return this.raw.chats.addChatMembers({ chat_id: chatId, user_ids: userIds });
  }

  /** Returns members of a chat or channel. */
  async getChatMembers(
    chatId: Int64,
    { user_ids, ...extra }: GetChatMembersExtra = {},
  ) {
    return this.raw.chats.getChatMembers({
      ...extra,
      chat_id: chatId,
      user_ids,
    });
  }

  /** Removes or optionally blocks one chat member. */
  async removeChatMember(chatId: Int64, userId: Int64, block?: boolean) {
    return this.raw.chats.removeChatMember({ chat_id: chatId, user_id: userId, block });
  }

  /** Returns all active webhook subscriptions. */
  async getSubscriptions() {
    return this.raw.subscriptions.getSubscriptions();
  }

  /** Creates or replaces a validated HTTPS webhook subscription. */
  async createSubscription(input: CreateSubscriptionInput) {
    validateSubscriptionInput(input);
    return this.raw.subscriptions.createSubscription(input);
  }

  /** Deletes the webhook subscription for the exact URL. */
  async deleteSubscription(url: string) {
    validateSubscriptionUrl(url);
    return this.raw.subscriptions.deleteSubscription({ url });
  }

  /** Returns an ordered long-poll page classified into known and future updates. */
  async getUpdates(
    types: MaybeArray<UpdateType> = [],
    extra: GetUpdatesOptions = {},
  ) {
    const updateTypes = typeof types === 'string' ? [types] : types;
    return this.raw.subscriptions.getUpdates({
      ...extra,
      types: updateTypes.length === 0 ? undefined : updateTypes,
    });
  }

  /** Returns the message pinned in a chat or channel. */
  async getPinnedMessage(chatId: Int64) {
    return this.raw.chats.getPinnedMessage({ chat_id: chatId });
  }

  /** Pins a message in a chat or channel. */
  async pinMessage(chatId: Int64, messageId: string, extra: PinMessageExtra = {}) {
    return this.raw.chats.pinMessage({ ...extra, chat_id: chatId, message_id: messageId });
  }

  /** Removes the pinned message from a chat or channel. */
  async unpinMessage(chatId: Int64) {
    return this.raw.chats.unpinMessage({ chat_id: chatId });
  }

  /** Sends a transient bot action such as typing or mark-seen. */
  async sendAction(chatId: Int64, action: SenderAction) {
    return this.raw.chats.sendAction({ chat_id: chatId, action });
  }

  /** Removes the current bot from a chat or channel. */
  async leaveChat(chatId: Int64) {
    return this.raw.chats.leaveChat({ chat_id: chatId });
  }

  /** Returns playback URLs and metadata for a video attachment. */
  async getVideo(videoToken: string) {
    return this.raw.videos.get({ video_token: videoToken });
  }

  /** Uploads an image and returns a ready attachment helper. */
  async uploadImage(options: UploadImageOptions) {
    return new ImageAttachment(await this.upload.image(options));
  }

  /** Uploads a video and returns a ready attachment helper. */
  async uploadVideo(options: UploadVideoOptions) {
    const data = await this.upload.video(options);
    return new VideoAttachment({ token: data.token });
  }

  /** Uploads audio and returns a ready attachment helper. */
  async uploadAudio(options: UploadAudioOptions) {
    const data = await this.upload.audio(options);
    return new AudioAttachment({ token: data.token });
  }

  /** Uploads a file and returns a ready attachment helper. */
  async uploadFile(options: UploadFileOptions) {
    const data = await this.upload.file(options);
    return new FileAttachment({ token: data.token });
  }
}
