import type { Client } from './client-types';
import { BotsApi } from './modules/bots/api';
import { ChatsApi } from './modules/chats/api';
import { MessagesApi } from './modules/messages/api';
import { SubscriptionsApi } from './modules/subscriptions/api';
import { UploadsApi } from './modules/uploads/api';
import { VideosApi } from './modules/videos/api';

/** Typed access to the current MAX HTTP API. */
export class RawApi {
  readonly request: Client['request'];

  readonly bots: BotsApi;

  readonly chats: ChatsApi;

  readonly messages: MessagesApi;

  readonly subscriptions: SubscriptionsApi;

  readonly uploads: UploadsApi;

  readonly videos: VideosApi;

  constructor(client: Client) {
    this.request = client.request;
    this.bots = new BotsApi(client);
    this.chats = new ChatsApi(client);
    this.messages = new MessagesApi(client);
    this.subscriptions = new SubscriptionsApi(client);
    this.uploads = new UploadsApi(client);
    this.videos = new VideosApi(client);
  }
}
