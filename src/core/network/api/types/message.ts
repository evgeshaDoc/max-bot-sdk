import type { Attachment } from './attachment';
import type { ChatType } from './chat';
import type { MarkupElement } from './markup';
import type { User } from './user';
import type { Int64 } from './int64';

export type MessageSender = User;

export type MessageRecipient = {
  chat_id: Int64 | null;
  chat_type: ChatType;
  user_id: Int64 | null;
};

export type MessageBody = {
  mid: string;
  seq: Int64;
  text: string | null;
  attachments: Attachment[] | null;
  markup?: MarkupElement[] | null;
};

export type MessageLinkType = 'forward' | 'reply';

export type LinkedMessage = {
  type: MessageLinkType;
  sender?: MessageSender | null;
  chat_id?: Int64;
  message: MessageBody;
};

export type MessageStat = {
  views: number;
};

export type Message = {
  sender?: MessageSender | null;
  recipient: MessageRecipient;
  timestamp: Int64;
  link?: LinkedMessage | null;
  body: MessageBody | null;
  stat?: MessageStat | null;
  url?: string | null;
};
