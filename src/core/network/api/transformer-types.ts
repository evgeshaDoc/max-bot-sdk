import type { PromiseMay, Rec } from '@tsofist/stem';

import type { ApiMethods } from './modules/types';

/** HTTP methods implemented by the current MAX Bot API table. */
export type HttpMethod = keyof ApiMethods;

/** Scalar values accepted by MAX query parameters. */
export type QueryValue = string | number | boolean | null | undefined;

/** A normalized response returned by the trusted MAX transport terminal. */
export interface ClientResponse {
  readonly status: number;
  readonly data: unknown;
  readonly headers: Headers;
}

/** Request fields an API transformer may replace before wire validation. */
export interface TransformableRequestOptions {
  readonly path?: Readonly<Rec<string | number>>;
  readonly query?: Readonly<Rec<QueryValue | readonly QueryValue[]>>;
  readonly body?: object | null;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

/** Immutable metadata exposed to an API transformer. */
export interface ApiCallMetadata {
  readonly method: HttpMethod;
  readonly route: string;
  readonly request: Readonly<TransformableRequestOptions>;
}

/** Continues one API transformer frame with optional request replacements. */
export type ApiCallNext = (
  replacement?: Readonly<Partial<TransformableRequestOptions>>,
) => Promise<ClientResponse>;

/**
 * Observes or transforms one API call before the trusted transport terminal.
 * Thrown objects retain identity and receive method/path/ambiguousOutcome when writable.
 * Primitive or frozen throws cannot carry these details; avoid them for mutation failures.
 */
export type ApiTransformer = (
  next: ApiCallNext,
  call: ApiCallMetadata,
) => PromiseMay<void>;
