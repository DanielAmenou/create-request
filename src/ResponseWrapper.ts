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
  async getJson<T = unknown>(): Promise<T> {
    return this.response.json() as Promise<T>;
  }

  /**
   * Get response as text
   */
  async getText(): Promise<string> {
    return this.response.text();
  }

  /**
   * Get response as Blob
   */
  async getBlob(): Promise<Blob> {
    return this.response.blob();
  }

  /**
   * Get response as ArrayBuffer
   */
  async getArrayBuffer(): Promise<ArrayBuffer> {
    return this.response.arrayBuffer();
  }

  /**
   * Get response as ReadableStream for true streaming consumption.
   * This allows you to process data incrementally as it arrives.
   *
   * @example
   * const stream = await request.sendTo('https://example.com/large-file').getBody();
   * const reader = stream.getReader();
   *
   * while (true) {
   *   const { done, value } = await reader.read();
   *   if (done) break;
   *   // Process chunk of data in 'value'
   * }
   */
  getBody(): ReadableStream<Uint8Array> | null {
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
}
