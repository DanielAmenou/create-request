/**
 * Wrapper for HTTP responses with methods to transform the response data
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

  // Response body methods with caching
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
