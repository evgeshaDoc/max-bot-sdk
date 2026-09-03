import type { EditMyCommandsDTO, EditMyCommandsResponse, GetMyInfoResponse } from './bots/types';
import type {
  AddChatMembersDTO, AddChatMembersResponse, EditChatInfoDTO, EditChatInfoResponse,
  GetChatAdminsDTO, GetChatAdminsResponse, GetChatByIdDTO, GetChatByIdResponse,
  GetChatMembersDTO, GetChatMembersResponse,
  GetChatMembershipDTO, GetChatMembershipResponse, GetPinnedMessageDTO,
  GetPinnedMessageResponse, LeaveChatDTO, LeaveChatResponse, PinMessageDTO,
  PinMessageResponse, RemoveChatMemberDTO, RemoveChatMemberResponse, RevokeChatAdminDTO,
  RevokeChatAdminResponse, SendActionDTO, SendActionResponse, SetChatAdminsDTO,
  SetChatAdminsResponse, UnpinMessageDTO, UnpinMessageResponse,
} from './chats/types';
import type {
  AnswerOnCallbackDTO, AnswerOnCallbackResponse, DeleteMessageDTO, DeleteMessageResponse,
  EditMessageDTO, EditMessageResponse, GetMessageDTO, GetMessageResponse, GetMessagesDTO,
  GetMessagesResponse, SendMessageDTO, SendMessageResponse,
} from './messages/types';
import type {
  CreateSubscriptionDTO, CreateSubscriptionResponse, DeleteSubscriptionDTO,
  DeleteSubscriptionResponse, GetSubscriptionsResponse, GetUpdatesDTO, GetUpdatesResponse,
} from './subscriptions/types';
import type { GetUploadUrlDTO, GetUploadUrlResponse } from './uploads/types';
import type { GetVideoDTO, GetVideoResponse } from './videos/types';

type ObjectPart<Request, Key extends PropertyKey> = Request extends Record<Key, infer Part>
  ? Part
  : object;

export type FlattenReq<Request> = ObjectPart<Request, 'body'>
& ObjectPart<Request, 'query'>
& ObjectPart<Request, 'path'>;

export interface ApiMethods {
  GET: {
    'chats/{chat_id}': { req: GetChatByIdDTO; res: GetChatByIdResponse };
    'chats/{chat_id}/members/admins': { req: GetChatAdminsDTO; res: GetChatAdminsResponse };
    'chats/{chat_id}/members': { req: GetChatMembersDTO; res: GetChatMembersResponse };
    'chats/{chat_id}/members/me': { req: GetChatMembershipDTO; res: GetChatMembershipResponse };
    'chats/{chat_id}/pin': { req: GetPinnedMessageDTO; res: GetPinnedMessageResponse };
    me: { req: object; res: GetMyInfoResponse };
    subscriptions: { req: object; res: GetSubscriptionsResponse };
    updates: { req: GetUpdatesDTO; res: GetUpdatesResponse };
    messages: { req: GetMessagesDTO; res: GetMessagesResponse };
    'messages/{message_id}': { req: GetMessageDTO; res: GetMessageResponse };
    'videos/{video_token}': { req: GetVideoDTO; res: GetVideoResponse };
  };
  POST: {
    'chats/{chat_id}/actions': { req: SendActionDTO; res: SendActionResponse };
    'chats/{chat_id}/members/admins': { req: SetChatAdminsDTO; res: SetChatAdminsResponse };
    'chats/{chat_id}/members': { req: AddChatMembersDTO; res: AddChatMembersResponse };
    subscriptions: { req: CreateSubscriptionDTO; res: CreateSubscriptionResponse };
    messages: { req: SendMessageDTO; res: SendMessageResponse };
    uploads: { req: GetUploadUrlDTO; res: GetUploadUrlResponse };
    answers: { req: AnswerOnCallbackDTO; res: AnswerOnCallbackResponse };
  };
  PATCH: {
    'me/commands': { req: EditMyCommandsDTO; res: EditMyCommandsResponse };
    'chats/{chat_id}': { req: EditChatInfoDTO; res: EditChatInfoResponse };
  };
  PUT: {
    messages: { req: EditMessageDTO; res: EditMessageResponse };
    'chats/{chat_id}/pin': { req: PinMessageDTO; res: PinMessageResponse };
  };
  DELETE: {
    messages: { req: DeleteMessageDTO; res: DeleteMessageResponse };
    subscriptions: { req: DeleteSubscriptionDTO; res: DeleteSubscriptionResponse };
    'chats/{chat_id}/pin': { req: UnpinMessageDTO; res: UnpinMessageResponse };
    'chats/{chat_id}/members': { req: RemoveChatMemberDTO; res: RemoveChatMemberResponse };
    'chats/{chat_id}/members/me': { req: LeaveChatDTO; res: LeaveChatResponse };
    'chats/{chat_id}/members/admins/{user_id}': {
      req: RevokeChatAdminDTO;
      res: RevokeChatAdminResponse;
    };
  };
}
