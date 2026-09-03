import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import type { Bot } from './bot';
import type { Context } from './context';
import { cancelUnreadFetchBody, createWebhookHandler, webhookCallback } from './webhook';
import { nodeHttpWebhookAdapter } from './webhook-adapters';
import type {
  WebhookServer,
  WebhookServerOptions,
  WebhookServerRuntime,
} from './webhook-types';

const MINIMUM_REQUEST_TIMEOUT_MS = 31_000;

type BunRuntime = {
  serve(options: {
    readonly fetch: (request: Request) => Promise<Response>;
    readonly hostname: string;
    readonly idleTimeout: number;
    readonly port: number;
  }): {
    readonly port: number;
    stop(closeActiveConnections?: boolean): void | Promise<void>;
  };
};

type ValidatedServerOptions = {
  readonly hostname: string;
  readonly path: `/${string}`;
  readonly port: number;
  readonly runtime: WebhookServerRuntime;
  readonly signal: AbortSignal | undefined;
};

type BunServerInput<ContextType extends Context> = {
  readonly bot: Bot<ContextType>;
  readonly options: WebhookServerOptions;
  readonly runtime: BunRuntime;
  readonly validated: ValidatedServerOptions;
};

function getBunRuntime(): BunRuntime | undefined {
  const candidate: unknown = Reflect.get(globalThis, 'Bun');
  if (typeof candidate !== 'object' || candidate === null) return undefined;
  return typeof Reflect.get(candidate, 'serve') === 'function'
    ? candidate as BunRuntime
    : undefined;
}

function validateHostname(hostname: string): void {
  if (hostname.length === 0
    || hostname !== hostname.trim()
    || /[\s/@?#\0]/u.test(hostname)) {
    throw new TypeError('Webhook server hostname must be a valid local bind hostname');
  }

  try {
    const authority = hostname.includes(':') ? `[${hostname}]` : hostname;
    const parsed = new URL(`http://${authority}`);
    if (parsed.hostname.length === 0) throw new TypeError();
  } catch {
    throw new TypeError('Webhook server hostname must be a valid local bind hostname');
  }
}

function validatePath(path: string): asserts path is `/${string}` {
  if (!path.startsWith('/')
    || path.includes('?')
    || path.includes('#')
    || /%(?![\dA-Fa-f]{2})/u.test(path)) {
    throw new TypeError('Webhook server path must be an absolute pathname');
  }
  const normalized = new URL(path, 'http://localhost').pathname;
  if (normalized !== path) {
    throw new TypeError('Webhook server path must be URL-normalized');
  }
}

function validateOptions(options: WebhookServerOptions): ValidatedServerOptions {
  const runtime = options.runtime ?? 'auto';
  const hostname = options.hostname ?? '0.0.0.0';
  const port = options.port ?? 3000;
  const path = options.path ?? '/webhook';

  if (runtime !== 'auto' && runtime !== 'bun' && runtime !== 'node') {
    throw new TypeError('Webhook server runtime must be auto, bun, or node');
  }
  validateHostname(hostname);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new TypeError('Webhook server port must be an integer from 0 to 65535');
  }
  validatePath(path);
  if (options.signal?.aborted) {
    throw new DOMException('Webhook server start was aborted', 'AbortError');
  }

  return {
    hostname,
    path,
    port,
    runtime,
    signal: options.signal,
  };
}

function localUrl(hostname: string, port: number, path: string): URL {
  const authority = hostname.includes(':') ? `[${hostname}]` : hostname;
  return new URL(`http://${authority}:${port}${path}`);
}

function nodeRequestPath(request: IncomingMessage): string {
  const { url } = request;
  if (!url?.startsWith('/')) return '';
  const queryStart = url.indexOf('?');
  return queryStart === -1 ? url : url.slice(0, queryStart);
}

async function listenNodeServer(
  server: ReturnType<typeof createServer>,
  options: ValidatedServerOptions,
): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    function handleError(error: Error): void {
      server.off('listening', handleListening);
      reject(error);
    }

    function handleListening(): void {
      server.off('error', handleError);
      resolve();
    }

    server.once('error', handleError);
    server.once('listening', handleListening);
    server.listen(options.port, options.hostname);
  });

  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Webhook server did not bind a TCP address');
  }
  return address.port;
}

async function createNodeServer<ContextType extends Context>(
  bot: Bot<ContextType>,
  options: WebhookServerOptions,
  validated: ValidatedServerOptions,
): Promise<WebhookServer> {
  const callback = webhookCallback(bot, nodeHttpWebhookAdapter, options);
  let activeRequests = 0;
  let closing = false;
  let resolveDrained: (() => void) | undefined;

  async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    activeRequests += 1;
    try {
      if (nodeRequestPath(request) !== validated.path) {
        nodeHttpWebhookAdapter(request, response)
          .respond(new Response(null, { status: 404 }));
        return;
      }
      await callback(request, response);
    } catch {
      if (response.headersSent || response.destroyed) {
        if (!response.writableEnded) response.destroy();
      } else {
        nodeHttpWebhookAdapter(request, response)
          .respond(new Response(null, { status: 500 }));
      }
    } finally {
      activeRequests -= 1;
      if (closing) server.closeIdleConnections();
      if (activeRequests === 0) {
        resolveDrained?.();
        resolveDrained = undefined;
      }
    }
  }

  const server = createServer(handleRequest);
  server.requestTimeout = MINIMUM_REQUEST_TIMEOUT_MS;
  const port = await listenNodeServer(server, validated);
  let finishClosing: () => void = () => undefined;
  let failClosing: (error: unknown) => void = () => undefined;
  const finished = new Promise<void>((resolve, reject) => {
    finishClosing = resolve;
    failClosing = reject;
  });

  function close(): Promise<void> {
    if (closing) return finished;
    closing = true;

    let closeError: Error | undefined;
    const nativeClosed = new Promise<void>((resolve) => {
      server.close((error) => {
        closeError = error;
        resolve();
      });
    });
    server.closeIdleConnections();

    (async function drainAndClose(): Promise<void> {
      await nativeClosed;
      if (activeRequests > 0) {
        await new Promise<void>((resolve) => { resolveDrained = resolve; });
      }
      if (closeError) throw closeError;
    }()).then(finishClosing, failClosing);

    return finished;
  }

  function handleAbort(): void {
    close().catch(() => undefined);
  }

  validated.signal?.addEventListener('abort', handleAbort, { once: true });
  if (validated.signal?.aborted) handleAbort();
  finished.finally(() => {
    validated.signal?.removeEventListener('abort', handleAbort);
  }).catch(() => undefined);

  return {
    runtime: 'node',
    url: localUrl(validated.hostname, port, validated.path),
    finished,
    close,
  };
}

function createBunServer<ContextType extends Context>(
  input: BunServerInput<ContextType>,
): WebhookServer {
  const {
    bot,
    options,
    runtime,
    validated,
  } = input;
  const webhookHandler = createWebhookHandler(bot, options);

  async function handleRequest(request: Request): Promise<Response> {
    if (new URL(request.url).pathname !== validated.path) {
      const response = new Response(null, { status: 404 });
      cancelUnreadFetchBody(request, response);
      return response;
    }
    try {
      return await webhookHandler(request);
    } catch {
      const response = new Response(null, { status: 500 });
      cancelUnreadFetchBody(request, response);
      return response;
    }
  }

  const server = runtime.serve({
    fetch: handleRequest,
    hostname: validated.hostname,
    idleTimeout: MINIMUM_REQUEST_TIMEOUT_MS / 1_000,
    port: validated.port,
  });
  let closing = false;
  let finishClosing: () => void = () => undefined;
  let failClosing: (error: unknown) => void = () => undefined;
  const finished = new Promise<void>((resolve, reject) => {
    finishClosing = resolve;
    failClosing = reject;
  });

  function close(): Promise<void> {
    if (closing) return finished;
    closing = true;
    Promise.resolve(server.stop(false)).then(finishClosing, failClosing);
    return finished;
  }

  function handleAbort(): void {
    close().catch(() => undefined);
  }

  validated.signal?.addEventListener('abort', handleAbort, { once: true });
  if (validated.signal?.aborted) handleAbort();
  finished.finally(() => {
    validated.signal?.removeEventListener('abort', handleAbort);
  }).catch(() => undefined);

  return {
    runtime: 'bun',
    url: localUrl(validated.hostname, server.port, validated.path),
    finished,
    close,
  };
}

/**
 * Starts an SDK-owned local HTTP webhook listener.
 *
 * The returned URL is a local bind URL, not the public HTTPS endpoint registered
 * with MAX. Production deployments must terminate trusted TLS on port 443 before
 * proxying to this listener.
 *
 * @param bot - Initialized bot receiving known updates.
 * @param options - Local listener and webhook processor settings.
 * @returns The bound listener handle.
 */
export async function serveWebhook<ContextType extends Context>(
  bot: Bot<ContextType>,
  options: WebhookServerOptions = {},
): Promise<WebhookServer> {
  const validated = validateOptions(options);
  const bunRuntime = getBunRuntime();
  if (validated.runtime === 'bun' && !bunRuntime) {
    throw new TypeError('Bun.serve is unavailable in this runtime');
  }
  if (bunRuntime
    && (validated.runtime === 'bun' || validated.runtime === 'auto')) {
    return createBunServer({
      bot,
      options,
      runtime: bunRuntime,
      validated,
    });
  }
  return createNodeServer(bot, options, validated);
}
