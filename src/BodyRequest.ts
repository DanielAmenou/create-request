import { RequestError } from "./RequestError.js";
import { BaseRequest } from "./BaseRequest.js";
import { BodyType } from "./enums.js";
import type { Body, GraphQLOptions } from "./types.js";
import type { ResponseWrapper } from "./ResponseWrapper.js";

/**
 * Base class for requests that can have a body (POST, PUT, PATCH)
 */
export abstract class BodyRequest extends BaseRequest {
  protected body?: Body;
  private bodyType?: BodyType;
  private graphQLOptions: GraphQLOptions | undefined = undefined;

  constructor(url: string) {
    super(url);
  }

  /**
   * Sets the body of the request
   * @param body - The request body
   */
  withBody(body: Body): this {
    this.body = body;

    // Set body type and validate
    if (typeof body === "string") {
      this.bodyType = BodyType.STRING;
      this.setContentTypeIfNeeded("text/plain");
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
      this.bodyType = BodyType.JSON;
      this.setContentTypeIfNeeded("application/json");

      // Validate JSON is stringifiable early
      try {
        JSON.stringify(body);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new RequestError(`JSON stringify failed: ${errorMessage}`, this.url, this.method);
      }
    } else {
      this.bodyType = BodyType.BINARY;
    }

    return this;
  }

  /**
   * Sets a GraphQL query or mutation as the request body
   * Automatically formats the body as JSON and sets Content-Type to application/json
   *
   * @param query - The GraphQL query or mutation string
   * @param variables - Optional variables object to pass with the query
   * @param options - Optional GraphQL-specific options
   * @returns The request instance for chaining
   *
   * @example
   * const request = new PostRequest('/graphql')
   *   .withGraphQL('query { user(id: $id) { name email } }', { id: '123' });
   *
   * @example
   * const request = new PostRequest('/graphql')
   *   .withGraphQL('mutation { createUser(name: $name) { id } }', { name: 'John' });
   *
   * @example
   * // Throw an error if the GraphQL response contains errors
   * const request = new PostRequest('/graphql')
   *   .withGraphQL('query { user { id } }', undefined, { throwOnError: true });
   */
  withGraphQL(query: string, variables?: Record<string, unknown>, options?: GraphQLOptions): this {
    if (typeof query !== "string" || query.length === 0) {
      throw new RequestError("Invalid GraphQL query", this.url, this.method);
    }

    const graphQLBody: { query: string; variables?: Record<string, unknown> } = {
      query: query,
    };

    if (variables !== undefined) {
      if (typeof variables !== "object" || variables === null || Array.isArray(variables)) {
        throw new RequestError("Invalid GraphQL variables", this.url, this.method);
      }
      graphQLBody.variables = variables;
    }

    // Store GraphQL options if provided
    if (options !== undefined) {
      if (typeof options !== "object" || options === null || Array.isArray(options)) {
        throw new RequestError("Invalid GraphQL options", this.url, this.method);
      }

      // Store only the known GraphQL options properties
      const opts = options as unknown as { throwOnError?: boolean };
      this.graphQLOptions = {
        throwOnError: typeof opts.throwOnError === "boolean" ? opts.throwOnError : undefined,
      };
    }

    // Validate JSON is stringifiable early
    try {
      JSON.stringify(graphQLBody);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new RequestError(`JSON stringify failed: ${errorMessage}`, this.url, this.method);
    }

    this.body = graphQLBody;
    this.bodyType = BodyType.JSON;
    this.setContentTypeIfNeeded("application/json");

    return this;
  }

  /**
   * Check if Content-Type header is already set (case-insensitive)
   */
  private hasContentType(): boolean {
    const headers = this.requestOptions.headers;
    if (typeof headers === "object" && headers !== null) {
      const headersObj = headers as Record<string, string>;
      return Object.keys(headersObj).some(header => header.toLowerCase() === "content-type");
    }
    return false;
  }

  private setContentTypeIfNeeded(contentType: string): void {
    if (!this.hasContentType()) {
      this.withContentType(contentType);
    }
  }

  /**
   * Get the GraphQL options if set
   * @returns The GraphQL options or undefined
   */
  protected getGraphQLOptions(): GraphQLOptions | undefined {
    return this.graphQLOptions;
  }

  /**
   * Execute the request and return the ResponseWrapper
   * Overrides the base implementation to add body handling
   */
  async getResponse(): Promise<ResponseWrapper> {
    if (this.body !== undefined) {
      // Remove previous body if it exists
      if (this.requestOptions.body) delete this.requestOptions.body;

      // Process the body based on its type
      if (this.bodyType === BodyType.JSON) {
        this.requestOptions.body = JSON.stringify(this.body);
      } else {
        this.requestOptions.body = this.body;
      }
    }

    return super.getResponse();
  }
}
