import type { Api } from '../src/api';
import type { RawApi } from '../src/core/network/api/raw-api';

declare const api: Api;
declare const raw: RawApi;

// @ts-expect-error retired GET /chats has no compatibility method
api.getAllChats();
// @ts-expect-error current chat lookup requires lossless Int64
api.getChat(123);
// @ts-expect-error retired unbounded raw helper is not public
raw.get('chats');
