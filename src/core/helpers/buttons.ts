import type { Int64 } from '../network/api/types/int64';
import type {
  Button,
  CallbackButton,
  ChatButton,
  LinkButton,
  OpenAppButton,
  RequestContactButton,
  RequestGeoLocationButton,
} from '../network/api/types/keyboard';

type ButtonExtra<
  ButtonType extends Button,
  Omitted extends keyof Omit<ButtonType, 'text' | 'type'> | '' = '',
> = Omit<ButtonType, 'text' | 'type' | Omitted>;

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
