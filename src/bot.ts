import createDebug from 'debug';

import { Api } from './api';
import { Composer } from './composer';
import { Context } from './context';
import type { MaybePromise } from './core/helpers/types';
import { createClient, type ClientOptions } from './core/network/api/client';
import { BotNotInitializedError } from './core/network/api/error';
import type { BotInfo } from './core/network/api/types/bot';
import type { Update, UpdateType } from './core/network/api/types/update';
import { Polling } from './core/network/polling';

const debug = createDebug('max-bot-sdk:bot');

type ContextConstructor<ContextType extends Context> = new (
  ...args: ConstructorParameters<typeof Context>
) => ContextType;

/** Configuration used by {@link Bot}. */
export interface BotConfig<ContextType extends Context> {
  /** HTTP client settings shared by every API call. */
  readonly clientOptions?: ClientOptions;

  /** Context implementation instantiated for each known update. */
  readonly contextType?: ContextConstructor<ContextType>;
}

/** Long-polling launch settings. */
export interface LaunchOptions {
  /** Update kinds requested from MAX. An empty list requests every known kind. */
  readonly allowedUpdates?: readonly UpdateType[];
}

type PollingErrorHandler<ContextType extends Context> = (
  error: unknown,
  context: ContextType,
) => MaybePromise<void>;

function finishMiddleware(): Promise<void> {
  return Promise.resolve();
}

/** MAX bot runtime with a single Composer middleware pipeline. */
export class Bot<ContextType extends Context = Context> extends Composer<ContextType> {
  /** API client bound to this bot token. */
  readonly api: Api;

  private initializedBotInfo?: BotInfo;

  private readonly contextType: ContextConstructor<ContextType>;

  private initialization?: Promise<BotInfo>;

  private polling?: Polling;

  private pollingLoop?: Promise<void>;

  private pollingErrorHandler?: PollingErrorHandler<ContextType>;

  constructor(token: string, config: BotConfig<ContextType> = {}) {
    super();

    this.contextType = config.contextType
      ?? Context as ContextConstructor<ContextType>;
    this.api = new Api(createClient(token, config.clientOptions));

    debug('Created Bot instance');
  }

  /** Bot identity cached after successful initialization. */
  get botInfo(): BotInfo | undefined {
    return this.initializedBotInfo;
  }

  /**
   * Loads and caches the bot identity.
   * Concurrent callers share one request; a failed request can be retried explicitly.
   * @returns The authenticated bot identity.
   */
  initialize(): Promise<BotInfo> {
    if (!this.initialization) {
      this.initialization = this.api.getMyInfo().then(
        (botInfo) => {
          this.initializedBotInfo = botInfo;
          return botInfo;
        },
        (error: unknown) => {
          this.initialization = undefined;
          throw error;
        },
      );
    }

    return this.initialization;
  }

  /**
   * Replaces the error handler used only by long polling.
   * Public webhook dispatch deliberately bypasses this handler.
   * @param handler - Polling error handler.
   * @returns This bot for chaining.
   */
  catch(handler: PollingErrorHandler<ContextType>): this {
    this.pollingErrorHandler = handler;
    return this;
  }

  /**
   * Dispatches one already parsed update without making a network request.
   * @param update - Known MAX update.
   * @throws {BotNotInitializedError} If {@link initialize} has not succeeded.
   */
  dispatchUpdate(update: Update): Promise<void> {
    if (!this.initializedBotInfo) {
      return Promise.reject(new BotNotInitializedError());
    }

    return this.dispatchMiddleware(update);
  }

  /**
   * Starts development long polling after initialization.
   * Repeated calls while polling is active share the current loop.
   * @param options - Polling filters.
   */
  start(options: LaunchOptions = {}): Promise<void> {
    if (!this.pollingLoop) {
      const polling = new Polling(this.api, options.allowedUpdates);
      this.polling = polling;
      this.pollingLoop = this.runPolling(polling);
    }

    return this.pollingLoop;
  }

  /** Stops the active long-poll request and any retry wait. */
  stop(): void {
    this.polling?.stop();
  }

  private async runPolling(polling: Polling): Promise<void> {
    try {
      const botInfo = await this.initialize();
      debug(`Starting @${botInfo.username}`);
      await polling.loop(this.dispatchPollingUpdate.bind(this));
    } finally {
      this.polling = undefined;
      this.pollingLoop = undefined;
    }
  }

  private dispatchPollingUpdate(update: Update): Promise<void> {
    return this.dispatchMiddleware(update, this.pollingErrorHandler);
  }

  private async dispatchMiddleware(
    update: Update,
    errorHandler?: PollingErrorHandler<ContextType>,
  ): Promise<void> {
    const updateId = `${update.update_type}:${update.timestamp}`;
    const ContextType = this.contextType;
    const context = new ContextType(update, this.api, this.initializedBotInfo);

    debug(`Processing update ${updateId}`);
    try {
      await this.middleware()(context, finishMiddleware);
    } catch (error) {
      if (!errorHandler) {
        throw error;
      }
      await errorHandler(error, context);
    } finally {
      debug(`Finished processing update ${updateId}`);
    }
  }
}
