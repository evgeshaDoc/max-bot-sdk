import type { IncomingMessage, ServerResponse } from 'node:http';

import { WebhookBodyLimitError } from './webhook-body-limit-error';
import type {
  BufferedWebhookRequest,
  ExpressWebhookResponse,
  FastifyWebhookReply,
  WebhookExchange,
} from './webhook-types';

const SECRET_HEADER = 'x-max-bot-api-secret';

function normalizeHeader(
  value: string | readonly string[] | undefined,
): string | null {
  if (typeof value === 'string') return value;
  return value?.length === 1 ? value[0] ?? null : null;
}

function parseContentLength(
  value: string | readonly string[] | undefined,
): number | undefined {
  const normalized = normalizeHeader(value);
  if (normalized === null || !/^\d+$/.test(normalized)) return undefined;
  const contentLength = Number(normalized);
  return Number.isSafeInteger(contentLength) ? contentLength : undefined;
}

function requestBody(request: BufferedWebhookRequest, maxBytes: number): string | Uint8Array {
  const body = request.rawBody ?? request.body;
  if (typeof body !== 'string' && !(body instanceof Uint8Array)) {
    throw new TypeError('MAX webhook adapters require an unparsed raw body');
  }
  const bodyBytes = typeof body === 'string' ? Buffer.byteLength(body) : body.byteLength;
  if (bodyBytes > maxBytes) throw new WebhookBodyLimitError();
  return body;
}

function applyHeaders(
  processorResponse: Response,
  setHeader: (name: string, value: string) => unknown,
): void {
  processorResponse.headers.forEach((value, name) => setHeader(name, value));
}

function readNodeBody(request: IncomingMessage, maxBytes: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    function cleanup(): void {
      request.off('aborted', handleAborted);
      request.off('data', handleData);
      request.off('end', handleEnd);
      request.off('error', handleError);
    }

    function handleAborted(): void {
      cleanup();
      request.once('error', ignoreSettledRequestError);
      reject(new Error('Webhook request aborted'));
    }

    function handleData(chunk: Buffer | string): void {
      if (typeof chunk === 'string') {
        request.pause();
        cleanup();
        request.once('error', ignoreSettledRequestError);
        reject(new TypeError('MAX webhook Node adapter requires raw byte chunks'));
        return;
      }
      totalBytes += chunk.byteLength;
      if (totalBytes > maxBytes) {
        request.pause();
        cleanup();
        request.once('error', ignoreSettledRequestError);
        reject(new WebhookBodyLimitError());
        return;
      }
      chunks.push(chunk);
    }

    function handleEnd(): void {
      cleanup();
      const body = new Uint8Array(totalBytes);
      let offset = 0;
      for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
      }
      resolve(body);
    }

    function handleError(error: Error): void {
      cleanup();
      reject(error);
    }

    if (request.aborted) {
      handleAborted();
      return;
    }
    request.once('aborted', handleAborted);
    request.on('data', handleData);
    request.once('end', handleEnd);
    request.once('error', handleError);
  });
}

function ignoreSettledRequestError(): void {
  // Prevent a late socket error from escaping after an abort or bounded-read rejection.
}

function closeUnreadNodeRequest(
  request: IncomingMessage,
  response: ServerResponse,
): void {
  const noRequestBody = request.headers['transfer-encoding'] === undefined
    && (request.headers['content-length'] === undefined
      || request.headers['content-length'] === '0');
  if (request.complete || noRequestBody) return;

  response.shouldKeepAlive = false;
  response.setHeader('connection', 'close');
  let cleaned = false;

  function destroyUnreadRequest(): void {
    if (cleaned) return;
    cleaned = true;
    response.off('close', destroyUnreadRequest);
    response.off('finish', destroyUnreadRequest);
    if (request.complete || request.destroyed) return;
    request.once('error', ignoreSettledRequestError);
    request.socket.once('error', ignoreSettledRequestError);
    request.destroy();
  }

  response.once('close', destroyUnreadRequest);
  response.once('finish', destroyUnreadRequest);
}

/**
 * Adapts a native Node HTTP request and response without parsing JSON.
 * @param request - Incoming raw Node request stream.
 * @param response - Node response completed exactly once by this exchange.
 */
export function nodeHttpWebhookAdapter(
  request: IncomingMessage,
  response: ServerResponse,
): WebhookExchange<void> {
  let responded = false;
  return {
    request: {
      method: request.method ?? '',
      secret: normalizeHeader(request.headers[SECRET_HEADER]),
      contentLength: parseContentLength(request.headers['content-length']),
      readBody(maxBytes: number) {
        return readNodeBody(request, maxBytes);
      },
    },
    respond(processorResponse: Response) {
      if (responded) throw new Error('Webhook response was already applied');
      responded = true;
      response.statusCode = processorResponse.status;
      applyHeaders(processorResponse, response.setHeader.bind(response));
      closeUnreadNodeRequest(request, response);
      response.end();
    },
  };
}

/**
 * Adapts Express or Nest-on-Express route-local raw-body middleware.
 * @param request - Request whose `rawBody` or `body` is raw text or bytes.
 * @param response - Express-compatible response.
 */
export function expressWebhookAdapter(
  request: BufferedWebhookRequest,
  response: ExpressWebhookResponse,
): WebhookExchange<void> {
  let responded = false;
  return {
    request: {
      method: request.method,
      secret: normalizeHeader(request.headers[SECRET_HEADER]),
      contentLength: parseContentLength(request.headers['content-length']),
      readBody(maxBytes: number) {
        return requestBody(request, maxBytes);
      },
    },
    respond(processorResponse: Response) {
      if (responded) throw new Error('Webhook response was already applied');
      responded = true;
      response.status(processorResponse.status);
      applyHeaders(processorResponse, response.setHeader.bind(response));
      response.end();
    },
  };
}

/**
 * Adapts Fastify or Nest-on-Fastify configured with a buffer content parser.
 * @param request - Request whose `rawBody` or `body` is raw text or bytes.
 * @param reply - Fastify-compatible reply.
 */
export function fastifyWebhookAdapter(
  request: BufferedWebhookRequest,
  reply: FastifyWebhookReply,
): WebhookExchange<void> {
  let responded = false;
  return {
    request: {
      method: request.method,
      secret: normalizeHeader(request.headers[SECRET_HEADER]),
      contentLength: parseContentLength(request.headers['content-length']),
      readBody(maxBytes: number) {
        return requestBody(request, maxBytes);
      },
    },
    respond(processorResponse: Response) {
      if (responded) throw new Error('Webhook response was already applied');
      responded = true;
      reply.status(processorResponse.status);
      applyHeaders(processorResponse, reply.header.bind(reply));
      reply.send();
    },
  };
}
