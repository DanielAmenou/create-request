import { GetRequest, PostRequest, PutRequest, DeleteRequest, PatchRequest, HeadRequest, OptionsRequest } from "./requestMethods.js";
import type { BaseRequest } from "./BaseRequest.js";
import type { RetryConfig, RetryCallback, CookiesRecord, CookieOptions, RequestInterceptor, ResponseInterceptor, ErrorInterceptor } from "./types.js";
import type { CredentialsPolicy, RedirectMode, RequestPriority, ReferrerPolicy, RequestMode } from "./enums.js";

/**
 * API Builder for creating configured API instances with reusable default settings.
 */
type ApiBuilder = {
  withBaseURL(baseURL: string): ApiBuilder;
  get(path: string): GetRequest;
  post(path: string): PostRequest;
  put(path: string): PutRequest;
  del(path: string): DeleteRequest;
  patch(path: string): PatchRequest;
  head(path: string): HeadRequest;
  options(path: string): OptionsRequest;

  /**
   * Add multiple HTTP headers to the request.
   * Null and undefined header values are ignored.
   *
   * @param headers - An object containing key-value pairs of headers
   * @returns The API builder instance for chaining
   *
   * @example
   * ```typescript
   * api.withHeaders({
   *   'Content-Type': 'application/json',
   *   'Authorization': 'Bearer token123'
   * });
   * ```
   */
  withHeaders(headers: Record<string, string>): ApiBuilder;

  /**
   * Add a single HTTP header to the request.
   *
   * @param name - The header name
   * @param value - The header value
   * @returns The API builder instance for chaining
   *
   * @example
   * ```typescript
   * api.withHeader('Content-Type', 'application/json');
   * ```
   */
  withHeader(name: string, value: string): ApiBuilder;

  /**
   * Set a timeout for the request.
   * If the request takes longer than the specified time, it will be aborted and a RequestError will be thrown.
   *
   * @param timeout - The timeout in milliseconds (must be a positive finite number)
   * @returns The API builder instance for chaining
   * @throws {RequestError} If timeout is not a positive finite number
   *
   * @example
   * ```typescript
   * api.withTimeout(5000); // 5 second timeout
   * ```
   */
  withTimeout(timeout: number): ApiBuilder;

  /**
   * Configure automatic retry behavior for failed requests.
   * By default, retries only network errors. For more control, pass a RetryConfig object.
   *
   * @param retries - Either:
   *   - A number: number of retry attempts (fixed delay of 1000ms between retries)
   *   - A RetryConfig object with optional properties:
   *     - maxRetries: number of retry attempts
   *     - delay: a function (attempt, error?) => number that returns delay in ms
   *     - retryOn: array of status codes to retry on (in addition to network errors)
   *     - shouldRetry: custom function to decide if a retry should happen
   * @returns The API builder instance for chaining
   *
   * @example
   * ```typescript
   * // Simple retry with fixed delay
   * api.withRetries(3);
   * ```
   *
   * @example
   * ```typescript
   * // Exponential backoff
   * api.withRetries({
   *   maxRetries: 3,
   *   delay: (attempt) => Math.pow(2, attempt) * 1000
   * });
   * ```
   *
   * @example
   * ```typescript
   * // Retry specific status codes
   * api.withRetries({
   *   maxRetries: 2,
   *   retryOn: [408, 429, 500, 502, 503, 504]
   * });
   * ```
   *
   * @example
   * ```typescript
   * // Custom retry logic with error-aware delay
   * api.withRetries({
   *   maxRetries: 3,
   *   delay: (attempt, error) => {
   *     if (error?.status === 429) return 5000; // Rate limited
   *     return attempt * 1000; // Linear backoff
   *   },
   *   shouldRetry: (error) => error.status === 429 || error.status >= 500
   * });
   * ```
   */
  withRetries(retries: number | RetryConfig): ApiBuilder;

  /**
   * Register a callback to be invoked before each retry attempt.
   * The callback receives the attempt number (1-indexed), the error that caused the retry,
   * and the delay before the next retry.
   *
   * @param callback - A function that receives (attempt: number, error: RequestError, delay: number)
   * @returns The API builder instance for chaining
   *
   * @example
   * ```typescript
   * api.onRetry((attempt, error, delay) => {
   *   console.log(`Retry attempt ${attempt} after ${delay}ms due to:`, error.message);
   * });
   * ```
   */
  onRetry(callback: RetryCallback): ApiBuilder;

  /**
   * Set the credentials policy for the request.
   * Controls whether cookies and HTTP authentication are sent with cross-origin requests.
   *
   * - `include`: Send credentials with both same-origin and cross-origin requests
   * - `omit`: Never send credentials
   * - `same-origin` (default): Only send credentials with same-origin requests
   *
   * Note: Use direct call pattern. Fluent API (e.g., `.withCredentials.INCLUDE()`) is not supported in ApiBuilder.
   *
   * @param credentials - The credentials policy
   * @returns The API builder instance for chaining
   *
   * @example
   * ```typescript
   * api.withCredentials('include'); // Send cookies with cross-origin requests
   * api.withCredentials(CredentialsPolicy.INCLUDE);
   * ```
   */
  withCredentials(credentials: CredentialsPolicy): ApiBuilder;

  /**
   * Set the referrer URL for the request.
   * This specifies the referrer to send in the Referer header.
   *
   * @param referrer - The referrer URL
   * @returns The API builder instance for chaining
   *
   * @example
   * ```typescript
   * api.withReferrer('https://example.com/page');
   * ```
   */
  withReferrer(referrer: string): ApiBuilder;

  /**
   * Set the referrer policy for the request.
   * Controls how much referrer information is included with requests.
   *
   * Available policies:
   * - `no-referrer`: Never send referrer
   * - `no-referrer-when-downgrade` (default): Send referrer except when going from HTTPS to HTTP
   * - `origin`: Send only the origin (scheme, host, port)
   * - `origin-when-cross-origin`: Full URL for same-origin, only origin for cross-origin
   * - `same-origin`: Send referrer only for same-origin requests
   * - `strict-origin`: Send origin, but not when going from HTTPS to HTTP
   * - `strict-origin-when-cross-origin`: Full URL for same-origin, origin for cross-origin HTTPS, nothing for HTTP
   * - `unsafe-url`: Always send full URL (may leak sensitive information)
   *
   * @param policy - The referrer policy
   * @returns The API builder instance for chaining
   *
   * @example
   * ```typescript
   * api.withReferrerPolicy('no-referrer');
   * api.withReferrerPolicy(ReferrerPolicy.NO_REFERRER); // Using enum
   * ```
   */
  withReferrerPolicy(policy: ReferrerPolicy): ApiBuilder;

  /**
   * Set the redirect behavior for the request.
   *
   * - `follow` (default): Automatically follow redirects
   * - `error`: Treat redirects as errors
   * - `manual`: Handle redirects manually (response will have type 'opaqueredirect')
   *
   * @param redirect - The redirect mode
   * @returns The API builder instance for chaining
   *
   * @example
   * ```typescript
   * api.withRedirect('error'); // Throw an error on redirect
   * api.withRedirect(RedirectMode.ERROR); // Using enum
   * ```
   */
  withRedirect(redirect: RedirectMode): ApiBuilder;

  /**
   * Enable or disable HTTP keep-alive for the request.
   * When enabled, the connection can be reused for multiple requests.
   *
   * @param keepalive - Whether to use keep-alive (default is false)
   * @returns The API builder instance for chaining
   *
   * @example
   * ```typescript
   * api.withKeepAlive(true);
   * ```
   */
  withKeepAlive(keepalive: boolean): ApiBuilder;

  /**
   * Set the priority hint for the request.
   * This provides a hint to the browser about the relative priority of this request.
   *
   * - `high`: High priority (e.g., critical resources)
   * - `low`: Low priority (e.g., prefetch, background tasks)
   * - `auto` (default): Browser decides the priority
   *
   * @param priority - The request priority
   * @returns The API builder instance for chaining
   *
   * @example
   * ```typescript
   * api.withPriority('high'); // Mark as high priority
   * api.withPriority(RequestPriority.HIGH); // Using enum
   * ```
   */
  withPriority(priority: RequestPriority): ApiBuilder;

  /**
   * Set the Subresource Integrity (SRI) value for the request.
   * Used to verify that a fetched resource hasn't been tampered with.
   *
   * @param integrity - The integrity hash (e.g., 'sha384-...')
   * @returns The API builder instance for chaining
   *
   * @example
   * ```typescript
   * api.withIntegrity('sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8wC');
   * ```
   */
  withIntegrity(integrity: string): ApiBuilder;

  /**
   * Set the cache mode for the request.
   * Controls how the request interacts with the browser's HTTP cache.
   *
   * Cache modes:
   * - `default`: Use the standard HTTP cache behavior (check freshness, use cached response if valid)
   * - `no-store`: Bypass cache completely, don't store the response
   * - `reload`: Bypass cache for this request, but store the response
   * - `no-cache`: Use cached response only after revalidation with the server
   * - `force-cache`: Use cached response even if stale, only fetch if not cached
   * - `only-if-cached`: Use cached response or fail (must use with same-origin mode)
   *
   * @param cache - The cache mode
   * @returns The API builder instance for chaining
   *
   * @example
   * ```typescript
   * api.withCache('no-store'); // Don't cache this request
   * api.withCache('force-cache'); // Use cache even if stale
   * ```
   */
  withCache(cache: RequestCache): ApiBuilder;

  /**
   * Set the request mode.
   * Controls CORS behavior and what types of responses are allowed.
   *
   * Request modes:
   * - `cors` (default): Allow cross-origin requests, follow CORS protocol
   * - `no-cors`: Make cross-origin request without CORS headers (limited response access)
   * - `same-origin`: Only allow same-origin requests, reject cross-origin
   * - `navigate`: Used for navigation requests (usually not needed for fetch)
   *
   * @param mode - The request mode
   * @returns The API builder instance for chaining
   *
   * @example
   * ```typescript
   * api.withMode('same-origin'); // Only allow same-origin requests
   * api.withMode(RequestMode.SAME_ORIGIN); // Using enum
   * ```
   */
  withMode(mode: RequestMode): ApiBuilder;

  /**
   * Sets the Content-Type header for the request.
   * Shorthand for `withHeader('Content-Type', contentType)`.
   *
   * @param contentType - The MIME type (e.g., 'application/json', 'text/plain', 'application/xml')
   * @returns The API builder instance for chaining
   *
   * @example
   * ```typescript
   * api.withContentType('application/json');
   * ```
   *
   * @example
   * ```typescript
   * api.withContentType('application/xml');
   * ```
   */
  withContentType(contentType: string): ApiBuilder;

  /**
   * Sets the Authorization header for the request.
   * Shorthand for `withHeader('Authorization', authValue)`.
   * For Bearer tokens, use `withBearerToken()` instead. For Basic auth, use `withBasicAuth()`.
   *
   * @param authValue - The full authorization header value (e.g., `'Bearer token123'`, `'Basic base64string'`)
   * @returns The API builder instance for chaining
   *
   * @example
   * ```typescript
   * api.withAuthorization('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...');
   * ```
   *
   * @example
   * ```typescript
   * api.withAuthorization('CustomScheme customToken');
   * ```
   */
  withAuthorization(authValue: string): ApiBuilder;

  /**
   * Sets up HTTP Basic Authentication.
   * Encodes the username and password in base64 and sets the Authorization header.
   *
   * @param username - The username for Basic authentication
   * @param password - The password for Basic authentication
   * @returns The API builder instance for chaining
   *
   * @example
   * ```typescript
   * api.withBasicAuth('myuser', 'mypassword');
   * // Sets: Authorization: Basic bXl1c2VyOm15cGFzc3dvcmQ=
   * ```
   */
  withBasicAuth(username: string, password: string): ApiBuilder;

  /**
   * Sets a Bearer token for authentication.
   * Shorthand for `withAuthorization('Bearer ' + token)`.
   *
   * @param token - The Bearer token (JWT, OAuth token, etc.)
   * @returns The API builder instance for chaining
   *
   * @example
   * ```typescript
   * api.withBearerToken('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...');
   * // Sets: Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   * ```
   */
  withBearerToken(token: string): ApiBuilder;

  /**
   * Sets cookies for the request.
   * Cookies are sent in the Cookie header. Multiple calls will merge cookies.
   * Cookie values can be simple strings or objects with additional cookie options.
   *
   * @param cookies - An object where keys are cookie names and values are either:
   *   - A string (the cookie value)
   *   - A CookieOptions object with `value` and optional properties (secure, httpOnly, sameSite, expires, path, domain, maxAge)
   * @returns The API builder instance for chaining
   *
   * @example
   * ```typescript
   * // Simple string cookies
   * api.withCookies({ sessionId: 'abc123', userId: '456' });
   * ```
   *
   * @example
   * ```typescript
   * // Cookies with options (note: options are for documentation only in request cookies)
   * api.withCookies({
   *   sessionId: 'abc123',
   *   token: { value: 'xyz789', secure: true }
   * });
   * ```
   */
  withCookies(cookies: CookiesRecord): ApiBuilder;

  /**
   * Sets a single cookie for the request.
   * Convenience method for adding one cookie at a time.
   *
   * @param name - The cookie name
   * @param value - The cookie value as a string, or a CookieOptions object with `value` and optional properties
   * @returns The API builder instance for chaining
   *
   * @example
   * ```typescript
   * api.withCookie('sessionId', 'abc123');
   * ```
   *
   * @example
   * ```typescript
   * api.withCookie('token', { value: 'xyz789', secure: true });
   * ```
   */
  withCookie(name: string, value: string | CookieOptions): ApiBuilder;

  /**
   * Sets a CSRF (Cross-Site Request Forgery) token in the request headers.
   * This is commonly used to protect against CSRF attacks in web applications.
   *
   * @param token - The CSRF token value
   * @param headerName - The name of the header to use. Defaults to `'X-CSRF-Token'`.
   * @returns The API builder instance for chaining
   *
   * @example
   * ```typescript
   * api.withCsrfToken('csrf-token-123');
   * // Sets: X-CSRF-Token: csrf-token-123
   * ```
   *
   * @example
   * ```typescript
   * api.withCsrfToken('token', 'X-Custom-CSRF-Header');
   * // Sets: X-Custom-CSRF-Header: token
   * ```
   */
  withCsrfToken(token: string, headerName?: string): ApiBuilder;

  /**
   * Disables automatic anti-CSRF protection.
   * By default, X-Requested-With: XMLHttpRequest header is sent with all requests.
   * @returns The API builder instance for chaining
   */
  withoutCsrfProtection(): ApiBuilder;

  /**
   * Sets common security headers to help prevent CSRF attacks
   * @returns The API builder instance for chaining
   */
  withAntiCsrfHeaders(): ApiBuilder;

  /**
   * Add a request interceptor for this specific request
   * Request interceptors can modify the request configuration or return an early response
   *
   * @param interceptor - The request interceptor function
   * @returns The API builder instance for chaining
   *
   * @example
   * api.withRequestInterceptor((config) => {
   *   config.headers['X-Custom'] = 'value';
   *   return config;
   * });
   */
  withRequestInterceptor(interceptor: RequestInterceptor): ApiBuilder;

  /**
   * Add a response interceptor for this specific request
   * Response interceptors can transform the response
   *
   * @param interceptor - The response interceptor function
   * @returns The API builder instance for chaining
   *
   * @example
   * api.withResponseInterceptor((response) => {
   *   console.log('Status:', response.status);
   *   return response;
   * });
   */
  withResponseInterceptor(interceptor: ResponseInterceptor): ApiBuilder;

  /**
   * Add an error interceptor for this specific request
   * Error interceptors can handle or transform errors
   *
   * @param interceptor - The error interceptor function
   * @returns The API builder instance for chaining
   *
   * @example
   * api.withErrorInterceptor((error) => {
   *   console.error('Request failed:', error);
   *   throw error;
   * });
   */
  withErrorInterceptor(interceptor: ErrorInterceptor): ApiBuilder;

  /**
   * Adds default query parameters to all requests made through this API instance.
   *
   * @param params - An object containing query parameter key-value pairs
   * @returns The API builder instance for chaining
   *
   * @example
   * ```typescript
   * const api = createApi()
   *   .withBaseURL('https://api.example.com')
   *   .withQueryParams({ apiVersion: 'v2', format: 'json' });
   * // All requests will include ?apiVersion=v2&format=json
   * ```
   */
  withQueryParams(params: Record<string, string | string[] | number | boolean | null | undefined>): ApiBuilder;

  /**
   * Adds a single default query parameter to all requests made through this API instance.
   *
   * @param key - The query parameter name
   * @param value - The query parameter value
   * @returns The API builder instance for chaining
   *
   * @example
   * ```typescript
   * const api = createApi()
   *   .withBaseURL('https://api.example.com')
   *   .withQueryParam('apiKey', 'abc123');
   * ```
   */
  withQueryParam(key: string, value: string | string[] | number | boolean | null | undefined): ApiBuilder;
};

/**
 * Internal API builder implementation.
 */
class ApiBuilderImpl {
  private baseURL?: string;
  private modifiers: Array<(request: BaseRequest) => void> = [];
  private proxy?: ApiBuilder;

  withBaseURL(baseURL: string): ApiBuilder {
    this.baseURL = baseURL;
    return this.getProxy();
  }

  private resolveURL(url?: string): string {
    if (!url) return this.baseURL || "";
    if (/^https?:\/\//.test(url)) return url;
    if (!this.baseURL) return url;
    return this.baseURL.replace(/\/$/, "") + (url[0] === "/" ? url : "/" + url);
  }

  private applyModifiers(request: BaseRequest): void {
    if (this.modifiers) for (const modifier of this.modifiers) modifier(request);
  }

  get(url?: string): GetRequest {
    const request = new GetRequest(this.resolveURL(url));
    this.applyModifiers(request);
    return request;
  }

  post(url?: string): PostRequest {
    const request = new PostRequest(this.resolveURL(url));
    this.applyModifiers(request);
    return request;
  }

  put(url?: string): PutRequest {
    const request = new PutRequest(this.resolveURL(url));
    this.applyModifiers(request);
    return request;
  }

  del(url?: string): DeleteRequest {
    const request = new DeleteRequest(this.resolveURL(url));
    this.applyModifiers(request);
    return request;
  }

  patch(url?: string): PatchRequest {
    const request = new PatchRequest(this.resolveURL(url));
    this.applyModifiers(request);
    return request;
  }

  head(url?: string): HeadRequest {
    const request = new HeadRequest(this.resolveURL(url));
    this.applyModifiers(request);
    return request;
  }

  options(url?: string): OptionsRequest {
    const request = new OptionsRequest(this.resolveURL(url));
    this.applyModifiers(request);
    return request;
  }

  private addModifier(modifier: (request: BaseRequest) => void): ApiBuilder {
    this.modifiers.push(modifier);
    return this.getProxy();
  }

  private getProxy(): ApiBuilder {
    if (!this.proxy) {
      this.proxy = this.createProxy();
    }
    return this.proxy;
  }

  private createProxy(): ApiBuilder {
    const disallowedMethods = new Set(["withBody", "withGraphQL", "withAbortController"]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return
    return new Proxy(this as any, {
      get(target: unknown, prop: string | symbol): unknown {
        const implTarget = target as ApiBuilderImpl;

        // Return undefined for disallowed methods
        if (typeof prop === "string" && disallowedMethods.has(prop)) {
          return undefined;
        }

        // Check if it's an HTTP method - these should be called directly
        if (prop === "get" || prop === "post" || prop === "put" || prop === "del" || prop === "patch" || prop === "head" || prop === "options") {
          return implTarget[prop].bind(implTarget);
        }

        // Check if it's a configuration method that already exists
        if (prop === "withBaseURL") {
          return implTarget[prop].bind(implTarget);
        }

        // Check if the property exists on BaseRequest prototype
        // If it's a 'with...' method or other chainable method, create a modifier for it
        if (typeof prop === "string" && (prop.startsWith("with") || prop === "onRetry")) {
          return (...args: unknown[]) => {
            return implTarget.addModifier((request: BaseRequest) => {
              const method = (request as unknown as Record<string, unknown>)[prop];
              if (typeof method === "function") {
                (method as (...args: unknown[]) => unknown).apply(request, args);
              }
            });
          };
        }

        // For other properties, return them directly if they exist
        const targetValue = (implTarget as unknown as Record<string, unknown>)[prop as string];
        return targetValue;
      },
    });
  }

  static create(): ApiBuilder {
    return new ApiBuilderImpl().getProxy();
  }
}

/**
 * Creates a new API builder for configuring default request settings.
 * The API builder allows you to set up a base URL, default headers, timeout,
 * and other configuration options that will be applied to all requests made through it.
 *
 * @returns A new API builder instance
 *
 * @example
 * ```typescript
 * // Create an API instance with defaults
 * const api = api()
 *   .withBaseURL('https://api.example.com')
 *   .withBearerToken('token123')
 *   .withTimeout(5000);
 *
 * // All requests will use these defaults
 * const users = await api.get('/users').getJson();
 * const newUser = await api.post('/users').withBody({ name: 'John' }).getJson();
 * ```
 *
 * @example
 * ```typescript
 * // Use without URL when baseURL is set
 * const api = api().withBaseURL('https://api.example.com');
 * const data = await api.get().getJson(); // Requests to https://api.example.com
 * ```
 *
 * @example
 * ```typescript
 * // Override defaults per request
 * const api = api()
 *   .withBaseURL('https://api.example.com')
 *   .withTimeout(5000);
 *
 * // This request uses a longer timeout
 * await api.get('/slow-endpoint').withTimeout(30000).getJson();
 * ```
 */
export function api(): ApiBuilder {
  return ApiBuilderImpl.create();
}
