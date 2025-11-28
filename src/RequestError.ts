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
  /** The URL that was requested */
  public readonly url: string;
  /** The HTTP method that was used (e.g., 'GET', 'POST') */
  public readonly method: string;
  /** Whether the request failed due to a timeout */
  public readonly isTimeout: boolean;
  /** Whether the request was aborted (cancelled) */
  public readonly isAborted: boolean;

  /**
   * Creates a new RequestError instance.
   *
   * @param message - Error message describing what went wrong
   * @param url - The URL that was requested
   * @param method - The HTTP method that was used
   * @param options - Additional error context
   * @param options.status - HTTP status code if available
   * @param options.response - The Response object if available
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
    return new RequestError(`Timeout ${timeoutMs}ms`, url, method, {
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
   * @returns A RequestError with the status code and response object
   *
   * @example
   * ```typescript
   * const response = await fetch('/api/users');
   * if (!response.ok) {
   *   throw RequestError.fromResponse(response, '/api/users', 'GET');
   * }
   * ```
   */
  static fromResponse(response: Response, url: string, method: string): RequestError {
    return new RequestError(`HTTP ${response.status}`, url, method, {
      status: response.status,
      response,
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
    const errorName = originalError.name;
    const stack = originalError.stack || "";
    const errorMessageLower = message.toLowerCase();

    // Check for timeout errors (Node.js/undici TimeoutError)
    // Note: While explicit timeouts set via withTimeout() are handled in BaseRequest,
    // this detection serves as a safety net for:
    // 1. Timeout errors from external AbortControllers (e.g., AbortSignal.timeout())
    // 2. Different runtime implementations that may throw timeout errors differently
    // 3. Network-level timeouts (ETIMEDOUT)
    const isTimeoutError =
      errorName === "TimeoutError" ||
      errorMessageLower.includes("timeout") ||
      errorMessageLower.includes("aborted due to timeout") ||
      errorCode === "ETIMEDOUT" ||
      stack.includes("TimeoutError") ||
      stack.includes("timeout");

    // If the error message is generic "fetch failed", provide more context
    if (message === "fetch failed" || message === "Failed to fetch") {
      // Check for DNS resolution errors
      const isDnsError =
        errorCode === "ENOTFOUND" ||
        errorCode === "EAI_AGAIN" ||
        errorCode === "EAI_NODATA" ||
        stack.includes("getaddrinfo") ||
        stack.includes("ENOTFOUND") ||
        stack.includes("EAI_AGAIN");

      // Check for connection errors (but not timeout errors)
      const isConnectionError = !isTimeoutError && (errorCode === "ECONNREFUSED" || errorCode === "ECONNRESET" || stack.includes("ECONNREFUSED") || stack.includes("connect"));

      if (isTimeoutError) {
        message = `Timeout ${url}`;
      } else if (isDnsError) {
        message = `DNS error ${url}`;
      } else if (isConnectionError) {
        message = `Connection refused ${url}`;
      } else {
        message = `Network error ${url}`;
      }
    }

    const error = new RequestError(message, url, method, {
      ...(isTimeoutError ? { isTimeout: true } : {}),
    });

    // Create a proper RequestError stack trace, but append the original stack for debugging
    // This way Node.js will show "RequestError: ..." instead of "TypeError: ..."
    if (originalError.stack) {
      // Get the current stack (which will start with RequestError)
      const currentStack = error.stack || "";

      // Append the original error's stack as "Caused by:" for debugging context
      error.stack = `${currentStack}\n\nCaused by: ${originalError.stack}`;
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
