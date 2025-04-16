import { type HttpMethod, type RedirectMode, type RequestMode, type RequestPriority, CredentialsPolicy } from "./enums.js";
import type { RequestOptions, RetryCallback, CookiesRecord, CookieOptions } from "./types.js";
import { type ResponsePromise, ResponseWrapper } from "./ResponseWrapper.js";
import type { CacheOptions } from "./types/cache.js";
import { CacheManager } from "./utils/CacheManager.js";
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
  protected requestOptions: RequestOptions = {
    headers: {},
  };
  protected abortController?: AbortController;
  protected queryParams: URLSearchParams = new URLSearchParams();
  protected autoApplyCsrfProtection: boolean = true;
  protected cacheManager?: CacheManager;
  protected cacheEnabled = false;

  constructor() {}

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
    this.requestOptions.headers = {
      ...(this.requestOptions.headers as Record<string, string>),
      ...headers,
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
   * Configure request caching behavior
   * When enabled, responses will be cached and reused for subsequent identical requests.
   *
   * @param options - Cache configuration options
   * @returns The request instance for chaining
   *
   * @example
   * request.withCache({
   *   ttl: 60000, // Cache for 1 minute
   *   maxEntries: 100,
   *   storage: localStorage
   * });
   */
  withCache(options: CacheOptions = {}): this {
    this.cacheEnabled = true;
    this.cacheManager = new CacheManager(options);
    return this;
  }

  /**
   * Send the request to the specified URL
   * This is the final method in the chain that executes the request.
   *
   * @param url - The URL to send the request to
   * @returns A promise with additional methods for processing the response
   *
   * @example
   * const response = await request.sendTo('/api/users');
   * const data = await response.getJson();
   */
  sendTo(url: string): ResponsePromise {
    // Format the URL with query parameters
    url = this.formatUrlWithQueryParams(url);

    // Apply automatic CSRF protection if enabled
    if (this.autoApplyCsrfProtection) {
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
        // Check if local token exists using case-insensitive comparison
        const headers = this.requestOptions.headers as Record<string, string>;
        const csrfHeaderName = config.getCsrfHeaderName();
        const hasLocalToken = this.hasHeader(headers, "X-CSRF-Token") || this.hasHeader(headers, csrfHeaderName);

        if (!hasLocalToken) {
          this.withHeaders({
            [csrfHeaderName]: globalToken,
          });
        }
      }

      // check for XSRF token in cookies and send it as a header
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

    // Cast the request options to RequestInit to ensure compatibility
    const fetchOptions: RequestInit = {
      ...(this.requestOptions as RequestInit),
      method: this.method,
    };

    // Create the base promise - handle caching if enabled
    let basePromise: Promise<ResponseWrapper>;

    if (this.cacheEnabled && this.cacheManager) {
      const cacheKey = this.cacheManager.generateKey(url, this.method, this.requestOptions.headers as Record<string, string>, this.requestOptions.body);

      basePromise = this.executeWithCache(url, fetchOptions, cacheKey);
    } else {
      basePromise = !this.requestOptions.retries ? this.executeRequest(url, fetchOptions) : this.executeWithRetries(url, fetchOptions);
    }

    const responsePromise = basePromise as ResponsePromise;

    // Attach convenience methods that begin processing immediately
    responsePromise.getJson = async <T = unknown>(): Promise<T> => {
      return basePromise.then(response => response.getJson<T>());
    };

    responsePromise.getText = async (): Promise<string> => {
      return basePromise.then(response => response.getText());
    };

    responsePromise.getBlob = async (): Promise<Blob> => {
      return basePromise.then(response => response.getBlob());
    };

    responsePromise.getArrayBuffer = async (): Promise<ArrayBuffer> => {
      return basePromise.then(response => response.getArrayBuffer());
    };

    responsePromise.getBody = async (): Promise<ReadableStream<Uint8Array> | null> => {
      return basePromise.then(response => response.getBody());
    };

    responsePromise.getData = async <T = unknown, R = T>(selector?: (data: T) => R): Promise<T | R> => {
      try {
        const data = await basePromise.then(response => response.getJson<T>());

        // If no selector is provided, return the raw JSON data
        if (!selector) return data;

        // Apply the selector if provided
        return selector(data);
      } catch (error) {
        // Always enhance the error with the original data
        const errorMessage = error instanceof Error ? error.message : String(error);
        const enhancedError = new Error(`Data selector failed: ${errorMessage}. Original data: ${JSON.stringify(await basePromise.then(response => response.getJson()), null, 2)}`);

        // Preserve the stack trace if available
        if (error instanceof Error && error.stack) {
          enhancedError.stack = error.stack;
        }

        throw enhancedError;
      }
    };

    return responsePromise;
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

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.executeRequest(url, fetchOptions);
      } catch (error) {
        const requestError = error instanceof RequestError ? error : RequestError.networkError(url, fetchOptions.method as string, error as Error);

        if (attempt >= maxRetries) throw requestError;

        if (this.requestOptions.onRetry) {
          await this.requestOptions.onRetry({ attempt: attempt + 1, error: requestError });
        }
      }
    }

    // This should never happen but is needed for type safety
    throw new RequestError(`Max retries reached`, url, fetchOptions.method as string);
  }

  private async executeRequest(url: string, fetchOptions: RequestInit): Promise<ResponseWrapper> {
    // Create a request controller for timeout if needed, or use the provided one
    const controller = this.abortController || new AbortController();
    const { signal } = controller;

    // Use the controller signal for the fetch request, but don't overwrite an existing signal
    fetchOptions.signal = fetchOptions.signal || signal;

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    // Flag to track if abort was caused by our timeout
    let abortedByTimeout = false;

    // Handle timeout regardless of whether an external controller is provided
    if (this.requestOptions.timeout) {
      if (this.abortController) {
        // If we have an external controller, create a separate timeout controller
        // that won't interfere with the external one

        // Use AbortSignal.timeout if available (modern browsers)
        if (typeof AbortSignal.timeout === "function") {
          const timeoutSignal = AbortSignal.timeout(this.requestOptions.timeout);

          // Add event listener to propagate the abort to the main controller
          timeoutSignal.addEventListener("abort", () => {
            if (!controller.signal.aborted) {
              abortedByTimeout = true;
              controller.abort();
            }
          });
        } else {
          // Fallback for browsers without AbortSignal.timeout
          timeoutId = setTimeout(() => {
            if (!controller.signal.aborted) {
              abortedByTimeout = true;
              controller.abort();
            }
          }, this.requestOptions.timeout);
        }
      } else {
        timeoutId = setTimeout(() => {
          abortedByTimeout = true;
          controller.abort();
        }, this.requestOptions.timeout);
      }
    }

    try {
      let response: Response;

      try {
        response = await fetch(url, fetchOptions);
      } catch (error) {
        // Check if this is an abort error that was specifically caused by our timeout
        if (error instanceof DOMException && error.name === "AbortError" && abortedByTimeout) {
          throw RequestError.timeout(url, fetchOptions.method as string, this.requestOptions.timeout!);
        }

        // Otherwise it's either a user-triggered abort or another network error
        throw RequestError.networkError(url, fetchOptions.method as string, error as Error);
      }

      if (!response.ok) {
        throw RequestError.fromResponse(response, url, fetchOptions.method as string);
      }

      // Return a wrapped response instead of parsing it
      return new ResponseWrapper(response);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  /**
   * Executes a request using cache when possible
   * @param url The formatted URL to send the request to
   * @param fetchOptions The fetch options to use
   * @param cacheKey The cache key for this request
   */
  private async executeWithCache(url: string, fetchOptions: RequestInit, cacheKey: string): Promise<ResponseWrapper> {
    // Try to get from cache first
    if (this.cacheManager) {
      const cachedEntry = await this.cacheManager.get(cacheKey);

      if (cachedEntry) {
        // Create a synthetic Response object from cached data
        const cachedResponse = new Response(JSON.stringify(cachedEntry.value), {
          status: 200,
          headers: new Headers(cachedEntry.headers || {}),
        });
        return new ResponseWrapper(cachedResponse);
      }
    }

    // Not in cache, make the actual request
    const response = await (!this.requestOptions.retries ? this.executeRequest(url, fetchOptions) : this.executeWithRetries(url, fetchOptions));

    // Cache the successful response if caching is enabled
    // Only cache successful responses
    if (response.ok && this.cacheManager) {
      // Clone the response so we don't consume it
      try {
        const responseData = await response.getJson();

        // Extract headers to store in cache
        const headers: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          headers[key] = value;
        });

        // Store in cache
        await this.cacheManager.set(cacheKey, responseData, headers);
      } catch (error) {
        // Failed to cache, but we can still return the response
        console.warn("Failed to cache response:", error);
      }
    }

    return response;
  }
}
