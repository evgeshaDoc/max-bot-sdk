import { Bot } from '../src/bot';
import { Context } from '../src/context';
import type { MessageCreatedUpdate } from '../src/core/network/api/types/update';
import { findAttachment } from '../src/filters';

class CustomContext extends Context {
  tenant = 'tenant';
}

declare const bot: Bot<CustomContext>;

bot.on('bot_added', (context): 'bot_added' => context.update.update_type);
bot.on('bot_started', (context): 'bot_started' => context.update.update_type);
bot.on('bot_stopped', (context): 'bot_stopped' => context.update.update_type);
bot.on('bot_removed', (context): 'bot_removed' => context.update.update_type);
bot.on('chat_title_changed', (context): 'chat_title_changed' => context.update.update_type);
bot.on('dialog_cleared', (context): 'dialog_cleared' => context.update.update_type);
bot.on('dialog_muted', (context): 'dialog_muted' => context.update.update_type);
bot.on('dialog_unmuted', (context): 'dialog_unmuted' => context.update.update_type);
bot.on('dialog_removed', (context): 'dialog_removed' => context.update.update_type);
bot.on('message_callback', (context): 'message_callback' => context.update.update_type);
bot.on('message_created', (context): 'message_created' => context.update.update_type);
bot.on('message_edited', (context): 'message_edited' => context.update.update_type);
bot.on('message_removed', (context): 'message_removed' => context.update.update_type);
bot.on('user_added', (context): 'user_added' => context.update.update_type);
bot.on('user_removed', (context): 'user_removed' => context.update.update_type);

bot.on('message_created:text', (context) => {
  context.message.body.text.toUpperCase();
  context.tenant.toUpperCase();
});

bot.on(['message_created:text', 'message_callback:payload'] as const, (context) => {
  if (context.update.update_type === 'message_created') {
    context.update.message.body.text.toUpperCase();
  }
  if (context.update.update_type === 'message_callback') {
    context.update.callback.payload.toUpperCase();
  }
});

bot.on('message_created:attachment:image', (context) => {
  const [first] = context.message.body.attachments;
  const attachmentType = first.type;
  // @ts-expect-error the query proves one image exists, not that every attachment is an image
  const photoId = first.payload.photo_id;
  const foundPhotoId = findAttachment(context.message, 'image')?.payload.photo_id;
  return [attachmentType, photoId, foundPhotoId];
});

bot.on('message_callback:message', (context) => context.message.body);
bot.on('message_callback:payload', (context) => context.callback.payload.toUpperCase());
bot.on('bot_started:payload', (context) => context.startPayload.toUpperCase());

bot.on('message_created', (context) => {
  // @ts-expect-error L1 narrowing does not guarantee a non-null body
  const { text } = context.message.body;
  return text;
});

const created = bot.on('message_created', (context) => context.tenant);
created.on('message_created:text', (context) => context.message.body.text.toUpperCase());

const explicit: Context<MessageCreatedUpdate> = undefined as never;
if (explicit.has('message_created:text')) explicit.message.body.text.toUpperCase();

// @ts-expect-error unknown update query
bot.on('future_event', () => undefined);
// @ts-expect-error invalid refinement
bot.on('message_created:future', () => undefined);
// @ts-expect-error invalid attachment discriminant
bot.on('message_created:attachment:future', () => undefined);
// @ts-expect-error wildcard shortcuts are intentionally unsupported
bot.on(':text', () => undefined);
