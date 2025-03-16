export class RequestError extends Error {
  public readonly status?: number;
  public readonly response?: Response;
  public readonly url: string;
  public readonly method: string;
  public readonly timeoutError?: boolean;

  constructor(
    message: string,
    url: string,
    method: string,
    options: {
      status?: number;
      response?: Response;
      timeoutError?: boolean;
    } = {}
  ) {
    super(message);
    this.name = "RequestError";
    this.url = url;
    this.method = method;
    this.status = options.status;
    this.response = options.response;
    this.timeoutError = options.timeoutError;

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
    return new RequestError(`Request timed out after ${timeoutMs}ms`, url, method, {
      timeoutError: true,
    });
  }

  static fromResponse(response: Response, url: string, method: string): RequestError {
    return new RequestError(`Request failed with status ${response.status}`, url, method, {
      status: response.status,
      response,
    });
  }

  static networkError(url: string, method: string, originalError: Error): RequestError {
    const error = new RequestError(`Network error: ${originalError.message}`, url, method);
    error.stack = originalError.stack;
    return error;
  }
}
