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
