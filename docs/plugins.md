# Plugins and context flavors

A middleware plugin is a `Middleware` function or object. A context flavor is an
ordinary TypeScript intersection; the SDK has no plugin registry or installer.

```ts
type AuditFlavor = { audit: { updateType: string } };
type RequestFlavor = { requestId: string };
type AppContext = Context & AuditFlavor & RequestFlavor;

const bot = new Bot<AppContext>(token);

bot.use(async (context, next) => {
  context.audit = { updateType: context.updateType };
  context.requestId = context.update.timestamp;
  await next();
});

bot.on('message_created:text', (context) => {
  console.log(context.requestId, context.audit, context.message.body.text);
});
```

Register field-installing middleware before handlers that read those fields. The
intersection describes the completed context shape; it does not initialize fields or
hide an ordering mistake at runtime. Multiple flavors compose by adding intersections.

`bot.api` and every `Context.api` reference the same `Api` instance. API transformers
installed by a plugin are therefore global configuration for future calls, not scoped
to one update. A middleware plugin may install context fields per update; it must not
install and remove global transformers inside the update pipeline.

Transformers observe normalized responses after trusted validation, may replace only
`path`, `query`, `body`, `signal`, and `timeoutMs`, and must call `next` exactly once.
They do not intercept arbitrary upload requests and must not retry mutations after an
ambiguous outcome.

See `examples/plugin-bot.ts` for a complete two-flavor middleware plugin with a global
API timing transformer.

## Sessions

Session state is an ordinary context flavor and requires an explicit key resolver,
initial-value factory, and storage adapter. One `session(...)` middleware instance
serializes updates with the same key only inside one Node.js or Bun process.

Storage must return isolated objects when failed middleware must not mutate persisted
state through a shared reference. The SDK does not clone session values. A suppressed
inner `errorBoundary` is successful downstream processing and persists the session;
a rethrown error skips the SDK `write` or `delete` call.

Call `deleteSession()` to delete after successful downstream processing. Deletion is
idempotent and remains dominant even if middleware later assigns `context.session`.

See `examples/session-bot.ts` for a complete explicit-storage setup.
