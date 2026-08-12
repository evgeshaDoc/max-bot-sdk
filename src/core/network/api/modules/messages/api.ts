import { BaseApi } from '../../base-api';
import type { FlattenReq } from '../types';
import type {
  AnswerOnCallbackDTO,
  AnswerOnCallbackResponse,
  DeleteMessageDTO,
  DeleteMessageResponse,
  EditMessageDTO,
  EditMessageResponse,
  GetMessageDTO,
  GetMessageResponse,
  GetMessagesDTO,
  GetMessagesResponse,
  SendMessageDTO,
  SendMessageResponse,
} from './types';

export class MessagesApi extends BaseApi {
  async get(query: FlattenReq<GetMessagesDTO>): Promise<GetMessagesResponse> {
    return this._get('messages', { query });
  }

  async getById({ message_id }: FlattenReq<GetMessageDTO>): Promise<GetMessageResponse> {
    return this._get('messages/{message_id}', { path: { message_id } });
  }

  async send({
    chat_id, user_id, disable_link_preview, ...body
  }: FlattenReq<SendMessageDTO>): Promise<SendMessageResponse> {
    return this._post('messages', {
      body,
      query: { chat_id, user_id, disable_link_preview },
    });
  }

  async edit({ message_id, ...body }: FlattenReq<EditMessageDTO>): Promise<EditMessageResponse> {
    return this._put('messages', { query: { message_id }, body });
  }

  async delete(query: FlattenReq<DeleteMessageDTO>): Promise<DeleteMessageResponse> {
    return this._delete('messages', { query });
  }

  async answerOnCallback(
    { callback_id, ...body }: FlattenReq<AnswerOnCallbackDTO>,
  ): Promise<AnswerOnCallbackResponse> {
    return this._post('answers', { query: { callback_id }, body });
  }
}
