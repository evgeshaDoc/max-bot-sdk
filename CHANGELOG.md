# Changelog

## 0.2.5-tlman.1

- Пакет переименован в `@tlman/max-bot-sdk`; root barrels удалены в пользу direct exports.
- Добавлены webhook subscriptions, Web Fetch handler для `Bun.serve`, публичный offline dispatch и устойчивый lifecycle `Bot`.
- API обновлён до 28 текущих методов MAX; retired `GET /chats` и legacy update types удалены.
- Все документированные `int64` теперь lossless decimal strings с bare-number сериализацией.
- Все запросы, включая upload, используют единый injected-fetch transport без автоматического retry mutation.
- Добавлены 15 текущих update variants, future-safe parser, Node/Bun package smoke и release gates.

Изменения намеренно breaking: старое имя пакета, root imports, numeric IDs и удалённые методы не поддерживаются compatibility shims.
