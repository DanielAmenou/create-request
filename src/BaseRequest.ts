import { type HttpMethod, RedirectMode, RequestMode, RequestPriority, ReferrerPolicy, CredentialsPolicy } from "./enums.js";
import type {
  Body,
  RetryConfig,
  RequestConfig,
  RetryCallback,
  CookiesRecord,
  CookieOptions,
  RequestOptions,
  GraphQLOptions,
  ErrorInterceptor,
  RequestInterceptor,
  ResponseInterceptor,
} from "./types.js";
import { ResponseWrapper } from "./ResponseWrapper.js";
import { CookieUtils } from "./utils/CookieUtils.js";
import { RequestError } from "./RequestError.js";
import { CsrfUtils } from "./utils/CsrfUtils.js";
import { Config } from "./utils/Config.js";

/**
 * Base class with common functionality for all request types
 * Provides the core request building and execution capabilities.
 */
export abstract class BaseRequest {
  protected abstract method: HttpMethod;
  protected url: string;
  protected requestOptions: RequestOptions = {
    headers: {},
  };
  protected abortController?: AbortController;
  protected queryParams: URLSearchParams = new URLSearchParams();
  protected autoApplyCsrfProtection: boolean = true;

  // Per-request interceptors
  private requestInterceptors: RequestInterceptor[] = [];
  private responseInterceptors: ResponseInterceptor[] = [];
  private errorInterceptors: ErrorInterceptor[] = [];

  constructor(url: string) {
    this.url = url;
  }

  /**
   * Get GraphQL options if set (only for BodyRequest subclasses)
   * @returns GraphQL options or undefined
   */
  protected getGraphQLOptions(): GraphQLOptions | undefined {
    return undefined;
  }

  /**
   * Creates a fluent API for setting enum-based options
   * Combines direct setter with convenience methods
   */
  private createFluentSetter<T extends string>(optionName: keyof RequestOptions, options: Record<string, T>): unknown {
    const fluent: Record<string, () => BaseRequest> = {};

    // Create convenience methods for each enum value
    Object.entries(options).forEach(([key, value]) => {
      fluent[key] = (): BaseRequest => {
        (this.requestOptions as Record<string, unknown>)[optionName] = value;
        return this;
      };
    });

    // Create the callable setter
    const callable = (value: T | string): BaseRequest => {
      (this.requestOptions as Record<string, unknown>)[optionName] = value;
      return this;
    };

    return Object.assign(callable, fluent);
  }

  private validateUrl(url: string): void {
    const errorMessage = "Bad URL";
    if (!url?.trim()) throw new RequestError(errorMessage, url, this.method);
    if (url.includes("\0") || url.includes("\r") || url.includes("\n")) {
      throw new RequestError(errorMessage, url, this.method);
    }
    const trimmed = url.trim();
    if (/^https?:\/\//.test(trimmed)) {
      try {
        new URL(trimmed);
      } catch {
        throw new RequestError(errorMessage, trimmed, this.method);
      }
    }
  }

  /**
   * Add multiple HTTP headers to the request
   *
   * @param headers - Key-value pairs of header names and values
   * @returns The request instance for chaining
   *
   * @example
   * request.withHeaders({
   *   'Accept': 'application/json',
   *   'X-Custom-Header': 'value'
   * });
   */
  withHeaders(headers: Record<string, string>): this {
    // Filter out null and undefined values
    const filteredHeaders: Record<string, string> = {};
    Object.entries(headers).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        filteredHeaders[key] = value;
      }
    });

    this.requestOptions.headers = {
      ...this.getHeadersRecord(),
      ...filteredHeaders,
    };
    return this;
  }

  /**
   * Add a single HTTP header to the request
   *
   * @param key - The header name
   * @param value - The header value
   * @returns The request instance for chaining
   *
   * @example
   * request.withHeader('Accept', 'application/json');
   */
  withHeader(key: string, value: string): this {
    return this.withHeaders({ [key]: value });
  }

  /**
   * Set a timeout for the request
   * If the request takes longer than the specified timeout, it will be aborted.
   *
   * @param timeout - The timeout in milliseconds
   * @returns The request instance for chaining
   * @throws RequestError if timeout is not a positive number
   *
   * @example
   * request.withTimeout(5000); // 5 seconds timeout
   */
  withTimeout(timeout: number): this {
    if (!Number.isFinite(timeout) || timeout <= 0) throw new RequestError("Bad timeout", this.url, this.method);

    this.requestOptions.timeout = timeout;
    return this;
  }

  /**
   * Configure automatic retry behavior for failed requests
   *
   * @param retries - Number of retry attempts before failing, or a configuration object
   * @returns The request instance for chaining
   * @throws RequestError if retries is not a non-negative integer or invalid config
   *
   * @example
   * // Simple number (backward compatible)
   * request.withRetries(3); // Retry up to 3 times
   *
   * @example
   * // With fixed delay
   * request.withRetries({ attempts: 3, delay: 1000 }); // Retry 3 times with 1 second delay
   *
   * @example
   * // With exponential backoff function
   * request.withRetries({
   *   attempts: 3,
   *   delay: ({ attempt }) => Math.min(1000 * Math.pow(2, attempt - 1), 10000)
   * });
   *
   * @example
   * // With delay function based on error
   * request.withRetries({
   *   attempts: 3,
   *   delay: ({ attempt, error }) => {
   *     if (error.status === 429) return 5000; // Rate limited, wait longer
   *     return attempt * 1000; // Exponential backoff
   *   }
   * });
   */
  withRetries(retries: number | RetryConfig): this {
    if (typeof retries === "number") {
      if (!Number.isInteger(retries) || retries < 0) {
        throw new RequestError(`Bad retries: ${retries}`, this.url, this.method);
      }
      this.requestOptions.retries = retries;
    } else {
      // Validate RetryConfig
      if (!Number.isInteger(retries.attempts) || retries.attempts < 0) {
        throw new RequestError(`Bad attempts: ${retries.attempts}`, this.url, this.method);
      }
      // Validate delay if provided
      if (retries.delay !== undefined) {
        if (typeof retries.delay === "number") {
          if (!Number.isFinite(retries.delay) || retries.delay < 0) {
            throw new RequestError(`Bad delay: ${retries.delay}`, this.url, this.method);
          }
        } else if (typeof retries.delay !== "function") {
          throw new RequestError(`Bad delay: ${typeof retries.delay}`, this.url, this.method);
        }
      }
      this.requestOptions.retries = retries;
    }
    return this;
  }

  /**
   * Set a callback to be invoked before each retry attempt
   * Useful for implementing backoff strategies or logging retry attempts.
   *
   * @param callback - Function to call before retrying
   * @returns The request instance for chaining
   *
   * @example
   * request.onRetry(({ attempt, error }) => {
   *   console.log(`Retry attempt ${attempt} after error: ${error.message}`);
   *   return new Promise(resolve => setTimeout(resolve, attempt * 1000));
   * });
   */
  onRetry(callback: RetryCallback): this {
    this.requestOptions.onRetry = callback;
    return this;
  }

  /**
   * Sets the credentials policy for the request, controlling whether cookies and authentication
   * headers are sent with cross-origin requests.
   *
   * @param credentialsPolicy - The credentials policy to use:
   *   - `"include"` or `CredentialsPolicy.INCLUDE`: Always send credentials (cookies, authorization headers) with the request, even for cross-origin requests.
   *   - `"omit"` or `CredentialsPolicy.OMIT`: Never send credentials, even for same-origin requests.
   *   - `"same-origin"` or `CredentialsPolicy.SAME_ORIGIN`: Only send credentials for same-origin requests (default behavior in most browsers).
   *
   * @returns The request instance for chaining
   *
   * @example
   * // Using string values
   * request.withCredentials("include")
   *
   * @example
   * // Using enum values
   * request.withCredentials(CredentialsPolicy.INCLUDE)
   *
   * @example
   * // Using fluent API
   * request.withCredentials.INCLUDE()
   */
  get withCredentials(): ((credentialsPolicy: CredentialsPolicy | string) => BaseRequest) & {
    INCLUDE: () => BaseRequest;
    OMIT: () => BaseRequest;
    SAME_ORIGIN: () => BaseRequest;
  } {
    return this.createFluentSetter<CredentialsPolicy>("credentials", {
      INCLUDE: CredentialsPolicy.INCLUDE,
      OMIT: CredentialsPolicy.OMIT,
      SAME_ORIGIN: CredentialsPolicy.SAME_ORIGIN,
    }) as ((credentialsPolicy: CredentialsPolicy | string) => BaseRequest) & {
      INCLUDE: () => BaseRequest;
      OMIT: () => BaseRequest;
      SAME_ORIGIN: () => BaseRequest;
    };
  }

  /**
   * Allows providing an external AbortController to cancel the request.
   * This is useful when you need to cancel a request from outside the request chain,
   *
   * @param controller - The AbortController to use for this request. When `controller.abort()` is called,
   *   the request will be cancelled and throw an abort error.
   *
   * @returns The request instance for chaining
   *
   * @example
   * const controller = new AbortController();
   * const request = createRequest('/api/data')
   *   .withAbortController(controller)
   *   .getJson();
   *
   * // Later, cancel the request
   * controller.abort();
   *
   * @example
   * // Share abort controller across multiple requests
   * const controller = new AbortController();
   * request1.withAbortController(controller).getJson();
   * request2.withAbortController(controller).getJson();
   * // Aborting will cancel both requests
   * controller.abort();
   */
  withAbortController(controller: AbortController): this {
    this.abortController = controller;
    return this;
  }

  /**
   * Sets the referrer URL for the request. The referrer is the URL of the page that initiated the request.
   * This can be used to override the default referrer that the browser would normally send.
   *
   * @param referrer - The referrer URL to send with the request. Can be:
   *   - A full URL (e.g., "https://example.com/page")
   *   - An empty string to omit the referrer
   *   - A relative URL (will be resolved relative to the current page)
   *
   * @returns The request instance for chaining
   *
   * @example
   * request.withReferrer("https://example.com/previous-page")
   *
   * @example
   * // Omit referrer
   * request.withReferrer("")
   */
  withReferrer(referrer: string): this {
    this.requestOptions.referrer = referrer;
    return this;
  }

  /**
   * Sets the referrer policy for the request, controlling how much referrer information
   * is sent with the request. This helps balance privacy and functionality.
   *
   * @param policy - The referrer policy to use:
   *   - `"no-referrer"` or `ReferrerPolicy.NO_REFERRER`: Never send the referrer header.
   *   - `"no-referrer-when-downgrade"` or `ReferrerPolicy.NO_REFERRER_WHEN_DOWNGRADE`: Send full referrer for same-origin or HTTPS→HTTPS, omit for HTTPS→HTTP (default in most browsers).
   *   - `"origin"` or `ReferrerPolicy.ORIGIN`: Only send the origin (scheme, host, port), not the full URL.
   *   - `"origin-when-cross-origin"` or `ReferrerPolicy.ORIGIN_WHEN_CROSS_ORIGIN`: Send full referrer for same-origin, only origin for cross-origin.
   *   - `"same-origin"` or `ReferrerPolicy.SAME_ORIGIN`: Send full referrer for same-origin requests only, omit for cross-origin.
   *   - `"strict-origin"` or `ReferrerPolicy.STRICT_ORIGIN`: Send origin for HTTPS→HTTPS or HTTP→HTTP, omit for HTTPS→HTTP.
   *   - `"strict-origin-when-cross-origin"` or `ReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN`: Send full referrer for same-origin, origin for cross-origin HTTPS→HTTPS, omit for HTTPS→HTTP.
   *   - `"unsafe-url"` or `ReferrerPolicy.UNSAFE_URL`: Always send the full referrer URL (may leak sensitive information).
   *
   * @returns The request instance for chaining
   *
   * @example
   * // Using string values
   * request.withReferrerPolicy("no-referrer")
   *
   * @example
   * // Using enum values
   * request.withReferrerPolicy(ReferrerPolicy.NO_REFERRER)
   *
   * @example
   * // Using fluent API
   * request.withReferrerPolicy.NO_REFERRER()
   */
  get withReferrerPolicy(): ((policy: ReferrerPolicy | string) => BaseRequest) & {
    ORIGIN: () => BaseRequest;
    UNSAFE_URL: () => BaseRequest;
    SAME_ORIGIN: () => BaseRequest;
    NO_REFERRER: () => BaseRequest;
    STRICT_ORIGIN: () => BaseRequest;
    ORIGIN_WHEN_CROSS_ORIGIN: () => BaseRequest;
    NO_REFERRER_WHEN_DOWNGRADE: () => BaseRequest;
    STRICT_ORIGIN_WHEN_CROSS_ORIGIN: () => BaseRequest;
  } {
    return this.createFluentSetter<ReferrerPolicy>("referrerPolicy", {
      ORIGIN: ReferrerPolicy.ORIGIN,
      UNSAFE_URL: ReferrerPolicy.UNSAFE_URL,
      SAME_ORIGIN: ReferrerPolicy.SAME_ORIGIN,
      NO_REFERRER: ReferrerPolicy.NO_REFERRER,
      STRICT_ORIGIN: ReferrerPolicy.STRICT_ORIGIN,
      ORIGIN_WHEN_CROSS_ORIGIN: ReferrerPolicy.ORIGIN_WHEN_CROSS_ORIGIN,
      NO_REFERRER_WHEN_DOWNGRADE: ReferrerPolicy.NO_REFERRER_WHEN_DOWNGRADE,
      STRICT_ORIGIN_WHEN_CROSS_ORIGIN: ReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
    }) as ((policy: ReferrerPolicy | string) => BaseRequest) & {
      ORIGIN: () => BaseRequest;
      UNSAFE_URL: () => BaseRequest;
      SAME_ORIGIN: () => BaseRequest;
      NO_REFERRER: () => BaseRequest;
      STRICT_ORIGIN: () => BaseRequest;
      ORIGIN_WHEN_CROSS_ORIGIN: () => BaseRequest;
      NO_REFERRER_WHEN_DOWNGRADE: () => BaseRequest;
      STRICT_ORIGIN_WHEN_CROSS_ORIGIN: () => BaseRequest;
    };
  }

  /**
   * Sets how the request handles HTTP redirects (3xx status codes).
   *
   * @param redirect - The redirect handling mode:
   *   - `"follow"` or `RedirectMode.FOLLOW`: Automatically follow redirects. The fetch will transparently follow redirects and return the final response (default behavior).
   *   - `"error"` or `RedirectMode.ERROR`: Treat redirects as errors. If a redirect occurs, the request will fail with an error.
   *   - `"manual"` or `RedirectMode.MANUAL`: Return the redirect response without following it. The response will have a `type` of "opaqueredirect" and you can manually handle the redirect.
   *
   * @returns The request instance for chaining
   *
   * @example
   * // Using string values
   * request.withRedirect("follow")
   *
   * @example
   * // Using enum values
   * request.withRedirect(RedirectMode.FOLLOW)
   *
   * @example
   * // Using fluent API
   * request.withRedirect.FOLLOW()
   *
   * @example
   * // Fail on redirects
   * request.withRedirect.ERROR()
   */
  get withRedirect(): ((redirect: RedirectMode | string) => BaseRequest) & {
    FOLLOW: () => BaseRequest;
    ERROR: () => BaseRequest;
    MANUAL: () => BaseRequest;
  } {
    return this.createFluentSetter<RedirectMode>("redirect", {
      FOLLOW: RedirectMode.FOLLOW,
      ERROR: RedirectMode.ERROR,
      MANUAL: RedirectMode.MANUAL,
    }) as ((redirect: RedirectMode | string) => BaseRequest) & {
      FOLLOW: () => BaseRequest;
      ERROR: () => BaseRequest;
      MANUAL: () => BaseRequest;
    };
  }

  /**
   * Sets the keepalive flag for the request. When enabled, the request can continue
   * even after the page that initiated it is closed. This is useful for analytics,
   * logging, or other background requests that should complete even if the user navigates away.
   *
   * @param keepalive - Whether to allow the request to outlive the page:
   *   - `true`: The request will continue even if the page is closed or navigated away.
   *   - `false`: The request will be cancelled if the page is closed (default).
   *
   * @returns The request instance for chaining
   *
   * @example
   * // Send analytics event that should complete even if user navigates away
   * request.withKeepAlive(true)
   */
  withKeepAlive(keepalive: boolean): this {
    this.requestOptions.keepalive = keepalive;
    return this;
  }

  /**
   * Sets the priority hint for the request, indicating to the browser how important
   * this request is relative to other requests. This helps the browser optimize resource loading.
   *
   * @param priority - The request priority:
   *   - `"high"` or `RequestPriority.HIGH`: High priority - the browser should prioritize this request.
   *   - `"low"` or `RequestPriority.LOW`: Low priority - the browser can defer this request if needed.
   *   - `"auto"` or `RequestPriority.AUTO`: Automatic priority based on the request type (default).
   *
   * @returns The request instance for chaining
   *
   * @example
   * // Using string values
   * request.withPriority("high")
   *
   * @example
   * // Using enum values
   * request.withPriority(RequestPriority.HIGH)
   *
   * @example
   * // Using fluent API
   * request.withPriority.HIGH()
   *
   * @example
   * // Low priority for non-critical requests
   * request.withPriority.LOW()
   */
  get withPriority(): ((priority: RequestPriority | string) => BaseRequest) & {
    HIGH: () => BaseRequest;
    LOW: () => BaseRequest;
    AUTO: () => BaseRequest;
  } {
    return this.createFluentSetter<RequestPriority>("priority", {
      HIGH: RequestPriority.HIGH,
      LOW: RequestPriority.LOW,
      AUTO: RequestPriority.AUTO,
    }) as ((priority: RequestPriority | string) => BaseRequest) & {
      HIGH: () => BaseRequest;
      LOW: () => BaseRequest;
      AUTO: () => BaseRequest;
    };
  }

  /**
   * Sets the integrity hash for Subresource Integrity (SRI) verification.
   * This allows the browser to verify that the fetched resource hasn't been tampered with
   * by comparing its hash against the provided value. If the hashes don't match, the request fails.
   *
   * @param integrity - The integrity hash string in the format `"algorithm-hash"`:
   *   - Example: `"sha256-abcdef1234567890..."` (SHA-256 hash)
   *   - Example: `"sha384-abcdef1234567890..."` (SHA-384 hash)
   *   - Example: `"sha512-abcdef1234567890..."` (SHA-512 hash)
   *   - Multiple hashes can be separated by spaces: `"sha256-... sha384-..."`
   *
   * @returns The request instance for chaining
   *
   * @example
   * request.withIntegrity("sha256-abcdef1234567890...")
   *
   * @example
   * // Multiple algorithms for better compatibility
   * request.withIntegrity("sha256-... sha384-...")
   */
  withIntegrity(integrity: string): this {
    this.requestOptions.integrity = integrity;
    return this;
  }

  /**
   * Sets the cache mode for the request, controlling how the browser's HTTP cache
   * is used for this request.
   *
   * @param cache - The cache mode:
   *   - `"default"` or `CacheMode.DEFAULT`: Use the browser's default cache behavior. The browser will check the cache and use it if valid, otherwise fetch from network.
   *   - `"no-store"` or `CacheMode.NO_STORE`: Never use the cache and don't store the response in cache. Always fetch from network.
   *   - `"reload"` or `CacheMode.RELOAD`: Bypass the cache but store the response. Always fetch from network, ignoring cached responses.
   *   - `"no-cache"` or `CacheMode.NO_CACHE`: Check the cache but revalidate with the server. Use cached response only if server confirms it's still valid.
   *   - `"force-cache"` or `CacheMode.FORCE_CACHE`: Use the cache if available, even if stale. Only fetch from network if not in cache.
   *   - `"only-if-cached"` or `CacheMode.ONLY_IF_CACHED`: Only use the cache. If not in cache, return an error. Never fetch from network.
   *
   * @returns The request instance for chaining
   *
   * @example
   * // Using string values
   * request.withCache("no-cache")
   *
   * @example
   * // Using enum values
   * request.withCache(CacheMode.NO_CACHE)
   *
   * @example
   * // Using fluent API
   * request.withCache.NO_CACHE()
   *
   * @example
   * // Always fetch fresh data
   * request.withCache.RELOAD()
   *
   * @example
   * // Use cache only, fail if not cached
   * request.withCache.ONLY_IF_CACHED()
   */
  get withCache(): ((cache: string) => BaseRequest) & {
    DEFAULT: () => BaseRequest;
    NO_STORE: () => BaseRequest;
    RELOAD: () => BaseRequest;
    NO_CACHE: () => BaseRequest;
    FORCE_CACHE: () => BaseRequest;
    ONLY_IF_CACHED: () => BaseRequest;
  } {
    const cacheOptions: Record<string, string> = {
      DEFAULT: "default",
      NO_STORE: "no-store",
      RELOAD: "reload",
      NO_CACHE: "no-cache",
      FORCE_CACHE: "force-cache",
      ONLY_IF_CACHED: "only-if-cached",
    };
    return this.createFluentSetter<string>("cache", cacheOptions) as ((cache: string) => BaseRequest) & {
      DEFAULT: () => BaseRequest;
      NO_STORE: () => BaseRequest;
      RELOAD: () => BaseRequest;
      NO_CACHE: () => BaseRequest;
      FORCE_CACHE: () => BaseRequest;
      ONLY_IF_CACHED: () => BaseRequest;
    };
  }

  /**
   * Adds query parameters to the request URL.
   * Multiple calls will append parameters. Array values will create multiple query parameters with the same key.
   * Null and undefined values are ignored.
   *
   * @param params - An object containing query parameter key-value pairs.
   *   Values can be strings, numbers, booleans, arrays (for multiple values), or null/undefined (ignored).
   * @returns The request instance for chaining
   *
   * @example
   * ```typescript
   * // Simple parameters
   * request.withQueryParams({ page: 1, limit: 10, active: true });
   * // Results in: ?page=1&limit=10&active=true
   * ```
   *
   * @example
   * ```typescript
   * // Array values create multiple parameters
   * request.withQueryParams({ tags: ['js', 'ts', 'node'] });
   * // Results in: ?tags=js&tags=ts&tags=node
   * ```
   *
   * @example
   * ```typescript
   * // Null/undefined values are ignored
   * request.withQueryParams({ page: 1, filter: null, sort: undefined });
   * // Results in: ?page=1
   * ```
   */
  withQueryParams(params: Record<string, string | string[] | number | boolean | null | undefined>): this {
    Object.entries(params).forEach(([key, value]) => {
      if (value === null || value === undefined) {
        return;
      }

      if (Array.isArray(value)) {
        // Handle array values - add multiple entries with the same key
        value.forEach(v => this.queryParams.append(key, String(v)));
      } else {
        this.queryParams.append(key, String(value));
      }
    });
    return this;
  }

  /**
   * Adds a single query parameter to the request URL.
   * Convenience method for adding one parameter at a time.
   *
   * @param key - The query parameter name
   * @param value - The query parameter value. Can be a string, number, boolean, array (for multiple values), or null/undefined (ignored).
   * @returns The request instance for chaining
   *
   * @example
   * ```typescript
   * request.withQueryParam('page', 1).withQueryParam('limit', 10);
   * // Results in: ?page=1&limit=10
   * ```
   *
   * @example
   * ```typescript
   * // Array values create multiple parameters
   * request.withQueryParam('tags', ['js', 'ts']);
   * // Results in: ?tags=js&tags=ts
   * ```
   */
  withQueryParam(key: string, value: string | string[] | number | boolean | null | undefined): this {
    return this.withQueryParams({ [key]: value });
  }

  /**
   * Sets the request mode, which determines the CORS (Cross-Origin Resource Sharing) behavior
   * for the request. This controls how the browser handles cross-origin requests.
   *
   * @param mode - The request mode:
   *   - `"cors"` or `RequestMode.CORS`: Enable CORS. The browser will send CORS headers and enforce CORS rules. This is the default for most cross-origin requests.
   *   - `"no-cors"` or `RequestMode.NO_CORS`: Disable CORS. The request is sent as a "simple" request without CORS headers. The response will be opaque (you can't read it).
   *   - `"same-origin"` or `RequestMode.SAME_ORIGIN`: Only allow same-origin requests. Cross-origin requests will fail.
   *   - `"navigate"` or `RequestMode.NAVIGATE`: Used for navigation requests (typically only used by the browser itself).
   *
   * @returns The request instance for chaining
   *
   * @example
   * // Using string values
   * request.withMode("cors")
   *
   * @example
   * // Using enum values
   * request.withMode(RequestMode.CORS)
   *
   * @example
   * // Using fluent API
   * request.withMode.CORS()
   *
   * @example
   * // Restrict to same-origin only
   * request.withMode.SAME_ORIGIN()
   */
  get withMode(): ((mode: RequestMode | string) => BaseRequest) & {
    CORS: () => BaseRequest;
    NO_CORS: () => BaseRequest;
    SAME_ORIGIN: () => BaseRequest;
    NAVIGATE: () => BaseRequest;
  } {
    return this.createFluentSetter<RequestMode>("mode", {
      CORS: RequestMode.CORS,
      NO_CORS: RequestMode.NO_CORS,
      SAME_ORIGIN: RequestMode.SAME_ORIGIN,
      NAVIGATE: RequestMode.NAVIGATE,
    }) as ((mode: RequestMode | string) => BaseRequest) & {
      CORS: () => BaseRequest;
      NO_CORS: () => BaseRequest;
      SAME_ORIGIN: () => BaseRequest;
      NAVIGATE: () => BaseRequest;
    };
  }

  /**
   * Sets the Content-Type header for the request.
   * Shorthand for `withHeader('Content-Type', contentType)`.
   *
   * @param contentType - The MIME type (e.g., `'application/json'`, `'text/plain'`, `'multipart/form-data'`)
   * @returns The request instance for chaining
   *
   * @example
   * ```typescript
   * request.withContentType('application/json');
   * ```
   *
   * @example
   * ```typescript
   * request.withContentType('application/xml');
   * ```
   */
  withContentType(contentType: string): this {
    return this.withHeader("Content-Type", contentType);
  }

  /**
   * Sets the Authorization header for the request.
   * Shorthand for `withHeader('Authorization', authValue)`.
   * For Bearer tokens, use `withBearerToken()` instead. For Basic auth, use `withBasicAuth()`.
   *
   * @param authValue - The full authorization header value (e.g., `'Bearer token123'`, `'Basic base64string'`)
   * @returns The request instance for chaining
   *
   * @example
   * ```typescript
   * request.withAuthorization('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...');
   * ```
   *
   * @example
   * ```typescript
   * request.withAuthorization('CustomScheme customToken');
   * ```
   */
  withAuthorization(authValue: string): this {
    return this.withHeader("Authorization", authValue);
  }

  /**
   * Sets up HTTP Basic Authentication.
   * Encodes the username and password in base64 and sets the Authorization header.
   *
   * @param username - The username for Basic authentication
   * @param password - The password for Basic authentication
   * @returns The request instance for chaining
   *
   * @example
   * ```typescript
   * request.withBasicAuth('myuser', 'mypassword');
   * // Sets: Authorization: Basic bXl1c2VyOm15cGFzc3dvcmQ=
   * ```
   */
  withBasicAuth(username: string, password: string): this {
    const credentials = this.encodeBase64(`${username}:${password}`);
    return this.withAuthorization(`Basic ${credentials}`);
  }

  /**
   * Cross-environment base64 encoding
   * Works in both browser and Node.js environments
   */
  private encodeBase64(str: string): string {
    // Modern approach using TextEncoder (available in both modern browsers and Node.js)
    if (typeof TextEncoder !== "undefined" && typeof btoa === "function") {
      const encoder = new TextEncoder();
      const bytes = encoder.encode(str);
      return btoa(String.fromCharCode.apply(null, [...new Uint8Array(bytes)]));
    }

    // Browser environment
    if (typeof btoa === "function") return btoa(str);

    // Node.js environment
    if (typeof Buffer !== "undefined") return Buffer.from(str).toString("base64");

    // Fallback (should never happen in modern environments)
    throw new RequestError("No encoder", this.url, this.method);
  }

  /**
   * Sets a Bearer token for authentication.
   * Shorthand for `withAuthorization('Bearer ' + token)`.
   *
   * @param token - The Bearer token (JWT, OAuth token, etc.)
   * @returns The request instance for chaining
   *
   * @example
   * ```typescript
   * request.withBearerToken('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...');
   * // Sets: Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   * ```
   */
  withBearerToken(token: string): this {
    return this.withAuthorization(`Bearer ${token}`);
  }

  /**
   * Safely get headers as a Record<string, string>
   * @returns The headers object
   */
  private getHeadersRecord(): Record<string, string> {
    if (typeof this.requestOptions.headers === "object" && this.requestOptions.headers !== null) {
      return this.requestOptions.headers as Record<string, string>;
    }
    return {};
  }

  /**
   * Helper function to check for header presence in a case-insensitive way
   * @param headerName Header name to check
   * @returns Boolean indicating if the header exists (case-insensitive)
   */
  private hasHeader(headerName: string): boolean {
    const headers = this.getHeadersRecord();
    return Object.keys(headers).some(key => key.toLowerCase() === headerName.toLowerCase());
  }

  /**
   * Sets cookies for the request.
   * Cookies are sent in the Cookie header. Multiple calls will merge cookies.
   * Cookie values can be simple strings or objects with additional cookie options.
   *
   * @param cookies - An object where keys are cookie names and values are either:
   *   - A string (the cookie value)
   *   - A CookieOptions object with `value` and optional properties (secure, httpOnly, sameSite, expires, path, domain, maxAge)
   * @returns The request instance for chaining
   *
   * @example
   * ```typescript
   * // Simple string cookies
   * request.withCookies({ sessionId: 'abc123', userId: '456' });
   * ```
   *
   * @example
   * ```typescript
   * // Cookies with options (note: options are for documentation only in request cookies)
   * request.withCookies({
   *   sessionId: 'abc123',
   *   token: { value: 'xyz789', secure: true }
   * });
   * ```
   */
  withCookies(cookies: CookiesRecord): this {
    const cookieEntries = Object.entries(cookies || {});

    if (cookieEntries.length === 0) {
      return this;
    }

    const currentHeaders = this.getHeadersRecord();

    // Get all existing cookie headers with different cases
    const cookieValues: string[] = [];
    const cookieHeaderKeys: string[] = [];

    Object.keys(currentHeaders).forEach(key => {
      if (key.toLowerCase() === "cookie") {
        // Don't add empty cookie values
        if (currentHeaders[key]) cookieValues.push(currentHeaders[key]);
        cookieHeaderKeys.push(key);
      }
    });

    // Format the new cookies
    const cookieString = CookieUtils.formatRequestCookies(cookies);

    // Choose which header name to use - preserve existing case if possible
    const headerName = cookieHeaderKeys.length > 0 ? cookieHeaderKeys[0] : "Cookie";

    // Combine all existing cookie values with the new ones
    const combinedCookieValue = [...cookieValues, cookieString].filter(Boolean).join("; ");

    // Create a new headers object without any cookie headers
    const newHeaders = { ...currentHeaders };
    cookieHeaderKeys.forEach(key => {
      delete newHeaders[key];
    });

    // Set the new combined cookie header
    this.requestOptions.headers = {
      ...newHeaders,
      [headerName]: combinedCookieValue,
    };

    return this;
  }

  /**
   * Sets a single cookie for the request.
   * Convenience method for adding one cookie at a time.
   *
   * @param name - The cookie name
   * @param value - The cookie value as a string, or a CookieOptions object with `value` and optional properties
   * @returns The request instance for chaining
   *
   * @example
   * ```typescript
   * request.withCookie('sessionId', 'abc123');
   * ```
   *
   * @example
   * ```typescript
   * request.withCookie('token', { value: 'xyz789', secure: true });
   * ```
   */
  withCookie(name: string, value: string | CookieOptions): this {
    return this.withCookies({ [name]: value });
  }

  /**
   * Sets a CSRF (Cross-Site Request Forgery) token in the request headers.
   * This is commonly used to protect against CSRF attacks in web applications.
   *
   * @param token - The CSRF token value
   * @param headerName - The name of the header to use. Defaults to `'X-CSRF-Token'`.
   * @returns The request instance for chaining
   *
   * @example
   * ```typescript
   * request.withCsrfToken('csrf-token-123');
   * // Sets: X-CSRF-Token: csrf-token-123
   * ```
   *
   * @example
   * ```typescript
   * request.withCsrfToken('token', 'X-Custom-CSRF-Header');
   * // Sets: X-Custom-CSRF-Header: token
   * ```
   */
  withCsrfToken(token: string, headerName = "X-CSRF-Token"): this {
    return this.withHeader(headerName, token);
  }

  /**
   * Disables automatic anti-CSRF protection.
   * By default, X-Requested-With: XMLHttpRequest header is sent with all requests.
   * @returns The instance for chaining
   */
  withoutCsrfProtection(): this {
    this.autoApplyCsrfProtection = false;
    return this;
  }

  /**
   * Sets common security headers to help prevent CSRF attacks
   * @returns The instance for chaining
   */
  withAntiCsrfHeaders(): this {
    return this.withHeader("X-Requested-With", "XMLHttpRequest");
  }

  /**
   * Add a request interceptor for this specific request
   * Request interceptors can modify the request configuration or return an early response
   *
   * @param interceptor - The request interceptor function
   * @returns The instance for chaining
   *
   * @example
   * request.withRequestInterceptor((config) => {
   *   config.headers['X-Custom'] = 'value';
   *   return config;
   * });
   */
  withRequestInterceptor(interceptor: RequestInterceptor): this {
    this.requestInterceptors.push(interceptor);
    return this;
  }

  /**
   * Add a response interceptor for this specific request
   * Response interceptors can transform the response
   *
   * @param interceptor - The response interceptor function
   * @returns The instance for chaining
   *
   * @example
   * request.withResponseInterceptor((response) => {
   *   console.log('Status:', response.status);
   *   return response;
   * });
   */
  withResponseInterceptor(interceptor: ResponseInterceptor): this {
    this.responseInterceptors.push(interceptor);
    return this;
  }

  /**
   * Add an error interceptor for this specific request
   * Error interceptors can handle or transform errors
   *
   * @param interceptor - The error interceptor function
   * @returns The instance for chaining
   *
   * @example
   * request.withErrorInterceptor((error) => {
   *   console.error('Request failed:', error);
   *   throw error;
   * });
   */
  withErrorInterceptor(interceptor: ErrorInterceptor): this {
    this.errorInterceptors.push(interceptor);
    return this;
  }

  /**
   * Execute the request and return the ResponseWrapper
   * This is the base method for getting the full response.
   *
   * @returns A promise that resolves to the ResponseWrapper
   *
   * @example
   * const response = await request.getResponse();
   * console.log(response.status);
   */
  async getResponse(): Promise<ResponseWrapper> {
    const url = this.formatUrlWithQueryParams(this.url);
    this.applyCsrfProtection();

    const fetchOptions: RequestInit = {
      ...(this.requestOptions as RequestInit),
      method: this.method,
    };

    return !this.requestOptions.retries ? this.executeRequest(url, fetchOptions) : this.executeWithRetries(url, fetchOptions);
  }

  /**
   * Execute the request and parse the response as JSON
   *
   * @returns A promise that resolves to the parsed JSON data
   * @throws {RequestError} When the request fails, JSON parsing fails, GraphQL errors occur (if throwOnError enabled), or body is already consumed
   *
   * @example
   * const users = await request.getJson<User[]>();
   *
   * @example
   * // Error handling - errors are always RequestError
   * try {
   *   const data = await request.getJson();
   * } catch (error) {
   *   if (error instanceof RequestError) {
   *     console.log(error.status, error.url, error.method);
   *   }
   * }
   */
  async getJson<T = unknown>(): Promise<T> {
    const response = await this.getResponse();
    return response.getJson<T>();
  }

  /**
   * Execute the request and get the response body as text.
   *
   * @returns A promise that resolves to the response body as a string
   * @throws {RequestError} When the request fails or reading the response fails
   *
   * @example
   * ```typescript
   * const text = await request.getText();
   * console.log(text); // "Hello, world!"
   * ```
   */
  async getText(): Promise<string> {
    const response = await this.getResponse();
    return response.getText();
  }

  /**
   * Execute the request and get the response body as a Blob.
   * Useful for downloading files or handling binary data.
   *
   * @returns A promise that resolves to the response body as a Blob
   * @throws {RequestError} When the request fails or reading the response fails
   *
   * @example
   * ```typescript
   * const blob = await request.getBlob();
   * const url = URL.createObjectURL(blob);
   * // Use the blob URL (e.g., for downloading or displaying)
   * ```
   */
  async getBlob(): Promise<Blob> {
    const response = await this.getResponse();
    return response.getBlob();
  }

  /**
   * Execute the request and get the response body as an ArrayBuffer.
   * Useful for processing binary data at a low level.
   *
   * @returns A promise that resolves to the response body as an ArrayBuffer
   * @throws {RequestError} When the request fails or reading the response fails
   *
   * @example
   * ```typescript
   * const buffer = await request.getArrayBuffer();
   * const uint8Array = new Uint8Array(buffer);
   * // Process the binary data
   * ```
   */
  async getArrayBuffer(): Promise<ArrayBuffer> {
    const response = await this.getResponse();
    return response.getArrayBuffer();
  }

  /**
   * Execute the request and get the response body as a ReadableStream.
   * Note: Unlike other methods, streams cannot be cached. The body can only be consumed once.
   *
   * @returns A promise that resolves to the response body as a ReadableStream, or `null` if the body is not available
   * @throws {RequestError} When the request fails or the body has already been consumed
   *
   * @example
   * ```typescript
   * const stream = await request.getBody();
   * if (stream) {
   *   const reader = stream.getReader();
   *   // Process the stream chunk by chunk
   * }
   * ```
   */
  async getBody(): Promise<ReadableStream<Uint8Array> | null> {
    const response = await this.getResponse();
    return response.getBody();
  }

  /**
   * Execute the request and extract specific data using a selector function
   * If no selector is provided, returns the full JSON response.
   *
   * @param selector - Optional function to extract and transform data
   * @returns A promise that resolves to the selected data
   * @throws {RequestError} When the request fails, JSON parsing fails, or the selector throws an error
   *
   * @example
   * // Get full response
   * const data = await request.getData();
   *
   * // Extract specific data
   * const users = await request.getData(data => data.results.users);
   *
   * @example
   * // Error handling - errors are always RequestError
   * try {
   *   const data = await request.getData();
   * } catch (error) {
   *   if (error instanceof RequestError) {
   *     console.log(error.status, error.url, error.method);
   *   }
   * }
   */
  async getData<T = unknown, R = T>(selector?: (data: T) => R): Promise<T | R> {
    const response = await this.getResponse();
    return response.getData<T, R>(selector);
  }

  /**
   * Apply CSRF protection headers based on configuration
   */
  private applyCsrfProtection(): void {
    if (!this.autoApplyCsrfProtection) return;

    const config = Config.getInstance();

    // Apply anti-CSRF headers if enabled
    if (config.isAntiCsrfEnabled()) {
      this.withAntiCsrfHeaders();
    }

    // Apply global CSRF token if set
    const globalToken = config.getCsrfToken();
    if (globalToken) {
      const csrfHeaderName = config.getCsrfHeaderName();
      const hasLocalToken = this.hasHeader("X-CSRF-Token") || this.hasHeader(csrfHeaderName);

      if (!hasLocalToken) {
        this.withHeader(csrfHeaderName, globalToken);
      }
    }

    // Check for XSRF token in cookies and send it as a header
    if (config.isAutoXsrfEnabled() && typeof document !== "undefined") {
      const xsrfToken = CsrfUtils.getTokenFromCookie(config.getXsrfCookieName());
      if (xsrfToken && CsrfUtils.isValidToken(xsrfToken)) {
        const xsrfHeaderName = config.getXsrfHeaderName();
        const hasLocalToken = this.hasHeader("X-XSRF-TOKEN") || this.hasHeader(xsrfHeaderName);

        if (!hasLocalToken) {
          this.withHeader(xsrfHeaderName, xsrfToken);
        }
      }
    }
  }

  /**
   * Formats the URL with any query parameters
   * @param url The base URL
   * @returns The URL with query parameters appended
   */
  private formatUrlWithQueryParams(url: string): string {
    const queryString = this.queryParams.toString();
    if (!queryString) {
      return url;
    }

    try {
      // Try to use the URL constructor (works for absolute URLs)
      const urlObj = new URL(url);

      // Merge our query params with any that might be in the URL already
      this.queryParams.forEach((value, key) => {
        urlObj.searchParams.append(key, value);
      });

      return urlObj.toString();
    } catch (_error) {
      // Handle relative URLs
      const hasExistingParams = url.includes("?");
      const separator = hasExistingParams ? "&" : "?";
      return `${url}${separator}${queryString}`;
    }
  }

  /**
   * Executes a request with configured retry logic
   * @param url The formatted URL to send the request to
   * @param fetchOptions The fetch options to use
   * @returns A wrapped response object
   * @throws RequestError if the request fails after all retries
   */
  private async executeWithRetries(url: string, fetchOptions: RequestInit): Promise<ResponseWrapper> {
    const retriesConfig = this.requestOptions.retries;
    const maxRetries = typeof retriesConfig === "number" ? retriesConfig : retriesConfig?.attempts || 0;
    const method = typeof fetchOptions.method === "string" ? fetchOptions.method : "GET";

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.executeRequest(url, fetchOptions);
      } catch (error) {
        const requestError = error instanceof RequestError ? error : RequestError.networkError(url, method, error instanceof Error ? error : new Error(String(error)));

        if (attempt >= maxRetries) throw requestError;

        // Call onRetry callback if provided
        if (this.requestOptions.onRetry) {
          await this.requestOptions.onRetry({ attempt: attempt + 1, error: requestError });
        }

        // Apply delay if configured
        if (typeof retriesConfig === "object" && retriesConfig.delay !== undefined) {
          const delay = typeof retriesConfig.delay === "function" ? retriesConfig.delay({ attempt: attempt + 1, error: requestError }) : retriesConfig.delay;

          // Validate delay result
          if (typeof delay !== "number" || !Number.isFinite(delay) || delay < 0) {
            throw new RequestError(`Bad delay: ${delay}`, url, method);
          }

          // Wait for the delay
          if (delay > 0) {
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
    }

    // This should never happen but is needed for type safety
    throw new RequestError(`EO`, url, method);
  }

  /**
   * Run request interceptors in order: global interceptors first, then per-request
   * @param configParam - The request configuration
   * @returns Modified config or a Response to short-circuit
   */
  private async runRequestInterceptors(configParam: RequestConfig): Promise<RequestConfig | Response> {
    const globalConfig = Config.getInstance();
    const allInterceptors = [...globalConfig.getRequestInterceptors(), ...this.requestInterceptors];

    let currentConfig = configParam;

    for (let i = 0; i < allInterceptors.length; i++) {
      try {
        const result = await allInterceptors[i](currentConfig);

        // If interceptor returns a Response, short-circuit
        if (result instanceof Response) {
          return result;
        }

        currentConfig = result;
      } catch (error) {
        throw new RequestError(`ReqI: ${error instanceof Error ? error.message : String(error)}`, currentConfig.url, currentConfig.method);
      }
    }

    return currentConfig;
  }

  /**
   * Run response interceptors in reverse order: per-request interceptors first, then global in reverse
   * @param response - The response wrapper
   * @returns Modified response wrapper
   */
  private async runResponseInterceptors(response: ResponseWrapper): Promise<ResponseWrapper> {
    const globalConfig = Config.getInstance();
    const globalInterceptors = globalConfig.getResponseInterceptors();

    // Per-request in order, then global in reverse
    const allInterceptors = [...this.responseInterceptors, ...[...globalInterceptors].reverse()];

    let currentResponse = response;

    for (let i = 0; i < allInterceptors.length; i++) {
      try {
        currentResponse = await allInterceptors[i](currentResponse);
      } catch (error) {
        throw new RequestError(`ResI: ${error instanceof Error ? error.message : String(error)}`, currentResponse.url || "", currentResponse.method || "");
      }
    }

    return currentResponse;
  }

  /**
   * Run error interceptors in reverse order: per-request interceptors first, then global in reverse
   * @param error - The error that occurred
   * @returns Modified error or a ResponseWrapper to recover
   */
  private async runErrorInterceptors(error: RequestError): Promise<RequestError | ResponseWrapper> {
    const globalConfig = Config.getInstance();
    const globalInterceptors = globalConfig.getErrorInterceptors();

    // Per-request in order, then global in reverse
    const allInterceptors = [...this.errorInterceptors, ...[...globalInterceptors].reverse()];

    let currentError: RequestError | ResponseWrapper = error;

    for (let i = 0; i < allInterceptors.length; i++) {
      try {
        // If previous interceptor recovered with a response, stop processing
        if (currentError instanceof ResponseWrapper) {
          return currentError;
        }

        const result: RequestError | ResponseWrapper = await allInterceptors[i](currentError);
        currentError = result;
      } catch (interceptorError) {
        // If an error interceptor throws, that becomes the new error
        if (interceptorError instanceof RequestError) {
          currentError = interceptorError;
        } else {
          const em = interceptorError instanceof Error ? interceptorError.message : String(interceptorError);
          // Always wrap in RequestError when we have context
          if (currentError instanceof RequestError) {
            currentError = new RequestError(`ErrI${i + 1}: ${em}`, currentError.url, currentError.method, {
              status: currentError.status,
              response: currentError.response,
            });
          } else {
            /* c8 ignore start */
            // Last resort: if we have no context at all, use the original error's context
            // This shouldn't happen in practice, but handle it gracefully
            const errorObj = interceptorError instanceof Error ? interceptorError : new Error(String(interceptorError));
            currentError = RequestError.networkError(error.url, error.method, errorObj);
            /* c8 ignore end */
          }
        }
      }
    }

    return currentError;
  }

  /**
   * Helper to create an abort signal with timeout support
   * Handles various AbortSignal API levels gracefully
   */
  private createAbortSignal(
    timeoutMs: number | undefined,
    externalController: AbortController | undefined
  ): {
    signal: AbortSignal | undefined;
    cleanup: () => void;
    wasTimeout: () => boolean;
  } {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let timeoutController: AbortController | undefined;
    let isTimeout = false;

    // No timeout - just use external controller
    if (!timeoutMs) {
      return {
        signal: externalController?.signal,
        cleanup: () => {},
        wasTimeout: () => false,
      };
    }

    // Check if AbortSignal.any() is available (modern browsers)
    const hasAbortSignalAny = typeof (AbortSignal as { any?: unknown }).any === "function";
    const hasAbortSignalTimeout = typeof AbortSignal.timeout === "function";

    // Create timeout signal
    const createTimeoutSignal = (): AbortSignal => {
      if (hasAbortSignalTimeout) {
        const signal = AbortSignal.timeout(timeoutMs);
        signal.addEventListener("abort", () => (isTimeout = true), { once: true });
        return signal;
      } else {
        timeoutController = new AbortController();
        timeoutId = setTimeout(() => {
          isTimeout = true;
          timeoutController!.abort();
        }, timeoutMs);
        return timeoutController.signal;
      }
    };

    const timeoutSignal = createTimeoutSignal();

    // Combine signals if we have both timeout and external controller
    const finalSignal =
      externalController && hasAbortSignalAny
        ? (AbortSignal as unknown as { any: (signals: AbortSignal[]) => AbortSignal }).any([externalController.signal, timeoutSignal])
        : externalController
          ? this.combineSignalsManually(externalController.signal, timeoutSignal)
          : timeoutSignal;

    return {
      signal: finalSignal,
      cleanup: () => {
        if (timeoutId !== undefined) clearTimeout(timeoutId);
      },
      wasTimeout: () => isTimeout,
    };
  }

  /**
   * Manually combine two abort signals for older environments
   * Returns the first signal and listens to the second
   */
  private combineSignalsManually(signal1: AbortSignal, signal2: AbortSignal): AbortSignal {
    // If either is already aborted, use that one
    if (signal1.aborted) return signal1;
    if (signal2.aborted) return signal2;

    // Use a controller to create a combined signal
    const controller = new AbortController();

    const abort = () => controller.abort();
    signal1.addEventListener("abort", abort, { once: true });
    signal2.addEventListener("abort", abort, { once: true });

    return controller.signal;
  }

  /**
   * Convert fetchOptions to RequestConfig with proper typing
   */
  private createRequestConfig(url: string, fetchOptions: RequestInit): RequestConfig {
    const method = typeof fetchOptions.method === "string" ? fetchOptions.method : "GET";
    const headers = this.getHeadersRecord();
    const extendedOptions = fetchOptions as RequestInit & { priority?: RequestPriority | string };

    return {
      url,
      method,
      headers,
      body: fetchOptions.body as Body | undefined,
      signal: fetchOptions.signal || undefined,
      credentials: fetchOptions.credentials,
      mode: fetchOptions.mode,
      redirect: fetchOptions.redirect,
      referrer: fetchOptions.referrer,
      referrerPolicy: fetchOptions.referrerPolicy as ReferrerPolicy | undefined,
      keepalive: fetchOptions.keepalive,
      priority: extendedOptions.priority,
      integrity: fetchOptions.integrity,
      cache: fetchOptions.cache,
    };
  }

  /**
   * Apply interceptor results back to fetchOptions
   */
  private applyRequestConfig(config: RequestConfig, fetchOptions: RequestInit): void {
    fetchOptions.headers = config.headers;
    if (config.body !== undefined) {
      fetchOptions.body = config.body as BodyInit | null;
    }
    if (config.integrity !== undefined) {
      fetchOptions.integrity = config.integrity;
    }
    if (config.cache !== undefined) {
      fetchOptions.cache = config.cache as RequestCache;
    }
  }

  private async executeRequest(url: string, fetchOptions: RequestInit): Promise<ResponseWrapper> {
    const method = typeof fetchOptions.method === "string" ? fetchOptions.method : "GET";

    // Setup abort signal with timeout
    const abortSignal = this.createAbortSignal(this.requestOptions.timeout, this.abortController);

    try {
      // Run request interceptors before making the request
      const requestConfig = this.createRequestConfig(url, fetchOptions);
      const interceptorResult = await this.runRequestInterceptors(requestConfig);

      // If interceptor returned a Response, short-circuit and wrap it
      if (interceptorResult instanceof Response) {
        const graphQLOptions = this.getGraphQLOptions();
        const wrappedResponse = new ResponseWrapper(interceptorResult, this.url, this.method, graphQLOptions);
        return await this.runResponseInterceptors(wrappedResponse);
      }

      // Update fetchOptions with interceptor modifications
      url = interceptorResult.url;
      this.validateUrl(url);

      this.applyRequestConfig(interceptorResult, fetchOptions);

      // Set the combined abort signal
      if (abortSignal.signal) {
        fetchOptions.signal = abortSignal.signal;
      }

      // Execute fetch
      let response: Response;
      try {
        response = await fetch(url, fetchOptions);
      } catch (error) {
        const errorObj = error instanceof Error ? error : new Error(String(error));
        const errorName = errorObj.name;
        const errorMessage = errorObj.message.toLowerCase();

        // Check if this is a timeout error from our internal timeout
        const isOurTimeout = abortSignal.wasTimeout();

        // Check if it's an abort error (DOMException in browsers, or AbortSignal abort)
        if (error instanceof DOMException && error.name === "AbortError") {
          // If it was our timeout that caused the abort, throw timeout error
          if (isOurTimeout && this.requestOptions.timeout) {
            throw RequestError.timeout(url, method, this.requestOptions.timeout);
          }
          // Otherwise it's a manual abort
          throw RequestError.abortError(url, method);
        }

        // Check for Node.js/undici TimeoutError or other timeout indicators
        // This catches timeout errors that aren't thrown as AbortError
        const isTimeoutError = isOurTimeout || errorName === "TimeoutError" || errorMessage.includes("timeout") || errorMessage.includes("aborted due to timeout");

        if (isTimeoutError && this.requestOptions.timeout) {
          throw RequestError.timeout(url, method, this.requestOptions.timeout);
        }

        // For other network errors, let RequestError.networkError handle them
        // It will check for timeout patterns as a safety net (useful for external AbortControllers)
        throw RequestError.networkError(url, method, errorObj);
      }

      // Status 0 indicates the request failed before receiving a proper HTTP response
      // (e.g., CORS errors, network failures that don't throw). Treat as network error.
      if (response.status === 0) {
        throw RequestError.networkError(url, method, new Error("Failed with status 0 (network error or CORS blocked)"));
      }

      if (!response.ok) {
        throw RequestError.fromResponse(response, url, method);
      }

      const graphQLOptions = this.getGraphQLOptions();
      const wrappedResponse = new ResponseWrapper(response, url, method, graphQLOptions);
      return await this.runResponseInterceptors(wrappedResponse);
    } catch (error) {
      // Convert to RequestError if needed
      let requestError: RequestError;
      if (error instanceof RequestError) {
        requestError = error;
      } else {
        const errorObj = error instanceof Error ? error : new Error(String(error));
        requestError = RequestError.networkError(url, method, errorObj);
      }

      // Run error interceptors
      const interceptorResult = await this.runErrorInterceptors(requestError);

      // If error interceptor returned a ResponseWrapper, recover from error
      if (interceptorResult instanceof ResponseWrapper) {
        return interceptorResult;
      }

      throw interceptorResult;
    } finally {
      abortSignal.cleanup();
    }
  }
}
