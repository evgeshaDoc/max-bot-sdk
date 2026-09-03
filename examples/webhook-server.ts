import { Bot } from '@tlman/max-bot-sdk/bot';
import { serveWebhook } from '@tlman/max-bot-sdk/webhook-server';

const bot = new Bot(process.env.MAX_BOT_TOKEN ?? '');
bot.command('ping', (context) => context.reply('pong'));

async function main(): Promise<void> {
  const secret = process.env.MAX_WEBHOOK_SECRET;
  if (!secret) throw new TypeError('MAX_WEBHOOK_SECRET is required');
  await bot.initialize();
  const server = await serveWebhook(bot, {
    hostname: '127.0.0.1',
    port: 3000,
    secret,
  });

  console.log(`Local listener only: ${server.url}`);
}

main().catch(console.error);
