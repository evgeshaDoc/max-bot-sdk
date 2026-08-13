import { timingSafeEqual } from 'node:crypto';

import type { Bot } from './bot';
import type { Context } from './context';
import { parseUpdate } from './core/network/api/parse-update';
import { WebhookBodyLimitError } from './webhook-body-limit-error';
import type {
  WebhookAdapter,
  WebhookAdapterRequest,
  WebhookHandler,
  WebhookOptions,
} from './webhook-types';

const DEFAULT_MAX_BODY_BYTES = 1_048_576;
const SECRET_HEADER = 'x-max-bot-api-secret';
const SECRET_PATTERN = /^[A-Za-z0-9_-]{5,256}$/;
const utf8Encoder = new TextEncoder();

type ValidatedWebhookOptions = {
  readonly secret: string | undefined;
  readonly maxBodyBytes: number;
};

type WebhookProcessor = (request: WebhookAdapterRequest) => Promise<Response>;

function bodyByteLength(body: string | Uint8Array): number {
  return typeof body === 'string' ? utf8Encoder.encode(body).byteLength : body.byteLength;
}

function parseContentLength(value: string | null): number | undefined {
  if (value === null || !/^\d+$/.test(value)) return undefined;
  const contentLength = Number(value);
  return Number.isSafeInteger(contentLength) ? contentLength : undefined;
}

function secretsMatch(actual: string | null, expected: string): boolean {
  const actualBytes = Buffer.from(actual ?? '');
  const expectedBytes = Buffer.from(expected);
  return actual !== null
    && actualBytes.length === expectedBytes.length
    && timingSafeEqual(actualBytes, expectedBytes);
}

function validateWebhookOptions(options: WebhookOptions): ValidatedWebhookOptions {
  if (options.secret !== undefined && !SECRET_PATTERN.test(options.secret)) {
    throw new TypeError('MAX webhook secret must contain 5-256 URL-safe characters');
  }
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes <= 0) {
    throw new TypeError('MAX webhook maxBodyBytes must be a positive safe integer');
  }
  return { secret: options.secret, maxBodyBytes };
}

async function readFetchBody(request: Request, maxBytes: number): Promise<Uint8Array> {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    let result = await reader.read();
    while (!result.done) {
      totalBytes += result.value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new WebhookBodyLimitError();
      }
      chunks.push(result.value);
      result = await reader.read();
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function fetchWebhookAdapter(request: Request) {
  return {
    request: {
      method: request.method,
      secret: request.headers.get(SECRET_HEADER),
      contentLength: parseContentLength(request.headers.get('content-length')),
      readBody(maxBytes: number) {
        return readFetchBody(request, maxBytes);
      },
    },
    respond(response: Response) {
      return response;
    },
  };
}

function createWebhookProcessor<ContextType extends Context>(
  bot: Bot<ContextType>,
  options: ValidatedWebhookOptions,
): WebhookProcessor {
  return async function processWebhook(request: WebhookAdapterRequest): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response(null, { headers: { allow: 'POST' }, status: 405 });
    }
    if (options.secret !== undefined && !secretsMatch(request.secret, options.secret)) {
      return new Response(null, { status: 401 });
    }
    if (request.contentLength !== undefined
      && request.contentLength > options.maxBodyBytes) {
      return new Response(null, { status: 413 });
    }

    let rawBody: unknown;
    try {
      rawBody = await request.readBody(options.maxBodyBytes);
    } catch (error) {
      return new Response(null, {
        status: error instanceof WebhookBodyLimitError ? 413 : 500,
      });
    }
    if (typeof rawBody !== 'string' && !(rawBody instanceof Uint8Array)) {
      return new Response(null, { status: 500 });
    }
    if (bodyByteLength(rawBody) > options.maxBodyBytes) {
      return new Response(null, { status: 413 });
    }

    let parsedUpdate;
    try {
      parsedUpdate = parseUpdate(rawBody);
    } catch {
      return new Response(null, { status: 400 });
    }

    if (parsedUpdate.kind === 'known') {
      try {
        await bot.dispatchUpdate(parsedUpdate.update);
      } catch {
        return new Response(null, { status: 500 });
      }
    }
    return new Response(null, { status: 200 });
  };
}

/**
 * Adapts the shared lossless webhook processor to an external server callback.
 * @param bot - Initialized bot receiving known updates.
 * @param adapter - Raw-body framework adapter that owns the response lifecycle.
 * @param options - Request verification and body-limit settings.
 * @returns A callback with the adapter's inferred arguments and result.
 */
export function webhookCallback<
  ContextType extends Context,
  Arguments extends readonly unknown[],
  Result,
>(
  bot: Bot<ContextType>,
  adapter: WebhookAdapter<Arguments, Result>,
  options: WebhookOptions = {},
): (...arguments_: Arguments) => Promise<Result> {
  const processor = createWebhookProcessor(bot, validateWebhookOptions(options));
  return async function handleWebhookCallback(...arguments_: Arguments): Promise<Result> {
    const exchange = adapter(...arguments_);
    return exchange.respond(await processor(exchange.request));
  };
}

/**
 * Creates the canonical Web Fetch MAX webhook handler.
 * @param bot - Initialized bot receiving known updates.
 * @param options - Request verification and body-limit settings.
 * @returns A Web Fetch API request handler.
 */
export function createWebhookHandler<ContextType extends Context>(
  bot: Bot<ContextType>,
  options: WebhookOptions = {},
): WebhookHandler {
  return webhookCallback(bot, fetchWebhookAdapter, options);
}

export type {
  WebhookAdapter,
  WebhookAdapterRequest,
  WebhookExchange,
  WebhookHandler,
  WebhookOptions,
} from './webhook-types';
