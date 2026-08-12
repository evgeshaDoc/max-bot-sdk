# `5` Расширение контекста

Вы можете расширить контекст, который приходит при каждом обновлении:
```typescript
import { Bot } from '@tlman/max-bot-sdk/bot';
import { Context } from '@tlman/max-bot-sdk/context';

class MyContext extends Context {
  isAdmin = false;
}

const ADMIN_ID = '12345';

const bot = new Bot(process.env.MAX_BOT_TOKEN!, { contextType: MyContext });

bot.use(async (ctx, next) => {
  ctx.isAdmin = ctx.user?.user_id === ADMIN_ID;
  return next();
});

bot.command('start', async (ctx) => {
  if (ctx.isAdmin) {
    return ctx.reply('Привет, админ!');
  }
  return ctx.reply('Привет!');
});
```
