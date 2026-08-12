import { Bot } from '@tlman/max-bot-sdk/bot';
import { Context } from '@tlman/max-bot-sdk/context';

const token = process.env.MAX_BOT_TOKEN;
if (!token) throw new Error('Token must be provided');

class CustomContext extends Context {
  reply(...options: Parameters<Context['reply']>) {
    console.log(`Reply to ${this.chatId} with options: ${options}`);
    return super.reply(...options);
  }
}

const bot = new Bot(token, { contextType: CustomContext });

bot.api.setMyCommands([{
  name: 'start',
}]);

bot.command('start', (ctx) => {
  return ctx.reply('Hello!');
});

bot.start();
