# ADR 0002: grammY-inspired extension kernel

Date: 2026-08-13. Status: accepted for `0.3`.

## Decision

Extend the existing MAX-native `Bot -> Composer -> Context`, `Api -> RawApi -> Client`,
lossless parser, polling, and webhook seams incrementally. A grammY fork, a second
dispatcher/client/parser, and a compatibility facade are rejected.

`use`, `on`, `command`, `hears`, `action`, `when`, `branch`, and `errorBoundary`
return dynamically linked child composers. This is one intentional breaking family:
chained registrations become scoped intersections. Separate statements remain siblings.
The existing `filter(...)` method remains an unregistered middleware builder.

API transformers are global to the shared `Api`, can replace only `path`, `query`, `body`,
`signal`, and `timeoutMs`, and must call `next` exactly once. They cannot short-circuit,
replace trusted route/method/descriptors/parser/auth metadata, or intercept uploads.

Sessions provide keyed ordering only within one `session(...)` instance in one process.
They do not provide distributed locking, rollback, or polling concurrency.

One processor owns method, secret, size, lossless parse, dispatch, and status mapping.
Fetch, Node HTTP, Express, Fastify, and standalone Node/Bun surfaces only adapt raw bytes
and responses around it. Parsed framework objects are rejected: unlike grammY examples
that can use `express.json()`, MAX unsafe `int64` values require the original body bytes.

`bot.start()` remains outbound long polling and never starts an inbound server.
Webhook callbacks use a caller-owned server; `serveWebhook` owns only a local listener.
Subscription lifecycle, public HTTPS:443, certificates, reverse proxies, and process
signals remain explicit deployment concerns.

## Deferred

- `drop`, `route`, `lazy`, and `fork` Composer primitives;
- per-context transformers and transformer short-circuit responses;
- distributed session coordination and automatic storage rollback;
- automatic subscription management, TLS, tunnels, health routes, and process handlers;
- additional framework adapters without a real consumer and compatibility test;
- polling parallelism;
- string-trigger regex escaping and strict `/` command-prefix validation until a separate
  `1.0` trigger-semantics ADR.

Revisit a deferred item only for measured production need or at least two real plugins.

## Phase 0 baseline

On the implementation worktree, `/usr/bin/time -p npm run typecheck` completed in
`0.69s` wall time (`1.23s` user, `0.12s` system). This is comparison evidence for the
finite-query phase, not a machine-independent performance budget.
