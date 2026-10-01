import type { StandardSchemaV1 } from "./schema.js";
import type { Method, RequestErrorCode } from "./types.js";

/** Everything a {@link RequestError} can carry besides its message. */
export interface RequestErrorOptions {
  /** What kind of failure this is — see {@link RequestErrorCode}. */
  code: RequestErrorCode;
  /** The URL that was requested (with query string). */
  url: string;
  /** The HTTP method that was used. */
  method: Method;
  /** HTTP status, when a response was received. */
  status?: number | undefined;
  /** The raw `Response`, when one was received. Its body has been read into `body` (unless it was larger than 1 MB). */
  response?: Response | undefined;
  /** The response body as text, when one was received and could be read (at most 1 MB). */
  body?: string | undefined;
  /** Schema issues, for `"VALIDATION"` errors coming from `getJson(schema)` and friends. */
  issues?: readonly StandardSchemaV1.Issue[] | undefined;
  /** The underlying error (what `fetch`, an interceptor or `JSON.parse` threw). */
  cause?: unknown;
}

/**
 * The single error type thrown by this library. Every rejection from `getResponse()`, `getJson()`, …
 * is a `RequestError`, so one `instanceof` (or {@link isRequestError}) check is enough, and `code`
 * tells you what happened.
 *
 * @example
 * ```typescript
 * try {
 *   await api.get("/users/42").getJson<User>();
 * } catch (error) {
 *   if (!isRequestError(error)) throw error;
 *   switch (error.code) {
 *     case "HTTP":    console.log(error.status, error.data);   break;  // parsed error body
 *     case "TIMEOUT": console.log("try again later");          break;
 *     case "ABORTED": break;                                     // the user navigated away
 *     default:        console.error(error.message, error.cause);
 *   }
 * }
 * ```
 */
export class RequestError<TData = unknown> extends Error {
  override readonly name = "RequestError";
  /** What kind of failure this is — see {@link RequestErrorCode}. */
  declare readonly code: RequestErrorCode;
  /** The URL that was requested (with query string). */
  declare readonly url: string;
  /** The HTTP method that was used. */
  declare readonly method: Method;
  /** HTTP status, when a response was received. */
  declare readonly status?: number | undefined;
  /** The raw `Response`, when one was received. Its body has been read into `body` (unless it was larger than 1 MB). */
  declare readonly response?: Response | undefined;
  /** The response body as text, when one was received and could be read (at most 1 MB). */
  declare readonly body?: string | undefined;
  /** Schema issues, for `"VALIDATION"` errors coming from `getJson(schema)` and friends. */
  declare readonly issues?: readonly StandardSchemaV1.Issue[] | undefined;
  declare private _data?: unknown;

  constructor(message: string, options: RequestErrorOptions) {
    super(message, options); // `cause` is picked up only when present, so it is not an own property otherwise
    Object.assign(this, options);
  }

  /**
   * `body` parsed as JSON — the shape most APIs use for error details.
   * `undefined` when there is no body or it is not valid JSON; never throws.
   *
   * @example
   * ```typescript
   * catch (error) {
   *   if (isRequestError(error)) console.log(error.data?.message ?? error.message);
   * }
   * ```
   */
  get data(): TData | undefined {
    if (this._data === undefined && this.body) {
      try {
        this._data = JSON.parse(this.body);
      } catch {
        /* not JSON */
      }
    }
    return this._data as TData | undefined;
  }

  /** Shorthand for `code === "TIMEOUT"`. */
  get isTimeout(): boolean {
    return this.code === "TIMEOUT";
  }

  /** Shorthand for `code === "ABORTED"`. */
  get isAborted(): boolean {
    return this.code === "ABORTED";
  }
}

/** Type guard for {@link RequestError} — handy in `catch (error: unknown)` blocks. */
export const isRequestError = (error: unknown): error is RequestError => error instanceof RequestError;

/**
 * Message of an unknown thrown value.
 * @internal
 */
export const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));
