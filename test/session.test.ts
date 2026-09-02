import assert from 'node:assert/strict';
import test from 'node:test';

import { Api } from '../src/api';
import { Bot } from '../src/bot';
import { Composer } from '../src/composer';
import { Context } from '../src/context';
import { createClient } from '../src/core/network/api/client';
import type { MessageRemovedUpdate } from '../src/core/network/api/types/update';
import type { Middleware, MiddlewareFn } from '../src/middleware';
import { session } from '../src/session';
import type { SessionFlavor, SessionOptions, StorageAdapter } from '../src/session-types';
import { createWebhookHandler } from '../src/webhook';

type Counter = { value: number };
type TestContext = Context<MessageRemovedUpdate> & { key: string };
type SessionContext = TestContext & SessionFlavor<Counter>;
type RunOptions = { readonly key: string; readonly messageId?: string };
type Release = () => void;

const api = new Api(createClient('token', {
  fetch: async () => new Response('{}', { status: 200 }),
}));

test('successful sessions follow the exact order and synchronous keys preserve FIFO', async () => {
  const order: string[] = [];
  const middleware = session<TestContext, Counter>({
    storage: {
      read() { order.push('read'); return undefined; },
      write() { order.push('write'); },
      delete() { order.push('delete'); },
    },
    getSessionKey(context) { order.push(`key:${context.update.message_id}`); return 'key'; },
    initial() { order.push('initial'); return { value: 0 }; },
  });
  const downstream: MiddlewareFn<SessionContext> = (context) => {
    order.push(`downstream:${context.update.message_id}`);
  };

  await Promise.all([
    run(middleware, downstream, { key: 'key', messageId: 'first' }),
    run(middleware, downstream, { key: 'key', messageId: 'second' }),
  ]);
  assert.deepEqual(order, [
    'key:first',
    'key:second',
    'read',
    'initial',
    'downstream:first',
    'write',
    'read',
    'initial',
    'downstream:second',
    'write',
  ]);
});

test('same-key updates serialize without lost writes and other keys stay concurrent', async () => {
  const values = new Map<string, Counter>();
  const storage = isolatedStorage(values);
  const middleware = session<TestContext, Counter>({
    storage,
    getSessionKey: (context) => context.key,
    initial: () => ({ value: 0 }),
  });
  const increment: MiddlewareFn<SessionContext> = async (context) => {
    const { value } = context.session;
    await Promise.resolve();
    context.session.value = value + 1;
  };

  await Promise.all(Array.from({ length: 100 }, () => run(
    middleware,
    increment,
    { key: 'one' },
  )));
  assert.deepEqual(values.get('one'), { value: 100 });

  const entered: string[] = [];
  let release = (): void => undefined;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  const concurrent: MiddlewareFn<SessionContext> = async (context) => {
    entered.push(context.key);
    if (entered.length === 2) release();
    await barrier;
  };
  await Promise.all([
    run(middleware, concurrent, { key: 'two' }),
    run(middleware, concurrent, { key: 'three' }),
  ]);
  assert.deepEqual(entered.sort(), ['three', 'two']);
});

test('resolver completion determines queue order and invalid keys fail before storage', async () => {
  const order: string[] = [];
  const pending = new Map<string, Release>();
  let reads = 0;
  const middleware = session<TestContext, Counter>({
    storage: {
      read() { reads += 1; return { value: 0 }; },
      write() {},
      delete() {},
    },
    async getSessionKey(context) {
      await new Promise<void>((resolve) => {
        pending.set(context.update.message_id, resolve);
      });
      return 'shared';
    },
    initial: () => ({ value: 0 }),
  });
  const record: MiddlewareFn<SessionContext> = (context) => {
    order.push(context.update.message_id);
  };
  const first = run(middleware, record, { key: 'key', messageId: 'first' });
  const second = run(middleware, record, { key: 'key', messageId: 'second' });
  await Promise.resolve();
  pending.get('second')?.();
  await Promise.resolve();
  pending.get('first')?.();
  await Promise.all([first, second]);
  assert.deepEqual(order, ['second', 'first']);

  const resolverError = new Error('resolver');
  await assert.rejects(
    runResolverFailure(
      () => { throw resolverError; },
      () => { reads += 1; },
    ),
    (error) => error === resolverError,
  );
  await assert.rejects(
    runResolverFailure(
      async () => { throw resolverError; },
      () => { reads += 1; },
    ),
    (error) => error === resolverError,
  );

  const invalidOptions = {
    storage: {
      read() { reads += 1; return undefined; },
      write() {},
      delete() {},
    },
    getSessionKey: () => 'valid',
    initial: () => ({ value: 0 }),
  };
  Reflect.set(invalidOptions, 'getSessionKey', () => 7);
  const invalid = session<TestContext, Counter>(invalidOptions);
  await assert.rejects(
    run(invalid, record, { key: 'invalid' }),
    (error) => error instanceof TypeError && error.message === 'Session key must be a string',
  );
  assert.equal(reads, 2);
});

test('read and initial failures preserve identity and do not run later stages', async () => {
  const readError = new Error('read');
  const initialError = new Error('initial');
  const calls: string[] = [];
  const readFailure = session<TestContext, Counter>({
    storage: {
      read() { calls.push('read'); throw readError; },
      write() { calls.push('write'); },
      delete() { calls.push('delete'); },
    },
    getSessionKey: () => 'key',
    initial() { calls.push('initial'); return { value: 0 }; },
  });
  await assert.rejects(
    run(readFailure, () => calls.push('downstream'), { key: 'key' }),
    (error) => error === readError,
  );
  assert.deepEqual(calls, ['read']);

  calls.length = 0;
  const initialFailure = session<TestContext, Counter>({
    storage: {
      read() { calls.push('read'); return undefined; },
      write() { calls.push('write'); },
      delete() { calls.push('delete'); },
    },
    getSessionKey: () => 'key',
    initial() { calls.push('initial'); throw initialError; },
  });
  await assert.rejects(
    run(initialFailure, () => calls.push('downstream'), { key: 'key' }),
    (error) => error === initialError,
  );
  assert.deepEqual(calls, ['read', 'initial']);
});

test('downstream, write, and delete failures preserve identity and release the key', async () => {
  const cases: readonly ('downstream' | 'write' | 'delete')[] = [
    'downstream',
    'write',
    'delete',
  ];
  for (const stage of cases) {
    const expected = new Error(stage);
    const calls: string[] = [];
    let attempt = 0;
    const middleware = session<TestContext, Counter>({
      storage: {
        read() { calls.push('read'); return { value: 0 }; },
        write() { calls.push('write'); if (stage === 'write' && attempt === 1) throw expected; },
        delete() { calls.push('delete'); if (stage === 'delete' && attempt === 1) throw expected; },
      },
      getSessionKey: () => 'key',
      initial: () => ({ value: 0 }),
    });
    const failing: MiddlewareFn<SessionContext> = (context) => {
      attempt += 1;
      calls.push('downstream');
      if (stage === 'downstream' && attempt === 1) throw expected;
      if (stage === 'delete') context.deleteSession();
    };

    await assert.rejects(
      run(middleware, failing, { key: 'key' }),
      (error) => error === expected,
    );
    await run(middleware, failing, { key: 'key' });
    assert.equal(attempt, 2);
    let expectedCalls = ['read', 'downstream', 'read', 'downstream', 'write'];
    if (stage === 'write') {
      expectedCalls = ['read', 'downstream', 'write', 'read', 'downstream', 'write'];
    } else if (stage === 'delete') {
      expectedCalls = ['read', 'downstream', 'delete', 'read', 'downstream', 'delete'];
    }
    assert.deepEqual(calls, expectedCalls);
  }
});

test('delete is idempotent and dominates later session assignment', async () => {
  const calls: string[] = [];
  const middleware = session<TestContext, Counter>({
    storage: {
      read: () => ({ value: 1 }),
      write() { calls.push('write'); },
      delete() { calls.push('delete'); },
    },
    getSessionKey: () => 'key',
    initial: () => ({ value: 0 }),
  });
  await run(middleware, (context) => {
    context.deleteSession();
    context.deleteSession();
    context.session = { value: 2 };
  }, { key: 'key' });
  assert.deepEqual(calls, ['delete']);
});

test('identity cleanup keeps a queued same-key update blocked behind the current owner', async () => {
  const middleware = session<TestContext, Counter>({
    storage: isolatedStorage(new Map()),
    getSessionKey: () => 'key',
    initial: () => ({ value: 0 }),
  });
  const entered: string[] = [];
  const releases = new Map<string, Release>();
  const controlled: MiddlewareFn<SessionContext> = async (context) => {
    entered.push(context.update.message_id);
    await new Promise<void>((resolve) => {
      releases.set(context.update.message_id, resolve);
    });
  };
  const first = run(middleware, controlled, { key: 'key', messageId: 'first' });
  const second = run(middleware, controlled, { key: 'key', messageId: 'second' });
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
  assert.deepEqual(entered, ['first']);
  releases.get('first')?.();
  await first;
  const third = run(middleware, controlled, { key: 'key', messageId: 'third' });
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
  assert.deepEqual(entered, ['first', 'second']);
  releases.get('second')?.();
  await second;
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
  assert.deepEqual(entered, ['first', 'second', 'third']);
  releases.get('third')?.();
  await third;
});

test('suppressed boundary writes while rethrown boundary skips storage mutation', async () => {
  const expected = new Error('inner');
  const writes: number[] = [];
  let deletes = 0;
  const sessionMiddleware = Composer.flatten(session<TestContext, Counter>({
    storage: {
      read: () => ({ value: 0 }),
      write(_key, value) { writes.push(value.value); },
      delete() { deletes += 1; },
    },
    getSessionKey: () => 'key',
    initial: () => ({ value: 0 }),
  }));
  const suppressed = new Composer<SessionContext>();
  suppressed.errorBoundary(() => undefined, (context) => {
    context.session.value = 1;
    throw expected;
  });
  const suppressedContext = createContext('key');
  await sessionMiddleware(suppressedContext, async () => {
    await suppressed.middleware()(suppressedContext, async () => undefined);
  });
  assert.deepEqual(writes, [1]);

  const rethrown = new Composer<SessionContext>();
  rethrown.errorBoundary((error) => { throw error; }, (context) => {
    context.deleteSession();
    throw expected;
  });
  await assert.rejects(
    (async () => {
      const rethrownContext = createContext('key');
      await sessionMiddleware(rethrownContext, async () => {
        await rethrown.middleware()(rethrownContext, async () => undefined);
      });
    })(),
    (error) => error === expected,
  );
  assert.deepEqual(writes, [1]);
  assert.equal(deletes, 0);
});

test('session storage failure escapes through webhook processing as HTTP 500', async () => {
  type WebhookContext = Context & SessionFlavor<Counter>;
  const bot = new Bot<WebhookContext>('token', {
    clientOptions: {
      fetch: async () => new Response(
        '{"user_id":1,"first_name":"Bot","username":"bot",'
        + '"is_bot":true,"name":"Bot"}',
        { status: 200 },
      ),
    },
  });
  const storageError = new Error('storage failed');
  bot.use(session<Context, Counter>({
    storage: {
      read: () => ({ value: 0 }),
      write() { throw storageError; },
      delete() {},
    },
    getSessionKey: (context) => context.update.timestamp,
    initial: () => ({ value: 0 }),
  }));
  await bot.initialize();
  const response = await createWebhookHandler(bot, { secret: 'valid_secret' })(new Request(
    'https://bot.test',
    {
      method: 'POST',
      headers: { 'x-max-bot-api-secret': 'valid_secret' },
      body: '{"update_type":"message_removed","timestamp":1,"message_id":"m",'
        + '"chat_id":2,"user_id":3}',
    },
  ));
  assert.equal(response.status, 500);
});

function isolatedStorage(values: Map<string, Counter>): StorageAdapter<Counter> {
  return {
    read(key) {
      const value = values.get(key);
      return value && { ...value };
    },
    write(key, value) {
      values.set(key, { ...value });
    },
    delete(key) {
      values.delete(key);
    },
  };
}

async function runResolverFailure(
  getSessionKey: SessionOptions<TestContext, Counter>['getSessionKey'],
  onRead: Release,
): Promise<void> {
  const middleware = session<TestContext, Counter>({
    storage: {
      read() { onRead(); return undefined; },
      write() {},
      delete() {},
    },
    getSessionKey,
    initial: () => ({ value: 0 }),
  });
  await run(middleware, () => undefined, { key: 'invalid' });
}

async function run(
  middleware: Middleware<SessionContext>,
  downstream: MiddlewareFn<SessionContext>,
  options: RunOptions,
): Promise<void> {
  const context = createContext(options.key, options.messageId);
  await Composer.flatten(middleware)(context, async () => {
    await downstream(context, async () => undefined);
  });
}

function createContext(key: string, messageId = key): SessionContext {
  return Object.assign(new Context({
    update_type: 'message_removed',
    timestamp: '1',
    message_id: messageId,
    chat_id: '1',
    user_id: '1',
  }, api), {
    key,
    session: { value: 0 },
    deleteSession() {},
  });
}
