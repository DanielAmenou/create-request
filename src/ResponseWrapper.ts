import { RequestError } from "./RequestError.js";
import type { GraphQLOptions } from "./types.js";

/**
 * Wrapper for HTTP responses with methods to transform the response data
 */
export class ResponseWrapper {
  private readonly response: Response;
  public readonly url?: string;
  public readonly method?: string;

  // GraphQL-specific options
  private graphQLOptions?: GraphQLOptions;

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

  // Wrapper properties
  get status(): number {
    return this.response.status;
  }

  get statusText(): string {
    return this.response.statusText;
  }

  get headers(): Headers {
    return this.response.headers;
  }

  get ok(): boolean {
    return this.response.ok;
  }

  get raw(): Response {
    return this.response;
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
    const errorMessages = errors.map(x =>
      typeof x === "string" ? x : x && typeof x === "object" && "message" in x ? String((x as { message?: unknown }).message || "Unknown error") : String(x)
    );
    const errorMessage = errorMessages.join(", ");

    throw new RequestError(`GraphQL request failed with errors: ${errorMessage}`, this.url || "", this.method || "", {
      status: this.response.status,
      response: this.response,
    });
  }

  /**
   * Parse the response body as JSON
   * Note: This consumes the response body and can only be called once.
   * If GraphQL options are set with throwOnError=true, will check for GraphQL errors and throw.
   *
   * @returns The parsed JSON data
   * @throws {RequestError} When the request fails, JSON parsing fails, GraphQL errors occur (if throwOnError enabled), or body is already consumed
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
    if (this.response.bodyUsed) {
      throw new RequestError("Body already consumed", this.url || "", this.method || "", {
        status: this.response.status,
        response: this.response,
      });
    }

    try {
      const parsed: unknown = await this.response.json();
      this.checkGraphQLErrors(parsed);
      return parsed as T;
    } catch (error) {
      // Re-throw RequestErrors from checkGraphQLErrors without wrapping
      if (error instanceof RequestError) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new RequestError(`Invalid JSON: ${errorMessage}`, this.url || "", this.method || "", {
        status: this.response.status,
        response: this.response,
      });
    }
  }

  /**
   * Get the response body as text
   * Note: This consumes the response body and can only be called once.
   *
   * @returns The response text
   * @throws {RequestError} When reading fails or the response has already been consumed
   *
   * @example
   * const text = await response.getText();
   */
  async getText(): Promise<string> {
    if (this.response.bodyUsed) {
      throw new RequestError("Body already consumed", this.url || "", this.method || "", {
        status: this.response.status,
        response: this.response,
      });
    }

    try {
      return await this.response.text();
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      throw new RequestError(`Read failed: ${errorMessage}`, this.url || "", this.method || "", {
        status: this.response.status,
        response: this.response,
      });
    }
  }

  /**
   * Get the response body as a Blob
   * Note: This consumes the response body and can only be called once.
   *
   * @returns The response as a Blob
   * @throws {RequestError} When reading fails or the response has already been consumed
   *
   * @example
   * const blob = await response.getBlob();
   * const url = URL.createObjectURL(blob);
   */
  async getBlob(): Promise<Blob> {
    if (this.response.bodyUsed) {
      throw new RequestError("Body already consumed", this.url || "", this.method || "", {
        status: this.response.status,
        response: this.response,
      });
    }

    try {
      return await this.response.blob();
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      throw new RequestError(`Read failed: ${errorMessage}`, this.url || "", this.method || "", {
        status: this.response.status,
        response: this.response,
      });
    }
  }

  /**
   * Get the response body as an ArrayBuffer
   * Note: This consumes the response body and can only be called once.
   *
   * @returns The response as an ArrayBuffer
   * @throws {RequestError} When reading fails or the response has already been consumed
   *
   * @example
   * const buffer = await response.getArrayBuffer();
   * const uint8Array = new Uint8Array(buffer);
   */
  async getArrayBuffer(): Promise<ArrayBuffer> {
    if (this.response.bodyUsed) {
      throw new RequestError("Body already consumed", this.url || "", this.method || "", {
        status: this.response.status,
        response: this.response,
      });
    }

    try {
      return await this.response.arrayBuffer();
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      throw new RequestError(`Read failed: ${errorMessage}`, this.url || "", this.method || "", {
        status: this.response.status,
        response: this.response,
      });
    }
  }

  /**
   * Get the raw response body as a ReadableStream
   * Note: This consumes the response body and should only be called once.
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
    if (this.response.bodyUsed) {
      throw new RequestError("Body already consumed", this.url || "", this.method || "", {
        status: this.response.status,
        response: this.response,
      });
    }

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
        throw new RequestError(`Data selector failed: ${errorMessage}`, this.url || "", this.method || "", {
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
