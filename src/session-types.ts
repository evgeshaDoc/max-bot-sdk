import type { Context } from './context';
import type { MaybePromise } from './core/helpers/types';

/** Context fields installed by {@link session} for the current update. */
export type SessionFlavor<Data extends object> = {
  /** Mutable session value loaded for the current key. */
  session: Data;
  /** Marks the current session for deletion after downstream middleware succeeds. */
  deleteSession(): void;
};

/** Persistent storage used by session middleware. */
export interface StorageAdapter<Data extends object> {
  /** Reads an isolated session value, or `undefined` when the key is absent. */
  read(key: string): MaybePromise<Data | undefined>;
  /** Persists the session value after successful downstream processing. */
  write(key: string, value: Data): MaybePromise<void>;
  /** Deletes the session value after successful downstream processing. */
  delete(key: string): MaybePromise<void>;
}

/** Configuration for one single-process session middleware instance. */
export interface SessionOptions<
  ContextType extends Context,
  Data extends object,
> {
  /**
   * Storage for session values.
   *
   * It must isolate values returned from `read` when rollback semantics are required;
   * the SDK does not clone live object references.
   */
  readonly storage: StorageAdapter<Data>;
  /** Creates a fresh value whenever storage returns `undefined`. */
  readonly initial: (context: ContextType) => MaybePromise<Data>;
  /**
   * Resolves the serialization key for this update.
   *
   * Ordering is guaranteed only among updates using the same `session(...)` instance
   * in one process. Async resolvers enter the queue in resolver-completion order.
   */
  readonly getSessionKey: (context: ContextType) => MaybePromise<string>;
}
