/**
 * Wrapper for HTTP responses with methods to transform the response data
 */
export class ResponseWrapper {
  readonly ok: boolean;
  private response: Response;

  constructor(response: Response) {
    this.response = response;
    this.ok = response.status >= 200 && response.status < 300; // Standard Fetch API behavior
  }

  /**
   * Get the raw Response object
   */
  get raw(): Response {
    return this.response;
  }

  /**
   * Get the HTTP status code
   */
  get status(): number {
    return this.response.status;
  }

  /**
   * Get the HTTP status text
   */
  get statusText(): string {
    return this.response.statusText;
  }

  /**
   * Get response headers
   */
  get headers(): Headers {
    return this.response.headers;
  }

  /**
   * Parse response as JSON
   */
  async json<T = unknown>(): Promise<T> {
    return this.response.json() as Promise<T>;
  }

  /**
   * Get response as text
   */
  async text(): Promise<string> {
    return this.response.text();
  }

  /**
   * Get response as Blob
   */
  async blob(): Promise<Blob> {
    return this.response.blob();
  }

  /**
   * Get response as ArrayBuffer
   */
  async arrayBuffer(): Promise<ArrayBuffer> {
    return this.response.arrayBuffer();
  }

  /**
   * Get response as ReadableStream
   */
  body(): ReadableStream<Uint8Array> | null {
    return this.response.body;
  }
}

/**
 * Type for Promise with response data transformation methods
 */
export interface ResponsePromise<T = ResponseWrapper> extends Promise<T> {
  json<R = unknown>(): Promise<R>;
  text(): Promise<string>;
  blob(): Promise<Blob>;
  arrayBuffer(): Promise<ArrayBuffer>;
  body(): Promise<ReadableStream<Uint8Array> | null>;
}
