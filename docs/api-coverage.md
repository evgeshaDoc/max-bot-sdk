# MAX API coverage

Audit date: **2026-08-13**. Primary source: current [MAX API documentation](https://dev.max.ru/docs-api). The pinned Go schema at `b9ac3728162b743a36a597ed1432d96bfb69a1cb` is used only for nested shapes omitted from rendered pages. Contract evidence lives in `test/endpoints.test.ts`; update parsing evidence lives in `test/update-parser.test.ts`.

## Method pages (29/29)

| Method | Documentation | Status | Type/API implementation | Wire descriptor | Evidence and decision |
| --- | --- | --- | --- | --- | --- |
| `GET /me` | [GET /me](https://dev.max.ru/docs-api/methods/GET/me) | supported | `BotsApi.getMyInfo`, `BotInfo` | `GET me` | endpoint table |
| `PATCH /me/commands` | [PATCH /me/commands](https://dev.max.ru/docs-api/methods/PATCH/me/commands) | supported | `BotsApi.editMyCommands`, `EditMyCommandsDTO` | `PATCH me/commands` | endpoint table |
| `GET /chats` | [GET /chats](https://dev.max.ru/docs-api/methods/GET/chats) | retired, not implemented | no runtime or public symbol | none | MAX retired the method in June 2026; no compatibility shim |
| `GET /chats/{chatId}` | [GET chat](https://dev.max.ru/docs-api/methods/GET/chats/-chatId-) | supported | `ChatsApi.getById`, `Chat` | `GET chats/{chat_id}` | current documented decimal chat-ID selector |
| `PATCH /chats/{chatId}` | [PATCH chat](https://dev.max.ru/docs-api/methods/PATCH/chats/-chatId-) | supported | `ChatsApi.edit`, `EditChatInfoDTO` | `PATCH chats/{chat_id}` | endpoint table |
| `POST /chats/{chatId}/actions` | [POST action](https://dev.max.ru/docs-api/methods/POST/chats/-chatId-/actions) | supported | `ChatsApi.sendAction`, `SenderAction` | `POST chats/{chat_id}/actions` | endpoint table |
| `GET /chats/{chatId}/pin` | [GET pin](https://dev.max.ru/docs-api/methods/GET/chats/-chatId-/pin) | supported | `ChatsApi.getPinnedMessage` | `GET chats/{chat_id}/pin` | endpoint table |
| `PUT /chats/{chatId}/pin` | [PUT pin](https://dev.max.ru/docs-api/methods/PUT/chats/-chatId-/pin) | supported | `ChatsApi.pinMessage` | `PUT chats/{chat_id}/pin` | endpoint table |
| `DELETE /chats/{chatId}/pin` | [DELETE pin](https://dev.max.ru/docs-api/methods/DELETE/chats/-chatId-/pin) | supported | `ChatsApi.unpinMessage` | `DELETE chats/{chat_id}/pin` | endpoint table |
| `GET /chats/{chatId}/members/me` | [GET membership](https://dev.max.ru/docs-api/methods/GET/chats/-chatId-/members/me) | supported | `ChatsApi.getChatMembership`, `ChatMember` | `GET chats/{chat_id}/members/me` | endpoint table |
| `DELETE /chats/{chatId}/members/me` | [DELETE membership](https://dev.max.ru/docs-api/methods/DELETE/chats/-chatId-/members/me) | supported | `ChatsApi.leaveChat` | `DELETE chats/{chat_id}/members/me` | endpoint table |
| `GET /chats/{chatId}/members/admins` | [GET admins](https://dev.max.ru/docs-api/methods/GET/chats/-chatId-/members/admins) | supported | `ChatsApi.getChatAdmins`, `ChatMember` | `GET chats/{chat_id}/members/admins` | endpoint table |
| `POST /chats/{chatId}/members/admins` | [POST admins](https://dev.max.ru/docs-api/methods/POST/chats/-chatId-/members/admins) | supported | `ChatsApi.setChatAdmins`, `ChatAdmin` | `POST chats/{chat_id}/members/admins` | endpoint table; request permissions include only documented assignable values |
| `DELETE /chats/{chatId}/members/admins/{userId}` | [DELETE admin](https://dev.max.ru/docs-api/methods/DELETE/chats/-chatId-/members/admins/-userId-) | supported | `ChatsApi.revokeChatAdmin` | `DELETE chats/{chat_id}/members/admins/{user_id}` | endpoint table |
| `GET /chats/{chatId}/members` | [GET members](https://dev.max.ru/docs-api/methods/GET/chats/-chatId-/members) | supported | `ChatsApi.getChatMembers` | `GET chats/{chat_id}/members` | endpoint table |
| `POST /chats/{chatId}/members` | [POST members](https://dev.max.ru/docs-api/methods/POST/chats/-chatId-/members) | supported | `ChatsApi.addChatMembers`, `FailedUserDetails` | `POST chats/{chat_id}/members` | endpoint table |
| `DELETE /chats/{chatId}/members` | [DELETE member](https://dev.max.ru/docs-api/methods/DELETE/chats/-chatId-/members) | supported | `ChatsApi.removeChatMember` | `DELETE chats/{chat_id}/members` | endpoint table; `user_id` and `block` are query parameters |
| `GET /subscriptions` | [GET subscriptions](https://dev.max.ru/docs-api/methods/GET/subscriptions) | supported | `SubscriptionsApi.getSubscriptions`, `Subscription` | `GET subscriptions` | endpoint table |
| `POST /subscriptions` | [POST subscription](https://dev.max.ru/docs-api/methods/POST/subscriptions) | supported | `SubscriptionsApi.createSubscription`, `CreateSubscriptionInput` | `POST subscriptions` | endpoint table; HTTPS, secret and update-type validation before fetch |
| `DELETE /subscriptions` | [DELETE subscription](https://dev.max.ru/docs-api/methods/DELETE/subscriptions) | supported | `SubscriptionsApi.deleteSubscription` | `DELETE subscriptions` | endpoint table; exactly one mutation request |
| `GET /updates` | [GET updates](https://dev.max.ru/docs-api/methods/GET/updates) | supported | `SubscriptionsApi.getUpdates`, `GetUpdatesResponse` | `GET updates`, `updateDescriptor` | endpoint and parser tests; page classifier discards future payloads before numeric conversion |
| `POST /uploads` | [POST uploads](https://dev.max.ru/docs-api/methods/POST/uploads) | supported | `UploadsApi.getUploadUrl`, `UploadType` | `POST uploads` | endpoint table |
| `GET /messages` | [GET messages](https://dev.max.ru/docs-api/methods/GET/messages) | supported | `MessagesApi.get`, `GetMessagesDTO` | `GET messages` | endpoint table |
| `POST /messages` | [POST message](https://dev.max.ru/docs-api/methods/POST/messages) | supported | `MessagesApi.send`, `NewMessageBody` | `POST messages` | endpoint table; mutation is never retried automatically |
| `PUT /messages` | [PUT message](https://dev.max.ru/docs-api/methods/PUT/messages) | supported | `MessagesApi.edit`, `NewMessageBody` | `PUT messages` | endpoint table |
| `DELETE /messages` | [DELETE message](https://dev.max.ru/docs-api/methods/DELETE/messages) | supported | `MessagesApi.delete` | `DELETE messages` | endpoint table |
| `GET /messages/{messageId}` | [GET message](https://dev.max.ru/docs-api/methods/GET/messages/-messageId-) | supported | `MessagesApi.getById`, `Message` | `GET messages/{message_id}` | endpoint table |
| `GET /videos/{videoToken}` | [GET video](https://dev.max.ru/docs-api/methods/GET/videos/-videoToken-) | supported | `VideosApi.get`, `VideoDetails` | `GET videos/{video_token}` | endpoint table |
| `POST /answers` | [POST answer](https://dev.max.ru/docs-api/methods/POST/answers) | supported | `MessagesApi.answerOnCallback` | `POST answers` | endpoint table |

## Top-level object pages (8/8)

| Object | Documentation | Public symbol | Descriptor/evidence | Resolved documentation decision |
| --- | --- | --- | --- | --- |
| `User` | [User](https://dev.max.ru/docs-api/objects/User) | `types/user.ts: User` | `user`; endpoint/update fixtures | `first_name` is current; deprecated `name` remains nullable; every documented int64 is `Int64` |
| `UserWithPhoto` | [UserWithPhoto](https://dev.max.ru/docs-api/objects/UserWithPhoto) | `types/user.ts: UserWithPhoto` | `user`; endpoint/update fixtures | optional photo and description fields follow rendered docs |
| `BotInfo` | [BotInfo](https://dev.max.ru/docs-api/objects/BotInfo) | `types/bot.ts: BotInfo` | `GET me` | current profile plus the documented command list |
| `ChatMember` | [ChatMember](https://dev.max.ru/docs-api/objects/ChatMember) | `types/chat.ts: ChatMember` | `chatMember` | current and compatibility response permission literals accepted; assignments use current values |
| `Chat` | [Chat](https://dev.max.ru/docs-api/objects/Chat) | `types/chat.ts: Chat` | `chat` | current four-value status union; nested user/message and int64 participant map typed |
| `Message` | [Message](https://dev.max.ru/docs-api/objects/Message) | `types/message.ts: Message` | `message` | channel sender may be absent and body may be null; `seq` and timestamps are `Int64` |
| `NewMessageBody` | [NewMessageBody](https://dev.max.ru/docs-api/objects/NewMessageBody) | `modules/messages/types.ts: NewMessageBody` | `newMessage` | required nullable wire members are explicit; notify defaults to true |
| `Update` | [Update](https://dev.max.ru/docs-api/objects/Update) | `types/update.ts: Update` | `updateDescriptor`; parser fixtures | exact current 15-kind discriminated union; removed historical construction kinds are treated as future tags |

## Current updates (15/15)

All fixtures are redacted examples derived from the rendered Update variants, with nested fallback shapes checked against the pinned official Go schema. Every row is exercised by `test/update-parser.test.ts`.

| Kind | Public type | Fixture | Int64-bearing fields |
| --- | --- | --- | --- |
| `bot_added` | `BotAddedUpdate` | `test/fixtures/updates/bot_added.json` | timestamp, chat and user identifiers/activity |
| `bot_started` | `BotStartedUpdate` | `test/fixtures/updates/bot_started.json` | timestamp, chat and user identifiers/activity |
| `bot_stopped` | `BotStoppedUpdate` | `test/fixtures/updates/bot_stopped.json` | timestamp, chat and user identifiers/activity |
| `bot_removed` | `BotRemovedUpdate` | `test/fixtures/updates/bot_removed.json` | timestamp, chat and user identifiers/activity |
| `chat_title_changed` | `ChatTitleChangedUpdate` | `test/fixtures/updates/chat_title_changed.json` | timestamp, chat and user identifiers/activity |
| `dialog_cleared` | `DialogClearedUpdate` | `test/fixtures/updates/dialog_cleared.json` | timestamp, chat and user identifiers/activity |
| `dialog_muted` | `DialogMutedUpdate` | `test/fixtures/updates/dialog_muted.json` | timestamp, chat/user identifiers/activity, muted-until time |
| `dialog_unmuted` | `DialogUnmutedUpdate` | `test/fixtures/updates/dialog_unmuted.json` | timestamp, chat and user identifiers/activity |
| `dialog_removed` | `DialogRemovedUpdate` | `test/fixtures/updates/dialog_removed.json` | timestamp, chat and user identifiers/activity |
| `message_callback` | `MessageCallbackUpdate` | `test/fixtures/updates/message_callback.json` | update/callback/message times, user/recipient IDs, message sequence |
| `message_created` | `MessageCreatedUpdate` | `test/fixtures/updates/message_created.json` | update/message times, user/recipient IDs, message sequence |
| `message_edited` | `MessageEditedUpdate` | `test/fixtures/updates/message_edited.json` | update/message times, user/recipient IDs, message sequence |
| `message_removed` | `MessageRemovedUpdate` | `test/fixtures/updates/message_removed.json` | timestamp, chat and user IDs |
| `user_added` | `UserAddedUpdate` | `test/fixtures/updates/user_added.json` | timestamp, chat/user/inviter IDs and activity |
| `user_removed` | `UserRemovedUpdate` | `test/fixtures/updates/user_removed.json` | timestamp, chat/user/admin IDs and activity |

## Reachable wire structures

| Area | Resolved structures and public symbols | Descriptor coverage | Evidence/conflict decision |
| --- | --- | --- | --- |
| Common | `Int64`, `ActionResponse` | every selected int64 leaf; action shape | unit and endpoint tests; typed `{success:false}` resolves unchanged |
| Bot | `BotCommand`, `BotInfo`, `EditMyCommandsDTO` | user and command responses | endpoint table |
| User | `User`, `UserWithPhoto`, `UserLocale` | user IDs and activity timestamps | object fixtures; locale is an IETF BCP 47 string |
| Chat | `Chat`, `ChatType`, `ChatStatus`, `Image` inline shape | chat IDs/times/owner/participant map | endpoint and update fixtures |
| Membership | `ChatMember`, `ChatAdmin`, `ChatAdminPermission`, `FailedUserDetails` | member/admin/user ID arrays and page marker | endpoint table; rendered docs take precedence over stale self-signed schema fields |
| Message | `Message`, `MessageRecipient`, `MessageBody`, `LinkedMessage`, `MessageStat`, `MessageLinkType` | sender/recipient IDs, timestamps, sequence, linked chat IDs | endpoint and update fixtures |
| New message | `NewMessageBody`, `SendMessageDTO`, `EditMessageDTO`, `AnswerOnCallbackDTO` | recipient IDs and nested attachment/button IDs | endpoint table |
| Response attachments | `PhotoAttachment`, `VideoAttachment`, `AudioAttachment`, `FileAttachment`, `ContactAttachment`, `StickerAttachment`, `ShareAttachment`, `LocationAttachment`, `InlineKeyboardAttachment`, `ReplyKeyboardAttachment`, `DataAttachment` | photo/contact/user IDs and file size | message fixtures and endpoint table |
| Request attachments | `ImageAttachmentRequest`, `VideoAttachmentRequest`, `AudioAttachmentRequest`, `FileAttachmentRequest`, `ContactAttachmentRequest`, `StickerAttachmentRequest`, `ShareAttachmentRequest`, `LocationAttachmentRequest`, `InlineKeyboardAttachmentRequest`, `ReplyKeyboardAttachmentRequest` | contact/direct-user/button IDs | endpoint table |
| Buttons | `CallbackButton`, `LinkButton`, `RequestContactButton`, `RequestGeoLocationButton`, `ChatButton`, `OpenAppButton`, `ClipboardButton`, `ReplyButton` variants | app contact ID | message fixtures and outbound endpoint table |
| Markup | `MarkupElement`, `UserMentionMarkup` and all ten documented discriminants | mention user ID | message fixtures |
| Subscription | `Subscription`, `CreateSubscriptionInput`, `GetSubscriptionsResponse` | subscription creation time | subscription endpoint table; obsolete certificate fields intentionally excluded |
| Long polling | `GetUpdatesDTO`, `GetUpdatesResponse`, `ParsedUpdate` | marker plus per-kind descriptor | parser/polling tests; future payload is discarded before field normalization |
| Upload | `UploadType`, `GetUploadUrlResponse`, upload result | external upload result ID is `Int64`; URL/token request has none | endpoint and upload transport tests; external upload contract follows observed SDK flow |
| Video | `VideoDetails`, `VideoUrls`, thumbnail photo payload | thumbnail photo ID | endpoint table |

Totals: **28/28 supported methods**, **29/29 method pages**, **8/8 object pages**, **15/15 current update variants**. All documented reachable int64 fields use the public decimal-string `Int64` contract.
