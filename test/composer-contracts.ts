import { Bot } from '../src/bot';
import { Context } from '../src/context';
import type { MiddlewareObj } from '../src/middleware';

class CustomContext extends Context {
  isAdmin = false;
}

declare const bot: Bot<CustomContext>;
declare const plugin: MiddlewareObj<CustomContext>;

bot.use(plugin);
bot.use(bot.filter('message_created', (context) => {
  return context.isAdmin ? context.message.body : undefined;
}));
bot.on('message_created', (context) => {
  return context.isAdmin ? context.message.body : undefined;
});
bot.command('start', (context) => {
  return context.isAdmin ? context.message.body : undefined;
});
bot.hears(/echo (.+)?/, (context) => {
  return context.isAdmin ? context.match?.[1] : undefined;
});
bot.action('connect_wallet', (context) => {
  return context.isAdmin ? context.callback.callback_id : undefined;
});

const useChild = bot.use(plugin);
// @ts-expect-error linked children expose Composer members, not Bot lifecycle members
useChild.catch(() => undefined);

const removed = bot.when(
  (context): context is CustomContext & Context<{
    update_type: 'message_removed';
    timestamp: `${bigint}`;
    message_id: string;
    chat_id: `${bigint}`;
    user_id: `${bigint}`;
  }> => context.update.update_type === 'message_removed',
  (context) => context.update.message_id,
);
removed.use((context) => context.isAdmin && context.update.message_id);

bot.when(async (context) => context.isAdmin, (context) => {
  // @ts-expect-error asynchronous boolean predicates do not narrow context types
  return context.nonexistentFlavor;
});

bot.branch((context) => context.isAdmin, plugin).use((context) => context.isAdmin);
bot.errorBoundary((_error, context, next) => (
  context.isAdmin ? next() : undefined
), plugin).use((context) => context.isAdmin);
