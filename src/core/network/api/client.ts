import { MaxError, MaxErrorKind } from './error';
import { parseLosslessJson, stringifyLosslessJson } from './json';
import {
  encodeWireValue,
  normalizeWireValue,
  type WireDescriptor,
  validateWireValue,
} from './wire-descriptors';
import { getWireContract } from './wire-contracts';

const DEFAULT_BASE_URL = 'https://platform-api2.max.ru';
const DEFAULT_TIMEOUT_MS = 10_000;

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type QueryValue = string | number | boolean | null | undefined;

/** Configures the single HTTP transport used by the SDK. */
export interface ClientOptions {
  readonly fetch?: typeof globalThis.fetch;
  /** Request deadline in milliseconds. @default 10000 */
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly baseUrl?: string;
}

export interface RequestOptions {
  readonly method?: HttpMethod;
  readonly body?: object | null;
  readonly query?: Readonly<Record<string, QueryValue | readonly QueryValue[]>>;
  readonly path?: Readonly<Record<string, string | number>>;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly requestDescriptor?: WireDescriptor;
  readonly responseDescriptor?: WireDescriptor;
  readonly parseResponse?: (text: string) => unknown;
}

export interface ClientCallOptions {
  readonly path: string;
  readonly options: RequestOptions;
}

export interface ClientResponse {
  readonly status: number;
  readonly data: unknown;
  readonly headers: Headers;
}

export interface RawRequestOptions {
  readonly url: string;
  readonly init: RequestInit;
  readonly timeoutMs?: number;
}

/** A configured MAX HTTP client. */
export interface Client {
  readonly call: (options: ClientCallOptions) => Promise<ClientResponse>;
  readonly request: (options: RawRequestOptions) => Promise<Response>;
}

/** Creates the SDK's single injected-fetch MAX transport. */
export function createClient(token: string, options: ClientOptions = {}): Client {
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  validateBaseUrl(baseUrl);
  validateTimeout(timeoutMs);

  async function call(callOptions: ClientCallOptions): Promise<ClientResponse> {
    const method = callOptions.options.method ?? 'GET';
    const errorPath = callOptions.path;
    const contract = getWireContract(method, callOptions.path);
    const requestTimeout = callOptions.options.timeoutMs ?? timeoutMs;
    let path: string;
    try {
      validateTimeout(requestTimeout);
      validateWireValue(callOptions.options.path, contract.path);
      validateWireValue(callOptions.options.query, contract.query);
      validateWireValue(callOptions.options.body, contract.body);
      path = buildPath(callOptions.path, callOptions.options.path);
    } catch (error) {
      throw withRequestDetails(error, method, errorPath, false);
    }
    if (!token) {
      throw new MaxError('MAX access token is required', {
        kind: MaxErrorKind.Protocol,
        method,
        path: errorPath,
      });
    }

    const url = new URL(path, ensureTrailingSlash(baseUrl));
    appendQuery(url, callOptions.options.query);
    const controller = new AbortController();
    if (options.signal?.aborted || callOptions.options.signal?.aborted) {
      throw new MaxError('MAX request aborted', {
        kind: MaxErrorKind.Abort,
        method,
        path: errorPath,
        ambiguousOutcome: false,
      });
    }
    const body = serializeBody(
      callOptions.options.body,
      callOptions.options.requestDescriptor ?? contract.body,
      method,
      errorPath,
    );
    const timeout = setTimeout(controller.abort.bind(controller), requestTimeout);
    const combined = combineSignals([
      controller.signal,
      options.signal,
      callOptions.options.signal,
    ]);
    let responseReceived = false;
    let responseStatus: number | undefined;
    let requestStarted = false;

    try {
      requestStarted = true;
      const response = await fetchImplementation(url, {
        method,
        headers: buildHeaders(token, callOptions.options.body),
        body,
        redirect: 'error',
        signal: combined.signal,
      });
      responseReceived = true;
      responseStatus = response.status;
      const text = await response.text();
      const data = response.ok
        ? parseSuccessfulResponse(text, callOptions.options, contract.response)
        : parseErrorBody(text);
      if (response.ok) contract.validateResponse?.(data);
      return { status: response.status, data, headers: response.headers };
    } catch (error) {
      if (error instanceof MaxError) {
        const ambiguous = error.ambiguousOutcome
          || (responseReceived && isMutation(method) && error.kind === MaxErrorKind.Protocol);
        throw withRequestDetails(error, method, errorPath, ambiguous);
      }
      const callerAborted = options.signal?.aborted || callOptions.options.signal?.aborted;
      if (responseStatus !== undefined && responseStatus >= 400) {
        throw new MaxError('MAX response body could not be read', {
          kind: MaxErrorKind.Http,
          status: responseStatus,
          method,
          path: errorPath,
          ambiguousOutcome: isMutation(method) && responseStatus >= 500,
          cause: error,
        });
      }
      throw new MaxError(callerAborted ? 'MAX request aborted' : 'MAX request failed', {
        kind: classifyFailure(callerAborted, controller.signal.aborted, responseReceived),
        method,
        path: errorPath,
        ambiguousOutcome: isMutation(method) && requestStarted,
        cause: error,
      });
    } finally {
      clearTimeout(timeout);
      combined.cleanup();
    }
  }

  async function request(requestOptions: RawRequestOptions): Promise<Response> {
    const requestUrl = validateUrl(requestOptions.url);
    const controller = new AbortController();
    validateTimeout(requestOptions.timeoutMs ?? timeoutMs);
    if (options.signal?.aborted || requestOptions.init.signal?.aborted) {
      throw new MaxError('MAX upload aborted', {
        kind: MaxErrorKind.Abort,
        method: requestOptions.init.method,
        path: 'upload',
        ambiguousOutcome: false,
      });
    }
    const timeout = setTimeout(
      controller.abort.bind(controller),
      requestOptions.timeoutMs ?? timeoutMs,
    );
    const combined = combineSignals([
      controller.signal,
      options.signal,
      requestOptions.init.signal ?? undefined,
    ]);
    let responseStatus: number | undefined;
    try {
      const response = await fetchImplementation(requestUrl, {
        ...requestOptions.init,
        redirect: 'error',
        signal: combined.signal,
      });
      responseStatus = response.status;
      const body = await response.arrayBuffer();
      return new Response(body, {
        headers: response.headers,
        status: response.status,
        statusText: response.statusText,
      });
    } catch (error) {
      const callerAborted = options.signal?.aborted || requestOptions.init.signal?.aborted;
      if (responseStatus !== undefined) {
        const isErrorResponse = responseStatus >= 400;
        throw new MaxError(isErrorResponse
          ? 'MAX upload response body could not be read'
          : 'MAX upload returned an unreadable response', {
          kind: isErrorResponse ? MaxErrorKind.Http : MaxErrorKind.Protocol,
          status: responseStatus,
          method: requestOptions.init.method,
          path: 'upload',
          ambiguousOutcome: isErrorResponse ? responseStatus >= 500 : true,
          cause: error,
        });
      }
      throw new MaxError(callerAborted ? 'MAX upload aborted' : 'MAX upload failed', {
        kind: classifyFailure(
          callerAborted,
          controller.signal.aborted,
          responseStatus !== undefined,
        ),
        method: requestOptions.init.method,
        path: 'upload',
        ambiguousOutcome: true,
        cause: error,
      });
    } finally {
      clearTimeout(timeout);
      combined.cleanup();
    }
  }

  return { call, request };
}

function validateBaseUrl(value: string): void {
  const url = validateUrl(value);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new MaxError('MAX base URL must use HTTP or HTTPS', {
      kind: MaxErrorKind.Protocol,
    });
  }
}

function validateUrl(value: string): URL {
  try {
    return new URL(value);
  } catch (error) {
    throw new MaxError('MAX request URL is invalid', {
      kind: MaxErrorKind.Protocol,
      cause: error,
    });
  }
}

function validateTimeout(value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new MaxError('MAX request timeout must be a positive finite number', {
      kind: MaxErrorKind.Protocol,
    });
  }
}

function classifyFailure(
  callerAborted: boolean | undefined,
  timedOut: boolean,
  responseReceived: boolean,
): MaxErrorKind {
  if (callerAborted) return MaxErrorKind.Abort;
  if (timedOut) return MaxErrorKind.Timeout;
  return responseReceived ? MaxErrorKind.Protocol : MaxErrorKind.Network;
}

function buildPath(template: string, path?: RequestOptions['path']): string {
  const result = Object.entries(path ?? {}).reduce((value, [key, item]) => {
    return value.split(`{${key}}`).join(encodeURIComponent(String(item)));
  }, template);
  if (/\{[^}]+\}/.test(result)) {
    throw new MaxError('MAX request path is incomplete', { kind: MaxErrorKind.Protocol });
  }
  return result;
}

function ensureTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}

function appendQuery(url: URL, query?: RequestOptions['query']): void {
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, Array.isArray(value) ? value.join(',') : String(value));
    }
  }
}

function buildHeaders(token: string, body?: object | null): HeadersInit {
  return {
    Authorization: token,
    ...(body === undefined || body === null ? {} : { 'content-type': 'application/json' }),
  };
}

function serializeBody(
  body: object | null | undefined,
  descriptor?: WireDescriptor,
  method?: HttpMethod,
  path?: string,
): string | undefined {
  if (body === undefined || body === null) return undefined;
  try {
    return stringifyLosslessJson(encodeWireValue(body, descriptor));
  } catch (error) {
    if (error instanceof MaxError) throw error;
    throw new MaxError('MAX request body is invalid', {
      kind: MaxErrorKind.Protocol,
      method,
      path,
      ambiguousOutcome: false,
      cause: error,
    });
  }
}

function parseSuccessfulResponse(
  text: string,
  options: RequestOptions,
  contractDescriptor?: WireDescriptor,
): unknown {
  return options.parseResponse
    ? options.parseResponse(text)
    : parseResponseBody(text, options.responseDescriptor ?? contractDescriptor);
}

function parseResponseBody(text: string, descriptor?: WireDescriptor): unknown {
  if (text.length === 0) {
    if (descriptor) {
      throw new MaxError('MAX returned an empty response', { kind: MaxErrorKind.Protocol });
    }
    return undefined;
  }
  try {
    return normalizeWireValue(parseLosslessJson(text), descriptor);
  } catch (error) {
    if (error instanceof MaxError) throw error;
    throw new MaxError('MAX returned invalid JSON', {
      kind: MaxErrorKind.Protocol,
      cause: error,
    });
  }
}

function parseErrorBody(text: string): unknown {
  if (!text) return undefined;
  try {
    return normalizeWireValue(parseLosslessJson(text));
  } catch {
    return undefined;
  }
}

function combineSignals(signals: readonly (AbortSignal | undefined)[]): {
  readonly signal: AbortSignal;
  readonly cleanup: () => void;
} {
  const active = signals.filter((signal): signal is AbortSignal => {
    return signal !== undefined;
  });
  if (active.length === 1) return { signal: active[0], cleanup: () => {} };

  const controller = new AbortController();
  function abort(): void {
    controller.abort();
  }
  for (const signal of active) {
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  }
  function cleanup(): void {
    for (const signal of active) signal.removeEventListener('abort', abort);
  }
  return { signal: controller.signal, cleanup };
}

function isMutation(method: HttpMethod): boolean {
  return method !== 'GET';
}

function withRequestDetails(
  error: unknown,
  method: HttpMethod,
  path: string,
  ambiguousOutcome: boolean,
): MaxError {
  if (!(error instanceof MaxError)) {
    return new MaxError('MAX request does not match its wire contract', {
      kind: MaxErrorKind.Protocol,
      method,
      path,
      ambiguousOutcome,
      cause: error,
    });
  }
  if (error.method === method
    && error.path === path
    && error.ambiguousOutcome === ambiguousOutcome) return error;
  return new MaxError(error.message, {
    kind: error.kind,
    status: error.status,
    code: error.code,
    method,
    path,
    retryAfter: error.retryAfter,
    ambiguousOutcome,
    cause: error,
  });
}
