import createDebug from 'debug';

import type { Api } from '../../api';
import { MaxError, MaxErrorKind } from './api/error';
import type { Int64 } from './api/types/int64';
import type { Update, UpdateType } from './api/types/update';
import type { GetUpdatesResponse } from './api/modules/subscriptions/types';

const debug = createDebug('max-bot-sdk:polling');
const LONG_POLL_TIMEOUT_SECONDS = 30;
const REQUEST_TIMEOUT_MILLISECONDS = 35_000;
const RETRY_INTERVAL_MILLISECONDS = 5_000;

type UpdateHandler = (update: Update) => Promise<void>;

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function isRetryableError(error: unknown): boolean {
  if (!(error instanceof MaxError)) {
    return error instanceof TypeError;
  }

  return error.kind === MaxErrorKind.Network
    || error.kind === MaxErrorKind.Timeout
    || error.status === 429
    || (error.status !== undefined && error.status >= 500);
}

function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    function finish(): void {
      signal.removeEventListener('abort', handleAbort);
      resolve();
    }

    const timer = setTimeout(finish, milliseconds);

    function handleAbort(): void {
      clearTimeout(timer);
      resolve();
    }

    if (signal.aborted) {
      handleAbort();
      return;
    }
    signal.addEventListener('abort', handleAbort, { once: true });
  });
}

/** Development long-poll transport for known MAX updates. */
export class Polling {
  private readonly abortController = new AbortController();

  private marker?: Int64;

  private running = false;

  constructor(
    private readonly api: Api,
    private readonly allowedUpdates: readonly UpdateType[] = [],
  ) {}

  /**
   * Processes update pages in wire order until stopped or an unrecoverable error escapes.
   * @param handleUpdate - Managed polling dispatch boundary.
   */
  async loop(handleUpdate: UpdateHandler): Promise<void> {
    if (this.running) throw new Error('Polling is already running');
    this.running = true;
    try {
      await this.runLoop(handleUpdate);
    } finally {
      this.running = false;
    }
  }

  private async runLoop(handleUpdate: UpdateHandler): Promise<void> {
    debug('Starting long polling');

    while (!this.abortController.signal.aborted) {
      let page: GetUpdatesResponse | undefined;
      try {
        page = await this.fetchPage();
      } catch (error) {
        if (this.abortController.signal.aborted || isAbortError(error)) {
          break;
        }
        if (!isRetryableError(error)) {
          throw error;
        }

        debug(`GET /updates failed; retrying after ${RETRY_INTERVAL_MILLISECONDS}ms`);
        await wait(RETRY_INTERVAL_MILLISECONDS, this.abortController.signal);
      }

      if (page) {
        for (const parsedUpdate of page.updates) {
          if (parsedUpdate.kind === 'known') {
            await handleUpdate(parsedUpdate.update);
          }
        }

        this.marker = page.marker ?? undefined;
      }
    }

    debug('Long polling is done');
  }

  /** Stops both the active GET request and retry delay. */
  stop(): void {
    this.abortController.abort();
  }

  private fetchPage(): Promise<GetUpdatesResponse> {
    return this.api.getUpdates([...this.allowedUpdates], {
      marker: this.marker,
      signal: this.abortController.signal,
      timeout: LONG_POLL_TIMEOUT_SECONDS,
      timeoutMs: REQUEST_TIMEOUT_MILLISECONDS,
    });
  }
}
