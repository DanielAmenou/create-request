export class RequestError extends Error {
  public readonly status?: number;
  public readonly response?: Response;
  public readonly url: string;
  public readonly method: string;
  public readonly isTimeout?: boolean;
  public readonly isAborted?: boolean;

  constructor(
    message: string,
    url: string,
    method: string,
    options: {
      status?: number;
      response?: Response;
      isTimeout?: boolean;
      isAborted?: boolean;
    } = {}
  ) {
    super(message);
    this.name = "RequestError";
    this.url = url;
    this.method = method;
    this.status = options.status;
    this.response = options.response;
    this.isTimeout = options.isTimeout;
    this.isAborted = options.isAborted;

    // For better stack traces in modern environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RequestError);
    }

    // Maintains proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, RequestError.prototype);
  }

  /**
   * Static methods for creating specific types of RequestError
   */

  static timeout(url: string, method: string, timeoutMs: number): RequestError {
    return new RequestError(`Timeout: ${timeoutMs}ms`, url, method, {
      isTimeout: true,
    });
  }

  static fromResponse(response: Response, url: string, method: string): RequestError {
    return new RequestError(`HTTP ${response.status}`, url, method, {
      status: response.status,
      response,
    });
  }

  static networkError(url: string, method: string, originalError: Error): RequestError {
    // Provide more descriptive error messages for common network errors
    let message = originalError.message;

    // Check for Node.js error codes (e.g., from undici/dns errors)
    const errorCode = (originalError as Error & { code?: string }).code;
    const errorName = originalError.name;
    const stack = originalError.stack || "";
    const errorMessageLower = message.toLowerCase();

    // Check for timeout errors (Node.js/undici TimeoutError)
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
        message = `Network error: Request timeout for ${url}`;
      } else if (isDnsError) {
        message = `Network error: Unable to resolve hostname for ${url}`;
      } else if (isConnectionError) {
        message = `Network error: Connection refused for ${url}`;
      } else {
        message = `Network error: Failed to fetch ${url}`;
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

  static abortError(url: string, method: string): RequestError {
    return new RequestError("Aborted", url, method, {
      isAborted: true,
    });
  }
}
