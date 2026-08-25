import type { Guard, MaybeArray } from './core/helpers/types';
import type { Int64 } from './core/network/api/types/int64';
import type { Message } from './core/network/api/types/message';
import type { Update } from './core/network/api/types/update';
import { compileFilterQuery } from './filter-query';
import type { FilteredUpdateFor, FilterQuery } from './filter-query-types';

import type {
  ContextPredicate,
  Middleware,
  MiddlewareErrorHandler,
  MiddlewareFn,
  MiddlewareObj,
  NextFn,
} from './middleware';

import type { Context, FilteredContext } from './context';

type Triggers = MaybeArray<string | RegExp>;

type UpdateFilter<ContextType extends Context> = FilterQuery | Guard<ContextType['update']>;

export class Composer<ContextType extends Context> implements MiddlewareObj<ContextType> {
  private handler: MiddlewareFn<ContextType>;

  constructor(...middlewares: Array<Middleware<ContextType>>) {
    this.handler = Composer.compose(middlewares);
  }

  /** Returns the current composed middleware pipeline. */
  middleware(): MiddlewareFn<ContextType> {
    return this.handler;
  }

  /** Appends middleware as a dynamically linked child pipeline. */
  use(...middlewares: Array<Middleware<ContextType>>): Composer<ContextType> {
    const child = new Composer(...middlewares);
    this.handler = Composer.compose([this.handler, child]);
    return child;
  }

  on<Filter extends FilterQuery | Guard<ContextType['update']>>(
    filters: MaybeArray<Filter>,
    ...middlewares: Array<Middleware<FilteredContext<ContextType, Filter>>>
  ): Composer<FilteredContext<ContextType, Filter>> {
    const child = new Composer(...middlewares);
    const predicate = compileContextFilter<ContextType, Filter>(filters);
    const binding: MiddlewareFn<ContextType> = (context, next) => {
      return predicate(context) ? child.middleware()(context, next) : next();
    };
    this.handler = Composer.compose([this.handler, binding]);
    return child;
  }

  command(
    command: Triggers,
    ...middlewares: Array<Middleware<FilteredContext<ContextType, 'message_created'>>>
  ): Composer<FilteredContext<ContextType, 'message_created'>> {
    const normalizedTriggers = normalizeTriggers(command);
    const child = new Composer(...middlewares);

    this.on('message_created', (ctx, next) => {
      const text = extractTextFromMessage(ctx.message, ctx.myId);
      if (!text) return next();

      const cmd = text.slice(1);

      for (const trigger of normalizedTriggers) {
        const match = trigger(cmd);
        if (match) {
          ctx.match = match;
          return child.middleware()(ctx, next);
        }
      }

      return next();
    });
    return child;
  }

  hears(
    triggers: Triggers,
    ...middlewares: Array<Middleware<FilteredContext<ContextType, 'message_created'>>>
  ): Composer<FilteredContext<ContextType, 'message_created'>> {
    const normalizedTriggers = normalizeTriggers(triggers);
    const child = new Composer(...middlewares);

    this.on('message_created', (ctx, next) => {
      const text = extractTextFromMessage(ctx.message, ctx.myId);
      if (!text) return next();

      for (const trigger of normalizedTriggers) {
        const match = trigger(text);
        if (match) {
          ctx.match = match;
          return child.middleware()(ctx, next);
        }
      }

      return next();
    });
    return child;
  }

  action(
    triggers: Triggers,
    ...middlewares: Array<Middleware<FilteredContext<ContextType, 'message_callback'>>>
  ): Composer<FilteredContext<ContextType, 'message_callback'>> {
    const normalizedTriggers = normalizeTriggers(triggers);
    const child = new Composer(...middlewares);

    this.on('message_callback', (ctx, next) => {
      const { payload } = ctx.update.callback;

      if (!payload) return next();

      for (const trigger of normalizedTriggers) {
        const match = trigger(payload);
        if (match) {
          ctx.match = match;
          return child.middleware()(ctx, next);
        }
      }

      return next();
    });
    return child;
  }

  /** Registers middleware behind a synchronous context type guard. */
  when<NarrowedContext extends ContextType>(
    predicate: (context: ContextType) => context is NarrowedContext,
    ...middlewares: Array<Middleware<NarrowedContext>>
  ): Composer<NarrowedContext>;

  /** Registers middleware behind a synchronous or asynchronous predicate. */
  when(
    predicate: ContextPredicate<ContextType>,
    ...middlewares: Array<Middleware<ContextType>>
  ): Composer<ContextType>;

  when(
    predicate: ContextPredicate<ContextType>,
    ...middlewares: Array<Middleware<ContextType>>
  ): Composer<ContextType> {
    const child = new Composer(...middlewares);
    const binding: MiddlewareFn<ContextType> = async (context, next) => {
      if (await predicate(context)) {
        await child.middleware()(context, next);
        return;
      }
      await next();
    };
    this.handler = Composer.compose([this.handler, binding]);
    return child;
  }

  /** Selects one middleware branch and returns its linked continuation. */
  branch(
    predicate: ContextPredicate<ContextType>,
    thenMiddleware: Middleware<ContextType>,
    otherwiseMiddleware: Middleware<ContextType> = Composer.pass,
  ): Composer<ContextType> {
    const thenHandler = Composer.compose([thenMiddleware, Composer.pass]);
    const otherwiseHandler = Composer.compose([otherwiseMiddleware, Composer.pass]);
    const child = new Composer<ContextType>(async (context, next) => {
      const handler = await predicate(context) ? thenHandler : otherwiseHandler;
      await handler(context, next);
    });
    this.handler = Composer.compose([this.handler, child]);
    return child;
  }

  /** Catches errors from a linked child without catching recovered outer middleware. */
  errorBoundary(
    handler: MiddlewareErrorHandler<ContextType>,
    ...middlewares: Array<Middleware<ContextType>>
  ): Composer<ContextType> {
    const child = new Composer(...middlewares);
    const boundary: MiddlewareFn<ContextType> = async (context, next) => {
      let continueOuter = false;
      let caught = false;
      let caughtError: unknown;
      try {
        await child.middleware()(context, createContinuation(() => {
          continueOuter = true;
        }));
      } catch (error) {
        caught = true;
        caughtError = error;
      }
      if (caught) {
        await handler(caughtError, context, createGuardedNext(next));
        return;
      }
      if (continueOuter) await next();
    };
    this.handler = Composer.compose([this.handler, boundary]);
    return child;
  }

  filter<Filter extends UpdateFilter<ContextType>>(
    filters: MaybeArray<Filter>,
    ...middlewares: Array<Middleware<FilteredContext<ContextType, Filter>>>
  ): MiddlewareFn<ContextType> {
    const handler = Composer.compose(middlewares);
    const predicate = compileContextFilter<ContextType, Filter>(filters);
    return (ctx, next) => {
      return predicate(ctx) ? handler(ctx, next) : next();
    };
  }

  static flatten<NestedContext extends Context>(
    middleware: Middleware<NestedContext>,
  ): MiddlewareFn<NestedContext> {
    return typeof middleware === 'function'
      ? middleware
      : (context, next) => middleware.middleware()(context, next);
  }

  static concat<NestedContext extends Context>(
    first: MiddlewareFn<NestedContext>,
    andThen: MiddlewareFn<NestedContext>,
  ): MiddlewareFn<NestedContext> {
    return async (context, next) => {
      let nextCalled = false;
      await first(context, async () => {
        if (nextCalled) {
          throw new Error('`next` already called before!');
        }
        nextCalled = true;
        await andThen(context, next);
      });
    };
  }

  static pass<NestedContext extends Context>(
    _context: NestedContext,
    next: NextFn,
  ): Promise<void> {
    return next();
  }

  static compose<NestedContext extends Context>(
    middlewares: Array<Middleware<NestedContext>>,
  ): MiddlewareFn<NestedContext> {
    if (!Array.isArray(middlewares)) {
      throw new Error('Middlewares must be an array');
    }
    if (middlewares.length === 0) {
      return Composer.pass;
    }
    return middlewares.map(Composer.flatten).reduce(Composer.concat);
  }
}

function compileFilters<
  UpdateValue extends Update,
  Filter extends FilterQuery | Guard<UpdateValue>,
>(filters: MaybeArray<Filter>): Guard<UpdateValue, FilteredUpdateFor<UpdateValue, Filter>> {
  const filterList = (Array.isArray(filters) ? filters : [filters]) as readonly Filter[];
  const predicates: readonly ((update: UpdateValue) => boolean)[] = filterList.map((filter) => (
    typeof filter === 'function'
      ? filter as Guard<UpdateValue>
      : compileFilterQuery(filter as FilterQuery)
  ));
  return function matchesFilter(
    update: UpdateValue,
  ): update is FilteredUpdateFor<UpdateValue, Filter> {
    return predicates.some((predicate) => predicate(update));
  };
}

function compileContextFilter<
  ContextValue extends Context,
  Filter extends FilterQuery | Guard<ContextValue['update']>,
>(
  filters: MaybeArray<Filter>,
): (context: ContextValue) => context is FilteredContext<ContextValue, Filter> {
  const predicate = compileFilters(filters);
  return function matchesContext(
    context: ContextValue,
  ): context is FilteredContext<ContextValue, Filter> {
    return predicate(context.update);
  };
}

function normalizeTriggers(triggers: Triggers) {
  return (Array.isArray(triggers) ? triggers : [triggers]).map((trigger) => {
    if (trigger instanceof RegExp) {
      return (value = '') => {
        // eslint-disable-next-line no-param-reassign
        trigger.lastIndex = 0;
        return trigger.exec(value.trim());
      };
    }
    const regex = new RegExp(`^${trigger}$`);
    return (value: string) => regex.exec(value.trim());
  });
}

function extractTextFromMessage(message: Message, myId?: Int64) {
  const { body } = message;
  if (!body) return undefined;
  const { text } = body;

  const mention = body.markup?.find((m) => {
    return m.type === 'user_mention';
  });

  if (
    mention
    && mention.from === 0
    && mention.user_id === myId
  ) {
    return text?.slice(mention.length).trim();
  }

  return text;
}

function createContinuation(onCall: () => void): NextFn {
  let called = false;
  return async function continueMiddleware(): Promise<void> {
    if (called) throw new Error('`next` already called before!');
    called = true;
    onCall();
  };
}

function createGuardedNext(next: NextFn): NextFn {
  let called = false;
  return async function continueMiddleware(): Promise<void> {
    if (called) throw new Error('`next` already called before!');
    called = true;
    await next();
  };
}
