import type { PromiseMay, Rec } from '@tsofist/stem';

/** Webhook request settings shared by every ingress adapter. */
export interface WebhookOptions {
  /** Expected secret; missing configuration throws. Use `false` only with external auth. */
  readonly secret?: string | false;

  /** Maximum accepted raw request-body size in bytes. @default 1048576 */
  readonly maxBodyBytes?: number;
}

/** Runtime used by the SDK-owned local webhook listener. */
export type WebhookServerRuntime = 'auto' | 'bun' | 'node';

/** Settings for an SDK-owned local webhook listener. */
export interface WebhookServerOptions extends WebhookOptions {
  /** Native server implementation. @default 'auto' */
  readonly runtime?: WebhookServerRuntime;

  /** Local interface to bind. @default '0.0.0.0' */
  readonly hostname?: string;

  /** Local TCP port. Use `0` to select an available port. @default 3000 */
  readonly port?: number;

  /** Exact URL pathname that accepts webhook requests. @default '/webhook' */
  readonly path?: `/${string}`;

  /** Aborting the signal gracefully closes the listener. */
  readonly signal?: AbortSignal;
}

/** Handle for an SDK-owned local webhook listener. */
export interface WebhookServer {
  /** Native runtime selected for this listener. */
  readonly runtime: Exclude<WebhookServerRuntime, 'auto'>;

  /**
   * Local bind URL.
   *
   * This is not the public HTTPS URL registered with MAX.
   */
  readonly url: URL;

  /** Settles after graceful listener shutdown completes. */
  readonly finished: Promise<void>;

  /** Stops accepting requests and waits for accepted requests to finish. */
  close(): Promise<void>;
}

/** Web Fetch API handler accepted directly by `Bun.serve({ fetch })`. */
export type WebhookHandler = (request: Request) => Promise<Response>;

/** Raw webhook request exposed by a server adapter to the shared processor. */
export interface WebhookAdapterRequest {
  /** Incoming HTTP method. */
  readonly method: string;

  /** Incoming `X-Max-Bot-Api-Secret`, or `null` when absent or ambiguous. */
  readonly secret: string | null;

  /** Declared request size when a valid `Content-Length` is available. */
  readonly contentLength: number | undefined;

  /** Reads the original UTF-8 text or bytes without parsing or reserializing JSON. */
  readBody(maxBytes: number): PromiseMay<string | Uint8Array>;
}

/** One adapter-owned request/response lifecycle. */
export interface WebhookExchange<Result> {
  /** Raw request passed to the shared webhook processor. */
  readonly request: WebhookAdapterRequest;

  /** Applies the processor response to the adapter's response object. */
  respond(response: Response): PromiseMay<Result>;
}

/** Converts a framework callback into one raw webhook exchange. */
export type WebhookAdapter<
  Arguments extends readonly unknown[],
  Result,
> = (...arguments_: Arguments) => WebhookExchange<Result>;

/** Minimal raw-body request shape shared by Express and Fastify adapters. */
export interface BufferedWebhookRequest {
  /** Incoming HTTP method. */
  readonly method: string;

  /** Framework-normalized request headers. */
  readonly headers: Readonly<Rec<string | readonly string[] | undefined>>;

  /** Preferred raw body exposed by framework integrations such as Nest. */
  readonly rawBody?: unknown;

  /** Route-local raw parser result. */
  readonly body?: unknown;
}

/** Minimal Express response surface used by the adapter. */
export interface ExpressWebhookResponse {
  /** Sets the HTTP response status. */
  status(code: number): unknown;

  /** Sets one processor response header. */
  setHeader(name: string, value: string): unknown;

  /** Ends the response with an empty body. */
  end(): unknown;
}

/** Minimal Fastify reply surface used by the adapter. */
export interface FastifyWebhookReply {
  /** Sets the HTTP response status. */
  status(code: number): unknown;

  /** Sets one processor response header. */
  header(name: string, value: string): unknown;

  /** Sends the empty processor response. */
  send(payload?: unknown): unknown;
}
