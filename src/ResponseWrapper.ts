import { RequestError, errorMessage, toError } from "./RequestError.js";
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
  private readonly _res: Response;
  private _gqlOpts?: GraphQLOptions;

  // Cache the body as the last used method
  private _blob?: Blob;
  private _text?: string;
  private _json?: unknown;
  private _buf?: ArrayBuffer;

  constructor(response: Response, url?: string, method?: string, graphQLOptions?: GraphQLOptions) {
    this._res = response;
    this.url = url;
    this.method = method;
    if (graphQLOptions) {
      this._gqlOpts = {
        throwOnError: graphQLOptions.throwOnError,
      };
    }
  }

  /**
   * HTTP status code (e.g., 200, 404, 500)
   */
  get status(): number {
    return this._res.status;
  }

  /**
   * HTTP status text (e.g., "OK", "Not Found", "Internal Server Error")
   */
  get statusText(): string {
    return this._res.statusText;
  }

  /**
   * Response headers as a Headers object
   */
  get headers(): Headers {
    return this._res.headers;
  }

  /**
   * Whether the response status is in the 200-299 range (successful)
   */
  get ok(): boolean {
    return this._res.ok;
  }

  /**
   * The raw Response object from the fetch API.
   * Use this if you need direct access to the underlying Response.
   */
  get raw(): Response {
    return this._res;
  }

  /**
   * Create a RequestError carrying this response's context
   * @param message - The error message
   * @param withBody - Whether to attach the cached body text to the error
   */
  private _err(message: string, withBody?: boolean): RequestError {
    return new RequestError(message, this.url || "", this.method || "", {
      status: this._res.status,
      response: this._res,
      body: withBody ? this._text : undefined,
    });
  }

  /**
   * Read the response body via the given reader, wrapping failures in a RequestError
   * @throws RequestError if the body has already been consumed or reading fails
   */
  private async _read<T>(reader: () => Promise<T>): Promise<T> {
    this._checkUsed();
    try {
      return await reader();
    } catch (e) {
      throw this._err(`Read: ${errorMessage(e)}`);
    }
  }

  /**
   * Check if the response body has already been consumed and throw an error if so
   * @throws RequestError if the body has already been consumed
   */
  private _checkUsed(): void {
    if (this._res.bodyUsed) {
      throw this._err("Body used");
    }
  }

  /**
   * Check for GraphQL errors and throw if throwOnError is enabled
   * @param data - The parsed JSON data
   * @throws RequestError if GraphQL response contains errors and throwOnError is enabled
   */
  private _checkGql(data: unknown): void {
    if (!this._gqlOpts?.throwOnError || typeof data !== "object" || data === null) return;
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
    throw this._err(`GQL: ${errorMessages.join(", ")}`, true);
  }

  /**
   * Parse the response body as JSON
   * If GraphQL options are set with throwOnError=true, will check for GraphQL errors and throw.
   *
   * Returns `null` for empty responses (204 No Content, content-length: 0, or empty body).
   * This handles common API patterns where PUT/DELETE operations return no content on success.
   *
   * @returns The parsed JSON data, or `null` for empty responses
   * @throws {RequestError} When the request fails, JSON parsing fails, or GraphQL errors occur (if throwOnError enabled).
   *
   * @example
   * const data = await response.getJson();
   * if (data !== null) {
   *   console.log(data.items);
   * }
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
  async getJson<T = unknown>(): Promise<T | null> {
    if (this._json !== undefined) return this._json as T | null;

    // Handle empty responses: 204 No Content or content-length: 0
    const contentLength = this._res.headers.get("content-length");
    if (this._res.status === 204 || contentLength === "0") {
      this._json = null;
      return null;
    }

    this._checkUsed();

    try {
      // Read as text first to handle empty bodies and cache for getText()
      const text = await this._res.text();
      this._text = text;

      // Handle empty or whitespace-only responses
      if (!text || text.trim() === "") {
        this._json = null;
        return null;
      }

      // Parse the text as JSON
      const parsed = JSON.parse(text) as T;
      this._json = parsed;
      this._checkGql(parsed);
      return parsed;
    } catch (error) {
      if (error instanceof RequestError) {
        throw error;
      }
      throw this._err(`Bad JSON: ${errorMessage(error)}`, true);
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
    if (this._text !== undefined) return this._text;
    return (this._text = await this._read(() => this._res.text()));
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
    if (this._blob !== undefined) return this._blob;
    return (this._blob = await this._read(() => this._res.blob()));
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
    if (this._buf !== undefined) {
      return this._buf;
    }
    return (this._buf = await this._read(() => this._res.arrayBuffer()));
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
    this._checkUsed();

    return this._res.body;
  }

  /**
   * Extract specific data using a selector function
   * If no selector is provided, returns the full JSON response.
   *
   * Returns `null` for empty responses (204 No Content, content-length: 0, or empty body).
   * If a selector is provided and data is `null`, the selector will receive `null`.
   *
   * @param selector - Optional function to extract and transform data
   * @returns A promise that resolves to the selected data, or `null` for empty responses
   * @throws {RequestError} When the request fails, JSON parsing fails, or the selector throws an error
   *
   * @example
   * // Get full response
   * const data = await response.getData();
   * if (data !== null) {
   *   console.log(data.items);
   * }
   *
   * @example
   * // Extract specific data (use null-safe selector for empty responses)
   * const users = await response.getData(data => data?.results?.users);
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
  async getData<T = unknown, R = T>(selector?: (data: T | null) => R): Promise<T | R | null> {
    try {
      const data = await this.getJson<T>();

      // If no selector is provided, return the raw JSON data (may be null)
      if (!selector) return data;

      // Apply the selector if provided (selector receives null for empty responses)
      return selector(data);
    } catch (error) {
      // If it's already a RequestError, re-throw it
      if (error instanceof RequestError) {
        throw error;
      }

      // Enhance selector errors with context
      if (selector) {
        throw this._err(`Selector: ${errorMessage(error)}`, true);
      }

      // If we get here and it's not a RequestError, wrap it
      // This should rarely happen as getJson() should throw RequestError
      throw RequestError.networkError(this.url || "", this.method || "", toError(error));
    }
  }
}
