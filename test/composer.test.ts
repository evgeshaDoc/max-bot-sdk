import assert from 'node:assert/strict';
import test from 'node:test';

import type { Api } from '../src/api';
import { Composer } from '../src/composer';
import { Context } from '../src/context';
import type { BotInfo } from '../src/core/network/api/types/bot';
import type {
  MessageCallbackUpdate,
  MessageCreatedUpdate,
  MessageRemovedUpdate,
} from '../src/core/network/api/types/update';
import type { MiddlewareFn, MiddlewareObj } from '../src/middleware';

const api: Api = undefined as never;
const botInfo: BotInfo = {
  user_id: '42',
  first_name: 'Bot',
  username: 'bot',
  is_bot: true,
  name: 'Bot',
};

test('Composer returns linked children while separate registrations stay siblings', async () => {
  const composer = new Composer<Context>();
  const seen: string[] = [];

  const useChild = composer.use(async (_context, next) => {
    seen.push('use');
    await next();
  });
  assert.notEqual(useChild, composer);
  composer.on('message_created', () => seen.push('created'));
  composer.on('message_removed', () => seen.push('removed'));

  await run(composer, createMessageContext('hello'));
  await run(composer, createRemovedContext());

  assert.deepEqual(seen, ['use', 'created', 'use', 'removed']);
});

test('linked children stay dynamic and chained registrations are scoped', async () => {
  const composer = new Composer<Context>();
  const seen: string[] = [];
  const created = composer.on('message_created', async (_context, next) => {
    seen.push('created');
    await next();
  });
  const nested = created.use(async (_context, next) => {
    seen.push('late');
    await next();
  });
  nested.use(() => seen.push('nested-late'));
  created.on('message_removed', () => seen.push('impossible-intersection'));

  await run(composer, createMessageContext('hello'));
  await run(composer, createRemovedContext());

  assert.deepEqual(seen, ['created', 'late', 'nested-late']);
});

test('Composer preserves onion order, objects, short-circuit, and dynamic lookup', async () => {
  const order: string[] = [];
  let objectMiddleware: MiddlewareFn<Context> = async (_context, next) => {
    order.push('object-before');
    await next();
    order.push('object-after');
  };
  const dynamicObject: MiddlewareObj<Context> = {
    middleware() {
      return objectMiddleware;
    },
  };
  const composer = new Composer<Context>(
    async (_context, next) => {
      order.push('function-before');
      await next();
      order.push('function-after');
    },
    dynamicObject,
  );

  await run(composer, createRemovedContext(), () => order.push('outer'));
  assert.deepEqual(order, [
    'function-before',
    'object-before',
    'outer',
    'object-after',
    'function-after',
  ]);

  objectMiddleware = () => {
    order.push('replacement');
  };
  await run(composer, createRemovedContext(), () => order.push('unreachable'));
  assert.deepEqual(order.slice(-3), ['function-before', 'replacement', 'function-after']);
});

test('Composer preserves duplicate-next and middleware error identity', async () => {
  const duplicate = new Composer<Context>(async (_context, next) => {
    await next();
    await next();
  }, Composer.pass);
  await assert.rejects(
    run(duplicate, createRemovedContext()),
    (error) => error instanceof Error && error.message === '`next` already called before!',
  );

  const expected = new Error('original middleware error');
  const failing = new Composer<Context>(() => {
    throw expected;
  });
  await assert.rejects(run(failing, createRemovedContext()), (error) => error === expected);
});

test('filter remains an unregistered middleware builder', async () => {
  const composer = new Composer<Context>();
  let handled = 0;
  const filter = composer.filter('message_created', () => {
    handled += 1;
  });

  await run(composer, createMessageContext('hello'));
  assert.equal(handled, 0);
  await filter(createMessageContext('hello'), async () => undefined);
  assert.equal(handled, 1);
});

test('when supports async predicates and synchronous guard narrowing at runtime', async () => {
  const composer = new Composer<Context>();
  const seen: string[] = [];
  composer.when(async (context) => context.updateType === 'message_created', () => {
    seen.push('async');
  });
  composer.when(
    (context): context is Context<MessageRemovedUpdate> => (
      context.updateType === 'message_removed'
    ),
    (context) => seen.push(context.update.message_id),
  );

  await run(composer, createMessageContext('hello'));
  await run(composer, createRemovedContext());
  assert.deepEqual(seen, ['async', 'message']);
});

test('branch evaluates once, chooses one branch, and links its continuation', async () => {
  const composer = new Composer<Context>();
  const seen: string[] = [];
  let evaluations = 0;
  const child = composer.branch(
    (context) => {
      evaluations += 1;
      return context.updateType === 'message_created';
    },
    async (_context, next) => {
      seen.push('true');
      await next();
    },
    () => seen.push('false'),
  );
  child.use(() => seen.push('continued'));

  await run(composer, createMessageContext('hello'));
  await run(composer, createRemovedContext());
  assert.equal(evaluations, 2);
  assert.deepEqual(seen, ['true', 'continued', 'false']);
});

test('branch preserves duplicate-next and error identity', async () => {
  const duplicate = new Composer<Context>();
  duplicate.branch(
    () => true,
    async (_context, next) => {
      await next();
      await next();
    },
  );
  await assert.rejects(
    run(duplicate, createRemovedContext()),
    (error) => error instanceof Error && error.message === '`next` already called before!',
  );

  const expected = new Error('branch failed');
  const failing = new Composer<Context>();
  failing.branch(() => true, () => { throw expected; });
  await assert.rejects(run(failing, createRemovedContext()), (error) => error === expected);
});

test('errorBoundary handles its dynamic child but excludes recovered outer errors', async () => {
  const composer = new Composer<Context>();
  const childError = new Error('child');
  const outerError = new Error('outer');
  const caught: unknown[] = [];
  const boundary = composer.errorBoundary(async (error, _context, next) => {
    caught.push(error);
    await next();
  }, () => {
    throw childError;
  });
  boundary.use(() => {
    throw new Error('unreachable late child');
  });
  composer.use(() => {
    throw outerError;
  });

  await assert.rejects(run(composer, createRemovedContext()), (error) => error === outerError);
  assert.deepEqual(caught, [childError]);
});

test('errorBoundary preserves handler onion order when recovery continues', async () => {
  const composer = new Composer<Context>();
  const order: string[] = [];
  composer.errorBoundary(async (_error, _context, next) => {
    order.push('handler-before');
    await next();
    order.push('handler-after');
  }, () => {
    throw new Error('recoverable');
  });
  composer.use(() => order.push('outer'));

  await run(composer, createRemovedContext());
  assert.deepEqual(order, ['handler-before', 'outer', 'handler-after']);
});

test('errorBoundary supports suppression, rethrow, late additions, and guarded next', async () => {
  const suppressed = new Composer<Context>();
  const expected = new Error('late child');
  const child = suppressed.errorBoundary(() => undefined);
  child.use(() => { throw expected; });
  let outerCalls = 0;
  suppressed.use(() => { outerCalls += 1; });
  await run(suppressed, createRemovedContext());
  assert.equal(outerCalls, 0);

  const rethrowing = new Composer<Context>();
  rethrowing.errorBoundary((error) => { throw error; }, () => { throw expected; });
  await assert.rejects(run(rethrowing, createRemovedContext()), (error) => error === expected);

  const duplicate = new Composer<Context>();
  duplicate.errorBoundary(async (_error, _context, next) => {
    await next();
    await next();
  }, () => { throw expected; });
  await assert.rejects(
    run(duplicate, createRemovedContext()),
    (error) => error instanceof Error && error.message === '`next` already called before!',
  );
});

test('convenience triggers preserve empty, RegExp, string-regex, and command semantics', async () => {
  let emptyMatches = 0;
  const empty = new Composer<Context>();
  empty.hears('', () => { emptyMatches += 1; });
  empty.command('', () => { emptyMatches += 1; });
  empty.action('', () => { emptyMatches += 1; });
  await run(empty, createMessageContext(''));
  await run(empty, createCallbackContext(''));
  assert.equal(emptyMatches, 0);

  let regexpMatches = 0;
  const regexp = new Composer<Context>();
  regexp.hears(/ping/g, () => { regexpMatches += 1; });
  await run(regexp, createMessageContext('ping'));
  await run(regexp, createMessageContext('ping'));
  assert.equal(regexpMatches, 2);

  const matches: string[] = [];
  const legacy = new Composer<Context>();
  legacy.hears('h.llo', () => { matches.push('hears'); });
  legacy.command('start', (context) => {
    matches.push(context.message.body?.text === '!start'
      ? 'command-first-character'
      : 'command-mention');
  });
  legacy.action('go.+', () => { matches.push('action'); });
  await run(legacy, createMessageContext('hello'));
  await run(legacy, createMessageContext('!start'));
  await run(legacy, createMentionedMessageContext('@bot /start'));
  await run(legacy, createCallbackContext('go.now'));
  assert.deepEqual(matches, [
    'hears',
    'command-first-character',
    'command-mention',
    'action',
  ]);
});

test('convenience trigger children stay scoped to the matched outer trigger', async () => {
  const seen: string[] = [];
  const commands = new Composer<Context>();
  commands.command('outer', async (_context, next) => next())
    .command('inner', () => seen.push('nested command'));
  await run(commands, createMessageContext('/inner'));
  assert.equal(seen.length, 0);

  const hears = new Composer<Context>();
  hears.hears('outer', async (_context, next) => next())
    .hears('inner', () => seen.push('nested hears'));
  await run(hears, createMessageContext('inner'));
  assert.equal(seen.length, 0);

  const actions = new Composer<Context>();
  actions.action('outer', async (_context, next) => next())
    .action('inner', () => seen.push('nested action'));
  await run(actions, createCallbackContext('inner'));
  assert.equal(seen.length, 0);

  commands.command('matched', async (_context, next) => next())
    .use(() => seen.push('matched child'));
  await run(commands, createMessageContext('/matched'));
  assert.deepEqual(seen, ['matched child']);
});

async function run(
  composer: Composer<Context>,
  context: Context,
  after: () => void = () => undefined,
): Promise<void> {
  await composer.middleware()(context, async () => after());
}

function createMessageContext(text: string): Context<MessageCreatedUpdate> {
  return new Context({
    update_type: 'message_created',
    timestamp: '1',
    message: {
      recipient: { chat_id: '2', chat_type: 'chat', user_id: null },
      timestamp: '1',
      body: {
        mid: 'message',
        seq: '1',
        text,
        attachments: null,
      },
    },
  }, api, botInfo);
}

function createMentionedMessageContext(text: string): Context<MessageCreatedUpdate> {
  const context = createMessageContext(text);
  if (!context.update.message.body) throw new Error('Message body fixture is required');
  context.update.message.body.markup = [{
    type: 'user_mention',
    from: 0,
    length: 4,
    user_id: '42',
  }];
  return context;
}

function createCallbackContext(payload: string): Context<MessageCallbackUpdate> {
  return new Context({
    update_type: 'message_callback',
    timestamp: '1',
    callback: {
      timestamp: '1',
      callback_id: 'callback',
      payload,
      user: {
        user_id: '7',
        first_name: 'User',
        username: null,
        is_bot: false,
        name: 'User',
      },
    },
    message: null,
  }, api, botInfo);
}

function createRemovedContext(): Context<MessageRemovedUpdate> {
  return new Context({
    update_type: 'message_removed',
    timestamp: '1',
    message_id: 'message',
    chat_id: '2',
    user_id: '7',
  }, api, botInfo);
}
