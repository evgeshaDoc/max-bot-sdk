import type { Guard, MaybeArray } from './core/helpers/types';
import type { Int64 } from './core/network/api/types/int64';
import type { Message } from './core/network/api/types/message';
import type { UpdateType } from './core/network/api/types/update';

import type {
  Middleware, MiddlewareFn, MiddlewareObj, NextFn,
} from './middleware';

import type { Context, FilteredContext } from './context';

type Triggers = MaybeArray<string | RegExp>;

type UpdateFilter<ContextType extends Context> = UpdateType | Guard<ContextType['update']>;

export class Composer<ContextType extends Context> implements MiddlewareObj<ContextType> {
  private handler: MiddlewareFn<ContextType>;

  constructor(...middlewares: Array<Middleware<ContextType>>) {
    this.handler = Composer.compose(middlewares);
  }

  /** Returns the current composed middleware pipeline. */
  middleware(): MiddlewareFn<ContextType> {
    return this.handler;
  }

  /** Appends middleware to this composer. */
  use(...middlewares: Array<Middleware<ContextType>>): this {
    this.handler = Composer.compose([this.handler, ...middlewares]);
    return this;
  }

  on<Filter extends UpdateType | Guard<ContextType['update']>>(
    filters: MaybeArray<Filter>,
    ...middlewares: Array<Middleware<FilteredContext<ContextType, Filter>>>
  ) {
    return this.use(this.filter(filters, ...middlewares));
  }

  command(
    command: Triggers,
    ...middlewares: Array<Middleware<FilteredContext<ContextType, 'message_created'>>>
  ) {
    const normalizedTriggers = normalizeTriggers(command);
    const handler = Composer.compose(middlewares);

    return this.use(this.filter('message_created', (ctx, next) => {
      const text = extractTextFromMessage(ctx.message, ctx.myId);
      if (!text) return next();

      const cmd = text.slice(1);

      for (const trigger of normalizedTriggers) {
        const match = trigger(cmd);
        if (match) {
          ctx.match = match;
          return handler(ctx, next);
        }
      }

      return next();
    }));
  }

  hears(
    triggers: Triggers,
    ...middlewares: Array<Middleware<FilteredContext<ContextType, 'message_created'>>>
  ) {
    const normalizedTriggers = normalizeTriggers(triggers);
    const handler = Composer.compose(middlewares);

    return this.use(this.filter('message_created', (ctx, next) => {
      const text = extractTextFromMessage(ctx.message, ctx.myId);
      if (!text) return next();

      for (const trigger of normalizedTriggers) {
        const match = trigger(text);
        if (match) {
          ctx.match = match;
          return handler(ctx, next);
        }
      }

      return next();
    }));
  }

  action(
    triggers: Triggers,
    ...middlewares: Array<Middleware<FilteredContext<ContextType, 'message_callback'>>>
  ) {
    const normalizedTriggers = normalizeTriggers(triggers);
    const handler = Composer.compose(middlewares);

    return this.use(this.filter('message_callback', (ctx, next) => {
      const { payload } = ctx.update.callback;

      if (!payload) return next();

      for (const trigger of normalizedTriggers) {
        const match = trigger(payload);
        if (match) {
          ctx.match = match;
          return handler(ctx, next);
        }
      }

      return next();
    }));
  }

  filter<Filter extends UpdateFilter<ContextType>>(
    filters: MaybeArray<Filter>,
    ...middlewares: Array<Middleware<FilteredContext<ContextType, Filter>>>
  ): MiddlewareFn<ContextType> {
    const handler = Composer.compose(middlewares);
    return (ctx, next) => {
      return ctx.has(filters) ? handler(ctx, next) : next();
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
