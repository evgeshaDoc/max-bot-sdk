import type { RequestHandler } from 'express';
import type { RouteHandlerMethod } from 'fastify';

import type { Bot } from '../src/bot';
import { webhookCallback } from '../src/webhook';
import {
  expressWebhookAdapter,
  fastifyWebhookAdapter,
} from '../src/webhook-adapters';
import type { WebhookAdapter } from '../src/webhook-types';

declare const bot: Bot;

const expressHandler: RequestHandler = webhookCallback(bot, expressWebhookAdapter, {
  secret: false,
});
const fastifyHandler: RouteHandlerMethod = webhookCallback(bot, fastifyWebhookAdapter, {
  secret: false,
});

type CustomRequest = {
  readonly method: string;
  readonly raw: Uint8Array;
};

type CustomResponse = {
  status: number;
};

const customAdapter: WebhookAdapter<
readonly [CustomRequest, CustomResponse],
CustomResponse
> = (request, response) => ({
  request: {
    method: request.method,
    secret: null,
    contentLength: request.raw.byteLength,
    readBody: () => request.raw,
  },
  respond(processorResponse) {
    response.status = processorResponse.status;
    return response;
  },
});

const customHandler = webhookCallback(bot, customAdapter, { secret: false });
const customResult: Promise<CustomResponse> = customHandler(
  { method: 'POST', raw: new Uint8Array() },
  { status: 0 },
);

Object.keys({ expressHandler, fastifyHandler, customResult });
