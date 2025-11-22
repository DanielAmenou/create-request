import { HttpMethod, RequestPriority, CredentialsPolicy, RequestMode, RedirectMode, SameSitePolicy, CacheMode, type ReferrerPolicy } from "./enums";
import type { RequestError } from "./RequestError.js";
import type { ResponseWrapper } from "./ResponseWrapper.js";

/**
 * Request body type that extends the standard BodyInit with support for JSON-serializable values.
 * This allows you to pass plain objects and arrays directly, which will be automatically stringified.
 *
 * @example
 * ```typescript
 * // All of these are valid Body types:
 * const body1: Body = { name: 'John', age: 30 }; // Object (auto-stringified)
 * const body2: Body = [1, 2, 3]; // Array (auto-stringified)
 * const body3: Body = 'plain text'; // String
 * const body4: Body = new FormData(); // FormData
 * const body5: Body = new Blob(['content']); // Blob
 * ```
 */
export type Body = BodyInit | Record<string, unknown> | unknown[];

/**
 * Callback function invoked before each retry attempt.
 * Can be used for logging, implementing custom backoff strategies, or other side effects.
 *
 * @param options - Retry callback options
 * @param options.attempt - The current retry attempt number (1-based, so first retry is 1)
 * @param options.error - The RequestError that triggered this retry
 * @returns `void` or a `Promise<void>` if the callback is async
 *
 * @example
 * ```typescript
 * const onRetry: RetryCallback = ({ attempt, error }) => {
 *   console.log(`Retry attempt ${attempt} after error: ${error.message}`);
 * };
 * ```
 */
export type RetryCallback = (options: { attempt: number; error: RequestError }) => void | Promise<void>;

/**
 * Function that calculates the delay (in milliseconds) before the next retry attempt.
 * Allows for dynamic delay strategies like exponential backoff or error-based delays.
 *
 * @param options - Delay calculation options
 * @param options.attempt - The current retry attempt number (1-based, so first retry is 1)
 * @param options.error - The RequestError that triggered this retry
 * @returns The delay in milliseconds (must be non-negative)
 *
 * @example
 * ```typescript
 * // Exponential backoff
 * const delayFn: RetryDelayFunction = ({ attempt }) => {
 *   return Math.min(1000 * Math.pow(2, attempt - 1), 10000);
 * };
 * ```
 *
 * @example
 * ```typescript
 * // Error-based delay (longer delay for rate limits)
 * const delayFn: RetryDelayFunction = ({ attempt, error }) => {
 *   if (error.status === 429) return 5000; // Rate limited, wait 5 seconds
 *   return attempt * 1000; // Otherwise, linear backoff
 * };
 * ```
 */
export type RetryDelayFunction = (options: { attempt: number; error: RequestError }) => number;

/**
 * Configuration object for retry behavior.
 * Provides fine-grained control over how failed requests are retried.
 *
 * @example
 * ```typescript
 * // Fixed delay
 * const config: RetryConfig = {
 *   attempts: 3,
 *   delay: 1000 // Wait 1 second between retries
 * };
 * ```
 *
 * @example
 * ```typescript
 * // Exponential backoff
 * const config: RetryConfig = {
 *   attempts: 3,
 *   delay: ({ attempt }) => Math.min(1000 * Math.pow(2, attempt - 1), 10000)
 * };
 * ```
 */
export interface RetryConfig {
  /**
   * Number of retry attempts before giving up.
   * For example, `attempts: 3` means the request will be tried up to 4 times total (1 initial + 3 retries).
   */
  attempts: number;
  /**
   * Delay between retries in milliseconds, or a function that calculates the delay.
   * - If a number: fixed delay in milliseconds (must be non-negative)
   * - If a function: calculates delay synchronously based on attempt number and error
   * - If not provided: no delay between retries (immediate retry)
   */
  delay?: number | RetryDelayFunction;
}

/**
 * Configuration object passed to request interceptors.
 * Contains all the information needed to make the request and can be modified by interceptors.
 *
 * @example
 * ```typescript
 * const interceptor: RequestInterceptor = (config) => {
 *   // Modify headers
 *   config.headers['X-Custom'] = 'value';
 *   // Change URL
 *   config.url = 'https://other-api.com' + config.url;
 *   return config;
 * };
 * ```
 */
export interface RequestConfig {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: Body;
  signal?: AbortSignal;
  credentials?: RequestCredentials;
  mode?: RequestMode | string;
  redirect?: RedirectMode | string;
  referrer?: string;
  referrerPolicy?: ReferrerPolicy;
  keepalive?: boolean;
  priority?: RequestPriority | string;
  integrity?: string;
  cache?: CacheMode | RequestCache;
}

/**
 * Request interceptor function that can modify the request configuration or return an early response.
 * Interceptors run before the request is sent. If an interceptor returns a Response object,
 * the request is short-circuited and that response is used instead of making the actual request.
 *
 * @param config - The request configuration that can be modified
 * @returns Either:
 *   - A modified `RequestConfig` object (request proceeds with modifications)
 *   - A `Response` object (request is short-circuited, this response is used)
 *   - A Promise resolving to either of the above
 *
 * @example
 * ```typescript
 * const interceptor: RequestInterceptor = (config) => {
 *   // Add custom header
 *   config.headers['X-Request-ID'] = generateId();
 *   return config;
 * };
 * ```
 *
 * @example
 * ```typescript
 * // Short-circuit request (e.g., for caching)
 * const cacheInterceptor: RequestInterceptor = (config) => {
 *   const cached = getFromCache(config.url);
 *   if (cached) {
 *     return new Response(JSON.stringify(cached));
 *   }
 *   return config;
 * };
 * ```
 */
export type RequestInterceptor = (config: RequestConfig) => RequestConfig | Response | Promise<RequestConfig | Response>;

/**
 * Response interceptor function that can transform the response.
 * Interceptors run after a successful request, allowing you to modify or log responses.
 *
 * @param response - The ResponseWrapper that can be modified or replaced
 * @returns Either:
 *   - A modified `ResponseWrapper` object
 *   - A Promise resolving to a `ResponseWrapper`
 *
 * @example
 * ```typescript
 * const interceptor: ResponseInterceptor = (response) => {
 *   console.log(`Response status: ${response.status}`);
 *   return response;
 * };
 * ```
 *
 * @example
 * ```typescript
 * // Transform response data
 * const interceptor: ResponseInterceptor = async (response) => {
 *   const data = await response.getJson();
 *   // Modify data...
 *   // Note: You'd need to create a new ResponseWrapper with modified data
 *   return response;
 * };
 * ```
 */
export type ResponseInterceptor = (response: ResponseWrapper) => ResponseWrapper | Promise<ResponseWrapper>;

/**
 * Error interceptor function that can handle or transform errors.
 * Interceptors run when a request fails, allowing you to handle errors, transform them,
 * or recover by returning a ResponseWrapper.
 *
 * @param error - The RequestError that occurred
 * @returns Either:
 *   - A modified `RequestError` (error is re-thrown with modifications)
 *   - A `ResponseWrapper` (error is recovered, request succeeds with this response)
 *   - A Promise resolving to either of the above
 *
 * @example
 * ```typescript
 * // Log errors
 * const interceptor: ErrorInterceptor = (error) => {
 *   console.error('Request failed:', error);
 *   return error; // Re-throw the error
 * };
 * ```
 *
 * @example
 * ```typescript
 * // Recover from specific errors
 * const interceptor: ErrorInterceptor = (error) => {
 *   if (error.status === 404) {
 *     // Return a default response instead of throwing
 *     return new ResponseWrapper(
 *       new Response(JSON.stringify({ data: [] }), { status: 200 })
 *     );
 *   }
 *   return error; // Re-throw other errors
 * };
 * ```
 */
export type ErrorInterceptor = (error: RequestError) => RequestError | ResponseWrapper | Promise<RequestError | ResponseWrapper>;

/**
 * Options for setting cookie properties.
 * Note: When used in request cookies (via `withCookies()`), these options are primarily
 * for documentation purposes, as the Cookie header only sends name-value pairs.
 * These options are more relevant when parsing Set-Cookie headers from responses.
 *
 * @example
 * ```typescript
 * const cookieOptions: CookieOptions = {
 *   value: 'abc123',
 *   secure: true,
 *   httpOnly: true,
 *   sameSite: SameSitePolicy.STRICT,
 *   expires: new Date('2024-12-31'),
 *   path: '/',
 *   domain: '.example.com',
 *   maxAge: 3600 // 1 hour in seconds
 * };
 * ```
 */
export interface CookieOptions {
  /** The cookie value */
  value: string;
  /** Whether the cookie should only be sent over HTTPS */
  secure?: boolean;
  /** Whether the cookie should not be accessible via JavaScript (HttpOnly flag) */
  httpOnly?: boolean;
  /** SameSite policy for the cookie */
  sameSite?: SameSitePolicy;
  /** Expiration date for the cookie */
  expires?: Date;
  /** Path where the cookie is valid */
  path?: string;
  /** Domain where the cookie is valid */
  domain?: string;
  /** Maximum age of the cookie in seconds */
  maxAge?: number;
}

/**
 * Record type for cookies.
 * Keys are cookie names, values are either simple strings or CookieOptions objects.
 *
 * @example
 * ```typescript
 * const cookies: CookiesRecord = {
 *   sessionId: 'abc123',
 *   token: { value: 'xyz789', secure: true }
 * };
 * ```
 */
export type CookiesRecord = Record<string, string | CookieOptions>;

export { HttpMethod, RequestMode, RedirectMode, SameSitePolicy, RequestPriority, CredentialsPolicy, CacheMode };

/**
 * Options for GraphQL requests.
 *
 * @example
 * ```typescript
 * const options: GraphQLOptions = {
 *   throwOnError: true // Throw RequestError if GraphQL response contains errors
 * };
 * ```
 */
export interface GraphQLOptions {
  /**
   * If `true`, throws a RequestError when the GraphQL response contains errors.
   * If `false` or undefined, errors are returned in the response data and must be checked manually.
   */
  throwOnError?: boolean;
}

export interface RequestOptions extends Omit<RequestInit, "signal" | "body" | "method" | "credentials" | "mode" | "redirect" | "priority" | "cache"> {
  timeout?: number;
  retries?: number | RetryConfig;
  onRetry?: RetryCallback;
  body?: Body;
  credentials?: CredentialsPolicy | RequestCredentials;
  mode?: RequestMode;
  redirect?: RedirectMode | RequestRedirect;
  priority?: RequestPriority | string;
  keepalive?: boolean;
  integrity?: string;
  cache?: CacheMode | RequestCache;
}
