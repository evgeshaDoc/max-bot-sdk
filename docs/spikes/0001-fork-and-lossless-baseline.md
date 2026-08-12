# Fork and lossless baseline

Date: 2026-08-13. Result: PASS.

## Repository boundary

- Worktree: isolated `max-bot-sdk` checkout; it is not the Telman monorepo.
- Remote: `git@github.com:evgeshaDoc/max-bot-sdk.git`.
- Private baseline: `30a79d55cdff9c6d0c4d8d3f15becc045777beef`.
- Official upstream pin and exact merge base: `2e4263e359b161830f1fd636400482ed4aede13b`.
- Existing delta retained: documentation corrections and `open_app`; its API was reworked for current types.
- Package ownership target: `@tlman/max-bot-sdk`; license remains MIT.

## Codec proof

`lossless-json@4.3.1` is exact-pinned because Node 18.18 does not provide `JSON.parse` reviver `context.source`. Direct probes passed in Node 18.18.2, Node 24.13.1 and Bun 1.3.14 for CJS and ESM imports, bare-number parsing/serialization, signed int64 min/max, `9007199254740993`, and recursive absence of public `bigint`/`LosslessNumber` values.

Production dependency audit reported zero known vulnerabilities. The package is MIT licensed. Native JSON is retained for ordinary non-MAX metadata only; every MAX response and webhook uses the bounded lossless codec.

## Descriptor boundary

The codec keeps raw numeric lexemes internal. Endpoint/update descriptors convert documented bare `int64` tokens to canonical decimal strings and convert them back to bare tokens outbound. Quoted digit strings are rejected on inbound int64 paths, digit-like text is preserved elsewhere, unsafe undeclared numeric tokens fail for known shapes, and unknown updates discard their payload before normalization.

No second dispatcher, HTTP client or schema generator was required, so the bounded-fork exit gate remains satisfied.
