import type { PromiseMay } from '@tsofist/stem';

import type { Context } from './context';

export type NextFn = () => Promise<void>;

/** A synchronous or asynchronous predicate over a middleware context. */
export type ContextPredicate<ContextType extends Context> = (
  context: ContextType,
) => PromiseMay<boolean>;

export type MiddlewareFn<ContextType extends Context> = (
  context: ContextType,
  next: NextFn,
) => PromiseMay<unknown>;

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
) => PromiseMay<void>;
