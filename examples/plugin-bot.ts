import { Bot } from '@tlman/max-bot-sdk/bot';
import type { ApiTransformer } from '@tlman/max-bot-sdk/core/network/api/client';
import type { Context } from '@tlman/max-bot-sdk/context';
import type { NextFn } from '@tlman/max-bot-sdk/middleware';

type AuditFlavor = {
  audit: {
    updateType: string;
  };
};

type RequestFlavor = {
  requestId: string;
};

type PluginContext = Context & AuditFlavor & RequestFlavor;

const bot = new Bot<PluginContext>(process.env.MAX_BOT_TOKEN ?? '');

async function installFlavor(context: PluginContext, next: NextFn): Promise<void> {
  context.audit = { updateType: context.updateType };
  context.requestId = context.update.timestamp;
  await next();
}

const logApiDuration: ApiTransformer = async (next, call) => {
  const startedAt = performance.now();
  try {
    await next();
  } finally {
    console.log(call.method, call.route, performance.now() - startedAt);
  }
};

bot.use(installFlavor);
bot.api.use(logApiDuration);

bot.on('message_created:text', async (context) => {
  await context.reply(`${context.requestId}: ${context.audit.updateType}`);
});
