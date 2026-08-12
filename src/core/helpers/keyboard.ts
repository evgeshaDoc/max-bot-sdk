import type { InlineKeyboardAttachmentRequest } from '../network/api/types/attachment-request';

/** Builds a MAX inline keyboard attachment request. */
export function inlineKeyboard(
  buttons: InlineKeyboardAttachmentRequest['payload']['buttons'],
): InlineKeyboardAttachmentRequest {
  return {
    type: 'inline_keyboard',
    payload: { buttons },
  };
}
