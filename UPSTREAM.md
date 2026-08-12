# Upstream provenance

- Official TypeScript baseline: `@maxhub/max-bot-api@0.2.5` at `2e4263e359b161830f1fd636400482ed4aede13b`.
- Private-fork baseline: `30a79d55cdff9c6d0c4d8d3f15becc045777beef`.
- Merge base: `2e4263e359b161830f1fd636400482ed4aede13b`.
- Current MAX docs audit: 2026-08-13.
- Secondary Go schema/fixture pin: `b9ac3728162b743a36a597ed1432d96bfb69a1cb`.
- Lossless codec: exact `lossless-json@4.3.1` (MIT).

## Existing private-fork patches

The four pre-SDK commits fix documentation URLs/names and add the documented `open_app` button. Those changes are retained, while the helper signature and `Int64` contact ID were reworked against current docs.

## Maintained patch inventory

1. Package ownership, direct exports, CI and protected release gates.
2. Single injected-fetch transport, typed errors and lossless wire descriptors.
3. Current endpoint/types ledger and retired API removal.
4. Raw update parser, webhook handler, lifecycle dispatch and polling semantics.
5. Native tests, attributed fixtures and Node/Bun packed-consumer checks.

The Go schema is not generator input: its host/auth, self-signed certificate flow and legacy update set are stale. It is used only for nested structures omitted from rendered MAX docs. See `docs/api-coverage.md` for every conflict decision.

## Sync checklist

Before taking an upstream change, compare its API docs date and update inventory, rerun all four verification layers, inspect every changed `int64` path, and update the SHAs above. Remove this fork when upstream ships equivalent lossless webhook, dispatch and current-API behavior with immutable releases.
