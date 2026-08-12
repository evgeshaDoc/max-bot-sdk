import type {
  Message, MessageBody,
} from './core/network/api/types/message';
import type {
  MessageCreatedUpdate, Update,
} from './core/network/api/types/update';

type MessageCreatedUpdateWithBody<Keys extends keyof MessageBody> = MessageCreatedUpdate & {
  message: Message & {
    body: MessageBody & Required<Pick<MessageBody, Keys>>;
  };
};

/** Creates a type guard for fields present in a created message body. */
export function createdMessageBodyHas<Keys extends Array<keyof MessageBody>>(
  ...keys: Keys
): (update: Update) => update is MessageCreatedUpdateWithBody<Keys[number]> {
  function messageBodyHas(
    update: Update,
  ): update is MessageCreatedUpdateWithBody<Keys[number]> {
    if (update.update_type !== 'message_created') return false;
    if (update.message.body === null) return false;
    for (const key of keys) {
      if (!(key in update.message.body)) return false;
      if (update.message.body[key] === undefined) return false;
    }
    return true;
  }

  return messageBodyHas;
}
