import { Bot } from '@tlman/max-bot-sdk/bot';
import type { Context } from '@tlman/max-bot-sdk/context';
import { session } from '@tlman/max-bot-sdk/session';
import type { SessionFlavor, StorageAdapter } from '@tlman/max-bot-sdk/session';

type CounterSession = { messages: number };
type AppContext = Context & SessionFlavor<CounterSession>;

const values = new Map<string, CounterSession>();
const storage: StorageAdapter<CounterSession> = {
  read(key) {
    const value = values.get(key);
    return value && { ...value };
  },
  write(key, value) {
    values.set(key, { ...value });
  },
  delete(key) {
    values.delete(key);
  },
};

const bot = new Bot<AppContext>(process.env.MAX_BOT_TOKEN ?? '');
bot.use(session({
  storage,
  getSessionKey(context) {
    return context.chatId ?? context.update.timestamp;
  },
  initial() {
    return { messages: 0 };
  },
}));

bot.on('message_created', async (context) => {
  context.session.messages += 1;
  await context.reply(`Messages in this session: ${context.session.messages}`);
});
