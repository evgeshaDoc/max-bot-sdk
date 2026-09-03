import type { Api } from '../src/api';
import type { Bot } from '../src/bot';
import type { RawApi } from '../src/core/network/api/raw-api';
import type { ApiTransformer } from '../src/core/network/api/transformer-types';
import { createWebhookHandler } from '../src/webhook';

declare const api: Api;
declare const raw: RawApi;
declare const bot: Bot;
declare const bunServe: (options: {
  readonly fetch: (request: Request) => Response | Promise<Response>;
}) => unknown;

bunServe({ fetch: createWebhookHandler(bot, { secret: false }) });

const transformer: ApiTransformer = async (next, call) => {
  Object.keys(call.request);
  /* eslint-disable no-param-reassign */
  // @ts-expect-error transformer metadata is immutable
  call.method = 'POST';
  /* eslint-enable no-param-reassign */
  // @ts-expect-error trusted method cannot be replaced
  await next({ method: 'POST' });
};
api.use(transformer);

// @ts-expect-error retired GET /chats has no compatibility method
api.getAllChats();
// @ts-expect-error current chat lookup requires lossless Int64
api.getChat(123);
// @ts-expect-error retired unbounded raw helper is not public
raw.get('chats');
