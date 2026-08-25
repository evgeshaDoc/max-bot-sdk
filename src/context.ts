import vCard from 'vcf';
import type { Guard, MaybeArray } from './core/helpers/types';
import type {
  AnswerOnCallbackExtra, EditMessageExtra, GetMessagesExtra, SendMessageExtra,
} from './core/network/api/modules/messages/types';
import type { BotInfo } from './core/network/api/types/bot';
import type { SenderAction } from './core/network/api/types/chat';
import type { Int64 } from './core/network/api/types/int64';
import type { Message } from './core/network/api/types/message';
import type {
  BotStartedUpdate, MessageCallbackUpdate, Update,
} from './core/network/api/types/update';
import type { User } from './core/network/api/types/user';

import { type Api } from './api';
import {
  EditChatExtra,
  GetChatMembersExtra,
  PinMessageExtra,
} from './core/network/api/modules/chats/types';
import { compileFilterQuery } from './filter-query';
import type { FilteredUpdateFor, FilterQuery } from './filter-query-types';

export type FilteredContext<
  ContextType extends Context,
  Filter extends FilterQuery | Guard<ContextType['update']>,
> = Filter extends FilterQuery
  ? ContextType & Context<FilteredUpdateFor<ContextType['update'], Filter>>
  : Filter extends Guard<ContextType['update'], infer GuardedUpdate>
    ? ContextType & Context<GuardedUpdate>
    : never;

type GetMessage<UpdateValue extends Update> =
  | UpdateValue extends MessageCallbackUpdate
    ? UpdateValue['message']
    : UpdateValue extends { message: Message }
      ? UpdateValue['message']
      : undefined;

type GetChatId<UpdateValue extends Update> =
    | UpdateValue extends { chat_id: Int64 }
      ? Int64
      : UpdateValue extends MessageCallbackUpdate
        ? Int64 | null | undefined
        : UpdateValue extends { message: Message }
          ? Int64 | null
          : undefined;

type GetMsgId<UpdateValue extends Update> =
    | UpdateValue extends { message_id: string }
      ? string
      : UpdateValue extends MessageCallbackUpdate
        ? string | undefined
        : UpdateValue extends { message: Message }
          ? string | undefined
          : undefined;

type GetCallback<UpdateValue extends Update> =
    | UpdateValue extends MessageCallbackUpdate
      ? UpdateValue['callback']
      : undefined;

type GetUser<UpdateValue extends Update> =
    | UpdateValue extends { user: User }
      ? User
      : UpdateValue extends MessageCallbackUpdate
        ? User
        : UpdateValue extends { message: Message }
          ? User | undefined
          : undefined;

type GetStartPayload<UpdateValue extends Update> =
    | UpdateValue extends BotStartedUpdate
      ? UpdateValue['payload']
      : undefined;

type ContactInfo = {
  tel?: string,
  fullName?: string,
};

type Location = {
  latitude: number
  longitude: number
};

type Sticker = {
  width: number;
  height: number;
  url: string;
  code: string;
};

export class Context<UpdateValue extends Update = Update> {
  match?: RegExpExecArray;

  constructor(
    readonly update: UpdateValue,
    readonly api: Api,
    readonly botInfo?: BotInfo,
  ) {}

  has<ContextType extends Context, Filter extends FilterQuery | Guard<ContextType['update']>>(
    this: ContextType,
    filters: MaybeArray<Filter>,
  ): this is FilteredContext<ContextType, Filter> {
    const filterList = (Array.isArray(filters) ? filters : [filters]) as readonly Filter[];
    for (const filter of filterList) {
      if (typeof filter === 'function' ? filter(this.update) : compileFilterQuery(filter)(this.update)) {
        return true;
      }
    }

    return false;
  }

  assert<Value extends string | number | object>(
    value: Value | null | undefined,
    method: string,
  ): asserts value is Value {
    if (value === undefined || value === null) {
      throw new TypeError(
        `MAX: "${method}" isn't available for "${this.updateType}"`,
      );
    }
  }

  get updateType() {
    return this.update.update_type;
  }

  get myId() {
    return this.botInfo?.user_id;
  }

  get startPayload() {
    return getStartPayload(this.update) as GetStartPayload<UpdateValue>;
  }

  get chatId() {
    return getChatId(this.update) as GetChatId<UpdateValue>;
  }

  get message() {
    return getMessage(this.update) as GetMessage<UpdateValue>;
  }

  get messageId() {
    return getMessageId(this.update) as GetMsgId<UpdateValue>;
  }

  get callback() {
    return getCallback(this.update) as GetCallback<UpdateValue>;
  }

  get user() {
    return getUser(this.update) as GetUser<UpdateValue>;
  }

  private _contactInfo?: ContactInfo;

  get contactInfo() {
    return (this._contactInfo ??= getContactInfo(this.update));
  }

  private _location?: Location;

  get location() {
    return (this._location ??= getLocation(this.update));
  }

  private _sticker?: Sticker;

  get sticker() {
    return (this._sticker ??= getSticker(this.update));
  }

  async reply(text: string, extra?: SendMessageExtra) {
    this.assert(this.chatId, 'reply');
    return this.api.sendMessageToChat(this.chatId, text, extra);
  }

  async getChat(chatId?: Int64) {
    if (chatId !== undefined) {
      return this.api.getChat(chatId);
    }
    this.assert(this.chatId, 'getChat');
    return this.api.getChat(this.chatId);
  }

  async editChatInfo(extra: EditChatExtra) {
    this.assert(this.chatId, 'editChatInfo');
    return this.api.editChatInfo(this.chatId, extra);
  }

  async getMessage(id: string) {
    return this.api.getMessage(id);
  }

  async getMessages(extra?: GetMessagesExtra) {
    this.assert(this.chatId, 'getMessages');
    return this.api.getMessages(this.chatId, extra);
  }

  async getPinnedMessage() {
    this.assert(this.chatId, 'getPinnedMessage');
    return this.api.getPinnedMessage(this.chatId);
  }

  async editMessage(extra: EditMessageExtra) {
    this.assert(this.messageId, 'editMessage');
    return this.api.editMessage(this.messageId, extra);
  }

  async deleteMessage(messageId?: string) {
    if (messageId !== undefined) {
      return this.api.deleteMessage(messageId);
    }
    this.assert(this.messageId, 'deleteMessage');
    return this.api.deleteMessage(this.messageId);
  }

  async answerOnCallback(extra: AnswerOnCallbackExtra) {
    this.assert(this.callback, 'answerOnCallback');
    return this.api.answerOnCallback(this.callback.callback_id, extra);
  }

  async getChatMembership() {
    this.assert(this.chatId, 'getChatMembership');
    return this.api.getChatMembership(this.chatId);
  }

  async getChatAdmins() {
    this.assert(this.chatId, 'getChatAdmins');
    return this.api.getChatAdmins(this.chatId);
  }

  async addChatMembers(userIds: Int64[]) {
    this.assert(this.chatId, 'addChatMembers');
    return this.api.addChatMembers(this.chatId, userIds);
  }

  async getChatMembers(extra?: GetChatMembersExtra) {
    this.assert(this.chatId, 'getChatMembers');
    return this.api.getChatMembers(this.chatId, extra);
  }

  async removeChatMember(userId: Int64) {
    this.assert(this.chatId, 'removeChatMember');
    return this.api.removeChatMember(this.chatId, userId);
  }

  async pinMessage(messageId: string, extra?: PinMessageExtra) {
    this.assert(this.chatId, 'pinMessage');
    return this.api.pinMessage(this.chatId, messageId, extra);
  }

  async unpinMessage() {
    this.assert(this.chatId, 'unpinMessage');
    return this.api.unpinMessage(this.chatId);
  }

  async sendAction(action: SenderAction) {
    this.assert(this.chatId, 'sendAction');
    return this.api.sendAction(this.chatId, action);
  }

  async leaveChat() {
    this.assert(this.chatId, 'leaveChat');
    return this.api.leaveChat(this.chatId);
  }
}

function getChatId(update: Update) {
  if ('chat_id' in update) {
    return update.chat_id;
  }
  if ('message' in update && update.message && 'recipient' in update.message) {
    return update.message.recipient.chat_id;
  }

  return undefined;
}

function getMessage(update: Update) {
  if ('message' in update) {
    return update.message;
  }
  return undefined;
}

function getMessageId(update: Update) {
  if ('message_id' in update) {
    return update.message_id;
  }

  if ('message' in update) {
    return update.message?.body?.mid;
  }

  return undefined;
}

function getCallback(update: Update) {
  if ('callback' in update) {
    return update.callback;
  }
  return undefined;
}

function getContactInfo(update: Update): ContactInfo | undefined {
  const message = getMessage(update);
  if (!message?.body) return undefined;
  const contact = message.body.attachments?.find((attachment) => {
    return attachment.type === 'contact';
  });
  if (!contact?.payload.vcf_info) return undefined;
  // eslint-disable-next-line new-cap
  const vcf = new vCard().parse(contact.payload.vcf_info);
  return {
    tel: vcf.get('tel').valueOf() as string | undefined,
    fullName: vcf.get('fn').valueOf() as string | undefined,
  };
}

function getLocation(update: Update): Location | undefined {
  const message = getMessage(update);
  if (!message?.body) return undefined;
  const location = message.body.attachments?.find((attachment) => {
    return attachment.type === 'location';
  });
  if (!location) return undefined;
  return {
    latitude: location.latitude,
    longitude: location.longitude,
  };
}

function getSticker(update: Update): Sticker | undefined {
  const message = getMessage(update);
  if (!message?.body) return undefined;
  const sticker = message.body.attachments?.find((attachment) => {
    return attachment.type === 'sticker';
  });
  if (!sticker) return undefined;
  return {
    width: sticker.width,
    height: sticker.height,
    url: sticker.payload.url,
    code: sticker.payload.code,
  };
}

function getUser(update: Update): User | undefined {
  if ('user' in update) {
    return update.user;
  }

  if (update.update_type === 'message_callback') {
    return update.callback.user;
  }

  if (update.update_type === 'message_created') {
    return update.message.sender || undefined;
  }

  return undefined;
}

function getStartPayload(update: Update): string | null | undefined {
  if (update.update_type === 'bot_started') {
    return update.payload;
  }
  return undefined;
}
