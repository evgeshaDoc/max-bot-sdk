import type { FlattenReq } from '../types';
import type { PhotoAttachmentRequestPayload } from '../../types/attachment-request';
import type {
  Chat, ChatAdmin, ChatMember, SenderAction,
} from '../../types/chat';
import type { ActionResponse } from '../../types/common';
import type { Int64 } from '../../types/int64';
import type { Message } from '../../types/message';

type ChatPath = { chat_id: Int64 };

export type GetChatByIdDTO = { path: ChatPath };
export type GetChatByIdResponse = Chat;
export type EditChatInfoDTO = {
  path: ChatPath;
  body: {
    icon?: PhotoAttachmentRequestPayload | null;
    title?: string | null;
    pin?: string | null;
    /** @default true */
    notify?: boolean | null;
  };
};
export type EditChatExtra = Omit<FlattenReq<EditChatInfoDTO>, 'chat_id'>;
export type EditChatInfoResponse = Chat;

export type SendActionDTO = { path: ChatPath; body: { action: SenderAction } };
export type SendActionResponse = ActionResponse;

export type GetPinnedMessageDTO = { path: ChatPath };
export type GetPinnedMessageResponse = { message: Message | null };
export type PinMessageDTO = {
  path: ChatPath;
  body: { message_id: string; /** @default true */ notify?: boolean | null };
};
export type PinMessageExtra = Omit<FlattenReq<PinMessageDTO>, 'chat_id' | 'message_id'>;
export type PinMessageResponse = ActionResponse;
export type UnpinMessageDTO = { path: ChatPath };
export type UnpinMessageResponse = ActionResponse;

export type GetChatMembershipDTO = { path: ChatPath };
export type GetChatMembershipResponse = ChatMember;
export type LeaveChatDTO = { path: ChatPath };
export type LeaveChatResponse = ActionResponse;

export type GetChatAdminsDTO = { path: ChatPath };
export type GetChatAdminsResponse = { members: ChatMember[]; marker?: Int64 | null };

export type SetChatAdminsDTO = {
  path: ChatPath;
  body: { admins: readonly ChatAdmin[] };
};
export type SetChatAdminsResponse = ActionResponse;
export type RevokeChatAdminDTO = { path: ChatPath & { user_id: Int64 } };
export type RevokeChatAdminResponse = ActionResponse;

export type GetChatMembersDTO = {
  path: ChatPath;
  query: { user_ids?: readonly Int64[]; marker?: Int64; count?: number };
};
export type GetChatMembersExtra = Omit<FlattenReq<GetChatMembersDTO>, 'chat_id' | 'user_ids'> & {
  user_ids?: readonly Int64[];
};
export type GetChatMembersResponse = { members: ChatMember[]; marker?: Int64 | null };

export type AddChatMembersDTO = { path: ChatPath; body: { user_ids: readonly Int64[] } };
/** Per-reason details for users rejected by the add-members operation. */
export interface FailedUserDetails {
  error_code: 'add.participant.privacy' | 'add.participant.not.found';
  user_ids: Int64[];
}
export type AddChatMembersResponse = ActionResponse & {
  readonly failed_user_ids?: Int64[] | null;
  readonly failed_user_details?: FailedUserDetails[] | null;
};

export type RemoveChatMemberDTO = {
  path: ChatPath;
  query: { user_id: Int64; block?: boolean };
};
export type RemoveChatMemberResponse = ActionResponse;
