import type { Rec } from '@tsofist/stem';

import type { Int64 } from './int64';
import type { Message } from './message';
import type { UserWithPhoto } from './user';

export type ChatType = 'dialog' | 'chat' | 'channel';

export type ChatStatus = 'active' | 'removed' | 'left' | 'closed';

/** Current MAX chat, channel or dialog metadata. */
export interface Chat {
  chat_id: Int64;
  type: ChatType;
  status: ChatStatus;
  title: string | null;
  icon: { url: string } | null;
  last_event_time: Int64;
  participants_count: number;
  owner_id?: Int64 | null;
  participants?: Rec<Int64> | null;
  is_public: boolean;
  link?: string | null;
  description: string | null;
  dialog_with_user?: UserWithPhoto | null;
  messages_count?: number | null;
  pinned_message?: Message | null;
}

export type SenderAction = 'typing_on' | 'sending_photo' | 'sending_video' | 'sending_audio' | 'sending_file' | 'mark_seen';

export type ChatAdminPermission =
  | 'read_all_messages'
  | 'add_remove_members'
  | 'add_admins'
  | 'change_chat_info'
  | 'pin_message'
  | 'edit_link'
  | 'write'
  | 'edit'
  | 'delete'
  | 'can_call'
  | 'view_stats'
  | 'edit_message'
  | 'delete_message'
  | 'post_edit_delete_message';

export type AssignableChatAdminPermission = Exclude<
ChatAdminPermission,
'view_stats' | 'can_call' | 'edit_message' | 'delete_message' | 'post_edit_delete_message'
>;

/** User or bot membership data returned by chat member endpoints. */
export interface ChatMember extends UserWithPhoto {
  last_access_time: Int64;
  is_owner: boolean;
  is_admin: boolean;
  join_time: Int64;
  permissions?: ChatAdminPermission[] | null;
  alias?: string;
}

/** Administrator assignment accepted by MAX chat admin endpoints. */
export interface ChatAdmin {
  user_id: Int64;
  permissions: AssignableChatAdminPermission[];
  alias?: string | null;
}
