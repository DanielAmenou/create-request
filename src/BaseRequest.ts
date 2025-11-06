import { type HttpMethod, RedirectMode, RequestMode, RequestPriority, ReferrerPolicy, CredentialsPolicy } from "./enums.js";
import type {
  Body,
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
    if (!url?.trim()) throw new RequestError("URL cannot be empty", url, this.method);
    if (url.includes("\0") || url.includes("\r") || url.includes("\n")) {
      throw new RequestError("Invalid URL (control chars)", url, this.method);
    }
    const trimmed = url.trim();
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      try {
        new URL(trimmed);
      } catch {
        throw new RequestError(`Invalid URL: ${trimmed}`, trimmed, this.method);
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
    // Ignore null and undefined values
    if (value !== null && value !== undefined) {
      return this.withHeaders({ [key]: value });
    }
    return this;
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
    if (!Number.isFinite(timeout) || timeout <= 0) throw new RequestError("Timeout must be a positive number", this.url, this.method);

    this.requestOptions.timeout = timeout;
    return this;
  }

  /**
   * Configure automatic retry behavior for failed requests
   *
   * @param retries - Number of retry attempts before failing
   * @returns The request instance for chaining
   * @throws RequestError if retries is not a non-negative integer
   *
   * @example
   * request.withRetries(3); // Retry up to 3 times
   */
  withRetries(retries: number): this {
    if (!Number.isInteger(retries) || retries < 0) throw new RequestError("Retry count must be a non-negative integer", this.url, this.method);
    this.requestOptions.retries = retries;
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
   * Sets credentials policy - supports both direct call and fluent API
   * @example
   * request.withCredentials("include")
   * request.withCredentials(CredentialsPolicy.INCLUDE)
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
   * Allows providing an external AbortController to cancel the request
   * @param controller - The AbortController to use for this request
   * @returns The instance for chaining
   */
  withAbortController(controller: AbortController): this {
    this.abortController = controller;
    return this;
  }

  /**
   * Sets the referrer for the request
   * @param referrer - The referrer URL or policy
   * @returns The instance for chaining
   */
  withReferrer(referrer: string): this {
    this.requestOptions.referrer = referrer;
    return this;
  }

  /**
   * Sets referrer policy - supports both direct call and fluent API
   * @example
   * request.withReferrerPolicy("no-referrer")
   * request.withReferrerPolicy(ReferrerPolicy.NO_REFERRER)
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
   * Sets redirect mode - supports both direct call and fluent API
   * @example
   * request.withRedirect("follow")
   * request.withRedirect(RedirectMode.FOLLOW)
   * request.withRedirect.FOLLOW()
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
   * Sets the keepalive flag for the request
   * @param keepalive - Whether to allow the request to outlive the page
   * @returns The instance for chaining
   */
  withKeepAlive(keepalive: boolean): this {
    this.requestOptions.keepalive = keepalive;
    return this;
  }

  /**
   * Sets request priority - supports both direct call and fluent API
   * @example
   * request.withPriority("high")
   * request.withPriority(RequestPriority.HIGH)
   * request.withPriority.HIGH()
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
   * Sets the integrity hash for subresource integrity verification
   * @param integrity - The integrity hash string (e.g., "sha256-...")
   * @returns The instance for chaining
   * @example
   * request.withIntegrity("sha256-abcdef1234567890...")
   */
  withIntegrity(integrity: string): this {
    this.requestOptions.integrity = integrity;
    return this;
  }

  /**
   * Sets cache mode - supports both direct call and fluent API
   * @example
   * request.withCache("no-cache")
   * request.withCache(CacheMode.NO_CACHE)
   * request.withCache.NO_CACHE()
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
   * Adds query parameters to the request URL
   * @param params - An object containing the query parameters
   * @returns The instance for chaining
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
   * Adds a single query parameter
   * @param key - The parameter name
   * @param value - The parameter value, can be a single value or array of values
   * @returns The instance for chaining
   */
  withQueryParam(key: string, value: string | string[] | number | boolean | null | undefined): this {
    if (value === null || value === undefined) return this;

    if (Array.isArray(value)) value.forEach(v => this.queryParams.append(key, String(v)));
    else this.queryParams.append(key, String(value));

    return this;
  }

  /**
   * Sets request mode - supports both direct call and fluent API
   * @example
   * request.withMode("cors")
   * request.withMode(RequestMode.CORS)
   * request.withMode.CORS()
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
   * Shorthand for setting the Content-Type header
   * @param contentType - The content type
   * @returns The instance for chaining
   */
  withContentType(contentType: string): this {
    return this.withHeaders({
      "Content-Type": contentType,
    });
  }

  /**
   * Shorthand for setting the Authorization header
   * @param authValue - The authorization value
   * @returns The instance for chaining
   */
  withAuthorization(authValue: string): this {
    return this.withHeaders({
      Authorization: authValue,
    });
  }

  /**
   * Shorthand for setting up Basic authentication
   * @param username - The username
   * @param password - The password
   * @returns The instance for chaining
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
    throw new RequestError("Base64 encoding is not supported", this.url, this.method);
  }

  /**
   * Sets the bearer token for authentication
   * @param token - The bearer token
   * @returns The instance for chaining
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
   * Sets cookies for the request
   * @param cookies Object containing cookie name-value pairs or cookie options
   * @returns The instance for chaining
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
   * Set a single cookie
   * @param name Cookie name
   * @param value Cookie value or options object
   * @returns The instance for chaining
   */
  withCookie(name: string, value: string | CookieOptions): this {
    return this.withCookies({ [name]: value });
  }

  /**
   * Sets a CSRF token in the request headers
   * @param token The CSRF token
   * @param headerName The name of the header to use (default: X-CSRF-Token)
   * @returns The instance for chaining
   */
  withCsrfToken(token: string, headerName = "X-CSRF-Token"): this {
    return this.withHeaders({
      [headerName]: token,
    });
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
    return this.withHeaders({
      "X-Requested-With": "XMLHttpRequest",
    });
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
   * Execute the request and get the response as text
   *
   * @returns A promise that resolves to the response text
   *
   * @example
   * const text = await request.getText();
   */
  async getText(): Promise<string> {
    const response = await this.getResponse();
    return response.getText();
  }

  /**
   * Execute the request and get the response as a Blob
   *
   * @returns A promise that resolves to the response Blob
   *
   * @example
   * const blob = await request.getBlob();
   */
  async getBlob(): Promise<Blob> {
    const response = await this.getResponse();
    return response.getBlob();
  }

  /**
   * Execute the request and get the response body as a ReadableStream
   *
   * @returns A promise that resolves to the response body stream
   *
   * @example
   * const stream = await request.getBody();
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
      this.withHeaders({
        "X-Requested-With": "XMLHttpRequest",
      });
    }

    // Apply global CSRF token if set
    const globalToken = config.getCsrfToken();
    if (globalToken) {
      const csrfHeaderName = config.getCsrfHeaderName();
      const hasLocalToken = this.hasHeader("X-CSRF-Token") || this.hasHeader(csrfHeaderName);

      if (!hasLocalToken) {
        this.withHeaders({
          [csrfHeaderName]: globalToken,
        });
      }
    }

    // Check for XSRF token in cookies and send it as a header
    if (config.isAutoXsrfEnabled() && typeof document !== "undefined") {
      const xsrfToken = CsrfUtils.getTokenFromCookie(config.getXsrfCookieName());
      if (xsrfToken && CsrfUtils.isValidToken(xsrfToken)) {
        const xsrfHeaderName = config.getXsrfHeaderName();
        const hasLocalToken = this.hasHeader("X-XSRF-TOKEN") || this.hasHeader(xsrfHeaderName);

        if (!hasLocalToken) {
          this.withHeaders({
            [xsrfHeaderName]: xsrfToken,
          });
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
    } catch (error) {
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
    const maxRetries = this.requestOptions.retries || 0;
    const method = typeof fetchOptions.method === "string" ? fetchOptions.method : "GET";

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.executeRequest(url, fetchOptions);
      } catch (error) {
        const requestError = error instanceof RequestError ? error : RequestError.networkError(url, method, error instanceof Error ? error : new Error(String(error)));

        if (attempt >= maxRetries) throw requestError;

        if (this.requestOptions.onRetry) {
          await this.requestOptions.onRetry({ attempt: attempt + 1, error: requestError });
        }
      }
    }

    // This should never happen but is needed for type safety
    throw new RequestError(`Max retries reached`, url, method);
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
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new RequestError(`Request interceptor failed: ${errorMessage}`, currentConfig.url, currentConfig.method);
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
    const allInterceptors = [...this.responseInterceptors, ...globalInterceptors.reverse()];

    let currentResponse = response;

    for (let i = 0; i < allInterceptors.length; i++) {
      try {
        currentResponse = await allInterceptors[i](currentResponse);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const url = currentResponse.url || "";
        const method = currentResponse.method || "";
        throw new RequestError(`Response interceptor failed: ${errorMessage}`, url, method);
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
    const allInterceptors = [...this.errorInterceptors, ...globalInterceptors.reverse()];

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
          const errorMessage = interceptorError instanceof Error ? interceptorError.message : String(interceptorError);
          // Always wrap in RequestError when we have context
          if (currentError instanceof RequestError) {
            currentError = new RequestError(`Error interceptor ${i + 1} failed: ${errorMessage}`, currentError.url, currentError.method, {
              status: currentError.status,
              response: currentError.response,
            });
          } else if (currentError instanceof ResponseWrapper && currentError.url && currentError.method) {
            // If it's a ResponseWrapper, we can still create a proper RequestError from its context
            currentError = new RequestError(`Error interceptor ${i + 1} failed: ${errorMessage}`, currentError.url, currentError.method, {
              status: currentError.status,
            });
          } else {
            // Last resort: if we have no context at all, use the original error's context
            // This shouldn't happen in practice, but handle it gracefully
            const errorObj = interceptorError instanceof Error ? interceptorError : new Error(String(interceptorError));
            currentError = RequestError.networkError(error.url, error.method, errorObj);
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
      fetchOptions.signal = abortSignal.signal;

      // Execute fetch
      let response: Response;
      try {
        response = await fetch(url, fetchOptions);
      } catch (error) {
        // Check if it's an abort error (DOMException in browsers, or AbortSignal abort)
        if (error instanceof DOMException && error.name === "AbortError") {
          if (abortSignal.wasTimeout()) {
            throw RequestError.timeout(url, method, this.requestOptions.timeout!);
          }
          throw RequestError.abortError(url, method);
        }

        // Check for Node.js/undici TimeoutError
        const errorObj = error instanceof Error ? error : new Error(String(error));
        const errorName = errorObj.name;
        const errorMessage = errorObj.message.toLowerCase();

        // Detect timeout errors from Node.js/undici (TimeoutError)
        const isTimeoutError = errorName === "TimeoutError" || errorMessage.includes("timeout") || errorMessage.includes("aborted due to timeout") || abortSignal.wasTimeout();

        if (isTimeoutError && this.requestOptions.timeout) {
          throw RequestError.timeout(url, method, this.requestOptions.timeout);
        }

        throw RequestError.networkError(url, method, errorObj);
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
