import { type HttpMethod, type RedirectMode, type RequestMode, type RequestPriority, CredentialsPolicy } from "./enums.js";
import type { RequestOptions, RetryCallback, CookiesRecord, CookieOptions, RequestInterceptor, ResponseInterceptor, ErrorInterceptor, RequestConfig, Body } from "./types.js";
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
      ...(this.requestOptions.headers as Record<string, string>),
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
   * @throws Error if timeout is not a positive number
   *
   * @example
   * request.withTimeout(5000); // 5 seconds timeout
   */
  withTimeout(timeout: number): this {
    if (!Number.isFinite(timeout) || timeout <= 0) throw new Error("Timeout must be a positive number");

    this.requestOptions.timeout = timeout;
    return this;
  }

  /**
   * Configure automatic retry behavior for failed requests
   *
   * @param retries - Number of retry attempts before failing
   * @returns The request instance for chaining
   * @throws Error if retries is not a non-negative integer
   *
   * @example
   * request.withRetries(3); // Retry up to 3 times
   */
  withRetries(retries: number): this {
    if (!Number.isInteger(retries) || retries < 0) throw new Error("Retry count must be a non-negative integer");
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
   * Sets the credentials policy for the request
   * @param credentialsPolicy - Can be 'omit', 'same-origin', or 'include'
   * @returns The instance for chaining
   */
  withCredentials(credentialsPolicy: CredentialsPolicy = CredentialsPolicy.SAME_ORIGIN): this {
    this.requestOptions.credentials = credentialsPolicy;
    return this;
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
   * Sets the referrer policy for the request
   * @param policy - The referrer policy to use
   * @returns The instance for chaining
   */
  withReferrerPolicy(policy: ReferrerPolicy): this {
    this.requestOptions.referrerPolicy = policy;
    return this;
  }

  /**
   * Sets the redirect policy for the request
   * @param redirect - Can be 'follow', 'error', or 'manual'
   * @returns The instance for chaining
   */
  withRedirect(redirect: RedirectMode): this {
    this.requestOptions.redirect = redirect;
    return this;
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
   * Sets the priority of the request
   * @param priority - Can be 'high', 'low', or 'auto'
   * @returns The instance for chaining
   */
  withPriority(priority: RequestPriority): this {
    this.requestOptions.priority = priority as RequestPriority;
    return this;
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
   * Sets the mode of the request
   * @param mode - The mode for the request (cors, no-cors, same-origin, navigate)
   * @returns The instance for chaining
   */
  withMode(mode: RequestMode): this {
    this.requestOptions.mode = mode as RequestMode;
    return this;
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
    throw new Error("Base64 encoding is not supported");
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
   * Helper function to check for header presence in a case-insensitive way
   * @param headers Headers object
   * @param headerName Header name to check
   * @returns Boolean indicating if the header exists (case-insensitive)
   */
  private hasHeader(headers: Record<string, string>, headerName: string): boolean {
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

    // Get current headers or initialize empty object
    const currentHeaders = (this.requestOptions.headers as Record<string, string>) || {};

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
   * const response = await request.get();
   * console.log(response.status);
   */
  async get(): Promise<ResponseWrapper> {
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
   *
   * @example
   * const users = await request.getJson<User[]>();
   */
  async getJson<T = unknown>(): Promise<T> {
    const response = await this.get();
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
    const response = await this.get();
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
    const response = await this.get();
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
    const response = await this.get();
    return response.getBody();
  }

  /**
   * Execute the request and extract specific data using a selector function
   * If no selector is provided, returns the full JSON response.
   *
   * @param selector - Optional function to extract and transform data
   * @returns A promise that resolves to the selected data
   *
   * @example
   * // Get full response
   * const data = await request.getData();
   *
   * // Extract specific data
   * const users = await request.getData(data => data.results.users);
   */
  async getData<T = unknown, R = T>(selector?: (data: T) => R): Promise<T | R> {
    try {
      const data = await this.getJson<T>();

      // If no selector is provided, return the raw JSON data
      if (!selector) return data;

      // Apply the selector if provided
      return selector(data);
    } catch (error) {
      // If it's already a RequestError, re-throw it
      if (error instanceof RequestError) {
        throw error;
      }

      // Enhance selector errors with context
      if (selector) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new RequestError(`Data selector failed: ${errorMessage}`, this.url, this.method);
      }

      // If we get here and it's not a RequestError, wrap it
      // This should rarely happen as ResponseWrapper methods should throw RequestError
      const errorObj = error instanceof Error ? error : new Error(String(error));
      throw RequestError.networkError(this.url, this.method, errorObj);
    }
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
      const headers = this.requestOptions.headers as Record<string, string>;
      const csrfHeaderName = config.getCsrfHeaderName();
      const hasLocalToken = this.hasHeader(headers, "X-CSRF-Token") || this.hasHeader(headers, csrfHeaderName);

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
        const headers = this.requestOptions.headers as Record<string, string>;
        const xsrfHeaderName = config.getXsrfHeaderName();
        const hasLocalToken = this.hasHeader(headers, "X-XSRF-TOKEN") || this.hasHeader(headers, xsrfHeaderName);

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
    if (!this.queryParams.toString()) {
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
      return `${url}${separator}${this.queryParams.toString()}`;
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
        // Use RequestError when we have request context
        throw new RequestError(`Interceptor failed: ${errorMessage}`, currentConfig.url, currentConfig.method);
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
        // Use RequestError when we have response context (url/method from ResponseWrapper)
        if (currentResponse.url && currentResponse.method) {
          throw new RequestError(`Interceptor failed: ${errorMessage}`, currentResponse.url, currentResponse.method);
        }
        // Fallback to generic Error if no context available (shouldn't happen in practice)
        throw new Error(`Interceptor failed: ${errorMessage}`);
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
            currentError = new RequestError(`Error interceptor ${i + 1} failed: ${errorMessage}`, currentError.url, currentError.method);
          } else if (currentError instanceof ResponseWrapper && currentError.url && currentError.method) {
            // If it's a ResponseWrapper, we can still create a proper RequestError from its context
            currentError = new RequestError(`Error interceptor ${i + 1} failed: ${errorMessage}`, currentError.url, currentError.method);
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

  private async executeRequest(url: string, fetchOptions: RequestInit): Promise<ResponseWrapper> {
    // Track resources that need cleanup
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let timeoutController: AbortController | undefined;
    let abortListener: (() => void) | undefined;

    // Flag to track if abort was caused by our timeout
    let abortedByTimeout = false;

    // Extract method early for error handling
    const method = typeof fetchOptions.method === "string" ? fetchOptions.method : "GET";

    try {
      // Run request interceptors before making the request
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const extendedFetchOptions = fetchOptions as RequestInit & { priority?: RequestPriority | string };
      const requestConfig: RequestConfig = {
        url,
        method,
        headers: (fetchOptions.headers as Record<string, string>) || {},
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        body: fetchOptions.body as Body | undefined,
        signal: fetchOptions.signal || undefined,
        credentials: fetchOptions.credentials,
        mode: fetchOptions.mode,
        redirect: fetchOptions.redirect,
        referrer: fetchOptions.referrer,
        referrerPolicy: fetchOptions.referrerPolicy,
        keepalive: fetchOptions.keepalive,
        priority: extendedFetchOptions.priority,
      };

      const interceptorResult = await this.runRequestInterceptors(requestConfig);

      // If interceptor returned a Response, short-circuit and wrap it
      if (interceptorResult instanceof Response) {
        const wrappedResponse = new ResponseWrapper(interceptorResult, this.url, this.method);
        // Still run response interceptors
        return await this.runResponseInterceptors(wrappedResponse);
      }

      // Update fetchOptions with interceptor modifications
      url = interceptorResult.url;

      // Validate the final URL after interceptors may have modified it
      this.validateUrl(url);

      fetchOptions.headers = interceptorResult.headers;
      if (interceptorResult.body !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        fetchOptions.body = interceptorResult.body as BodyInit | null;
      }
      // Determine which signal to use for the fetch request
      let finalSignal: AbortSignal | undefined;

      if (this.requestOptions.timeout) {
        if (this.abortController) {
          // External controller provided - need to combine signals

          // Use AbortSignal.any() if available
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
          if (typeof (AbortSignal as { any?: (signals: AbortSignal[]) => AbortSignal }).any === "function") {
            timeoutController = new AbortController();
            timeoutId = setTimeout(() => {
              abortedByTimeout = true;
              timeoutController!.abort();
            }, this.requestOptions.timeout);

            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            finalSignal = (AbortSignal as unknown as { any: (signals: AbortSignal[]) => AbortSignal }).any([this.abortController.signal, timeoutController.signal]);
          }
          // Fallback: use AbortSignal.timeout if available
          else if (typeof AbortSignal.timeout === "function") {
            const timeoutSignal = AbortSignal.timeout(this.requestOptions.timeout);

            // Listen for timeout abort
            abortListener = () => {
              if (!this.abortController!.signal.aborted) {
                abortedByTimeout = true;
              }
            };
            timeoutSignal.addEventListener("abort", abortListener, { once: true });

            // Manually combine signals
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            if (typeof (AbortSignal as { any?: (signals: AbortSignal[]) => AbortSignal }).any === "function") {
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
              finalSignal = (AbortSignal as unknown as { any: (signals: AbortSignal[]) => AbortSignal }).any([this.abortController.signal, timeoutSignal]);
            } else {
              // Final fallback: propagate timeout abort to external controller
              timeoutController = new AbortController();
              timeoutId = setTimeout(() => {
                abortedByTimeout = true;
                timeoutController!.abort();
              }, this.requestOptions.timeout);

              finalSignal = timeoutController.signal;

              // Also listen to external controller
              const externalAbortListener = () => {
                if (!timeoutController!.signal.aborted) {
                  timeoutController!.abort();
                }
              };
              this.abortController.signal.addEventListener("abort", externalAbortListener, { once: true });
            }
          }
          // Last resort fallback for older environments
          else {
            timeoutController = new AbortController();
            timeoutId = setTimeout(() => {
              abortedByTimeout = true;
              timeoutController!.abort();
            }, this.requestOptions.timeout);

            finalSignal = timeoutController.signal;

            // Propagate external abort to timeout controller
            const externalAbortListener = () => {
              if (!timeoutController!.signal.aborted) {
                timeoutController!.abort();
              }
            };
            this.abortController.signal.addEventListener("abort", externalAbortListener, { once: true });
          }
        } else {
          // No external controller - simple timeout case
          if (typeof AbortSignal.timeout === "function") {
            const timeoutSignal = AbortSignal.timeout(this.requestOptions.timeout);
            abortListener = () => {
              abortedByTimeout = true;
            };
            timeoutSignal.addEventListener("abort", abortListener, { once: true });
            finalSignal = timeoutSignal;
          } else {
            timeoutController = new AbortController();
            timeoutId = setTimeout(() => {
              abortedByTimeout = true;
              timeoutController!.abort();
            }, this.requestOptions.timeout);
            finalSignal = timeoutController.signal;
          }
        }
      } else {
        // No timeout - just use external controller if provided
        finalSignal = this.abortController?.signal;
      }

      // Set the final signal
      fetchOptions.signal = finalSignal;

      let response: Response;

      try {
        response = await fetch(url, fetchOptions);
      } catch (error) {
        // Check if this is an abort error that was specifically caused by our timeout
        if (error instanceof DOMException && error.name === "AbortError" && abortedByTimeout) {
          throw RequestError.timeout(url, method, this.requestOptions.timeout!);
        }

        // Check if this is a user-triggered abort (not timeout)
        if (error instanceof DOMException && error.name === "AbortError" && !abortedByTimeout) {
          throw RequestError.abortError(url, method);
        }

        // Otherwise it's a network error
        const errorObj = error instanceof Error ? error : new Error(String(error));
        throw RequestError.networkError(url, method, errorObj);
      }

      if (!response.ok) {
        throw RequestError.fromResponse(response, url, method);
      }

      // Return a wrapped response and run response interceptors
      const wrappedResponse = new ResponseWrapper(response, url, method);
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

      // Otherwise throw the (possibly modified) error
      throw interceptorResult;
    } finally {
      // Cleanup: clear timeout and remove all event listeners
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
      // Note: Event listeners with { once: true } are automatically removed after firing
      // Controllers are garbage collected when no longer referenced
    }
  }
}
