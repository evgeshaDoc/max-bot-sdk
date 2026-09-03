import type { FlattenReq } from '../types';
import type { AttachmentRequest } from '../../types/attachment-request';
import type { ActionResponse } from '../../types/common';
import type { Int64 } from '../../types/int64';
import type { Message, MessageLinkType } from '../../types/message';

export type GetMessageDTO = { path: { message_id: string } };
export type GetMessageResponse = Message;

export type GetMessagesDTO = {
  query: {
    chat_id?: Int64;
    message_ids?: string | null;
    from?: Int64;
    to?: Int64;
    count?: number;
  };
};
export type GetMessagesExtra = Omit<FlattenReq<GetMessagesDTO>, 'chat_id' | 'message_ids'> & {
  message_ids?: string[];
};
export type GetMessagesResponse = { messages: Message[] };

/** Body shared by send, edit and callback-answer message operations. */
export interface NewMessageBody {
  text: string | null;
  attachments: AttachmentRequest[] | null;
  link: { type: MessageLinkType; mid: string } | null;
  /** @default true */
  notify?: boolean;
  format?: 'markdown' | 'html' | null;
}

export type SendMessageDTO = {
  query: { user_id?: Int64; chat_id?: Int64; disable_link_preview?: boolean };
  body: NewMessageBody;
};
export type SendMessageExtra = Partial<Omit<FlattenReq<SendMessageDTO>, 'chat_id' | 'user_id' | 'text'>>;
export type SendMessageResponse = { message: Message };

export type DeleteMessageDTO = { query: { message_id: string } };
export type DeleteMessageExtra = Omit<FlattenReq<DeleteMessageDTO>, 'message_id'>;
export type DeleteMessageResponse = ActionResponse;

export type EditMessageDTO = { query: { message_id: string }; body: NewMessageBody };
export type EditMessageExtra = Partial<Omit<FlattenReq<EditMessageDTO>, 'message_id'>>;
export type EditMessageResponse = ActionResponse;

export type AnswerOnCallbackDTO = {
  query: { callback_id: string };
  body: { message?: NewMessageBody | null; notification?: string | null };
};
export type AnswerOnCallbackExtra = Omit<FlattenReq<AnswerOnCallbackDTO>, 'callback_id'>;
export type AnswerOnCallbackResponse = ActionResponse;
