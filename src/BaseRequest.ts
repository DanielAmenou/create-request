import {
  type HttpMethod,
  type RedirectMode,
  type RequestMode,
  type RequestPriority,
  CredentialsPolicy,
} from "./enums";
import { RequestError } from "./RequestError";
import { type ResponsePromise, ResponseWrapper } from "./ResponseWrapper";
import type { RequestOptions, RetryCallback } from "./types";

// Base class with common functionality for all request types
export abstract class BaseRequest {
  protected abstract method: HttpMethod;
  protected requestOptions: RequestOptions = {};
  protected abortController?: AbortController;
  protected queryParams: URLSearchParams = new URLSearchParams();

  constructor() {}

  withHeaders(headers: Record<string, string>): this {
    this.requestOptions.headers = {
      ...((this.requestOptions.headers as Record<string, string>) || {}),
      ...headers,
    };
    return this;
  }

  withTimeout(timeout: number): this {
    this.requestOptions.timeout = timeout;
    return this;
  }

  withRetries(retries: number): this {
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
    const credentials = btoa(`${username}:${password}`);
    return this.withAuthorization(`Basic ${credentials}`);
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
   * @param cookies - An object containing cookie name-value pairs
   * @returns The instance for chaining
   */
  withCookies(cookies: Record<string, string>): this {
    const cookieEntries = Object.entries(cookies);

    if (cookieEntries.length === 0) {
      return this;
    }

    // Format cookies as name=value pairs
    const cookieString = cookieEntries
      .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
      .join("; ");

    // Get current headers or initialize empty object
    const currentHeaders = (this.requestOptions.headers as Record<string, string>) || {};

    // If there's already a Cookie header, append to it; otherwise create a new one
    const existingCookies = currentHeaders["Cookie"] || "";
    const newCookieValue = existingCookies ? `${existingCookies}; ${cookieString}` : cookieString;

    // Set the Cookie header
    return this.withHeaders({
      Cookie: newCookieValue,
    });
  }

  /**
   * Send the request to the specified URL
   * @param url The URL to send the request to
   */
  sendTo(url: string): ResponsePromise {
    // Format the URL with query parameters
    url = this.formatUrlWithQueryParams(url);

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

    const urlObj = new URL(url);

    // Merge our query params with any that might be in the URL already
    this.queryParams.forEach((value, key) => {
      urlObj.searchParams.append(key, value);
    });

    return urlObj.toString();
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
    // that might have been set in requestOptions if it exists
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
