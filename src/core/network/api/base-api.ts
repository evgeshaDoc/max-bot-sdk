import type { Client, RequestOptions } from './client-types';
import { MaxError, MaxErrorKind } from './error';
import type { HttpMethod } from './transformer-types';

export class BaseApi {
  private readonly transportClient: Client;

  constructor(client: Client) {
    this.transportClient = client;
  }

  protected async _get<Response>(path: string, options: RequestOptions = {}): Promise<Response> {
    return this.call('GET', path, options);
  }

  protected async _post<Response>(path: string, options: RequestOptions = {}): Promise<Response> {
    return this.call('POST', path, options);
  }

  protected async _patch<Response>(path: string, options: RequestOptions = {}): Promise<Response> {
    return this.call('PATCH', path, options);
  }

  protected async _put<Response>(path: string, options: RequestOptions = {}): Promise<Response> {
    return this.call('PUT', path, options);
  }

  protected async _delete<Response>(path: string, options: RequestOptions = {}): Promise<Response> {
    return this.call('DELETE', path, options);
  }

  private async call<Response>(
    method: HttpMethod,
    path: string,
    options: RequestOptions,
  ): Promise<Response> {
    const result = await this.transportClient.call({ path, options: { ...options, method } });
    if (result.status < 200 || result.status >= 300) {
      const details = getErrorDetails(result.data);
      throw new MaxError('MAX API request failed', {
        kind: MaxErrorKind.Http,
        status: result.status,
        code: details.code,
        method,
        path,
        retryAfter: result.headers.get('retry-after') ?? undefined,
        ambiguousOutcome: method !== 'GET' && result.status >= 500,
      });
    }
    return result.data as Response;
  }
}

function getErrorDetails(value: unknown): { readonly code?: string } {
  if (typeof value !== 'object' || value === null || !('code' in value)) return {};
  return typeof value.code === 'string' ? { code: value.code } : {};
}
