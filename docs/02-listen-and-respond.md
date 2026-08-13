# `2` Прослушивание обновлений и реакция на них

После запуска бота Max начнёт отправлять вам обновления.
> Подробности обо всех обновлениях смотрите в [официальной документации](https://dev.max.ru/docs-api).

Max Bot API позволяет прослушивать эти обновления, например:
```typescript
// Обработчик начала диалога с ботом
bot.on('bot_started', (ctx) => {/* ... */});

// Обработчик новых сообщений
bot.on('message_created', (ctx) => {/* ... */});

// Обработчик добавления пользователя в беседу
bot.on('user_added', (ctx) => {/* ... */});
```
Вы можете использовать подсказки в редакторе кода, чтобы увидеть все доступные типы обновлений.

## Получение сообщений
Вы можете подписаться на обновление `message_created`:
```typescript
bot.on('message_created', (ctx) => {
  const message = ctx.message; // полученное сообщение
});
```
Или воспользоваться специальными методами:
```typescript
// Обработчик команды '/start'
bot.command('start', async (ctx) => {/* ... */});

// Сравнение текста сообщения со строкой или регулярным выраженим
bot.hears('hello', async (ctx) => {/* ... */});
bot.hears(/echo (.+)?/, async (ctx) => {/* ... */});

// Обработчик нажатия на callback-кнопку с указанным payload
bot.action('connect_wallet', async (ctx) => {/* ... */});
bot.action(/color:(.+)/, async (ctx) => {/* ... */});
```

## Отправка сообщений
Вы можете воспользоваться методами из `bot.api`:
```typescript
// MAX int64 всегда передаётся canonical decimal string
const userId = '12345';
const chatId = '54321';

await bot.api.sendMessageToUser(userId, 'Привет!');
// Опционально вы можете передать дополнительные параметры
await bot.api.sendMessageToUser(userId, 'Привет!', {/* доп. параметры */});

// Отправить сообщение в чат с id=54321
await bot.api.sendMessageToChat(chatId, 'Всем привет!');

// Получить отправленное сообщения
const message = await bot.api.sendMessageToUser(userId, 'Привет!');
console.log(message.body?.mid);
```

Все 28 текущих методов доступны через friendly API или типизированные модули `bot.api.raw`.

Или воспользоваться методом контекста `reply`:
```typescript
bot.hears('ping', async (ctx) => {
  if (!ctx.message.body) return;
  // 'reply' — псевдоним метода 'ctx.api.sendMessageToChat' в этом же чате
  await ctx.reply('pong', {
    // 'link' прикрепляет оригинальное сообщение
    link: { type: 'reply', mid: ctx.message.body.mid },
  });
});
```

## Форматирование сообщений
> Подробности про форматирование смотрите в [официальной документации](https://dev.max.ru/docs-api).

Вы можете отправлять сообщения, используя **жирный** или _курсивный_ текст, ссылки и многое другое. Есть два типа форматирования: `markdown` и `html`.
#### Markdown
```typescript
await bot.api.sendMessageToChat(
  '12345',
  '**Привет!** _Добро пожаловать_ в [Max](https://dev.max.ru).',
  { format: 'markdown' },
);

// или используя метод reply

bot.hears('ping', async (ctx) => {
  if (!ctx.message.body) return;
  await ctx.reply('**Привет!** _Добро пожаловать_ в [Max](https://dev.max.ru).', {
    // 'link' прикрепляет оригинальное сообщение
    link: { type: 'reply', mid: ctx.message.body.mid },
    format: 'markdown',
  });
});
```

#### HTML
```typescript
await bot.api.sendMessageToChat(
  '12345',
  '<b>Привет!</b> <i>Добро пожаловать</i> в <a href="https://dev.max.ru">Max</a>.',
  { format: 'html' },
);

// или используя метод reply

bot.hears('ping', async (ctx) => {
  if (!ctx.message.body) return;
  await ctx.reply('<b>Привет!</b> <i>Добро пожаловать</i> в <a href="https://dev.max.ru">Max</a>.', {
    // 'link' прикрепляет оригинальное сообщение
    link: { type: 'reply', mid: ctx.message.body.mid },
    format: 'html',
  });
});
```

## Webhook без потери MAX `int64`

MAX присылает идентификаторы больше `Number.MAX_SAFE_INTEGER`, поэтому webhook route должен
передать SDK исходную строку или bytes. `express.json()`, стандартный JSON parser Fastify и
любой уже разобранный object необратимо теряют точность; adapter вернёт для такого object
пустой `500` и не вызовет bot middleware.

Fetch handler остаётся прямым вариантом для Bun, Hono, Elysia и других Web Fetch runtimes:

```typescript
import { createWebhookHandler } from '@tlman/max-bot-sdk/webhook';

const fetch = createWebhookHandler(bot, {
  secret: process.env.MAX_WEBHOOK_SECRET,
  maxBodyBytes: 1_048_576,
});

Bun.serve({ fetch, port: 3000 });
```

### Standalone Node.js/Bun listener

Если lifecycle HTTP server должен принадлежать SDK, используйте отдельный entrypoint:

```typescript
import { serveWebhook } from '@tlman/max-bot-sdk/webhook-server';

const server = await serveWebhook(bot, {
  hostname: '127.0.0.1',
  path: '/webhook',
  port: 3000,
  secret: process.env.MAX_WEBHOOK_SECRET,
});

console.log(`Local webhook listener: ${server.url}`);
```

`server.url` всегда описывает локальный HTTP listener, а не URL для MAX subscription.
Production endpoint должен завершать trusted TLS на публичном HTTPS-порту `443` через
Caddy, Nginx или load balancer и proxy-ить запрос без разбора body на этот listener.
`serveWebhook` не создаёт subscription, не устанавливает process signal handlers и не
запускает polling. Subscription по-прежнему создаётся и удаляется явно через API; webhook и
`bot.start()` нельзя использовать одновременно. Native listener оставляет webhook request
не менее 31 секунды, чтобы не обрывать принятую обработку раньше 30-секундного окна MAX.

Для управляемого shutdown передайте `AbortSignal` или вызовите `await server.close()`;
повторный close безопасен и ждёт уже принятые запросы.

### Node HTTP

```typescript
import { createServer } from 'node:http';

import { webhookCallback } from '@tlman/max-bot-sdk/webhook';
import { nodeHttpWebhookAdapter } from '@tlman/max-bot-sdk/webhook-adapters';

const callback = webhookCallback(bot, nodeHttpWebhookAdapter, {
  secret: process.env.MAX_WEBHOOK_SECRET,
});

createServer(callback).listen(3000, '127.0.0.1');
```

### Express 5

Raw parser ставится только на webhook route и до любого общего `express.json()`:

```typescript
import express from 'express';

import { webhookCallback } from '@tlman/max-bot-sdk/webhook';
import { expressWebhookAdapter } from '@tlman/max-bot-sdk/webhook-adapters';

const app = express();
const maxBodyBytes = 1_048_576;

const emptyBodyLimitError = (error, _request, response, next) => {
  if (error?.status === 413) {
    response.status(413).end();
    return;
  }
  next(error);
};

app.post(
  '/webhook',
  express.raw({ type: 'application/json', limit: maxBodyBytes }),
  webhookCallback(bot, expressWebhookAdapter, {
    secret: process.env.MAX_WEBHOOK_SECRET,
    maxBodyBytes,
  }),
  emptyBodyLimitError,
);

app.use(express.json());
```

### Fastify 5

Buffer parser лучше encapsulate вместе с route, чтобы не менять JSON behavior остальных
endpoint-ов:

```typescript
import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';

import { webhookCallback } from '@tlman/max-bot-sdk/webhook';
import { fastifyWebhookAdapter } from '@tlman/max-bot-sdk/webhook-adapters';

const botApp = Fastify();
const maxBodyBytes = 1_048_576;

async function registerMaxWebhook(app: FastifyInstance): Promise<void> {
  app.setErrorHandler((error, _request, reply) => {
    if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      reply.status(413).send();
      return;
    }
    reply.send(error);
  });
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer', bodyLimit: maxBodyBytes },
    (_request, body, done) => done(null, body),
  );
  app.post('/webhook', webhookCallback(bot, fastifyWebhookAdapter, {
    secret: process.env.MAX_WEBHOOK_SECRET,
    maxBodyBytes,
  }));
}

await botApp.register(registerMaxWebhook);
await botApp.listen({ host: '127.0.0.1', port: 3000 });
```

### NestJS

Отдельного Nest adapter нет: `NestFactory.create(..., { rawBody: true })` добавляет исходный
`Buffer`, после чего Express platform использует `expressWebhookAdapter`, а Fastify platform —
`fastifyWebhookAdapter`. Controller должен передать `RawBodyRequest<Request>` и response/reply
соответствующему callback без `JSON.stringify` и без обращения к разобранному body. Это recipe
на основе официального Nest raw-body режима, а не отдельно протестированный Nest runtime.

Все adapters используют одну таблицу результатов: пустые `405`/`401`/`413`/`400`/`500` либо
ровно `200`. Проверка method, secret и объявленного `Content-Length` выполняется до чтения body;
фактический limit действует и для streaming ingress. Framework raw-parser limit должен быть не
выше `maxBodyBytes`; route/plugin-scoped error handler обязан преобразовать parser limit error в
пустой `413`, чтобы framework не раскрыл HTML/JSON детали до SDK processor-а.
