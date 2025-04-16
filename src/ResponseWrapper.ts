import { RequestError } from "./RequestError.js";

/**
 * Wrapper for HTTP responses with methods to transform the response data
 * Provides caching and conversion between different response formats.
 */
export class ResponseWrapper {
  private readonly response: Response;

  // Add cache properties for each response type - fix the 'any' type issues
  private textCache: string | undefined;
  private jsonCache: unknown;
  private blobCache: Blob | undefined;
  private arrayBufferCache: ArrayBuffer | undefined;
  private bodyUsed = false;

  constructor(response: Response) {
    this.response = response;
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
   * Parse the response body as JSON
   * Caches the result for subsequent calls.
   *
   * @returns The parsed JSON data
   * @throws Error if the response has already been consumed in a different format
   *
   * @example
   * const data = await response.getJson();
   * console.log(data.items);
   */
  async getJson<T = unknown>(): Promise<T> {
    if (this.jsonCache !== undefined) {
      return this.jsonCache as T;
    }

    if (this.bodyUsed) {
      // If we already have text, try to parse it as JSON
      if (this.textCache !== undefined) {
        try {
          // Fix unsafe assignment by explicitly casting to unknown first
          this.jsonCache = JSON.parse(this.textCache) as unknown;
          return this.jsonCache as T;
        } catch (e) {
          throw new Error("Cannot parse cached text as JSON");
        }
      }
      throw new Error("Response body has already been consumed in a different format");
    }

    this.bodyUsed = true;
    this.jsonCache = (await this.response.json()) as unknown;
    return this.jsonCache as T;
  }

  /**
   * Get the response body as text
   * Caches the result for subsequent calls. Attempts to convert from JSON or Blob
   * if the body has already been consumed in those formats.
   *
   * @returns The response text
   * @throws Error if the response has already been consumed in an incompatible format
   *
   * @example
   * const text = await response.getText();
   */
  async getText(): Promise<string> {
    if (this.textCache !== undefined) {
      return this.textCache;
    }

    if (this.bodyUsed) {
      // If we already have JSON, convert it to text
      if (this.jsonCache !== undefined) {
        this.textCache = JSON.stringify(this.jsonCache);
        return this.textCache;
      }

      // If we have blob, convert to text
      if (this.blobCache !== undefined) {
        this.textCache = await this.blobCache.text();
        return this.textCache;
      }

      throw new Error("Response body has already been consumed in a format that cannot be converted to text");
    }

    this.bodyUsed = true;
    this.textCache = await this.response.text();
    return this.textCache;
  }

  /**
   * Get the response body as a Blob
   * Caches the result for subsequent calls. Attempts to convert from text
   * if the body has already been consumed as text.
   *
   * @returns The response as a Blob
   * @throws Error if the response has already been consumed in an incompatible format
   *
   * @example
   * const blob = await response.getBlob();
   * const url = URL.createObjectURL(blob);
   */
  async getBlob(): Promise<Blob> {
    if (this.blobCache !== undefined) {
      return this.blobCache;
    }

    if (this.bodyUsed) {
      // If we have text, convert to Blob
      if (this.textCache !== undefined) {
        this.blobCache = new Blob([this.textCache], { type: "text/plain" });
        return this.blobCache;
      }
      throw new Error("Response body has already been consumed in a format that cannot be converted to Blob");
    }

    this.bodyUsed = true;
    this.blobCache = await this.response.blob();
    return this.blobCache;
  }

  /**
   * Get the response body as an ArrayBuffer
   * Caches the result for subsequent calls. Attempts to convert from text or Blob
   * if the body has already been consumed in those formats.
   *
   * @returns The response as an ArrayBuffer
   * @throws Error if the response has already been consumed in an incompatible format
   *
   * @example
   * const buffer = await response.getArrayBuffer();
   */
  async getArrayBuffer(): Promise<ArrayBuffer> {
    if (this.arrayBufferCache !== undefined) {
      return this.arrayBufferCache;
    }

    if (this.bodyUsed) {
      // If we have text, convert to ArrayBuffer
      if (this.textCache !== undefined) {
        const encoder = new TextEncoder();
        // Fix ArrayBufferLike by explicitly casting to ArrayBuffer
        const uint8Array = encoder.encode(this.textCache);
        this.arrayBufferCache = uint8Array.buffer as ArrayBuffer;
        return this.arrayBufferCache;
      }

      // If we have blob, convert to ArrayBuffer
      if (this.blobCache !== undefined) {
        this.arrayBufferCache = await this.blobCache.arrayBuffer();
        return this.arrayBufferCache;
      }

      throw new Error("Response body has already been consumed in a format that cannot be converted to ArrayBuffer");
    }

    this.bodyUsed = true;
    this.arrayBufferCache = await this.response.arrayBuffer();
    return this.arrayBufferCache;
  }

  /**
   * Get the raw response body as a ReadableStream
   * This method consumes the body and should only be called once.
   *
   * @returns The response body as a ReadableStream or null
   * @throws Error if the response body has already been consumed
   *
   * @example
   * const stream = response.getBody();
   * if (stream) {
   *   const reader = stream.getReader();
   *   // Process the stream
   * }
   */
  getBody(): ReadableStream<Uint8Array> | null {
    if (this.bodyUsed) {
      throw new Error("Response body has already been consumed");
    }

    this.bodyUsed = true;
    return this.response.body;
  }
}

/**
 * Type for Promise with response data transformation methods
 */
export interface ResponsePromise<T = ResponseWrapper> extends Promise<T> {
  getJson<R = unknown>(): Promise<R>;
  getText(): Promise<string>;
  getBlob(): Promise<Blob>;
  getArrayBuffer(): Promise<ArrayBuffer>;
  getBody(): Promise<ReadableStream<Uint8Array> | null>;
  getData<T = unknown, R = T>(selector?: (data: T) => R): Promise<T | R>;
}
