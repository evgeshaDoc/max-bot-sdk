import { Bot } from '../src/bot';
import { Context } from '../src/context';
import type {
  SessionFlavor,
  SessionOptions,
  StorageAdapter,
} from '../src/session-types';
import { session } from '../src/session';

type CounterSession = { count: number };
type AppContext = Context & SessionFlavor<CounterSession> & { requestId: string };

declare const storage: StorageAdapter<CounterSession>;
declare const otherStorage: StorageAdapter<{ name: string }>;
declare const options: SessionOptions<AppContext, CounterSession>;

const bot = new Bot<AppContext>('token');
bot.use(session(options));
bot.use(session<AppContext, CounterSession>({
  storage,
  getSessionKey: (context) => context.requestId,
  initial: () => ({ count: 0 }),
}));
bot.on('message_created', (context) => {
  context.session.count += 1;
  context.deleteSession();
});

// @ts-expect-error session data must be an object
session<AppContext, string>({ storage, getSessionKey: () => 'key', initial: () => 'value' });

// @ts-expect-error storage values must match the session flavor
const wrongStorage: StorageAdapter<CounterSession> = otherStorage;
wrongStorage.read('key');
