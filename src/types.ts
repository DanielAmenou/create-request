import type { RequestError } from "./error.js";
import type { HttpRequest } from "./request.js";
import type { ResponseWrapper } from "./response.js";

/** The HTTP methods a request can be created with. */
export type Method = "GET" | "HEAD" | "OPTIONS" | "DELETE" | "POST" | "PUT" | "PATCH";

/** The HTTP methods that may carry a request body (`withBody` / `withGraphQL` are only available on these). */
export type BodyMethod = "POST" | "PUT" | "PATCH" | "DELETE";

/*
 * The fetch option types below are spelled through `RequestInit` (present in both lib.dom and
 * `@types/node`) or as literal unions, so the declarations work in Node-only projects that do not
 * load the DOM lib. They are not exported: the public names are the DOM ones.
 */

/** What `fetch` accepts as a body. */
export type FetchBody = NonNullable<RequestInit["body"]>;
/** `"include"`, `"omit"` or `"same-origin"`. */
export type CredentialsMode = NonNullable<RequestInit["credentials"]>;
/** `"cors"`, `"no-cors"`, `"same-origin"` or `"navigate"`. */
export type CorsMode = NonNullable<RequestInit["mode"]>;
/** `"follow"`, `"error"` or `"manual"`. */
export type RedirectMode = NonNullable<RequestInit["redirect"]>;
/** A referrer policy name (`"no-referrer"`, `"strict-origin-when-cross-origin"`, …). */
export type ReferrerPolicyName = NonNullable<RequestInit["referrerPolicy"]>;
/** How the HTTP cache is used. */
export type CacheMode = "default" | "force-cache" | "no-cache" | "no-store" | "only-if-cached" | "reload";
/** A fetch priority hint. */
export type PriorityHint = "auto" | "high" | "low";

/**
 * Anything `withBody()` accepts.
 *
 * - `string` → sent as-is (`Content-Type: text/plain` unless you set one)
 * - `Blob` / `File`, `FormData`, `URLSearchParams` → sent as-is, `fetch` sets the matching `Content-Type`
 * - `ArrayBuffer`, typed arrays, `ReadableStream` → sent as-is, no `Content-Type` unless you set one
 * - any other JSON-serialisable object or array → `JSON.stringify`-ed (`Content-Type: application/json` unless you set one)
 *
 * @example
 * ```typescript
 * request.withBody({ name: "Ada" });          // JSON
 * request.withBody(new FormData(form));       // multipart
 * request.withBody("id=1&name=Ada");          // text/plain — set withContentType() for form-urlencoded
 * ```
 */
export type Body = FetchBody | object;

/** A single query-string value. Arrays produce repeated keys (`?tag=a&tag=b`); `null`/`undefined` remove the key. */
export type QueryValue = string | number | boolean | Date | null | undefined | readonly (string | number | boolean | Date)[];

/** Query parameters as a plain object (`{ page: 1, tags: ["a", "b"] }`) or as `URLSearchParams`. */
export type QueryParams = Record<string, QueryValue> | URLSearchParams;

/** Headers as a plain object. `null`/`undefined` unsets the header (useful to drop an api-level default). */
export type HeadersRecord = Record<string, string | number | null | undefined>;

/** Cookies as a plain object of `name → value`. Values are sent verbatim (no encoding). */
export type CookiesRecord = Record<string, string>;

/** A fetch-compatible function: receives the final URL and `RequestInit` and returns a `Response`. */
export type FetchFunction = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Discriminates the kind of failure a {@link RequestError} represents.
 *
 * - `"HTTP"` — the server answered with a non-2xx status (`status`, `response`, `body`, `data` are set)
 * - `"NETWORK"` — `fetch` itself rejected: DNS, connection refused, CORS, offline, a relative URL in Node.js
 *   (`cause` is the original error)
 * - `"TIMEOUT"` — the `withTimeout()` deadline passed, or a signal aborted with a `TimeoutError` (`AbortSignal.timeout()`)
 * - `"ABORTED"` — a signal passed with `withSignal()` / `withAbortController()` was aborted
 * - `"PARSE"` — the body could not be read or parsed (invalid JSON, body already consumed, selector threw)
 * - `"VALIDATION"` — the response did not match the schema passed to `getJson(schema)` (`issues` is set),
 *   or the request could not be built: an empty or unparsable absolute URL, an invalid header, timeout,
 *   retries or body (those last three are thrown synchronously by the `with*` method)
 * - `"INTERCEPTOR"` — an interceptor or callback (retry, CSRF token) threw (`cause` is what it threw)
 * - `"GRAPHQL"` — the GraphQL response contained `errors` and `throwOnError` was enabled
 */
export type RequestErrorCode = "HTTP" | "NETWORK" | "TIMEOUT" | "ABORTED" | "PARSE" | "VALIDATION" | "INTERCEPTOR" | "GRAPHQL";

/** What a retry decision or delay function receives. */
export interface RetryContext {
  /** The retry about to happen, starting at 1 (so `attempt === 1` follows the first failure). */
  attempt: number;
  /** The error that triggered this retry. */
  error: RequestError;
}

/**
 * Configuration for automatic retries — see `withRetries()`.
 *
 * By default a request is retried after a network error, a timeout, or a response with status
 * 408, 425, 429, 500, 502, 503 or 504, with exponential backoff (300 ms, 600 ms, 1.2 s, … plus
 * up to 100 ms of jitter, capped at `maxDelay`). A `Retry-After` header is honoured when present.
 * Aborted requests and requests with a `ReadableStream` body are never retried, whatever the policy.
 *
 * @example
 * ```typescript
 * request.withRetries(3);                                        // 3 retries, default policy
 * request.withRetries({ attempts: 3, delay: 1000 });             // fixed 1 s delay
 * request.withRetries({ attempts: 5, methods: ["GET", "HEAD"] });  // idempotent methods only
 * request.withRetries({
 *   attempts: 3,
 *   delay: ({ attempt }) => attempt * 500,
 *   shouldRetry: ({ error }) => error.code === "HTTP" && error.status === 503,
 *   onRetry: ({ attempt, delay }) => console.log(`retry #${attempt} in ${delay}ms`),
 * });
 * ```
 */
export interface RetryConfig {
  /** Number of retries after the first attempt (`3` means up to 4 requests in total). */
  attempts: number;
  /**
   * Delay before each retry, in milliseconds, or a function computing it.
   * When set, it takes precedence over a `Retry-After` header. Default: exponential backoff.
   */
  delay?: number | ((context: RetryContext) => number) | undefined;
  /** Statuses that are retried. Default: `[408, 425, 429, 500, 502, 503, 504]`. Network errors and timeouts are retried by default. */
  statuses?: readonly number[] | undefined;
  /** Methods that are retried. Default: all. Use `["GET", "HEAD", "OPTIONS", "PUT", "DELETE"]` to retry idempotent requests only. */
  methods?: readonly Method[] | undefined;
  /**
   * Upper bound, in milliseconds, for the default backoff. A `Retry-After` header longer than this
   * cancels the retry so you can react to it yourself. Default: `30000`.
   */
  maxDelay?: number | undefined;
  /** Full override of the retry decision (`statuses` and `methods` are ignored). Aborts and stream bodies still never retry. */
  shouldRetry?: ((context: RetryContext) => boolean | Promise<boolean>) | undefined;
  /** Called before every retry, after the delay has been computed. Awaited if it returns a promise. */
  onRetry?: ((context: RetryContext & { delay: number }) => void | Promise<void>) | undefined;
}

/**
 * The request as it is about to be sent, handed to request interceptors.
 *
 * `headers` keys are lower-case; `body` is already serialised (JSON bodies are strings);
 * `signal` combines the signals passed with `withSignal()` (the timeout is added after interceptors ran).
 * Mutate it in place or return a new object; return a `Response` to skip the network entirely.
 */
export interface RequestConfig extends Omit<RequestInit, "headers" | "body" | "method" | "signal" | "window"> {
  /** The final URL, with the query string and, for api requests, the base URL applied. */
  url: string;
  /** The HTTP method. */
  method: Method;
  /** The headers to send, with lower-case names. The CSRF header (`withCsrf()`) is added after interceptors ran. */
  headers: Record<string, string>;
  /** The serialised body: JSON bodies are already strings. */
  body?: FetchBody | null | undefined;
  /** The signals passed with `withSignal()` / `withAbortController()`, combined. The timeout is added after interceptors ran. */
  signal?: AbortSignal | undefined;
  /** Required by browsers and Node for `ReadableStream` bodies; set automatically. */
  duplex?: "half";
}

/**
 * Runs before the request is sent. Return nothing to keep your in-place changes, a new
 * {@link RequestConfig} to replace it, or a `Response` to short-circuit the request
 * (it is then treated like a fetched response: status is checked, response interceptors run —
 * but `withTimeout()` does not apply to it, since nothing was fetched).
 *
 * @example
 * ```typescript
 * const withTraceId: RequestInterceptor = config => {
 *   config.headers["x-trace-id"] = crypto.randomUUID();
 * };
 * ```
 */
export type RequestInterceptor = (config: RequestConfig) => RequestConfig | Response | void | Promise<RequestConfig | Response | void>;

/**
 * Runs after a successful response (before the body is read), with the request that produced it.
 * Return nothing to keep the response or another {@link ResponseWrapper} to replace it.
 *
 * @example
 * ```typescript
 * const logStatus: ResponseInterceptor = (response, request) => {
 *   console.log(request.method, response.url, response.status);
 * };
 * ```
 */
export type ResponseInterceptor = (response: ResponseWrapper, request: HttpRequest) => ResponseWrapper | void | Promise<ResponseWrapper | void>;

/**
 * Runs once when the request has failed for good (after all retries), with the request that failed.
 * Return nothing to keep the error, another {@link RequestError} to replace it, or a
 * {@link ResponseWrapper} to recover — typically by replaying `request.clone()`. Throwing replaces the error as well.
 *
 * @example
 * ```typescript
 * const replayed = new WeakSet<HttpRequest>();
 * const refreshOn401: ErrorInterceptor = async (error, request) => {
 *   if (error.status !== 401 || replayed.has(request)) return;
 *   token = await refreshToken();          // the request interceptor that adds the token reads it
 *   const retry = request.clone();
 *   replayed.add(retry);                   // never loop on a persistent 401
 *   return retry.getResponse();
 * };
 * ```
 */
export type ErrorInterceptor = (error: RequestError, request: HttpRequest) => RequestError | ResponseWrapper | void | Promise<RequestError | ResponseWrapper | void>;

/** Options for `withGraphQL()`. */
export interface GraphQLOptions {
  /** Throw a `RequestError` with code `"GRAPHQL"` when the response contains a non-empty `errors` array. Default: `false`. */
  throwOnError?: boolean | undefined;
}

/**
 * Options for `withCsrf()`.
 *
 * The token is attached only to same-origin requests (evaluated against the final URL, after
 * interceptors, before any redirect) unless `crossOrigin` is set. Outside a browser there is no
 * page origin and every request counts as same-origin.
 */
export interface CsrfOptions {
  /** Cookie to read the token from (browser only). Default: `"XSRF-TOKEN"`. Ignored when `token` is set. */
  cookie?: string | undefined;
  /** Header the token is sent in. Default: `"X-XSRF-TOKEN"` when read from a cookie, `"X-CSRF-Token"` when `token` is set. */
  header?: string | undefined;
  /** A token, or a function returning one per request (return `null`/`undefined` to send nothing). */
  token?: string | (() => string | null | undefined) | undefined;
  /** Also attach the token to cross-origin URLs. Default: `false`. */
  crossOrigin?: boolean | undefined;
}

/** What `getResult()` resolves to: `error` is `null` on success and the {@link RequestError} otherwise (then `data` is `null`). */
export type RequestResult<T> = { data: T; error: null } | { data: null; error: RequestError };
