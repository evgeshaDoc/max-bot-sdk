import type { Rec } from '@tsofist/stem';

import type {
  ApiTransformer,
  ClientResponse,
  HttpMethod,
  QueryValue,
} from './transformer-types';
import type { WireDescriptor } from './wire-descriptors';

/**
 * Configures the single HTTP transport used by the SDK.
 * @public
 */
export interface ClientOptions {
  /** Injected Fetch implementation. @default globalThis.fetch */
  readonly fetch?: typeof globalThis.fetch;
  /** Request deadline in milliseconds. @default 10000 */
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  /** MAX API origin. @default 'https://platform-api2.max.ru' */
  readonly baseUrl?: string;
}

/**
 * One authenticated MAX API call before transformer and wire processing.
 * @public
 */
export interface RequestOptions {
  /** HTTP method for the MAX route. @default 'GET' */
  readonly method?: HttpMethod;
  readonly body?: object | null;
  readonly query?: Readonly<Rec<QueryValue | readonly QueryValue[]>>;
  readonly path?: Readonly<Rec<string | number>>;
  readonly signal?: AbortSignal;
  /** Per-call deadline in milliseconds. @default ClientOptions.timeoutMs */
  readonly timeoutMs?: number;
  readonly requestDescriptor?: WireDescriptor;
  readonly responseDescriptor?: WireDescriptor;
  readonly parseResponse?: (text: string) => unknown;
}

/** @public */
export interface ClientCallOptions {
  readonly path: string;
  readonly options: RequestOptions;
}

/**
 * Raw absolute-URL request options used for pre-signed uploads.
 * @public
 */
export interface RawRequestOptions {
  readonly url: string;
  readonly init: RequestInit;
  /** Raw request deadline in milliseconds. @default ClientOptions.timeoutMs */
  readonly timeoutMs?: number;
}

/**
 * A configured MAX HTTP client.
 * @public
 */
export interface Client {
  /**
   * Calls an authenticated MAX endpoint through transformers, wire contracts,
   * and the lossless JSON codec.
   */
  readonly call: (options: ClientCallOptions) => Promise<ClientResponse>;

  /**
   * Calls an absolute or pre-signed upload URL through the shared fetch, timeout,
   * abort, and error boundary. It bypasses MAX transformers, wire codecs, and
   * Authorization injection.
   */
  readonly request: (options: RawRequestOptions) => Promise<Response>;

  /** Adds global transformers for future API calls. */
  use(...transformers: ApiTransformer[]): this;
}
