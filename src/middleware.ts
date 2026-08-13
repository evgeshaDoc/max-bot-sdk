import type { Context } from './context';
import type { MaybePromise } from './core/helpers/types';

export type NextFn = () => Promise<void>;

/** A synchronous or asynchronous predicate over a middleware context. */
export type ContextPredicate<ContextType extends Context> = (
  context: ContextType,
) => MaybePromise<boolean>;

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

/** Handles an error thrown inside a local Composer boundary. */
export type MiddlewareErrorHandler<ContextType extends Context> = (
  error: unknown,
  context: ContextType,
  next: NextFn,
) => MaybePromise<void>;
