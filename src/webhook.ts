import { timingSafeEqual } from 'node:crypto';

import type { Bot } from './bot';
import type { Context } from './context';
import { parseUpdate } from './core/network/api/parse-update';

const SECRET_HEADER = 'x-max-bot-api-secret';
const SECRET_PATTERN = /^[A-Za-z0-9_-]{5,256}$/;

/** Webhook request settings. */
export interface WebhookOptions {
  /** Expected value of `X-Max-Bot-Api-Secret`. Omit to skip SDK-level verification. */
  readonly secret?: string;
}

/** Web Fetch API handler accepted directly by `Bun.serve({ fetch })`. */
export type WebhookHandler = (request: Request) => Promise<Response>;

function secretsMatch(actual: string | null, expected: string): boolean {
  const actualBytes = Buffer.from(actual ?? '');
  const expectedBytes = Buffer.from(expected);
  return actual !== null
    && actualBytes.length === expectedBytes.length
    && timingSafeEqual(actualBytes, expectedBytes);
}

/**
 * Creates a server-independent MAX webhook request handler.
 * @param bot - Initialized bot receiving known updates.
 * @param options - Optional request verification settings.
 * @returns A Web Fetch API request handler.
 */
export function createWebhookHandler<ContextType extends Context>(
  bot: Bot<ContextType>,
  options: WebhookOptions = {},
): WebhookHandler {
  if (options.secret !== undefined && !SECRET_PATTERN.test(options.secret)) {
    throw new TypeError('MAX webhook secret must contain 5-256 URL-safe characters');
  }

  async function handleWebhook(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response(null, {
        headers: { allow: 'POST' },
        status: 405,
      });
    }

    if (options.secret !== undefined
      && !secretsMatch(request.headers.get(SECRET_HEADER), options.secret)) {
      return new Response(null, { status: 401 });
    }

    let parsedUpdate;
    try {
      parsedUpdate = parseUpdate(new Uint8Array(await request.arrayBuffer()));
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
  }

  return handleWebhook;
}
