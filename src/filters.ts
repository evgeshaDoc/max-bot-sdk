import type {
  Message, MessageBody,
} from './core/network/api/types/message';
import type { Attachment } from './core/network/api/types/attachment';
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

/** Finds the first attachment with the requested discriminant. */
export function findAttachment<AttachmentType extends Attachment['type']>(
  message: Message | null | undefined,
  type: AttachmentType,
): Extract<Attachment, { type: AttachmentType }> | undefined {
  function matchesAttachmentType(
    attachment: Attachment,
  ): attachment is Extract<Attachment, { type: AttachmentType }> {
    return attachment.type === type;
  }

  return message?.body?.attachments?.find(matchesAttachmentType);
}
