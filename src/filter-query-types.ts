import type { Attachment } from './core/network/api/types/attachment';
import type { Guard } from './core/helpers/types';
import type { CallbackData, Update, UpdateType } from './core/network/api/types/update';
import type { Message, MessageBody } from './core/network/api/types/message';

/** Attachment discriminants accepted by MAX filter queries. */
export type AttachmentQueryType = Attachment['type'];

type MessageUpdateType = 'message_created' | 'message_edited';

type MessageRefinementQuery =
  | `${MessageUpdateType}:text`
  | `${MessageUpdateType}:attachment`
  | `${MessageUpdateType}:attachment:${AttachmentQueryType}`;

/** Every finite filter query supported by the SDK. */
export type FilterQuery =
  | UpdateType
  | MessageRefinementQuery
  | 'message_callback:payload'
  | 'message_callback:message'
  | 'bot_started:payload';

type UpdateOfType<UpdateValue extends Update, Kind extends UpdateType> = Extract<
UpdateValue,
{ update_type: Kind }
>;

type MessageUpdateWithBody<
  UpdateValue extends Update,
  Kind extends MessageUpdateType,
  Body extends MessageBody,
> = UpdateOfType<UpdateValue, Kind> & {
  message: Message & { body: Body };
};

type MessageUpdateWithText<
  UpdateValue extends Update,
  Kind extends MessageUpdateType,
> = MessageUpdateWithBody<UpdateValue, Kind, MessageBody & { text: string }>;

type MessageUpdateWithAttachment<
  UpdateValue extends Update,
  Kind extends MessageUpdateType,
> = MessageUpdateWithBody<UpdateValue, Kind, MessageBody & {
  attachments: [Attachment, ...Attachment[]];
}>;

type CallbackUpdateWithPayload<UpdateValue extends Update> = UpdateOfType<
UpdateValue,
'message_callback'
> & { callback: CallbackData & { payload: string } };

type CallbackUpdateWithMessage<UpdateValue extends Update> = UpdateOfType<
UpdateValue,
'message_callback'
> & { message: Message };

type BotStartedUpdateWithPayload<UpdateValue extends Update> = UpdateOfType<
UpdateValue,
'bot_started'
> & { payload: string };

/** Resolves the update shape guaranteed by one filter query. */
export type FilterQueryUpdate<
  UpdateValue extends Update,
  Query extends FilterQuery,
> = Query extends UpdateType
  ? UpdateOfType<UpdateValue, Query>
  : Query extends `${infer Kind extends MessageUpdateType}:text`
    ? MessageUpdateWithText<UpdateValue, Kind>
    : Query extends `${infer Kind extends MessageUpdateType}:attachment${string}`
      ? MessageUpdateWithAttachment<UpdateValue, Kind>
      : Query extends 'message_callback:payload'
        ? CallbackUpdateWithPayload<UpdateValue>
        : Query extends 'message_callback:message'
          ? CallbackUpdateWithMessage<UpdateValue>
          : Query extends 'bot_started:payload'
            ? BotStartedUpdateWithPayload<UpdateValue>
            : never;

/** Resolves the update shape guaranteed by a query or update guard. */
export type FilteredUpdateFor<
  UpdateValue extends Update,
  Filter extends FilterQuery | Guard<UpdateValue>,
> = Filter extends FilterQuery
  ? FilterQueryUpdate<UpdateValue, Filter>
  : Filter extends Guard<UpdateValue, infer GuardedUpdate>
    ? GuardedUpdate
    : never;
