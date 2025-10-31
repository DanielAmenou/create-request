import { BaseRequest } from "./BaseRequest.js";
import { BodyType } from "./enums.js";
import type { Body } from "./types.js";
import type { ResponseWrapper } from "./ResponseWrapper.js";

/**
 * Base class for requests that can have a body (POST, PUT, PATCH)
 */
export abstract class BodyRequest extends BaseRequest {
  protected body?: Body;
  private bodyType?: BodyType;

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
      !(body instanceof FormData || body instanceof Blob || body instanceof ArrayBuffer || body instanceof URLSearchParams || body instanceof ReadableStream)
    ) {
      this.bodyType = BodyType.JSON;
      this.setContentTypeIfNeeded("application/json");

      // Validate JSON is stringifiable early
      try {
        JSON.stringify(body);
      } catch (error) {
        throw new Error(`Failed to stringify request body: ${String(error)}`);
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
   * @returns The request instance for chaining
   *
   * @example
   * const request = new PostRequest('/graphql')
   *   .withGraphQL('query { user(id: $id) { name email } }', { id: '123' });
   *
   * @example
   * const request = new PostRequest('/graphql')
   *   .withGraphQL('mutation { createUser(name: $name) { id } }', { name: 'John' });
   */
  withGraphQL(query: string, variables?: Record<string, unknown>): this {
    if (typeof query !== "string" || query.trim().length === 0) {
      throw new Error("GraphQL query must be a non-empty string");
    }

    const graphQLBody: { query: string; variables?: Record<string, unknown> } = {
      query: query.trim(),
    };

    if (variables !== undefined) {
      if (typeof variables !== "object" || variables === null || Array.isArray(variables)) {
        throw new Error("GraphQL variables must be an object");
      }
      graphQLBody.variables = variables;
    }

    // Validate JSON is stringifiable early
    try {
      JSON.stringify(graphQLBody);
    } catch (error) {
      throw new Error(`Failed to stringify GraphQL body: ${String(error)}`);
    }

    this.body = graphQLBody;
    this.bodyType = BodyType.JSON;
    this.setContentTypeIfNeeded("application/json");

    return this;
  }

  private setContentTypeIfNeeded(contentType: string): void {
    // Only set if not already set
    const headers = this.requestOptions.headers as Record<string, string>;
    if (!Object.keys(headers).some(header => header.toLowerCase() === "content-type")) {
      this.withContentType(contentType);
    }
  }

  /**
   * Execute the request and return the ResponseWrapper
   * Overrides the base implementation to add body handling
   */
  async get(): Promise<ResponseWrapper> {
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

    return super.get();
  }
}
