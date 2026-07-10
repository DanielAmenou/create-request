import { RequestError, errorMessage } from "./RequestError.js";
import { BaseRequest } from "./BaseRequest.js";
import { BodyType } from "./enums.js";
import type { Body, GraphQLOptions } from "./types.js";
import type { ResponseWrapper } from "./ResponseWrapper.js";

/**
 * Base class for requests that can have a body (POST, PUT, PATCH)
 */
export abstract class BodyRequest extends BaseRequest {
  protected _body?: Body;
  private _bodyType?: BodyType;
  private _gqlOpts: GraphQLOptions | undefined = undefined;

  /**
   * Sets the request body. Automatically detects the body type and sets appropriate Content-Type header.
   * Supports JSON objects/arrays, strings, FormData, Blob, ArrayBuffer, URLSearchParams, and ReadableStream.
   *
   * @param body - The request body. Can be:
   *   - A JSON-serializable object or array (automatically stringified)
   *   - A string (sets Content-Type to `text/plain` if not already set)
   *   - FormData, Blob, File, ArrayBuffer, TypedArray, URLSearchParams, or ReadableStream
   * @returns The request instance for chaining
   * @throws {RequestError} If the body is a JSON object that cannot be stringified
   *
   * @example
   * ```typescript
   * // JSON object (automatically stringified)
   * request.withBody({ name: 'John', age: 30 });
   *
   * @example
   * // JSON array
   * request.withBody([1, 2, 3]);
   *
   * @example
   * // String
   * request.withBody('plain text');
   *
   * @example
   * // FormData
   * const formData = new FormData();
   * formData.append('file', fileBlob);
   * request.withBody(formData);
   *
   * @example
   * // Blob
   * request.withBody(new Blob(['content'], { type: 'text/plain' }));
   * ```
   */
  withBody(body: Body): this {
    this._body = body;

    // Set body type and validate
    if (typeof body === "string") {
      this._bodyType = BodyType.STRING;
      this._setCT("text/plain");
    } else if (
      body !== null &&
      typeof body === "object" &&
      !(
        body instanceof FormData ||
        body instanceof Blob ||
        body instanceof File ||
        body instanceof ArrayBuffer ||
        ArrayBuffer.isView(body) || // Handles TypedArray and DataView
        body instanceof URLSearchParams ||
        body instanceof ReadableStream
      )
    ) {
      this._bodyType = BodyType.JSON;
      this._setCT("application/json");

      // Validate JSON is stringifiable early
      try {
        JSON.stringify(body);
      } catch (error) {
        throw new RequestError(`Bad JSON: ${errorMessage(error)}`, this._url, this._method);
      }
    } else {
      this._bodyType = BodyType.BINARY;
    }

    return this;
  }

  /**
   * Sets a GraphQL query or mutation as the request body.
   * Automatically formats the body as JSON and sets Content-Type to `application/json`.
   * If `throwOnError` is enabled in options, the response will be checked for GraphQL errors
   * and a RequestError will be thrown if any are found.
   *
   * @param query - The GraphQL query or mutation string (e.g., `'query { user { id } }'`)
   * @param variables - Optional variables object to pass with the query. Must be a plain object.
   * @param options - Optional GraphQL-specific options
   * @param options.throwOnError - If `true`, throws a RequestError when the GraphQL response contains errors
   * @returns The request instance for chaining
   * @throws {RequestError} If the query is empty, variables is invalid, or JSON stringification fails
   *
   * @example
   * ```typescript
   * // Simple query with variables
   * const request = create.post('/graphql')
   *   .withGraphQL('query { user(id: $id) { name email } }', { id: '123' });
   * const data = await request.getJson();
   * ```
   *
   * @example
   * ```typescript
   * // Mutation with variables
   * const request = create.post('/graphql')
   *   .withGraphQL('mutation { createUser(name: $name) { id } }', { name: 'John' });
   * ```
   *
   * @example
   * ```typescript
   * // Throw error if GraphQL response contains errors
   * const request = create.post('/graphql')
   *   .withGraphQL('query { user { id } }', undefined, { throwOnError: true });
   * // If the response has errors, this will throw a RequestError
   * const data = await request.getJson();
   * ```
   */
  withGraphQL(query: string, variables?: Record<string, unknown>, options?: GraphQLOptions): this {
    if (typeof query !== "string" || query.length === 0) {
      throw new RequestError("Bad query", this._url, this._method);
    }

    const graphQLBody: { query: string; variables?: Record<string, unknown> } = {
      query: query,
    };

    if (variables !== undefined) {
      if (typeof variables !== "object" || variables === null || Array.isArray(variables)) {
        throw new RequestError("Bad vars", this._url, this._method);
      }
      graphQLBody.variables = variables;
    }

    // Store GraphQL options if provided
    if (options !== undefined) {
      if (typeof options !== "object" || options === null || Array.isArray(options)) {
        throw new RequestError("Bad opts", this._url, this._method);
      }

      // Store only the known GraphQL options properties
      const opts = options as unknown as { throwOnError?: boolean };
      this._gqlOpts = {
        throwOnError: typeof opts.throwOnError === "boolean" ? opts.throwOnError : undefined,
      };
    }

    // Validate JSON is stringifiable early
    try {
      JSON.stringify(graphQLBody);
    } catch (error) {
      throw new RequestError(`Bad JSON: ${errorMessage(error)}`, this._url, this._method);
    }

    this._body = graphQLBody;
    this._bodyType = BodyType.JSON;
    this._setCT("application/json");

    return this;
  }

  /**
   * Check if Content-Type header is already set (case-insensitive)
   */
  private _hasCT(): boolean {
    const headers = this._opts.headers;
    if (typeof headers === "object" && headers !== null) {
      const headersObj = headers as Record<string, string>;
      return Object.keys(headersObj).some(header => header.toLowerCase() === "content-type");
    }
    return false;
  }

  private _setCT(contentType: string): void {
    if (!this._hasCT()) {
      this.withContentType(contentType);
    }
  }

  /**
   * Get the GraphQL options if set
   * @returns The GraphQL options or undefined
   */
  protected _gql(): GraphQLOptions | undefined {
    return this._gqlOpts;
  }

  /**
   * Execute the request and return the ResponseWrapper
   * Overrides the base implementation to add body handling
   */
  async getResponse(): Promise<ResponseWrapper> {
    if (this._body !== undefined) {
      // Remove previous body if it exists
      if (this._opts.body) delete this._opts.body;

      // Process the body based on its type
      if (this._bodyType === BodyType.JSON) {
        this._opts.body = JSON.stringify(this._body);
      } else {
        this._opts.body = this._body;
      }
    }

    return super.getResponse();
  }
}
