# Migrating to 0.3

## Composer registration returns

Registration methods now return a linked child Composer, not the parent `Bot`.
Keep independent handlers and Bot-only calls as separate statements:

```ts
bot.command('a', handleA);
bot.command('b', handleB);

bot.use(plugin);
bot.catch(handlePollingError);
```

Use chaining only when the next registration must be scoped inside the previous one.
`bot.use(bot.filter('message_created', handler))` remains supported because `filter`
continues to build middleware without registering it.

## Webhook bodies

Pass the original `string`, `Uint8Array`, Node request stream, or framework raw buffer to
the SDK. Do not put `express.json()`, Fastify object parsing, `request.json()`, `JSON.parse`,
or object re-serialization before the SDK: these can corrupt MAX `int64` values.

Polling, embedded webhook callbacks, and the standalone listener remain separate modes.
Creating or deleting a MAX subscription is still an explicit API operation.

## Filter queries

`on` accepts the documented finite MAX query catalog, including
`message_created:text`, attachment refinements, callback payload/message, and start
payload. Presence checks include empty strings. Existing `command`, `hears`, and
`action` keep their legacy truthiness behavior.

Attachment-type queries prove that at least one matching attachment exists; they do
not claim that every array element has that type. Use `findAttachment(message, type)`
when an exact attachment subtype is required.

## Compatibility freeze

In 0.3, string triggers still use regular-expression semantics, commands still discard
their first character, and bot mentions are stripped as before. A future 1.0 change needs
its own ADR and migration.
