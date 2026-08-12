import type { NullableObject } from '../../../helpers/types';

import type { Button, ReplyButton } from './keyboard';
import type { User } from './user';
import type { Int64 } from './int64';

type MediaPayload = {
  url: string;
  token: string;
};

export type PhotoAttachment = {
  type: 'image';
  payload: MediaPayload & {
    photo_id: Int64;
  }
};

export type VideoAttachment = {
  type: 'video';
  payload: MediaPayload;
  thumbnail?: { url: string } | null;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
};

export type AudioAttachment = {
  type: 'audio';
  payload: MediaPayload;
  transcription?: string | null;
};

export type FileAttachment = {
  type: 'file';
  payload: MediaPayload;
  filename: string;
  size: Int64;
};

export type StickerAttachment = {
  type: 'sticker';
  payload: {
    url: string;
    code: string
  };
  width: number;
  height: number;
};

export type ContactAttachment = {
  type: 'contact';
  payload: {
    vcf_info?: string | null;
    max_info?: User | null;
  }
};

export type ShareAttachment = {
  type: 'share';
  payload: Partial<NullableObject<MediaPayload>>;
  title?: string | null;
  description?: string | null;
  image_url?: string | null;
};

export type LocationAttachment = {
  type: 'location';
  latitude: number;
  longitude: number;
};

export type InlineKeyboardAttachment = {
  type: 'inline_keyboard';
  payload: {
    buttons: Button[][]
  }
};

export type ReplyKeyboardAttachment = {
  type: 'reply_keyboard';
  buttons: ReplyButton[][];
};

export type DataAttachment = {
  type: 'data';
  data: string;
};

export type Attachment =
  | PhotoAttachment
  | VideoAttachment
  | AudioAttachment
  | FileAttachment
  | StickerAttachment
  | ContactAttachment
  | InlineKeyboardAttachment
  | ReplyKeyboardAttachment
  | ShareAttachment
  | LocationAttachment
  | DataAttachment;
