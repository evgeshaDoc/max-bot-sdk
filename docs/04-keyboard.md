# `4` Клавиатура
Клавиатура и кнопки импортируются напрямую из отдельных модулей.

```typescript
import { inlineKeyboard } from '@tlman/max-bot-sdk/keyboard';
import * as button from '@tlman/max-bot-sdk/buttons';

const keyboard = inlineKeyboard([
  // 1-я строка с 3-мя кнопками
  [
    button.callback('default', 'color:default'),
    button.callback('positive', 'color:positive', { intent: 'positive' }),
    button.callback('negative', 'color:negative', { intent: 'negative' }),
  ], 
  // 2-я строка с 1-й кнопкой
  [button.link('Открыть Max', 'https://max.ru')],
]);
```

Все кнопки также создаются одной перегруженной функцией. Поле `type`
определяет допустимые параметры и точный тип результата:

```typescript
import { createButton } from '@tlman/max-bot-sdk/buttons';
import type { Button } from '@tlman/max-bot-sdk/types/keyboard';

const button: Button = createButton(
  'callback',
  'Подтвердить',
  'confirm',
  { intent: 'positive' },
);
```

### Типы кнопок

#### Callback
```typescript
button.callback(text: string, payload: string, extra?: { 
  intent?: 'default' | 'positive' | 'negative' 
});
```
Добавляет callback-кнопку. При нажатии на неё сервер Max отправляет обновление `message_callback`.

#### Link
```typescript
button.link(text: string, url: string);
```
Добавляет кнопку-ссылку. При нажатии на неё пользователю будет предложено открыть ссылку в новой вкладке.

#### RequestContact
```typescript
button.requestContact(text: string);
```
Добавляет кнопку запроса контакта. При нажатии на неё боту будет отправлено сообщение с номером телефона, полным именем и почтой пользователя во вложении в формате `VCF`.

#### RequestGeoLocation
```typescript
button.requestGeoLocation(text: string, extra?: { quick?: boolean });
```
Добавляет кнопку запроса геолокации. При нажатии на неё боту будет отправлено сообщение с геолокацией, которую укажет пользователь.

#### Chat
```typescript
button.chat(text: string, chatTitle: string, extra?: { 
  chat_description?: string | null;
  start_payload?: string | null;
  uuid?: number | null;
});
```
Добавляет кнопку создания чата. При нажатии на неё будет создан новый чат с ботом и пользователем.

#### OpenApp
```typescript
button.openApp(text: string, webApp: string, options?: {
  contactId?: Int64 | null;
  payload?: string | null;
});
```
Добавляет кнопку для запуска мини-приложения. При нажатии на неё откроется окно с мини-приложением бота, ссылка на которого указана в параметре webApp.
