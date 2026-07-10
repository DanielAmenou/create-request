/**
 * Extract a message from an unknown thrown value
 * @internal
 */
export const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * Coerce an unknown thrown value to an Error
 * @internal
 */
export const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

/**
 * Error class for HTTP request failures.
 * Extends the standard Error class with additional context about the failed request.
 *
 * @example
 * ```typescript
 * try {
 *   await create.get('/api/users').getJson();
 * } catch (error) {
 *    console.log(`Request failed: ${error.message}`);
 *    console.log(`URL: ${error.url}`);
 *    console.log(`Method: ${error.method}`);
 *    console.log(`Status: ${error.status}`);
 *    console.log(`Body: ${error.body}`); // Raw response body (if available)
 *    console.log(error.getJson()); // Body parsed as JSON (or undefined)
 *    console.log(`Is timeout: ${error.isTimeout}`);
 *    console.log(`Is aborted: ${error.isAborted}`);
 * }
 * ```
 */
export class RequestError extends Error {
  /** HTTP status code if the request received a response (e.g., 404, 500) */
  public readonly status?: number;
  /** The Response object if the request received a response before failing */
  public readonly response?: Response;
  /**
   * The raw response body as text, if a response was received and its body could be read.
   * `undefined` for errors without a response (network errors, timeouts, aborts)
   * or when the body could not be read.
   */
  public readonly body?: string;
  /** The URL that was requested */
  public readonly url: string;
  /** The HTTP method that was used (e.g., 'GET', 'POST') */
  public readonly method: string;
  /** Whether the request failed due to a timeout */
  public readonly isTimeout: boolean;
  /** Whether the request was aborted (cancelled) */
  public readonly isAborted: boolean;

  /** Cached result of parsing `body` as JSON (lazily populated by getJson) */
  private _parsed?: unknown;

  /**
   * Creates a new RequestError instance.
   *
   * @param message - Error message describing what went wrong
   * @param url - The URL that was requested
   * @param method - The HTTP method that was used
   * @param options - Additional error context
   * @param options.status - HTTP status code if available
   * @param options.response - The Response object if available
   * @param options.body - The raw response body as text, if available
   * @param options.isTimeout - Whether this was a timeout error
   * @param options.isAborted - Whether the request was aborted
   * @param options.cause - The underlying error that caused this error
   */
  constructor(
    message: string,
    url: string,
    method: string,
    options: {
      status?: number;
      response?: Response;
      body?: string;
      isTimeout?: boolean;
      isAborted?: boolean;
      cause?: Error;
    } = {}
  ) {
    super(message, { cause: options.cause });
    this.name = "RequestError";
    this.url = url;
    this.method = method;
    this.status = options.status;
    this.response = options.response;
    this.body = options.body;
    this.isTimeout = !!options.isTimeout;
    this.isAborted = !!options.isAborted;

    // For better stack traces in modern environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RequestError);
    }

    // Maintains proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, RequestError.prototype);
  }

  /**
   * Parses the captured response body (`body`) as JSON.
   * The result is cached, so repeated calls don't re-parse.
   * This method never throws - it returns `undefined` when there is no body
   * or the body is not valid JSON, making it safe to use in error handlers.
   *
   * @returns The parsed JSON body, or `undefined` if no body was captured or it isn't valid JSON
   *
   * @example
   * ```typescript
   * try {
   *   await create.post('/api/users').withBody(user).getJson();
   * } catch (error) {
   *   if (error instanceof RequestError) {
   *     const details = error.getJson<{ message: string; code: string }>();
   *     console.log(details?.message ?? error.body ?? error.message);
   *   }
   * }
   * ```
   */
  getJson<T = unknown>(): T | undefined {
    if (this._parsed === undefined && this.body) {
      try {
        this._parsed = JSON.parse(this.body);
      } catch {
        // Body is not valid JSON - leave parsedBody undefined
      }
    }
    return this._parsed as T | undefined;
  }

  /**
   * Safely reads the body of a Response as text without consuming it.
   * The response is cloned before reading, so the original body remains readable.
   * Never throws - returns `undefined` if the body is unavailable or cannot be read
   * (e.g., already consumed, locked stream, or read failure).
   *
   * @param response - The Response to read the body from
   * @returns The body as text, or `undefined` if it could not be read
   *
   * @example
   * ```typescript
   * const body = await RequestError.captureBody(response);
   * throw RequestError.fromResponse(response, url, 'GET', body);
   * ```
   */
  static async captureBody(response: Response): Promise<string | undefined> {
    try {
      if (!response.bodyUsed) return await response.clone().text();
    } catch {
      // Body could not be read (e.g., locked stream or read failure)
    }
    return undefined;
  }

  /**
   * Creates a RequestError for a timeout failure.
   *
   * @param url - The URL that timed out
   * @param method - The HTTP method that was used
   * @param timeoutMs - The timeout duration in milliseconds
   * @returns A RequestError with `isTimeout` set to `true`
   *
   * @example
   * ```typescript
   * throw RequestError.timeout('/api/data', 'GET', 5000);
   * ```
   */
  static timeout(url: string, method: string, timeoutMs: number): RequestError {
    return new RequestError(`Timeout:${timeoutMs}`, url, method, {
      isTimeout: true,
    });
  }

  /**
   * Creates a RequestError from an HTTP error response.
   * Used when the server returns a non-2xx status code.
   *
   * @param response - The Response object from the failed request
   * @param url - The URL that was requested
   * @param method - The HTTP method that was used
   * @param body - The response body as text, if already read (see {@link RequestError.captureBody})
   * @returns A RequestError with the status code, response object, and body (if provided)
   *
   * @example
   * ```typescript
   * const response = await fetch('/api/users');
   * if (!response.ok) {
   *   const body = await RequestError.captureBody(response);
   *   throw RequestError.fromResponse(response, '/api/users', 'GET', body);
   * }
   * ```
   */
  static fromResponse(response: Response, url: string, method: string, body?: string): RequestError {
    return new RequestError(`HTTP ${response.status}`, url, method, {
      status: response.status,
      response,
      body,
    });
  }

  /**
   * Creates a RequestError from a network-level error.
   * Automatically detects and categorizes common network errors (timeouts, DNS errors, connection errors).
   *
   * @param url - The URL that failed
   * @param method - The HTTP method that was used
   * @param originalError - The original error that occurred (e.g., from fetch)
   * @returns A RequestError with enhanced error message and context
   *
   * @example
   * ```typescript
   * try {
   *   await fetch('/api/data');
   * } catch (error) {
   *   if (error instanceof Error) {
   *     throw RequestError.networkError('/api/data', 'GET', error);
   *   }
   * }
   * ```
   */
  static networkError(url: string, method: string, originalError: Error): RequestError {
    // Provide more descriptive error messages for common network errors
    let message = originalError.message;

    // Check for Node.js error codes (e.g., from undici/dns errors)
    const errorCode = (originalError as Error & { code?: string }).code;
    const stack = originalError.stack || "";

    // Check for timeout errors (Node.js/undici TimeoutError)
    // Note: While explicit timeouts set via withTimeout() are handled in BaseRequest,
    // this detection serves as a safety net for timeout errors from external
    // AbortControllers, other runtimes, and network-level timeouts (ETIMEDOUT).
    const isTimeoutError =
      originalError.name === "TimeoutError" ||
      message.toLowerCase().includes("timeout") ||
      errorCode === "ETIMEDOUT" ||
      stack.includes("TimeoutError") ||
      stack.includes("timeout");

    // If the error message is generic "fetch failed", provide more context
    if (message === "fetch failed" || message === "Failed to fetch") {
      // Check for DNS resolution errors
      const isDnsError = errorCode === "ENOTFOUND" || errorCode === "EAI_AGAIN" || errorCode === "EAI_NODATA" || /getaddrinfo|ENOTFOUND|EAI_AGAIN/.test(stack);

      // Check for connection errors (but not timeout errors)
      const isConnectionError = !isTimeoutError && (errorCode === "ECONNREFUSED" || errorCode === "ECONNRESET" || stack.includes("ECONNREFUSED") || stack.includes("connect"));

      message = (isTimeoutError ? "Timeout:" : isDnsError ? "DNS:" : isConnectionError ? "Conn:" : "Net:") + url;
    }

    const error = new RequestError(message, url, method, isTimeoutError ? { isTimeout: true } : {});

    // Create a proper RequestError stack trace, but append the original stack for
    // debugging context, so Node.js shows "RequestError: ..." instead of "TypeError: ..."
    if (originalError.stack) {
      error.stack = `${error.stack || ""}\n\nCaused by: ${originalError.stack}`;
    }

    return error;
  }

  /**
   * Creates a RequestError for an aborted (cancelled) request.
   *
   * @param url - The URL that was aborted
   * @param method - The HTTP method that was used
   * @returns A RequestError with `isAborted` set to `true`
   *
   * @example
   * ```typescript
   * const controller = new AbortController();
   * controller.abort();
   * throw RequestError.abortError('/api/data', 'GET');
   * ```
   */
  static abortError(url: string, method: string): RequestError {
    return new RequestError("Aborted", url, method, {
      isAborted: true,
    });
  }
}
