import { Bot } from '@tlman/max-bot-sdk/bot';
import * as button from '@tlman/max-bot-sdk/core/helpers/buttons';
import { inlineKeyboard } from '@tlman/max-bot-sdk/core/helpers/keyboard';

const token = process.env.MAX_BOT_TOKEN;
if (!token) throw new Error('Token not provided');

const bot = new Bot(token);

bot.api.setMyCommands([
  { name: 'callback', description: 'Send callback keyboard' },
  { name: 'geoLocation', description: 'Send geoLocation request' },
  { name: 'contact', description: 'Send geoLocation request' },
  { name: 'createChat', description: 'Create chat' },
]);

const defaultKeyboard = [
  [button.link('❤️', 'https://dev.max.ru/')],
  [button.callback('Remove message', 'remove_message', { intent: 'negative' })],
];

bot.action('remove_message', async (ctx) => {
  const result = await ctx.deleteMessage();
  await ctx.answerOnCallback({
    notification: result.success
        ? 'Successfully removed message'
        : 'Failed to remove message',
  });
});

/*  Callback keyboard  */

const callbackKeyboard = inlineKeyboard([
  [
    button.callback('default', 'color:default'),
    button.callback('positive', 'color:positive', { intent: 'positive' }),
    button.callback('negative', 'color:negative', { intent: 'negative' }),
  ],
  ...defaultKeyboard,
]);

bot.command('callback', (ctx) => {
  return ctx.reply('Callback keyboard', { attachments: [callbackKeyboard] });
});

bot.action(/color:(.+)/, async (ctx) => {
  return ctx.answerOnCallback({
    message: {
      text: `Your choice: ${ctx.match?.[1]} color`,
      attachments: [],
      link: null,
    },
  });
});

/*  GeoLocation keyboard  */

bot.command('geoLocation', async (ctx) => {
  return ctx.reply('GeoLocation keyboard', {
    attachments: [
      inlineKeyboard([
        [button.requestGeoLocation('Send geoLocation')],
        ...defaultKeyboard,
      ]),
    ],
  });
});

bot.on('message_created', async (ctx, next) => {
  if (!ctx.location) return next();
  return ctx.reply(`Your location: ${ctx.location.latitude}, ${ctx.location.longitude}`);
});

/*  Contact keyboard  */

bot.command('contact', async (ctx) => {
  return ctx.reply('Contact keyboard', {
    attachments: [
      inlineKeyboard([
        [button.requestContact('Send my contact')],
        ...defaultKeyboard,
      ]),
    ],
  });
});

bot.on('message_created', async (ctx, next) => {
  if (!ctx.contactInfo) return next();
  return ctx.reply(`Your name: ${ctx.contactInfo.fullName}\nYour phone: ${ctx.contactInfo.tel}`);
});

/*  CreateChat keyboard  */

bot.command(/createChat(.+)?/, async (ctx) => {
  const chatTitle = ctx.match?.[1]?.trim();
  if (!chatTitle) {
    return ctx.reply('Enter chat title after command');
  }
  return ctx.reply('Create chat keyboard', {
    attachments: [
      inlineKeyboard([[
        button.chat(`Create chat "${chatTitle}"`, chatTitle),
      ]]),
    ],
  });
});

bot.start();
