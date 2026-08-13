import type { Int64 } from '../network/api/types/int64';
import type {
  Button,
  CallbackButton,
  ChatButton,
  ClipboardButton,
  LinkButton,
  OpenAppButton,
  RequestContactButton,
  RequestGeoLocationButton,
  SendContactButton,
  SendGeoLocationButton,
  SendMessageButton,
} from '../network/api/types/keyboard';

type ButtonExtra<
  ButtonType extends Button,
  Omitted extends keyof Omit<ButtonType, 'text' | 'type'> | '' = '',
> = Omit<ButtonType, 'text' | 'type' | Omitted>;

type ButtonCreateArguments =
  | readonly [
    type: 'callback',
    text: string,
    payload: string,
    extra?: ButtonExtra<CallbackButton, 'payload'>,
  ]
  | readonly [type: 'link', text: string, url: string]
  | readonly [type: 'request_contact', text: string]
  | readonly [
    type: 'request_geo_location',
    text: string,
    extra?: ButtonExtra<RequestGeoLocationButton>,
  ]
  | readonly [type: 'clipboard', text: string, payload: string]
  | readonly [type: 'message', text: string, extra?: ButtonExtra<SendMessageButton>]
  | readonly [
    type: 'user_geo_location',
    text: string,
    extra?: ButtonExtra<SendGeoLocationButton>,
  ]
  | readonly [type: 'user_contact', text: string, extra?: ButtonExtra<SendContactButton>]
  | readonly [
    type: 'chat',
    text: string,
    chatTitle: string,
    extra?: ButtonExtra<ChatButton, 'chat_title'>,
  ]
  | readonly [type: 'open_app', text: string, webApp: string, options?: OpenAppOptions];

export interface OpenAppOptions {
  readonly contactId?: Int64 | null;
  readonly payload?: string | null;
}

/** Creates an inline callback button. */
export function callback(
  text: string,
  payload: string,
  extra?: ButtonExtra<CallbackButton, 'payload'>,
): CallbackButton {
  return {
    type: 'callback', text, payload, ...extra,
  };
}

/** Creates a button that opens an external URL. */
export function link(text: string, url: string): LinkButton {
  return { type: 'link', text, url };
}

/** Creates a button requesting the user's contact. */
export function requestContact(text: string): RequestContactButton {
  return { type: 'request_contact', text };
}

/** Creates a button requesting the user's location. */
export function requestGeoLocation(
  text: string,
  extra?: ButtonExtra<RequestGeoLocationButton>,
): RequestGeoLocationButton {
  return { type: 'request_geo_location', text, ...extra };
}

/** Creates a button that copies its payload to the clipboard. */
export function clipboard(text: string, payload: string): ClipboardButton {
  return { type: 'clipboard', text, payload };
}

/** Creates a reply button that sends a message payload. */
export function sendMessage(
  text: string,
  extra?: ButtonExtra<SendMessageButton>,
): SendMessageButton {
  return { type: 'message', text, ...extra };
}

/** Creates a reply button that sends the user's location. */
export function sendGeoLocation(
  text: string,
  extra?: ButtonExtra<SendGeoLocationButton>,
): SendGeoLocationButton {
  return { type: 'user_geo_location', text, ...extra };
}

/** Creates a reply button that sends the user's contact. */
export function sendContact(
  text: string,
  extra?: ButtonExtra<SendContactButton>,
): SendContactButton {
  return { type: 'user_contact', text, ...extra };
}

/** Creates a button that starts a chat with the bot. */
export function chat(
  text: string,
  chatTitle: string,
  extra?: ButtonExtra<ChatButton, 'chat_title'>,
): ChatButton {
  return {
    type: 'chat', text, chat_title: chatTitle, ...extra,
  };
}

/** Creates a button that opens a MAX mini app. */
export function openApp(
  text: string,
  webApp: string,
  options: OpenAppOptions = {},
): OpenAppButton {
  return {
    type: 'open_app',
    text,
    web_app: webApp,
    contact_id: options.contactId,
    payload: options.payload,
  };
}

/** Creates any supported button through its `type` discriminant. */
export function createButton(
  type: 'callback',
  text: string,
  payload: string,
  extra?: ButtonExtra<CallbackButton, 'payload'>,
): CallbackButton;
export function createButton(type: 'link', text: string, url: string): LinkButton;
export function createButton(type: 'request_contact', text: string): RequestContactButton;
export function createButton(
  type: 'request_geo_location',
  text: string,
  extra?: ButtonExtra<RequestGeoLocationButton>,
): RequestGeoLocationButton;
export function createButton(
  type: 'clipboard',
  text: string,
  payload: string,
): ClipboardButton;
export function createButton(
  type: 'message',
  text: string,
  extra?: ButtonExtra<SendMessageButton>,
): SendMessageButton;
export function createButton(
  type: 'user_geo_location',
  text: string,
  extra?: ButtonExtra<SendGeoLocationButton>,
): SendGeoLocationButton;
export function createButton(
  type: 'user_contact',
  text: string,
  extra?: ButtonExtra<SendContactButton>,
): SendContactButton;
export function createButton(
  type: 'chat',
  text: string,
  chatTitle: string,
  extra?: ButtonExtra<ChatButton, 'chat_title'>,
): ChatButton;
export function createButton(
  type: 'open_app',
  text: string,
  webApp: string,
  options?: OpenAppOptions,
): OpenAppButton;
export function createButton(...args: ButtonCreateArguments): Button {
  switch (args[0]) {
    case 'callback':
      return callback(args[1], args[2], args[3]);
    case 'link':
      return link(args[1], args[2]);
    case 'request_contact':
      return requestContact(args[1]);
    case 'request_geo_location':
      return requestGeoLocation(args[1], args[2]);
    case 'clipboard':
      return clipboard(args[1], args[2]);
    case 'message':
      return sendMessage(args[1], args[2]);
    case 'user_geo_location':
      return sendGeoLocation(args[1], args[2]);
    case 'user_contact':
      return sendContact(args[1], args[2]);
    case 'chat':
      return chat(args[1], args[2], args[3]);
    case 'open_app':
      return openApp(args[1], args[2], args[3]);
    default:
      throw new TypeError('Unsupported MAX button type');
  }
}
