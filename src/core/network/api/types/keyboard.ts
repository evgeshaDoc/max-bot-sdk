import type { Int64 } from './int64';

export type ButtonIntent = 'default' | 'positive' | 'negative';

export type CallbackButton = {
  type: 'callback';
  text: string;
  payload: string;
  intent?: ButtonIntent;
};

export type LinkButton = {
  type: 'link';
  text: string;
  url: string;
};

export type RequestContactButton = {
  type: 'request_contact';
  text: string;
};

export type RequestGeoLocationButton = {
  type: 'request_geo_location';
  text: string;
  quick?: boolean;
};

export type ClipboardButton = {
  type: 'clipboard';
  text: string;
  payload: string;
};

export type SendMessageButton = {
  type: 'message';
  text: string;
  payload?: string | null;
  intent?: ButtonIntent;
};

export type SendGeoLocationButton = {
  type: 'user_geo_location';
  text: string;
  payload?: string | null;
  /** @default false */
  quick?: boolean;
};

export type SendContactButton = {
  type: 'user_contact';
  text: string;
  payload?: string | null;
};

export type ReplyButton = SendMessageButton | SendGeoLocationButton | SendContactButton;

export type ChatButton = {
  type: 'chat',
  text: string;
  chat_title: string;
  chat_description?: string | null;
  start_payload?: string | null;
  uuid?: number | null;
};

export type OpenAppButton = {
  type: 'open_app';
  text: string;
  web_app: string;
  contact_id?: Int64 | null;
  payload?: string | null;
};

export type Button =
  | CallbackButton
  | LinkButton
  | RequestContactButton
  | RequestGeoLocationButton
  | SendMessageButton
  | ChatButton
  | OpenAppButton
  | ClipboardButton;
