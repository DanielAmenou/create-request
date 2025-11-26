import { RequestError } from "./RequestError.js";
import type { GraphQLOptions } from "./types.js";

/**
 * Wrapper for HTTP responses with methods to transform the response data.
 * Provides convenient methods to parse the response body in different formats.
 * Response bodies are cached after the first read, so you can call multiple methods
 * (e.g., `getJson()` and `getText()`) on the same response.
 *
 * @example
 * ```typescript
 * const response = await create.get('/api/users').getResponse();
 * console.log(response.status); // 200
 * console.log(response.ok); // true
 * const data = await response.getJson();
 * ```
 */
export class ResponseWrapper {
  /** The URL that was requested (if available) */
  public readonly url?: string;
  /** The HTTP method that was used (if available) */
  public readonly method?: string;
  private readonly response: Response;
  private graphQLOptions?: GraphQLOptions;

  // Cache the body as the last used method
  private cachedBlob?: Blob;
  private cachedText?: string;
  private cachedJson?: unknown;
  private cachedArrayBuffer?: ArrayBuffer;

  constructor(response: Response, url?: string, method?: string, graphQLOptions?: GraphQLOptions) {
    this.response = response;
    this.url = url;
    this.method = method;
    if (graphQLOptions) {
      this.graphQLOptions = {
        throwOnError: graphQLOptions.throwOnError,
      };
    }
  }

  /**
   * HTTP status code (e.g., 200, 404, 500)
   */
  get status(): number {
    return this.response.status;
  }

  /**
   * HTTP status text (e.g., "OK", "Not Found", "Internal Server Error")
   */
  get statusText(): string {
    return this.response.statusText;
  }

  /**
   * Response headers as a Headers object
   */
  get headers(): Headers {
    return this.response.headers;
  }

  /**
   * Whether the response status is in the 200-299 range (successful)
   */
  get ok(): boolean {
    return this.response.ok;
  }

  /**
   * The raw Response object from the fetch API.
   * Use this if you need direct access to the underlying Response.
   */
  get raw(): Response {
    return this.response;
  }

  /**
   * Check if the response body has already been consumed and throw an error if so
   * @throws RequestError if the body has already been consumed
   */
  private checkBodyNotConsumed(): void {
    if (this.response.bodyUsed) {
      throw new RequestError("Body already consumed", this.url || "", this.method || "", {
        status: this.response.status,
        response: this.response,
      });
    }
  }

  /**
   * Check for GraphQL errors and throw if throwOnError is enabled
   * @param data - The parsed JSON data
   * @throws RequestError if GraphQL response contains errors and throwOnError is enabled
   */
  private checkGraphQLErrors(data: unknown): void {
    if (!this.graphQLOptions?.throwOnError || typeof data !== "object" || data === null) return;
    const responseData = data as { errors?: unknown };
    if (!Array.isArray(responseData.errors) || responseData.errors.length === 0) return;
    const errors = responseData.errors;
    const errorMessages = errors.map(x => {
      if (typeof x === "string") return x;
      if (x && typeof x === "object" && "message" in x) {
        const message = (x as { message?: unknown }).message;
        if (message == null) return "Unknown error";
        if (typeof message === "string") return message;
        if (typeof message === "object") {
          try {
            return JSON.stringify(message);
          } catch {
            return "Unknown error";
          }
        }
        // For primitives (number, boolean, etc.), safe to convert
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        return String(message);
      }
      return String(x);
    });
    const errorMessage = errorMessages.join(", ");

    throw new RequestError(`GraphQL: ${errorMessage}`, this.url || "", this.method || "", {
      status: this.response.status,
      response: this.response,
    });
  }

  /**
   * Parse the response body as JSON
   * If GraphQL options are set with throwOnError=true, will check for GraphQL errors and throw.
   *
   * @returns The parsed JSON data
   * @throws {RequestError} When the request fails, JSON parsing fails, or GraphQL errors occur (if throwOnError enabled).
   *
   * @example
   * const data = await response.getJson();
   * console.log(data.items);
   *
   * @example
   * // Error handling - errors are always RequestError
   * try {
   *   const data = await response.getJson();
   * } catch (error) {
   *   if (error instanceof RequestError) {
   *     console.log(error.status, error.url, error.method);
   *   }
   * }
   */
  async getJson<T = unknown>(): Promise<T> {
    if (this.cachedJson !== undefined) return this.cachedJson as T;

    this.checkBodyNotConsumed();

    try {
      const parsed: unknown = await this.response.json();
      this.cachedJson = parsed;
      this.checkGraphQLErrors(parsed);
      return parsed as T;
    } catch (error) {
      if (error instanceof RequestError) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new RequestError(`Bad JSON: ${errorMessage}`, this.url || "", this.method || "", {
        status: this.response.status,
        response: this.response,
      });
    }
  }

  /**
   * Get the response body as text.
   * The result is cached, so subsequent calls return the same value without re-reading the body.
   *
   * @returns A promise that resolves to the response body as a string
   * @throws {RequestError} When the body has already been consumed or reading fails
   *
   * @example
   * ```typescript
   * const text = await response.getText();
   * console.log(text); // "Hello, world!"
   * ```
   */
  async getText(): Promise<string> {
    if (this.cachedText !== undefined) return this.cachedText;

    this.checkBodyNotConsumed();

    try {
      const text = await this.response.text();
      this.cachedText = text;
      return text;
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      throw new RequestError(`Read: ${errorMessage}`, this.url || "", this.method || "", {
        status: this.response.status,
        response: this.response,
      });
    }
  }

  /**
   * Get the response body as a Blob.
   * Useful for downloading files or handling binary data.
   * The result is cached, so subsequent calls return the same value without re-reading the body.
   *
   * @returns A promise that resolves to the response body as a Blob
   * @throws {RequestError} When the body has already been consumed or reading fails
   *
   * @example
   * ```typescript
   * const blob = await response.getBlob();
   * const url = URL.createObjectURL(blob);
   * // Use the blob URL for downloading or displaying
   * ```
   */
  async getBlob(): Promise<Blob> {
    if (this.cachedBlob !== undefined) return this.cachedBlob;

    this.checkBodyNotConsumed();

    try {
      const blob = await this.response.blob();
      this.cachedBlob = blob;
      return blob;
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      throw new RequestError(`Read: ${errorMessage}`, this.url || "", this.method || "", {
        status: this.response.status,
        response: this.response,
      });
    }
  }

  /**
   * Get the response body as an ArrayBuffer.
   * Useful for processing binary data at a low level.
   * The result is cached, so subsequent calls return the same value without re-reading the body.
   *
   * @returns A promise that resolves to the response body as an ArrayBuffer
   * @throws {RequestError} When the body has already been consumed or reading fails
   *
   * @example
   * ```typescript
   * const buffer = await response.getArrayBuffer();
   * const uint8Array = new Uint8Array(buffer);
   * // Process the binary data
   * ```
   */
  async getArrayBuffer(): Promise<ArrayBuffer> {
    if (this.cachedArrayBuffer !== undefined) {
      return this.cachedArrayBuffer;
    }

    this.checkBodyNotConsumed();

    try {
      const arrayBuffer = await this.response.arrayBuffer();
      this.cachedArrayBuffer = arrayBuffer;
      return arrayBuffer;
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      throw new RequestError(`Read: ${errorMessage}`, this.url || "", this.method || "", {
        status: this.response.status,
        response: this.response,
      });
    }
  }

  /**
   * Get the raw response body as a ReadableStream
   * Note: This consumes the response body and should only be called once.
   * Unlike other methods, streams cannot be cached, so this will throw if the body is already consumed.
   *
   * @returns The response body as a ReadableStream or null
   * @throws {RequestError} When the response body has already been consumed
   *
   * @example
   * const stream = response.getBody();
   * if (stream) {
   *   const reader = stream.getReader();
   *   // Process the stream
   * }
   */
  getBody(): ReadableStream<Uint8Array> | null {
    this.checkBodyNotConsumed();

    return this.response.body;
  }

  /**
   * Extract specific data using a selector function
   * If no selector is provided, returns the full JSON response.
   *
   * @param selector - Optional function to extract and transform data
   * @returns A promise that resolves to the selected data
   * @throws {RequestError} When the request fails, JSON parsing fails, or the selector throws an error
   *
   * @example
   * // Get full response
   * const data = await response.getData();
   *
   * // Extract specific data
   * const users = await response.getData(data => data.results.users);
   *
   * @example
   * // Error handling - errors are always RequestError
   * try {
   *   const data = await response.getData();
   * } catch (error) {
   *   if (error instanceof RequestError) {
   *     console.log(error.status, error.url, error.method);
   *   }
   * }
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
        throw new RequestError(`Selector: ${errorMessage}`, this.url || "", this.method || "", {
          status: this.response.status,
          response: this.response,
        });
      }

      // If we get here and it's not a RequestError, wrap it
      // This should rarely happen as getJson() should throw RequestError
      const errorObj = error instanceof Error ? error : new Error(String(error));
      throw RequestError.networkError(this.url || "", this.method || "", errorObj);
    }
  }
}
