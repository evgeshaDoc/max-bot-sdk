# План модификации форка MAX TypeScript SDK

Статус: `RALPLAN consensus approved`, revision 5. Architect: `APPROVE`. Critic: `APPROVE`.

Дата среза: 2026-08-10.

База форка: [`@maxhub/max-bot-api@0.2.5`, upstream `2e4263e359b161830f1fd636400482ed4aede13b`](https://github.com/max-messenger/max-bot-api-client-ts/tree/2e4263e359b161830f1fd636400482ed4aede13b).

## 1. Результат и stop condition

Нужен отдельный, поддерживаемый форк официального MAX TypeScript SDK, который:

- сохраняет единственный MAX-native execution chain `Bot -> Composer -> Context` и существующий `Api`;
- поддерживает production Webhook: subscription CRUD, lossless raw parsing и публичный dispatch одного update;
- соответствует 29 актуальным страницам методов MAX: 28 поддерживаемых методов и одной tombstone-странице удалённого `GET /chats`;
- покрывает 8 верхнеуровневых object pages и все транзитивно достижимые wire structures;
- никогда не пропускает документированный `int64` через JavaScript `number`;
- выполняет все исходящие MAX-запросы через один transport и не повторяет mutations автоматически;
- собирается, тестируется и публикуется как immutable built package;
- предоставляет ровно тот public surface, который нужен будущему `MaxPlatformRuntime`, но ничего не знает о Telman.

Работа считается законченной, когда:

1. После Phase 4 `docs/api-coverage.md` содержит 29 method rows (28 supported + retired `GET /chats`), 8 object-page rows, 15 current update descriptors/fixtures и строки для всех транзитивных wire structures; нет `TODO`, `unknown` или неподтверждённых обязательных полей.
2. Все документированные `int64` имеют единый public type decimal string и проходят raw -> SDK -> `Context` -> outbound wire round-trip без потери точности.
3. Семантика `initialize`, `dispatchUpdate`, unknown updates, polling errors и mutation ambiguity закреплена тестами.
4. Все четыре автоматизированных слоя проверки зелёные на чистом checkout.
5. Обязательный live pre-release test-bot gate успешно создал, прочитал, проверил и удалил webhook subscription; cleanup подтверждён.
6. Упакованный tarball устанавливается и запускается в Node 18.18+ и Bun 1.3.11 только через объявленные direct subpath exports.
7. Выпущена immutable exact version с зафиксированными fork SHA, upstream SHA, docs audit date и package integrity.

## 2. Границы ответственности

### Форк SDK владеет

- MAX endpoint paths, HTTP method/query/path/body encoding и авторизацией;
- request/response/object/update types;
- lossless JSON parse/serialize для MAX wire format;
- `GET`, `POST`, `DELETE /subscriptions`;
- `parseUpdate(raw)` и известностью `update_type`;
- server-independent Web Fetch webhook handler, включая optional secret verification;
- `Bot.initialize()` и `Bot.dispatchUpdate(update)`;
- polling для разработки, включая его marker/retry/abort semantics;
- typed/sanitized MAX errors;
- fixtures, contract tests, package exports, CI, release и upstream sync policy.

### Будущий Telman владеет

- публичным HTTPS endpoint в gateway;
- получением исходных bytes/text без предварительного JSON parse;
- product-level routing и secret storage для `X-Max-Bot-Api-Secret`;
- выбором bot/shard/runtime;
- receipt, dedupe, ack timing, NATS и retries доставки;
- product lifecycle: когда создавать, сверять и удалять webhook subscription;
- нормализацией MAX updates в бизнес-контексты antispam/subscription;
- `MaxPlatformRuntime` и отображением `MaxError` в `PlatformOperationResult`.

### Не входит в этот план

- любые изменения `libs/bot-core`, ботов, gateway или `bot-control`;
- vendor/copy SDK в Telman;
- HTTP server и framework-specific adapter для Nest/Express;
- secret storage;
- receipt/dedulication store, NATS, shards, RPC;
- automatic subscription reconciliation;
- второй dispatcher, второй HTTP client или giant universal update;
- rate-limit queue или automatic mutation retries;
- генерация из неавторитетной schema;
- performance optimization без измеренного bottleneck.

`Bot.stop()` и будущий `MaxPlatformRuntime.stop()` означают остановку процесса/runtime dispatch. Они никогда не удаляют product webhook subscription.

## 3. RALPLAN-DR

### Principles

1. Один MAX-native dispatcher (`Bot/Composer`) и один HTTP transport.
2. Raw bytes/text доходят до SDK parser; documented `int64` никогда не проходит через JS `number`.
3. Unknown updates и failures явны, но SDK не принимает ack/retry/dedupe решения.
4. Claim «актуальный API» доказывается dated ledger, fixtures и live release gate.
5. Fork divergence ограничен patch inventory, exit gate и immutable releases.

### Главные decision drivers

1. Wire correctness, особенно bare JSON `int64`.
2. Чистая webhook/runtime граница без private SDK methods и без network fetch внутри dispatch.
3. Минимальная стоимость сопровождения форка и возможность вернуться к upstream.

### Option A — bounded fork официального SDK, выбран

Патчить существующие `Bot`, `Composer`, `Context`, `Api`, transport и types.

Плюсы:

- сохраняется официальный SDK mental model;
- не появляется второй middleware/dispatch framework;
- весь MAX HTTP остаётся в одном месте;
- upstream diff можно поддерживать как набор небольших патчей.

Минусы:

- type/API parity поддерживается вручную;
- `number -> Int64` и удаление barrels — deliberate breaking changes;
- нужен собственный release/CI процесс.

### Option B — upstream без изменений + companion package/Telman adapter

Это сильнейшая альтернатива: формально меньше fork maintenance и сохраняется drop-in upstream compatibility.

Она отклонена, потому что private `handleUpdate`, `Response.json()`, неверные `number`, stale types и transport bugs нельзя исправить наружной обёрткой. Companion package неизбежно создаст второй client/dispatcher или протечёт MAX wire knowledge в Telman.

### Option C — новый сгенерированный SDK

Отклонён: текущая authoritative OpenAPI не найдена, а `schema.yaml` официального Go SDK конфликтует с текущими docs. Если MAX опубликует versioned schema, доказанно совпадающую с docs, generation можно рассмотреть только для wire DTO/descriptors, сохранив `Bot/Composer/Context`.

### Bounded-fork exit gate

Работа останавливается и возвращается к Architect/RALPLAN, если:

- lossless support требует заменить или продублировать `Composer`/`Context`;
- webhook support требует второго dispatcher;
- API/upload требует второго HTTP client;
- codec превращается в универсальный schema/validation framework;
- fork начинает зависеть от `@tlman/*` или product lifecycle;
- private fork настолько разошёлся с pinned upstream, что patch inventory перестал быть bounded.

Fork выводится из эксплуатации, когда upstream выпустит эквивалентный lossless webhook/dispatch/current-API surface с тестами и immutable release.

## 4. Источники истины

Приоритет:

1. [Текущая документация MAX API](https://dev.max.ru/docs-api) — endpoints, delivery/security, deprecations, enums.
2. [Официальный Go SDK `v2@b9ac372`](https://github.com/max-messenger/max-bot-api-client-go/tree/b9ac3728162b743a36a597ed1432d96bfb69a1cb) — только secondary source для shapes/fixtures, отсутствующих в docs.
3. Официальный TS SDK `v0.2.5@2e4263e` — compatibility baseline, не источник актуального API.
4. Redacted live test-bot fixture — фактический wire evidence, но не доказательство обязательности каждого поля.

Go `schema.yaml` не используется как generator input: он содержит старый host/auth, self-signed certificate flow и legacy update kinds, противоречащие текущим docs.

## 5. Обязательные blocking spikes

### S0.1 — аудит private fork

До production edits:

1. Открыть отдельный checkout/worktree SDK fork.
2. Проверить root, remotes, branch, HEAD, merge-base с `2e4263e...`.
3. Зафиксировать все existing fork commits и классифицировать каждый delta: keep/drop/rework.
4. Проверить package name, registry ownership, CI/release и `LICENSE`.
5. Прервать execution, если `git rev-parse --show-toplevel` равен `/Users/kolosmanger/dev/telman`.

Artifact в форке: `docs/spikes/0001-fork-and-lossless-baseline.md`.

Если private fork ещё не существует, execution создаёт его ровно от `2e4263e...`; другой base SHA нельзя выбирать молча.

### S0.2 — lossless dependency proof

Leading candidate: exact `lossless-json@4.3.1`, [официальный репозиторий](https://github.com/josdejong/lossless-json).

Dependency добавляется только после temp proof на:

- Node 18.18;
- Bun 1.3.11;
- текущем CJS/Node16 build SDK;
- ESM/CJS import совместимости;
- license/security;
- lossless parse и bare-number serialization;
- отсутствии `bigint`/`LosslessNumber` в public API.

Если кандидат не проходит, исследуется ровно одна поддерживаемая альтернатива. Handwritten JSON parser запрещён.

### S0.3 — int64/descriptor proof

Проверить:

- `9007199254740993`;
- `9223372036854775807`;
- signed int64 min/max и out-of-range;
- canonical `0` и запрет `-0`;
- запрет exponent/decimal forms в int64 path;
- leading-zero JSON number как invalid JSON;
- nested object paths, `user_ids` arrays и int64 map values, если они есть в current wire graph;
- safe integers/floats остаются `number`;
- unsafe numeric token в known non-int64 path вызывает protocol error;
- официальный unsafe fixture `message.body.seq: 116328147937082782` проходит точно;
- raw update -> decimal string -> `Context` -> outbound bare number;
- пользовательские digit-like strings не изменяются;
- unknown update отбрасывает payload без округления и возвращает только type tag.

Ни на одном MAX JSON path нельзя использовать `Response.json()` или предварительный native `JSON.parse`.

### S0.4 — docs/schema freeze

Зафиксировать audit date, 29 method pages, 8 object pages, 15 update kinds и каждую inline/referenced wire structure. Все конфликты docs/Go/upstream записываются, а не угадываются.

## 6. Целевой public contract

### 6.1 Int64

```ts
/** Canonical signed decimal representation of a MAX int64. */
export type Int64 = `${bigint}`
```

Правила:

- каждый documented `integer<int64>` всегда `Int64`, даже если значение маленькое;
- counts, dimensions, durations и coordinates остаются `number`, если docs не объявляют их int64;
- runtime принимает только canonical signed decimal в диапазоне int64;
- query/path используют decimal text;
- request JSON сериализует `Int64` как unquoted integer token;
- public API никогда не возвращает `bigint`/`LosslessNumber` и не принимает unsafe `number` вместо `Int64`.

### 6.2 Bounded wire descriptors

Не использовать global field-name heuristic.

- Каждый из 28 supported methods имеет request/response descriptor.
- Каждый из 15 current updates имеет descriptor.
- Реально переиспользуемые nested structures имеют named descriptor.
- Descriptor отмечает shape, nullable branches, int64 paths/arrays/maps и safe numeric leaves.
- Descriptors internal, не экспортируются и не образуют generic validation DSL.

Known response flow:

1. `lossless-json` сохраняет numeric lexemes.
2. Выбранный descriptor преобразует только documented int64 в canonical decimal strings.
3. Остальные числа превращаются в `number` только после exact safe conversion.
4. Shape/int64 mismatch даёт `MaxError(kind='protocol')`.

Outbound descriptor преобразует только documented `Int64` обратно в bare JSON numeric token.

### 6.3 Raw webhook parser

```ts
export type ParsedUpdate =
    | { readonly kind: 'known'; readonly update: Update }
    | { readonly kind: 'unknown'; readonly updateType: string }

export function parseUpdate(rawBody: string | Uint8Array): ParsedUpdate
```

Semantics:

- `Uint8Array` декодируется strict UTF-8;
- invalid UTF-8/JSON/root/discriminant/known shape/int64 -> `MaxUpdateParseError`;
- ровно 15 current variants -> `known`;
- любой другой non-empty string discriminant, включая legacy kinds -> `unknown`;
- unknown не содержит raw body, payload или parsed object;
- `UpdateType` остаётся exact known union и не widening-ится до `string`;
- parsed-object overload отсутствует.

Valid future unknown не создаёт retry storm: Telman сможет безопасно acknowledge/log только `updateType`. Malformed known update остаётся ошибкой доставки.

Webhook и `GET /updates` используют один внутренний классификатор в одинаковом порядке:

1. Lossless parse raw JSON.
2. Валидация только root object и non-empty string `update_type`.
3. Unknown discriminant немедленно возвращает `{kind:'unknown', updateType}`; payload не валидируется, не нормализуется, не логируется и сразу отбрасывается.
4. Только known discriminant запускает update descriptor, structural validation, int64 normalization и safe numeric conversion.

Поэтом future unknown с необъявленным unsafe integer в payload всё равно возвращает minimal unknown tag, а не protocol error.

`GET /updates` возвращает тот же public result:

```ts
export type GetUpdatesResponse = {
    updates: ParsedUpdate[]
    marker: Int64 | null
}
```

Polling идёт по page по порядку: unknown пропускается без `Context`, middleware, catcher и payload logging; known идёт в polling dispatch boundary. Marker продвигается только после всех known updates, когда они успешны или их polling catcher resolved. Если catcher throws, marker page не продвигается; unknown-only page продвигается после skip.

### 6.4 Bot lifecycle и dispatch

```ts
export class Bot<ContextType extends Context = Context>
    extends Composer<ContextType> {
    readonly api: Api

    initialize(): Promise<BotInfo>
    dispatchUpdate(update: Update): Promise<void>
}
```

`initialize`:

- idempotent и concurrency-safe;
- concurrent calls разделяют один `getMyInfo` promise;
- success кэширует `botInfo`;
- failure очищает in-flight state;
- retry выполняется только следующим explicit вызовом;
- `start()` вызывает `initialize()` перед polling.

`dispatchUpdate`:

- требует successful initialize, иначе `BotNotInitializedError`;
- не lazy-initialize и делает zero network calls;
- создаёт ровно один configured `Context`;
- выполняет middleware ровно один раз;
- полностью bypass-ит `Bot.catch`;
- reject-ит исходную handler error без wrapping/aggregation;
- не ack/dedupe/retry и не меняет polling marker.

Один private middleware core вызывается двумя boundary wrappers:

- public managed `dispatchUpdate`;
- polling boundary.

`Bot.catch` принадлежит только polling:

- custom catcher resolves -> update обработан, polling продолжает;
- custom/default catcher throws -> polling прекращается, marker batch не фиксируется;
- одна ошибка вызывает catcher не более одного раза;
- public `dispatchUpdate` catcher не вызывает.

Polling обрабатывает batch последовательно в полученном порядке. Marker записывается только после успешного завершения всего batch.

### 6.5 Subscription API

```ts
export type CreateSubscriptionInput = {
    url: `https://${string}`
    update_types?: readonly UpdateType[]
    secret?: string
}

export type ActionResponse =
    | { readonly success: true; readonly message?: string }
    | { readonly success: false; readonly message?: string }

api.getSubscriptions(): Promise<GetSubscriptionsResponse>
api.createSubscription(input: CreateSubscriptionInput): Promise<ActionResponse>
api.deleteSubscription(url: string): Promise<ActionResponse>
```

- URL проходит runtime HTTPS validation.
- Secret соответствует `^[A-Za-z0-9_-]{5,256}$`.
- `update_types` допускает только exact current `UpdateType`.
- Валидный HTTP 2xx `{success:false,message?}` возвращается без изменений как typed business result; это не `MaxError` и `ambiguousOutcome = false`.
- SDK не делает implicit follow-up `GET /subscriptions` и не выводит фактическое состояние subscription; caller проверяет discriminant и явно читает state, если это нужно.
- Malformed 2xx body, который не является `ActionResponse`, остаётся ambiguous protocol failure.
- Методы не создают lifecycle loop и не вызываются автоматически из `start/stop`.

Raw implementations остаются в существующем `SubscriptionsApi`.

### 6.6 HTTP client

```ts
export interface ClientOptions {
    fetch?: typeof globalThis.fetch

    /** @default 10_000 */
    timeoutMs?: number

    signal?: AbortSignal

    /** Для тестов/совместимых private endpoints; production default фиксирован. */
    baseUrl?: string
}
```

- Default host только `https://platform-api2.max.ru`.
- Token только в `Authorization: <token>`; query-token удалён.
- Redirect запрещён, чтобы credential не ушёл на другой origin.
- General client выполняет zero retries.
- Polling передаёт отдельный timeout больше MAX long-poll timeout и повторяет только `GET /updates`.
- Upload helper использует общий fetch/timeout/error primitive, но не пересылает MAX Authorization на выданный upload URL.
- Query сохраняет `0`, `false`, `''`; пропускаются только `null`/`undefined`.
- Path values percent-encoded; unresolved placeholder -> protocol error.
- Response читается как text ровно один раз; все `2xx` считаются transport success, включая empty body.

### 6.7 Error contract

`MaxError` содержит только:

- `kind: network | timeout | aborted | http | protocol`;
- HTTP status, если есть;
- documented provider code;
- bounded sanitized provider message;
- safe header allowlist (`retry-after`, `content-type`, request/trace ID);
- route template и HTTP method;
- `ambiguousOutcome`;
- safe native cause при необходимости.

Он не содержит и автоматически не логирует token, Authorization, request/response raw body, message text, attachments, subscription URL/query/path values, webhook secret, arbitrary headers или unknown update payload.

Mutation ambiguity:

| Событие | GET | POST/PUT/PATCH/DELETE |
| --- | --- | --- |
| Validation/serialization error до fetch | false | false |
| Signal уже aborted до fetch | false | false |
| После вызова fetch: network/timeout/abort | false | true |
| Redirect rejected после начала request | false | true |
| HTTP 4xx, включая 429 | false | false |
| HTTP 5xx | false | true |
| 2xx body read failure | false | true |
| 2xx descriptor/protocol failure | false | true |
| 2xx typed `{success:false}` | false | false |
| Valid 2xx success | false | false |

Строка `2xx typed {success:false}` означает resolved `ActionResponse`, а не `MaxError`: SDK не интерпретирует и не перепроверяет business outcome. Malformed mutation response после 2xx — `MaxError(kind='protocol', ambiguousOutcome=true)`.

Ни один слой автоматически не повторяет ambiguous mutation.

## 7. Public package surface без barrels

Удалить/exclude source barrel indexes:

- `src/index.ts`;
- `src/types.ts`;
- `src/core/network/api/index.ts`;
- `src/core/network/api/modules/index.ts`;
- `src/core/network/api/types/index.ts`.

Все imports переводятся на direct paths. `package.json.exports`:

- не имеет root `.` export;
- не имеет `./types` и wildcard exports;
- указывает напрямую на emitted JS/declaration module;
- экспортирует только named exports; default exports отсутствуют.

Минимальные direct subpaths:

- `./bot`, `./api`, `./composer`, `./context`, `./middleware`, `./filters`;
- `./client`, `./raw-api`, `./errors`, `./parse-update`;
- `./attachments`, `./buttons`, `./keyboard`, `./upload`;
- `./types/int64`, `./types/user`, `./types/bot`, `./types/chat`, `./types/message`;
- `./types/attachment`, `./types/attachment-request`, `./types/keyboard`, `./types/markup`, `./types/common`, `./types/upload`, `./types/update`;
- `./modules/subscriptions`, `./api-methods`.

Friendly alias допустим только как export-map path на один concrete module, без re-export wrapper.

`src/core/network/api/types/subcription.ts` переименовать в `update.ts`; compatibility typo не сохранять.

## 8. Coverage ledger

`docs/api-coverage.md` имеет три раздела:

1. 29 method-page rows.
2. 8 top-level object-page rows.
3. Все транзитивные wire structures.

Каждая строка содержит docs URL, audit date, supported/retired status, TS symbol/file, descriptor, fixture provenance, contract test и conflicts/decision.

### 28 supported methods

- `GET /me`
- `PATCH /me/commands`
- `GET /chats/{chatId-or-link}`
- `PATCH /chats/{chatId}`
- `POST /chats/{chatId}/actions`
- `GET`, `PUT`, `DELETE /chats/{chatId}/pin`
- `GET`, `DELETE /chats/{chatId}/members/me`
- `GET`, `POST /chats/{chatId}/members/admins`
- `DELETE /chats/{chatId}/members/admins/{userId}`
- `GET`, `POST`, `DELETE /chats/{chatId}/members`
- `GET`, `POST`, `DELETE /subscriptions`
- `GET /updates`
- `POST /uploads`
- `GET`, `POST`, `PUT`, `DELETE /messages`
- `GET /messages/{messageId}`
- `GET /videos/{videoToken}`
- `POST /answers`

### Retired tombstone

`GET /chats` остаётся ledger row со статусом `retired/not implemented`. `Api.getAllChats`, raw method и DTO удаляются без deprecated shim.

### 8 top-level object pages

- `User`, `UserWithPhoto`, `BotInfo`, `ChatMember`;
- `Chat`, `Message`, `NewMessageBody`, `Update`.

Это не «8 types total». Ledger разворачивает все endpoint-local DTOs, 15 update payloads, `Subscription`, admin permissions, attachments/request attachments, buttons, markup, callbacks, nested message/chat/user structures, upload/video models и все reachable enums/unions.

### Exact current update set

Known:

`bot_added`, `bot_started`, `bot_stopped`, `bot_removed`, `chat_title_changed`, `dialog_cleared`, `dialog_muted`, `dialog_unmuted`, `dialog_removed`, `message_callback`, `message_created`, `message_edited`, `message_removed`, `user_added`, `user_removed`.

Legacy upstream kinds становятся unknown:

`message_construction_request`, `message_constructed`, `message_chat_created`.

## 9. Порядок реализации

### Phase 0 — isolated fork и blocking gates

Artifacts:

- отдельный SDK checkout/worktree;
- `docs/spikes/0001-fork-and-lossless-baseline.md`;
- docs freeze/initial coverage inventory.

Acceptance:

- exact merge-base/patch inventory известны;
- dependency и int64 spikes зелёные на Node/Bun;
- bounded-fork exit gate подтверждён;
- Telman worktree не изменён.

### Phase 1 — characterization, build baseline и удаление barrels

Touchpoints:

- `package.json`, lockfile, `tsconfig.json`, новый `tsconfig.test.json`;
- пять существующих barrel files и их importers;
- `test/characterization/**`;
- `UPSTREAM.md`, `NOTICE`, skeleton `docs/api-coverage.md`.

Changes:

- native `node:test` + `node:assert`, без test framework dependency;
- `noImplicitAny: true`, устранение touched `@ts-ignore`/`any`;
- direct internal imports, named exports;
- source maps/declarations;
- characterization существующих Composer order, Context construction, Bot start/polling и API calls.

Acceptance:

- clean build/lint/characterization green;
- ни одного source barrel/default export;
- package manifest не объявляет root/`./types`;
- SDK не читается consumer-ом из `src`.

### Phase 2 — descriptor и transport core

Touchpoints:

- `src/core/network/api/client.ts`;
- `base-api.ts`, `error.ts`;
- новые `json.ts`, `wire-descriptors.ts`, `types/int64.ts`;
- `src/core/helpers/upload.ts`;
- unit/injected-fetch/node:http tests.

Changes:

- exact approved lossless dependency;
- text-once parse, safe conversions, request/response descriptors;
- host/auth/query/path/body/timeout/signal/redirect rules;
- sanitized errors/logs;
- shared upload transport primitive;
- zero retry client.

Acceptance:

- все lexical/range/nested int64 cases проходят;
- ambiguity matrix проходит;
- MAX paths не используют native JSON parse/stringify или `Response.json()`;
- каждая general client operation вызывает fetch не более одного раза;
- token/body/secret/user content отсутствуют в auto logs/errors.

### Phase 3 — current API и type parity

Touchpoints:

- `src/api.ts`, `src/context.ts`, `src/filters.ts`;
- `src/core/network/api/raw-api.ts`;
- `modules/*/{api,types}.ts`;
- все reachable `types/*.ts` и affected helpers.

Changes:

- 27 supported non-update endpoints;
- subscription CRUD, admin grant/revoke, video metadata, current non-update types и `ActionResponse`;
- удаление retired `GET /chats` API/raw method/DTOs при сохранении tombstone ledger row;
- 7 non-`Update` top-level object pages и все non-update documented/transitive structures;
- non-update `Int64` migration и current User/Message/nullability/permission/button/attachment shapes;
- удаление recursive `POST /messages` retry;
- ledger доводится только до `27 / 28` supported, `28 / 29` method pages и `7 / 8` objects;
- `GET /updates`, `Update`, его variants и update-only transitive structures остаются pending.

Acceptance:

- injected-fetch table имеет 27 supported non-update rows;
- ledger закрывает `27 / 28` supported endpoints, `28 / 29` method pages (27 supported + retired `GET /chats`) и `7 / 8` top-level object pages;
- все non-update request/response/enum/union/transitive rows resolved;
- `GET /updates`, `Update`, 15 current variants и update-only transitive rows явно остаются pending до Phase 4;
- numeric int64 inputs и stale public methods не компилируются;
- subscription create/delete возвращают каждый валидный HTTP 2xx `ActionResponse` без изменений и без `MaxError`, независимо от `success` и наличия optional `message`;
- тесты покрывают `{success:true}`, `{success:true,message:'accepted'}`, `{success:false}` и `{success:false,message:'rejected'}` с deep equality и discriminant narrowing;
- каждый subscription mutation test делает ровно один HTTP request, не делает inferred `GET /subscriptions` и не интерпретирует state;
- compatibility shims отсутствуют.

### Phase 4 — update parsing, initialize, dispatch и polling

Touchpoints:

- `src/bot.ts`, `src/context.ts`, `src/composer.ts`, `src/filters.ts`;
- новый `src/core/network/api/parse-update.ts`;
- `src/core/network/api/types/update.ts`;
- `src/core/network/polling.ts`;
- update fixtures/tests.

Changes:

- `GET /updates` endpoint row и top-level object page `Update`;
- exact 15 current variants, 15 update descriptors и provenance-tagged fixtures;
- update-only transitive structures и проверка shared structures в update payloads;
- known/unknown parser;
- concurrency-safe initialize;
- public dispatch, bypassing `Bot.catch`;
- polling-only catcher;
- sequential batch, marker after full success;
- retry только `GET /updates`, abortable fetch/wait;
- global ledger закрывается на `28 / 28` supported endpoints, `29 / 29` method pages, `8 / 8` objects и всех reachable documented/transitive structures.

Acceptance:

- добавлен последний supported endpoint row `GET /updates`, top-level object page `Update`, 15 descriptors/fixtures и update-only transitive structures;
- 15 provenanced fixtures проходят correct typed handler;
- arbitrary/legacy kind даёт только `{kind,updateType}`;
- fixture future kind с необъявленным unsafe integer точно даёт `{kind:'unknown',updateType:'future_event'}`, а не protocol error;
- malformed known update reject;
- concurrent initialize делает один `GET /me`;
- failed initialize не кэшируется;
- dispatch before init rejects без fetch;
- dispatch after init делает zero fetch;
- middleware вызывается один раз и original error identity сохраняется;
- dispatch никогда не вызывает catcher;
- `GET /updates` возвращает ordered `ParsedUpdate[]` и использует тот же classifier, что webhook parser;
- polling не создаёт `Context`/лог/catcher для unknown, продвигает unknown-only page и не продвигает mixed page при escaped known failure;
- polling catcher/default/marker matrix проходит;
- global ledger только теперь закрывает `28 / 28` supported endpoints, `29 / 29` method pages (28 supported + 1 retired), `8 / 8` top-level object pages и все reachable transitive structures.

### Phase 5 — package, четыре слоя автоматизации, CI/docs

Package: `@tlman/max-bot-sdk@0.2.5-tlman.1` (user override of the earlier draft name).

Artifacts:

- direct `package.json.exports`;
- `prepack = clean + build`, без `prepare`;
- `README.md`, `CHANGELOG.md`, `UPSTREAM.md`, `NOTICE`;
- `.github/workflows/ci.yml`, protected `release.yml`;
- `test/consumer/**`.

Acceptance:

- frozen install/lint/build/typecheck/test/package checks green;
- tarball содержит только required dist/declarations/maps/docs/license metadata;
- direct imports работают в Node 18.18+ и Bun 1.3.11;
- fake runtime consumer имеет custom Context/middleware, `timeoutMs: 10_000`, initialize, raw parse, dispatch и outbound Api call;
- consumer не зависит от `@tlman/*` и не реализует прямой MAX HTTP;
- PR jobs не получают publish/test-bot credentials.

### Phase 6 — обязательный live pre-release gate

Protected manual workflow использует dedicated MAX test bot/user/chat и operator-controlled public HTTPS receiver.

Последовательность:

1. Через packed candidate SDK вызвать `POST /subscriptions` с unique URL и generated secret.
2. Проверить typed `{success:true}`.
3. Вызвать `GET /subscriptions`, проверить непустой список и созданную URL/update types.
4. Dedicated test account инициирует реальный event.
5. Receiver проверяет фактический header `X-Max-Bot-Api-Secret`.
6. Candidate SDK парсит исходный raw body и dispatch-ит event в test `Bot`.
7. В `finally` вызвать `DELETE /subscriptions`.
8. Повторный GET подтверждает отсутствие URL.
9. Cleanup failure блокирует release и создаёт manual cleanup alert.
10. Создать redacted synthetic fixture: заменить IDs/text/attachments/URL, удалить secret/header values, сохранить wire shape/int64 semantics.
11. Записать source, candidate version, capture/docs dates, redaction review и SHA-256.

Receiver/server code не попадает в SDK package. Release невозможен без успешного gate и cleanup evidence.

## 10. Ровно четыре автоматизированных слоя тестов

### Layer 1 — native `node:test` unit

Codec/descriptor lexical cases, единый webhook/polling classifier, future unknown с unsafe integer, mixed/unknown-only page marker transitions, initialize/dispatch/catch boundaries, Context nullability и error ambiguity/sanitization.

### Layer 2 — injected-fetch table

Одна таблица проверяет method, route, path/query, Authorization, body, descriptor response, unchanged/non-throwing `ActionResponse`, discriminant narrowing и one-call/no-retry/no-inferred-GET. Phase 3 даёт ей 27 non-update rows; Phase 4 добавляет `GET /updates`, после чего в этом же слое ровно 28 supported rows.

Retired `GET /chats` проверяется compile/absence assertion, но не считается 29-м supported row.

### Layer 3 — один `node:http` transport suite

Только поведение реального fetch: timeout/abort, empty/non-JSON/invalid JSON, 2xx/4xx/5xx, redirects, headers, safe logging, large integers и upload shared transport. Он не повторяет 28 endpoint-table.

### Layer 4 — Node+Bun packed consumer smoke

`npm pack`, clean install exact tarball, direct imports/type compile и fake standalone runtime flow. Ни одного source/deep undeclared import.

Каждая fixture имеет manifest с source URL/commit/date/redaction/SHA. Неатрибутированные fixtures запрещены.

## 11. Deliberate pre-mortem

### Raw body уже parsed до SDK

Результат: IDs округлены до проверки, routing/dedupe работают с другими значениями.

Меры: parser принимает только string/bytes; object overload отсутствует; consumer smoke начинается с raw bytes; README явно запрещает framework JSON body parser на этом path.

### Mutation повторена после timeout

Результат: дубликат message/admin/subscription action.

Меры: zero general retries, exact ambiguity matrix, one-fetch assertions; retry разрешён только polling `GET /updates`.

### API drift делает fresh SDK устаревшим

Результат: новый update создаёт retry storm либо stale type проходит незамеченным.

Меры: future discriminant -> minimal unknown; dated 29-page/transitive ledger; mandatory live pre-release; manual upstream/docs audit до каждого release.

## 12. Release, sync и rollback

### Release

- Protected annotated tag `v0.2.5-telman.1`.
- Tag metadata: fork SHA, upstream SHA, docs audit date, package SHA/integrity, live-gate evidence ID.
- Publish exact immutable built artifact в org registry; GitHub Packages — fallback, если существующего registry нет.
- `npm publish --provenance`, если registry поддерживает.
- Никаких branch/Git dependencies и перезаписи опубликованных версий.

### Upstream sync

`UPSTREAM.md` хранит URL/tag/SHA, patch inventory, docs audit date, exact dependency, stale Go conflicts и checklist.

Sync только manual/reviewed:

1. fetch upstream;
2. compare/reconcile bounded patches;
3. re-audit docs delta;
4. запустить четыре automation layers;
5. повторить mandatory live gate;
6. обновить recorded base и выпустить новую exact version.

Auto-merge запрещён.

### Rollback

- Consumer repin на предыдущую immutable exact version + lock integrity.
- Старые consumed versions не unpublish/overwrite.
- SDK rollback не создаёт и не удаляет production subscriptions.
- Исправление выпускается новой версией.

## 13. ADR

### Decision

Поддерживать bounded direct-export fork официального MAX TS SDK с lossless descriptor-driven wire handling, current API/types, webhook CRUD, raw parsing и managed dispatch.

### Drivers

- MAX production delivery — Webhook.
- Текущий SDK имеет только polling/private update handler.
- Официальный fixture с bare unsafe int64 доказывает некорректность `number`/`Response.json()`.
- Будущий runtime не должен владеть вторым MAX client/dispatcher.
- Пакет должен быть воспроизводимым и auditable.

### Rejected

- Telman-owned client/dispatcher;
- companion adapter поверх неизменного SDK;
- stale-schema generation;
- handwritten JSON parser;
- public bigint/LosslessNumber;
- root/type barrels;
- automatic mutation retries;
- SDK HTTP server.

### Consequences

- Renamed package намеренно ломает upstream root imports и numeric IDs.
- Consumers используют direct subpaths.
- Manual method/object/transitive ledger и live release gate становятся maintenance cost.
- Managed dispatch не использует `Bot.catch`.

### Follow-ups

- отдельный plan реализации `MaxPlatformRuntime`;
- periodic docs/upstream audit;
- retirement fork при upstream parity;
- новый Architect review при срабатывании exit gate.

## 14. Staffing и execution handoff

Доступные релевантные роли:

- `explore`, `researcher`, `dependency-expert`;
- `planner`, `architect`, `critic`;
- `executor`, `debugger`, `test-engineer`;
- `verifier`, `code-reviewer`, `code-simplifier`;
- `writer`, `git-master`.

### `$ralph`

Предпочтителен для маленького форка с центральным transport change и строгой последовательностью Phase 0 -> 6.

- Research/dependency: GPT-5.6 Terra high или Sol medium.
- Implementation: GPT-5.6 Sol high.
- Architecture: Sol max.
- Review/verifier: только Sol xhigh.

Launch после готовых PRD/test-spec artifacts:

```text
$ralph ".omx/plans/max-sdk-fork-webhook-bot-core.md"
```

### `$team`

При четырёх слотах: leader + три staged executors.

1. Transport/codec owner: client, errors, JSON, descriptors, upload primitive.
2. API/types/coverage owner: methods, DTO/object/update types, ledger.
3. Bot/dispatch/test/package owner: Bot, polling, parser, package smoke/CI/docs.

Общие `package.json`, lockfile, export map и ledger имеют одного named owner; workers не откатывают чужие edits.

Launch:

```text
$team 3:executor "Implement max-sdk-fork-webhook-bot-core.md in the separate SDK fork with phase gates"
```

```text
omx team 3:executor "Implement the MAX SDK fork plan; never edit Telman; stop at every phase gate"
```

### Team verification path

1. Каждый owner запускает targeted checks.
2. Leader интегрирует и запускает четыре automation layers.
3. Independent verifier сверяет ledger/fixtures/pack outputs.
4. Sol xhigh reviewer проверяет public API, int64 descriptors, ambiguity, sensitive logging и package contents.
5. Protected operator запускает live Phase 6 и подтверждает cleanup.
6. Release выполняется только после всех evidence IDs.

### Goal-mode follow-up

- `$ultragoal` — основной вариант durable implementation tracking; для parallel delivery сочетать с `$team`.
- `$autoresearch-goal` — только если blocking dependency/schema question останется нерешённым.
- `$performance-goal` — только после измеренного codec bottleneck.
- `$ralph` — single-owner delivery или fix/verification pressure после Team.

## 15. Основания выводов

- [MAX API overview](https://dev.max.ru/docs-api)
- [Webhook subscription](https://dev.max.ru/docs-api/methods/POST/subscriptions)
- [Webhook list](https://dev.max.ru/docs-api/methods/GET/subscriptions)
- [Webhook delete](https://dev.max.ru/docs-api/methods/DELETE/subscriptions)
- [Current Update set](https://dev.max.ru/docs-api/objects/Update)
- [MAX API changelog](https://dev.max.ru/docs-api/changelog-api)
- [Official TS Bot](https://github.com/max-messenger/max-bot-api-client-ts/blob/2e4263e359b161830f1fd636400482ed4aede13b/src/bot.ts)
- [Official TS client](https://github.com/max-messenger/max-bot-api-client-ts/blob/2e4263e359b161830f1fd636400482ed4aede13b/src/core/network/api/client.ts)
- [Official TS subscriptions](https://github.com/max-messenger/max-bot-api-client-ts/blob/2e4263e359b161830f1fd636400482ed4aede13b/src/core/network/api/modules/subscriptions/api.ts)
- [Official TS polling bug](https://github.com/max-messenger/max-bot-api-client-ts/issues/240)
- [Official TS missing bot_stopped](https://github.com/max-messenger/max-bot-api-client-ts/issues/184)
- [Official Go update fixtures](https://github.com/max-messenger/max-bot-api-client-go/tree/b9ac3728162b743a36a597ed1432d96bfb69a1cb/stabs)
- [Official unsafe int64 fixture](https://github.com/max-messenger/max-bot-api-client-go/blob/b9ac3728162b743a36a597ed1432d96bfb69a1cb/stabs/update.message_callback.json)
- [`bot-core` platform contract](/Users/kolosmanger/dev/telman/libs/bot-core/src/core/platform/platform-capabilities.types.ts:126)
- [`createBotRuntime` module/capability boundary](/Users/kolosmanger/dev/telman/libs/bot-core/src/core/runtime/create-bot-runtime.ts:19)
- [Telegram runtime template](/Users/kolosmanger/dev/telman/libs/bot-core/src/platforms/telegram/telegram-platform-runtime.ts:117)
- [Telegram module registry](/Users/kolosmanger/dev/telman/libs/bot-core/src/platforms/telegram/telegram-module-registry.ts:12)

Контекст и evidence: `.omx/context/max-sdk-fork-webhook-bot-core-20260810T174434Z.md`, `.omx/drafts/max-sdk-fork-evidence.md`.
