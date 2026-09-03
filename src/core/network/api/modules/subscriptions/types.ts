import type { ActionResponse } from '../../types/common';
import type { Int64 } from '../../types/int64';
import type { ParsedUpdate, UpdateType } from '../../types/update';
import type { RequestOptions } from '../../client-types';
import type { FlattenReq } from '../types';

/** Active MAX webhook subscription. */
export interface Subscription {
  url: `https://${string}`;
  time: Int64;
  update_types: UpdateType[] | null;
}

/** Parameters for creating or replacing a MAX webhook subscription. */
export interface CreateSubscriptionInput {
  readonly url: `https://${string}`;
  readonly update_types?: readonly UpdateType[];
  readonly secret?: string;
}

export type GetSubscriptionsResponse = { subscriptions: Subscription[] };
export type CreateSubscriptionDTO = { body: CreateSubscriptionInput };
export type CreateSubscriptionResponse = ActionResponse;
export type DeleteSubscriptionDTO = { query: { url: string } };
export type DeleteSubscriptionResponse = ActionResponse;

export type GetUpdatesDTO = {
  query: {
    limit?: number;
    timeout?: number;
    marker?: Int64 | null;
    types?: readonly UpdateType[];
  };
};
export type GetUpdatesResponse = { updates: ParsedUpdate[]; marker: Int64 | null };
export type GetUpdatesOptions = Omit<FlattenReq<GetUpdatesDTO>, 'types'>
& Pick<RequestOptions, 'signal' | 'timeoutMs'>;
