import { BaseApi } from '../../base-api';
import { parseUpdatesResponse } from '../../parse-update';
import type { FlattenReq } from '../types';
import type {
  CreateSubscriptionDTO,
  CreateSubscriptionResponse,
  DeleteSubscriptionDTO,
  DeleteSubscriptionResponse,
  GetSubscriptionsResponse,
  GetUpdatesOptions,
  GetUpdatesResponse,
} from './types';
import type { UpdateType } from '../../types/update';

export class SubscriptionsApi extends BaseApi {
  async getSubscriptions(): Promise<GetSubscriptionsResponse> {
    return this._get('subscriptions', {});
  }

  async createSubscription(
    body: FlattenReq<CreateSubscriptionDTO>,
  ): Promise<CreateSubscriptionResponse> {
    return this._post('subscriptions', { body });
  }

  async deleteSubscription(
    query: FlattenReq<DeleteSubscriptionDTO>,
  ): Promise<DeleteSubscriptionResponse> {
    return this._delete('subscriptions', { query });
  }

  async getUpdates(
    { signal, timeoutMs, ...query }: GetUpdatesOptions & { types?: readonly UpdateType[] },
  ): Promise<GetUpdatesResponse> {
    return this._get('updates', {
      query,
      signal,
      timeoutMs,
      parseResponse: parseUpdatesResponse,
    });
  }
}
