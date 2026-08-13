import type { Context } from './context';
import type { Middleware } from './middleware';
import type { SessionFlavor, SessionOptions } from './session-types';

export type { SessionFlavor, SessionOptions, StorageAdapter } from './session-types';

/**
 * Loads, installs, and persists keyed session data around downstream middleware.
 *
 * Same-key updates are serialized only within this middleware instance and process.
 * Storage must return isolated values when failed downstream mutation must not leak.
 * A suppressed inner error is a successful downstream result and is persisted; a
 * rethrown error skips SDK writes and deletes.
 *
 * @param options - Required key resolver, initial-value factory, and storage adapter.
 * @returns Middleware for a context intersected with {@link SessionFlavor}.
 */
export function session<
  ContextType extends Context,
  Data extends object,
>(options: SessionOptions<ContextType, Data>): Middleware<ContextType & SessionFlavor<Data>> {
  const tails = new Map<string, Promise<void>>();

  return async function sessionMiddleware(context, next): Promise<void> {
    const key = await options.getSessionKey(context);
    if (typeof key !== 'string') {
      throw new TypeError('Session key must be a string');
    }

    const previousTail = tails.get(key);
    let release = (): void => undefined;
    const currentGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    tails.set(key, currentGate);

    try {
      if (previousTail) await previousTail;

      const stored = await options.storage.read(key);
      context.session = stored === undefined
        ? await options.initial(context)
        : stored;

      let deleted = false;
      context.deleteSession = function deleteSession(): void {
        deleted = true;
      };

      await next();

      if (deleted) {
        await options.storage.delete(key);
      } else {
        await options.storage.write(key, context.session);
      }
    } finally {
      release();
      if (tails.get(key) === currentGate) tails.delete(key);
    }
  };
}
