/** Describes which SDK boundary rejected a MAX operation. */
export enum MaxErrorKind {
  Abort = 'aborted',
  Http = 'http',
  Network = 'network',
  Protocol = 'protocol',
  Timeout = 'timeout',
}

/** Public, sanitized details for a failed MAX API operation. */
export interface MaxErrorOptions {
  readonly kind: MaxErrorKind;
  readonly status?: number;
  readonly code?: string;
  readonly method?: string;
  readonly path?: string;
  readonly retryAfter?: string;
  readonly ambiguousOutcome?: boolean;
  readonly cause?: unknown;
}

/** Typed error raised by MAX transport, protocol, or validation boundaries. */
export class MaxError extends Error {
  readonly kind: MaxErrorKind;

  readonly status?: number;

  readonly code?: string;

  readonly method?: string;

  readonly path?: string;

  readonly retryAfter?: string;

  readonly ambiguousOutcome: boolean;

  constructor(message: string, options: MaxErrorOptions) {
    super(message);
    if (options.cause !== undefined) Object.defineProperty(this, 'cause', { value: 'redacted' });
    this.name = 'MaxError';
    this.kind = options.kind;
    this.status = options.status;
    this.code = options.code;
    this.method = options.method;
    this.path = options.path;
    this.retryAfter = options.retryAfter;
    this.ambiguousOutcome = options.ambiguousOutcome ?? false;
  }
}

/** Raised when a raw webhook body cannot be classified as a valid MAX update. */
export class MaxUpdateParseError extends MaxError {
  constructor(cause?: unknown) {
    super('Invalid MAX update payload', {
      kind: MaxErrorKind.Protocol,
      cause,
    });
    this.name = 'MaxUpdateParseError';
  }
}

/** Raised when managed dispatch starts before the bot has been initialized. */
export class BotNotInitializedError extends MaxError {
  constructor() {
    super('MAX bot must be initialized before dispatch', {
      kind: MaxErrorKind.Protocol,
    });
    this.name = 'BotNotInitializedError';
  }
}
