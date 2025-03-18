import {
  type HttpMethod,
  type RedirectMode,
  type RequestMode,
  type RequestPriority,
  CredentialsPolicy,
} from "./enums";
import { RequestError } from "./RequestError";
import { type ResponsePromise, ResponseWrapper } from "./ResponseWrapper";
import type { RequestOptions, RetryCallback, CookiesRecord, CookieOptions } from "./types";
import { Config } from "./utils/Config";
import { CookieUtils } from "./utils/CookieUtils";
import { CsrfUtils } from "./utils/CsrfUtils";

// Base class with common functionality for all request types
export abstract class BaseRequest {
  protected abstract method: HttpMethod;
  protected requestOptions: RequestOptions = {
    headers: {},
  };
  protected abortController?: AbortController;
  protected queryParams: URLSearchParams = new URLSearchParams();
  protected autoApplyCsrfProtection: boolean = true;

  constructor() {}

  withHeaders(headers: Record<string, string>): this {
    this.requestOptions.headers = {
      ...(this.requestOptions.headers as Record<string, string>),
      ...headers,
    };
    return this;
  }

  withTimeout(timeout: number): this {
    if (!Number.isFinite(timeout) || timeout <= 0)
      throw new Error("Timeout must be a positive number");

    this.requestOptions.timeout = timeout;
    return this;
  }

  withRetries(retries: number): this {
    if (!Number.isInteger(retries) || retries < 0)
      throw new Error("Retry count must be a non-negative integer");
    this.requestOptions.retries = retries;
    return this;
  }

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
  withQueryParams(
    params: Record<string, string | string[] | number | boolean | null | undefined>
  ): this {
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
   * @param value - The parameter value
   * @returns The instance for chaining
   */
  withQueryParam(key: string, value: string | number | boolean | null | undefined): this {
    if (value !== null && value !== undefined) {
      this.queryParams.append(key, String(value));
    }
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
    // Browser environment
    if (typeof btoa === "function") return btoa(str);

    // Node.js environment
    if (typeof Buffer !== "undefined") return Buffer.from(str).toString("base64");

    // Fallback (should never happen in modern environments)
    throw new Error("Base64 encoding is not supported in this environment");
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
   * Sets cookies for the request
   * @param cookies Object containing cookie name-value pairs or cookie options
   * @returns The instance for chaining
   */
  withCookies(cookies: CookiesRecord): this {
    const cookieEntries = Object.entries(cookies);

    if (cookieEntries.length === 0) {
      return this;
    }

    // Get current headers or initialize empty object
    const currentHeaders = (this.requestOptions.headers as Record<string, string>) || {};

    // Get the existing cookie header in a case-insensitive way
    let existingCookies = "";
    const cookieHeaderName = Object.keys(currentHeaders).find(
      header => header.toLowerCase() === "cookie"
    );

    if (cookieHeaderName) existingCookies = currentHeaders[cookieHeaderName];

    const cookieString = CookieUtils.formatRequestCookies(cookies);

    // Combine with existing cookies if present
    const newCookieValue = existingCookies ? `${existingCookies}; ${cookieString}` : cookieString;

    // Set the Cookie header, preserving original case if it exists
    const headerName = cookieHeaderName || "Cookie";
    return this.withHeaders({
      [headerName]: newCookieValue,
    });
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
   * Send the request to the specified URL
   * @param url The URL to send the request to
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
        // Check if local token exists
        const headers = this.requestOptions.headers as Record<string, string>;
        const hasLocalToken = Object.keys(headers).some(
          key => key === "X-CSRF-Token" || key === config.getCsrfHeaderName()
        );

        if (!hasLocalToken) {
          this.withHeaders({
            [config.getCsrfHeaderName()]: globalToken,
          });
        }
      }

      // check for XSRF token in cookies and send it as a header
      if (config.isAutoXsrfEnabled() && typeof document !== "undefined") {
        const xsrfToken = CsrfUtils.getTokenFromCookie(config.getXsrfCookieName());
        if (xsrfToken && CsrfUtils.isValidToken(xsrfToken)) {
          const headers = this.requestOptions.headers as Record<string, string>;
          const hasLocalToken = Object.keys(headers).some(
            key => key === "X-XSRF-TOKEN" || key === config.getXsrfHeaderName()
          );

          if (!hasLocalToken) {
            this.withHeaders({
              [config.getXsrfHeaderName()]: xsrfToken,
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

    // Create the base promise
    const basePromise = !this.requestOptions.retries
      ? this.executeRequest(url, fetchOptions)
      : this.executeWithRetries(url, fetchOptions);

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
   */
  private async executeWithRetries(
    url: string,
    fetchOptions: RequestInit
  ): Promise<ResponseWrapper> {
    let attempt = 0;
    const maxRetries = this.requestOptions.retries || 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        return await this.executeRequest(url, fetchOptions);
      } catch (error) {
        const requestError =
          error instanceof RequestError
            ? error
            : RequestError.networkError(url, fetchOptions.method as string, error as Error);

        if (attempt >= maxRetries || requestError.timeoutError) {
          throw requestError;
        }

        attempt++;

        if (this.requestOptions.onRetry) {
          await this.requestOptions.onRetry({ attempt, error: requestError });
        }
      }
    }
  }

  private async executeRequest(url: string, fetchOptions: RequestInit): Promise<ResponseWrapper> {
    // Create a request controller for timeout if needed, or use the provided one
    const controller = this.abortController || new AbortController();
    const { signal } = controller;

    // Use the controller signal for the fetch request, but don't overwrite an existing signal
    fetchOptions.signal = fetchOptions.signal || signal;

    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    // If we have a timeout and we're using our own controller (not provided externally)
    if (this.requestOptions.timeout && !this.abortController) {
      timeoutId = setTimeout(() => {
        controller.abort();
      }, this.requestOptions.timeout);
    }

    try {
      let response: Response;

      try {
        response = await fetch(url, fetchOptions);
      } catch (error) {
        // Check if this is an abort error from our timeout
        if (error instanceof DOMException && error.name === "AbortError" && timeoutId) {
          throw RequestError.timeout(
            url,
            fetchOptions.method as string,
            this.requestOptions.timeout!
          );
        }

        // Otherwise it's a network error
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
}
