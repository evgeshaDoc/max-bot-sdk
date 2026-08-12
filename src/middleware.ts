import type { Context } from './context';

type MaybePromise<Value> = Value | Promise<Value>;

export type NextFn = () => Promise<void>;

export type MiddlewareFn<ContextType extends Context> = (
  context: ContextType,
  next: NextFn,
) => MaybePromise<unknown>;

/** Object exposing Composer-compatible middleware. */
export interface MiddlewareObj<ContextType extends Context> {
  /** Returns the middleware function. */
  middleware: () => MiddlewareFn<ContextType>;
}

export type Middleware<ContextType extends Context> =
  MiddlewareFn<ContextType> | MiddlewareObj<ContextType>;
