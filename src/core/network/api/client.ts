import { entriesOf } from '@tsofist/stem/lib/object/entries-of';
import { hasOwn } from '@tsofist/stem/lib/object/has-own';
import { isNonNully } from '@tsofist/stem/lib/nully';

import { MaxError, MaxErrorKind } from './error';
import { parseLosslessJson, stringifyLosslessJson } from './json';
import {
  encodeWireValue,
  normalizeWireValue,
  type WireDescriptor,
  validateWireValue,
} from './wire-descriptors';
import { getWireContract } from './wire-contracts';
import type {
  Client,
  ClientCallOptions,
  ClientOptions,
  RawRequestOptions,
  RequestOptions,
} from './client-types';
import type {
  ApiCallMetadata,
  ApiCallNext,
  ApiTransformer,
  ClientResponse,
  HttpMethod,
  TransformableRequestOptions,
} from './transformer-types';

const DEFAULT_BASE_URL = 'https://platform-api2.max.ru';
const DEFAULT_TIMEOUT_MS = 10_000;

interface TrustedCallSpecification {
  readonly method: HttpMethod;
  readonly route: string;
  readonly requestDescriptor?: WireDescriptor;
  readonly responseDescriptor?: WireDescriptor;
  readonly parseResponse?: (text: string) => unknown;
  readonly contract: ReturnType<typeof getWireContract>;
}

/**
 * Input for the terminal transformer stage: the final trusted transport that
 * validates and performs the HTTP request exactly once after all transformers.
 * @private
 */
interface TrustedTerminalInput {
  readonly token: string;
  readonly fetchImplementation: typeof globalThis.fetch;
  readonly baseUrl: string;
  readonly defaultTimeoutMs: number;
  readonly clientSignal?: AbortSignal;
  readonly specification: TrustedCallSpecification;
  readonly request: Readonly<TransformableRequestOptions>;
}

/**
 * Creates the SDK's single injected-fetch MAX transport.
 * @param token - MAX bot access token.
 * @param options - Transport defaults and injected dependencies.
 * @returns A configured client for MAX API and pre-signed upload requests.
 * @throws {MaxError} If the base URL or timeout is invalid.
 * @public
 */
export function createClient(token: string, options: ClientOptions = {}): Client {
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const transformers: ApiTransformer[] = [];
  validateBaseUrl(baseUrl);
  validateTimeout(timeoutMs);

  async function call(callOptions: ClientCallOptions): Promise<ClientResponse> {
    const method = callOptions.options.method ?? 'GET';
    const terminalInput: TrustedTerminalInput = {
      token,
      fetchImplementation,
      baseUrl,
      defaultTimeoutMs: timeoutMs,
      clientSignal: options.signal,
      specification: {
        method,
        route: callOptions.path,
        requestDescriptor: callOptions.options.requestDescriptor,
        responseDescriptor: callOptions.options.responseDescriptor,
        parseResponse: callOptions.options.parseResponse,
        contract: getWireContract(method, callOptions.path),
      },
      request: {
        path: callOptions.options.path,
        query: callOptions.options.query,
        body: callOptions.options.body,
        signal: callOptions.options.signal,
        timeoutMs: callOptions.options.timeoutMs,
      },
    };
    return executeTransformerChain(terminalInput, transformers.slice());
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

  const client: Client = {
    call,
    request,
    use(...registeredTransformers) {
      transformers.push(...registeredTransformers);
      return client;
    },
  };
  return client;
}

async function executeTransformerChain(
  terminalInput: TrustedTerminalInput,
  transformers: readonly ApiTransformer[],
): Promise<ClientResponse> {
  let terminalStarted = false;
  let mutationMayHaveApplied = false;

  async function dispatch(
    index: number,
    request: Readonly<TransformableRequestOptions>,
  ): Promise<ClientResponse> {
    if (index === transformers.length) {
      if (terminalStarted) {
        throw new MaxError('MAX API transformer invoked the transport more than once', {
          kind: MaxErrorKind.Protocol,
          method: terminalInput.specification.method,
          path: terminalInput.specification.route,
          ambiguousOutcome: false,
        });
      }
      terminalStarted = true;
      try {
        const response = await executeTrustedCall({ ...terminalInput, request });
        mutationMayHaveApplied = isMutation(terminalInput.specification.method)
          && (response.status < 400 || response.status >= 500);
        return response;
      } catch (error) {
        if (error instanceof MaxError && error.ambiguousOutcome) {
          mutationMayHaveApplied = true;
        }
        throw error;
      }
    }

    const transformer = transformers[index];
    let frameOpen = true;
    let nextPromise: Promise<ClientResponse> | undefined;
    let nextError: unknown;
    let nextFailed = false;
    let duplicateCalled = false;
    let duplicateError: MaxError | undefined;
    let transformerFailed = false;
    let transformerError: unknown;
    const metadata: ApiCallMetadata = Object.freeze({
      method: terminalInput.specification.method,
      route: terminalInput.specification.route,
      request: Object.freeze({ ...request }),
    });

    const next: ApiCallNext = function callNext(replacement) {
      if (!frameOpen || nextPromise !== undefined) {
        duplicateCalled = true;
        const rejection = (async function rejectDuplicateNext(): Promise<never> {
          if (nextPromise) {
            try {
              await nextPromise;
            } catch {
              // The trusted terminal records whether the mutation may have applied.
            }
          }
          duplicateError = new MaxError('MAX API transformer called next more than once', {
            kind: MaxErrorKind.Protocol,
            method: terminalInput.specification.method,
            path: terminalInput.specification.route,
            ambiguousOutcome: mutationMayHaveApplied,
          });
          throw duplicateError;
        }());
        rejection.catch(() => undefined);
        return rejection;
      }
      nextPromise = dispatch(index + 1, mergeTransformableRequest(request, replacement))
        .catch((error: unknown) => {
          nextFailed = true;
          nextError = error;
          throw error;
        });
      nextPromise.catch(() => undefined);
      return nextPromise;
    };

    try {
      await transformer(next, metadata);
    } catch (error) {
      transformerFailed = true;
      transformerError = error;
    } finally {
      frameOpen = false;
    }
    if (duplicateCalled) {
      if (nextPromise) {
        try {
          await nextPromise;
        } catch {
          // The downstream outcome is reflected by mutationMayHaveApplied.
        }
      }
      if (transformerFailed
        && transformerError !== duplicateError
        && (!nextFailed || transformerError !== nextError)) {
        throw transformerError;
      }
      throw new MaxError('MAX API transformer called next more than once', {
        kind: MaxErrorKind.Protocol,
        method: terminalInput.specification.method,
        path: terminalInput.specification.route,
        ambiguousOutcome: mutationMayHaveApplied,
      });
    }
    if (transformerFailed) {
      if (nextPromise) {
        try {
          await nextPromise;
        } catch {
          // The transformer error remains the primary failure.
        }
      }
      throw transformerError;
    }
    if (!nextPromise) {
      throw new MaxError('MAX API transformer must call next exactly once', {
        kind: MaxErrorKind.Protocol,
        method: terminalInput.specification.method,
        path: terminalInput.specification.route,
        ambiguousOutcome: false,
      });
    }
    return nextPromise;
  }

  return dispatch(0, terminalInput.request);
}

function mergeTransformableRequest(
  current: Readonly<TransformableRequestOptions>,
  replacement?: Readonly<Partial<TransformableRequestOptions>>,
): Readonly<TransformableRequestOptions> {
  if (replacement === undefined) return current;
  return {
    path: hasOwn(replacement, 'path') ? replacement.path : current.path,
    query: hasOwn(replacement, 'query') ? replacement.query : current.query,
    body: hasOwn(replacement, 'body') ? replacement.body : current.body,
    signal: hasOwn(replacement, 'signal') ? replacement.signal : current.signal,
    timeoutMs: hasOwn(replacement, 'timeoutMs')
      ? replacement.timeoutMs
      : current.timeoutMs,
  };
}

async function executeTrustedCall(input: TrustedTerminalInput): Promise<ClientResponse> {
  const { method, route, contract } = input.specification;
  const requestTimeout = input.request.timeoutMs ?? input.defaultTimeoutMs;
  let path: string;
  try {
    validateTimeout(requestTimeout);
    validateWireValue(input.request.path, contract.path);
    validateWireValue(input.request.query, contract.query);
    validateWireValue(input.request.body, contract.body);
    path = buildPath(route, input.request.path);
  } catch (error) {
    throw withRequestDetails(error, method, route, false);
  }
  if (!input.token) {
    throw new MaxError('MAX access token is required', {
      kind: MaxErrorKind.Protocol,
      method,
      path: route,
    });
  }

  const url = new URL(path, ensureTrailingSlash(input.baseUrl));
  appendQuery(url, input.request.query);
  const controller = new AbortController();
  if (input.clientSignal?.aborted || input.request.signal?.aborted) {
    throw new MaxError('MAX request aborted', {
      kind: MaxErrorKind.Abort,
      method,
      path: route,
      ambiguousOutcome: false,
    });
  }
  const body = serializeBody(
    input.request.body,
    input.specification.requestDescriptor ?? contract.body,
    method,
    route,
  );
  const timeout = setTimeout(controller.abort.bind(controller), requestTimeout);
  const combined = combineSignals([
    controller.signal,
    input.clientSignal,
    input.request.signal,
  ]);
  let responseReceived = false;
  let responseStatus: number | undefined;
  let requestStarted = false;

  try {
    requestStarted = true;
    const response = await input.fetchImplementation(url, {
      method,
      headers: buildHeaders(input.token, input.request.body),
      body,
      redirect: 'error',
      signal: combined.signal,
    });
    responseReceived = true;
    responseStatus = response.status;
    const text = await response.text();
    const data = response.ok
      ? parseSuccessfulResponse(text, input.specification, contract.response)
      : parseErrorBody(text);
    if (response.ok) contract.validateResponse?.(data);
    return { status: response.status, data, headers: response.headers };
  } catch (error) {
    if (error instanceof MaxError) {
      const ambiguous = error.ambiguousOutcome
        || (responseReceived && isMutation(method) && error.kind === MaxErrorKind.Protocol);
      throw withRequestDetails(error, method, route, ambiguous);
    }
    const callerAborted = input.clientSignal?.aborted || input.request.signal?.aborted;
    if (responseStatus !== undefined && responseStatus >= 400) {
      throw new MaxError('MAX response body could not be read', {
        kind: MaxErrorKind.Http,
        status: responseStatus,
        method,
        path: route,
        ambiguousOutcome: isMutation(method) && responseStatus >= 500,
        cause: error,
      });
    }
    throw new MaxError(callerAborted ? 'MAX request aborted' : 'MAX request failed', {
      kind: classifyFailure(callerAborted, controller.signal.aborted, responseReceived),
      method,
      path: route,
      ambiguousOutcome: isMutation(method) && requestStarted,
      cause: error,
    });
  } finally {
    clearTimeout(timeout);
    combined.cleanup();
  }
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
  const result = entriesOf(path).reduce((value, [key, item]) => {
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
  for (const [key, value] of entriesOf(query)) {
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
  options: TrustedCallSpecification,
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
  const active = signals.filter(isNonNully);
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
