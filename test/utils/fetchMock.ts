import { Blob } from "node:buffer";
import { Readable } from "node:stream";

type MockResponseInit = {
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  body?: unknown;
};

/**
 * Creates a mock Response object for testing
 */
export function createMockResponse(init: MockResponseInit = {}): Response {
  const { status = 200, statusText = "OK", headers = { "content-type": "application/json" }, body = null } = init;

  // Create headers object
  const responseHeaders = new Headers();
  Object.entries(headers).forEach(([key, value]) => {
    responseHeaders.append(key, value);
  });

  // Create body
  let responseBody: BodyInit | null = null;

  if (body !== null) {
    if (typeof body === "string") {
      responseBody = body;
    } else if (body instanceof ArrayBuffer) {
      responseBody = body;
    } else if (body instanceof Blob) {
      // Convert Blob to string - simplifies testing
      responseBody = JSON.stringify(body);
    } else if (body instanceof Readable) {
      // Convert Node.js Readable to ReadableStream
      responseBody = Readable.toWeb(body) as ReadableStream<Uint8Array>;
    } else {
      // Default to JSON serialization
      responseBody = JSON.stringify(body);
    }
  } else if (headers["content-type"]?.includes("application/json")) {
    // Handle null body with JSON content type - explicitly use "null" string
    responseBody = "null";
  }

  return new Response(responseBody, {
    status,
    statusText,
    headers: responseHeaders,
  });
}

/**
 * Helper function to create a promise that resolves after the specified time
 */
export function wait(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

type MockFn<T = any> = {
  (...args: any[]): any;
  calls: any[][];
  mockImplementation: (fn: (...args: any[]) => T) => MockFn<T>;
  mockImplementationOnce: (fn: (...args: any[]) => T) => MockFn<T>;
  mockReset: () => void;
  mockRestore: () => void;
};

/**
 * Create a simple mock function
 */
function createMockFn<T = any>(): MockFn<T> {
  let implementation = (..._args: any[]): any => undefined;
  const onceImplementations: Array<(...args: any[]) => any> = [];
  const calls: any[][] = [];

  const mockFn = (...args: any[]): any => {
    calls.push(args);
    if (onceImplementations.length > 0) {
      const impl = onceImplementations.shift()!;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return impl(...args);
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return implementation(...args);
  };

  return Object.assign(mockFn, {
    calls,
    mockImplementation: (fn: (...args: any[]) => T): MockFn<T> => {
      implementation = fn;
      return mockFn as unknown as MockFn<T>;
    },
    mockImplementationOnce: (fn: (...args: any[]) => T): MockFn<T> => {
      onceImplementations.push(fn);
      return mockFn as unknown as MockFn<T>;
    },
    mockReset: (): void => {
      calls.length = 0;
      onceImplementations.length = 0;
      implementation = (..._args: any[]): any => undefined;
    },
    mockRestore: (): void => {
      calls.length = 0;
      onceImplementations.length = 0;
    },
  });
}

/**
 * Mock implementation for the global fetch function
 */
export class FetchMock {
  private static originalFetch: typeof fetch;
  private static mockImplementation = createMockFn<Promise<Response>>().mockImplementation(() => Promise.resolve(createMockResponse()));

  // Track active abortable mocks
  private static abortHandlers = new Map<AbortSignal, () => void>();

  /**
   * Install the fetch mock
   */
  static install(): void {
    if (!FetchMock.originalFetch) {
      FetchMock.originalFetch = globalThis.fetch;
    }

    // Replace the global fetch function with the mock implementation
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const signal = init?.signal;

      // Store the result of the mock function
      const mockResult = FetchMock.mockImplementation(input, init) as Promise<Response>;

      // If there's an abort signal, handle it
      if (signal) {
        if (signal.aborted) {
          // Already aborted
          return Promise.reject(new DOMException("The operation was aborted", "AbortError"));
        }

        // Return a promise that will be rejected if the signal is aborted
        return new Promise((resolve, reject) => {
          const abortHandler = () => {
            reject(new DOMException("The operation was aborted", "AbortError"));
            signal.removeEventListener("abort", abortHandler);
            FetchMock.abortHandlers.delete(signal);
          };

          // Add abort handler
          signal.addEventListener("abort", abortHandler);
          FetchMock.abortHandlers.set(signal, abortHandler);

          // Resolve with the mock result if not aborted
          mockResult
            .then(resolve)
            .catch(reject)
            .finally(() => {
              signal.removeEventListener("abort", abortHandler);
              FetchMock.abortHandlers.delete(signal);
            });
        });
      }

      return mockResult;
    }) as typeof fetch;
  }

  /**
   * Restore the original fetch implementation
   */
  static restore(): void {
    if (FetchMock.originalFetch) {
      globalThis.fetch = FetchMock.originalFetch;
      FetchMock.abortHandlers.clear();
    }
  }

  /**
   * Reset the mock implementation and call history
   */
  static reset(): void {
    FetchMock.mockImplementation.mockReset();
    FetchMock.abortHandlers.clear();
  }

  /**
   * Mock a successful response
   */
  static mockResponseOnce(responseInit: MockResponseInit = {}): void {
    FetchMock.mockImplementation.mockImplementationOnce(() => Promise.resolve(createMockResponse(responseInit)));
  }

  /**
   * Mock a failed response (network error)
   */
  static mockErrorOnce(error: Error = new Error("Network error")): void {
    FetchMock.mockImplementation.mockImplementationOnce(() => Promise.reject(error));
  }

  /**
   * Mock a response with a delay (for testing timeouts)
   */
  static mockDelayedResponseOnce(delay: number, responseInit: MockResponseInit = {}): void {
    FetchMock.mockImplementation.mockImplementationOnce((_input: RequestInfo | URL, init?: RequestInit) => {
      // Create a promise that resolves with the response after a delay
      const responsePromise = wait(delay).then(() => createMockResponse(responseInit));

      // If there's a signal, ensure we handle abort events
      if (init?.signal) {
        const signal = init.signal; // Store signal in a variable to avoid null checks

        return new Promise<Response>((resolve, reject) => {
          // Set up handlers for both delay completion and abort events
          const onAbort = () => {
            reject(new DOMException("The operation was aborted", "AbortError"));
            signal.removeEventListener("abort", onAbort);
          };

          // Listen for abort
          signal.addEventListener("abort", onAbort);

          // Clean up on completion
          responsePromise
            .then(result => {
              signal.removeEventListener("abort", onAbort);
              resolve(result);
            })
            .catch(error => {
              signal.removeEventListener("abort", onAbort);
              reject(error);
            });
        });
      }

      return responsePromise;
    });
  }

  /**
   * Get the mock implementation for assertions
   */
  static get mock(): MockFn<Promise<Response>> {
    return FetchMock.mockImplementation;
  }
}
