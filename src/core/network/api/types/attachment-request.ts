import type { NullableObject } from '../../../helpers/types';

import type { Button, ReplyButton } from './keyboard';
import type { Int64 } from './int64';

type MediaAttachmentRequestPayload = {
  token?: string;
};

export type ImageAttachmentRequest = {
  type: 'image';
  payload: MediaAttachmentRequestPayload & {
    url?: string | null;
    photos?: {
      [key: string]: { token: string }
    } | null
  }
};

export type VideoAttachmentRequest = {
  type: 'video';
  payload: MediaAttachmentRequestPayload;
};

export type AudioAttachmentRequest = {
  type: 'audio';
  payload: MediaAttachmentRequestPayload;
};

export type FileAttachmentRequest = {
  type: 'file';
  payload: MediaAttachmentRequestPayload;
};

export type ContactAttachmentRequest = {
  type: 'contact';
  payload: {
    name: string | null;
    contact_id?: Int64 | null;
    vcf_info?: string | null;
    vcf_phone?: string | null;
  }
};

export type StickerAttachmentRequest = {
  type: 'sticker';
  payload: {
    code: string
  };
};

export type InlineKeyboardAttachmentRequest = {
  type: 'inline_keyboard';
  payload: {
    buttons: Button[][]
  }
};

export type ReplyKeyboardAttachmentRequest = {
  type: 'reply_keyboard';
  buttons: ReplyButton[][];
  direct?: boolean;
  direct_user_id?: Int64 | null;
};

export type LocationAttachmentRequest = {
  type: 'location';
  latitude: number;
  longitude: number;
};

export type ShareAttachmentRequest = {
  type: 'share';
  payload: Partial<NullableObject<MediaAttachmentRequestPayload> & {
    url?: string | null;
  }>;
};

export type PhotoAttachmentRequestPayload = {
  url?: string | null;
  token?: string | null;
  photos?: Record<string, { token: string }> | null;
};

export type AttachmentRequest =
    | ImageAttachmentRequest
    | VideoAttachmentRequest
    | AudioAttachmentRequest
    | FileAttachmentRequest
    | StickerAttachmentRequest
    | ContactAttachmentRequest
    | InlineKeyboardAttachmentRequest
    | ReplyKeyboardAttachmentRequest
    | ShareAttachmentRequest
    | LocationAttachmentRequest;

export type AttachmentType = AttachmentRequest['type'];
