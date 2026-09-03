import assert from 'node:assert/strict';
import test from 'node:test';

import {
  callback,
  chat,
  clipboard,
  createButton,
  link,
  openApp,
  requestContact,
  requestGeoLocation,
  sendContact,
  sendGeoLocation,
  sendMessage,
} from '../src/core/helpers/buttons';

test('createButton delegates every discriminant to its typed factory', () => {
  const cases = [
    [
      createButton('callback', 'Confirm', 'confirm'),
      callback('Confirm', 'confirm'),
    ],
    [
      createButton('link', 'MAX', 'https://max.ru'),
      link('MAX', 'https://max.ru'),
    ],
    [
      createButton('request_contact', 'Contact'),
      requestContact('Contact'),
    ],
    [
      createButton('request_geo_location', 'Location', { quick: true }),
      requestGeoLocation('Location', { quick: true }),
    ],
    [
      createButton('clipboard', 'Copy', 'value'),
      clipboard('Copy', 'value'),
    ],
    [
      createButton('message', 'Reply', { payload: 'reply' }),
      sendMessage('Reply', { payload: 'reply' }),
    ],
    [
      createButton('user_geo_location', 'Send location', { quick: true }),
      sendGeoLocation('Send location', { quick: true }),
    ],
    [
      createButton('user_contact', 'Send contact', { payload: 'contact' }),
      sendContact('Send contact', { payload: 'contact' }),
    ],
    [
      createButton('chat', 'Chat', 'Support'),
      chat('Chat', 'Support'),
    ],
    [
      createButton('open_app', 'App', 'https://app.test'),
      openApp('App', 'https://app.test'),
    ],
  ] as const;

  for (const [created, expected] of cases) assert.deepEqual(created, expected);
  assert.throws(
    () => Reflect.apply(createButton, undefined, ['unsupported', 'Text']),
    TypeError,
  );
});
