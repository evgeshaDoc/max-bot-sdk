# @tlman/max-bot-sdk

Поддерживаемый TypeScript SDK для текущего MAX Bot API. Он сохраняет привычную цепочку `Bot → Composer → Context`, но добавляет lossless `int64`, webhook transport, актуальные типы и единый HTTP-клиент для Node.js 18.18+ и Bun.

```sh
npm install @tlman/max-bot-sdk
```

Пакет намеренно не имеет root barrel. Импортируйте только объявленные подмодули:

```ts
import { Bot } from '@tlman/max-bot-sdk/bot';
import { createWebhookHandler } from '@tlman/max-bot-sdk/webhook';

const bot = new Bot(process.env.MAX_BOT_TOKEN!);

bot.command('ping', (context) => context.reply('pong'));

await bot.initialize();

Bun.serve({
  port: 3000,
  fetch: createWebhookHandler(bot, {
    secret: process.env.MAX_WEBHOOK_SECRET,
  }),
});
```

Webhook body должен попасть в SDK как исходные bytes: не ставьте JSON body parser перед `createWebhookHandler` или `parseUpdate`. Для Node HTTP, Express 5 и Fastify 5 используйте raw-body adapters; для SDK-owned local listener — `serveWebhook`. Конкретные настройки и reverse-proxy boundary описаны в [docs/02-listen-and-respond.md](docs/02-listen-and-respond.md).

Создание subscription:

```ts
await bot.api.createSubscription({
  url: 'https://bot.example.com/max',
  secret: process.env.MAX_WEBHOOK_SECRET,
  update_types: ['message_created', 'message_callback'],
});
```

MAX принимает webhook только по HTTPS на стандартном порту 443. Endpoint должен вернуть ровно HTTP 200 не позднее 30 секунд. SDK проверяет `X-Max-Bot-Api-Secret`, возвращает 400 для malformed payload, 401 для неверного secret, 405 для другого метода и 500 при ошибке middleware.

Для разработки доступен long polling:

```ts
import { Bot } from '@tlman/max-bot-sdk/bot';

const bot = new Bot(process.env.MAX_BOT_TOKEN!);
bot.on('message_created', (context) => context.reply('Получено'));
await bot.start();
```

## Sessions

```ts
import { session } from '@tlman/max-bot-sdk/session';
import type { SessionFlavor } from '@tlman/max-bot-sdk/session';
```

Session middleware требует явные `storage`, `initial` и `getSessionKey`. Один instance
сериализует одинаковые ключи только внутри одного Node.js/Bun процесса; распределённую
координацию и изоляцию возвращаемых объектов обеспечивает storage adapter. Подробный
контракт и взаимодействие с `errorBoundary` описаны в [docs/plugins.md](docs/plugins.md).

## Lossless IDs

Все документированные MAX `int64` представлены как canonical decimal strings:

```ts
import type { Int64 } from '@tlman/max-bot-sdk/core/network/api/types/int64';

const chatId: Int64 = '9223372036854775807';
await bot.api.sendMessageToChat(chatId, 'Без потери точности');
```

SDK сериализует такие значения обратно в JSON как bare integer tokens. `bigint`, `LosslessNumber` и unsafe JavaScript `number` не выходят в public API.

## Public modules

Основные runtime imports: `/bot`, `/api`, `/context`, `/composer`, `/middleware`, `/filter-query`, `/filters`, `/session`, `/webhook`, `/webhook-adapters`, `/webhook-server`, `/client`, `/raw-api`, `/parse-update`, `/errors`, `/attachments`, `/keyboard`, `/buttons`. Типы доступны через точечные `/types/*` exports из `package.json`.

Полный аудит MAX API находится в [docs/api-coverage.md](docs/api-coverage.md), происхождение форка — в [UPSTREAM.md](UPSTREAM.md), политика обновления — в [CHANGELOG.md](CHANGELOG.md).

## Требования и проверка

- Node.js `>=18.18.0` или Bun `>=1.3.11`.
- `npm test` — unit, endpoint table и реальный `node:http` transport.
- `npm run test:pack` — установка tarball и запуск direct exports в Node и Bun.
- `npm run lint && npm run typecheck && npm run build` — статические проверки.

License: MIT.
