import { createButton } from '../src/core/helpers/buttons';
import { inlineKeyboard } from '../src/core/helpers/keyboard';
import type { Button } from '../src/core/network/api/types/keyboard';

const callbackButton = createButton('callback', 'Confirm', 'confirm', { intent: 'positive' });
String(callbackButton.payload);
// @ts-expect-error callback overload returns no URL
String(callbackButton.url);

const buttons: Button[] = [
  callbackButton,
  createButton('link', 'MAX', 'https://max.ru'),
  createButton('request_contact', 'Contact'),
  createButton('request_geo_location', 'Location', { quick: true }),
  createButton('clipboard', 'Copy', 'value'),
  createButton('message', 'Reply', { intent: 'default' }),
  createButton('user_geo_location', 'Send location'),
  createButton('user_contact', 'Send contact'),
  createButton('chat', 'Chat', 'Support'),
  createButton('chat', 'Chat', 'Support', {
    uuid: '018f5f1e-7b84-7c3c-9bd8-df7b467216a6',
  }),
  createButton('open_app', 'App', 'https://app.test'),
];

const replyOnlyButton = createButton('user_contact', 'Send contact');
// @ts-expect-error reply-only buttons cannot be placed in an inline keyboard
inlineKeyboard([[replyOnlyButton]]);

for (const button of buttons) {
  if (button.type === 'user_geo_location') Boolean(button.quick);
}

// @ts-expect-error callback requires payload
createButton('callback', 'Missing payload');
// @ts-expect-error link accepts URL rather than callback payload
createButton('link', 'MAX', { payload: 'wrong' });
// @ts-expect-error contact ID must preserve MAX int64 as a decimal string
createButton('open_app', 'App', 'https://app.test', { contactId: 1 });
// @ts-expect-error chat UUID must be a UUID string
createButton('chat', 'Chat', 'Support', { uuid: 1 });
// @ts-expect-error arbitrary strings are not UUID-shaped
createButton('chat', 'Chat', 'Support', { uuid: 'not-a-uuid' });
