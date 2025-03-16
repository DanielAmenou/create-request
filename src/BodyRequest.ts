import { BaseRequest } from "./BaseRequest";
import type { Body } from "./types";

// An extension of BaseRequest for methods that support request bodies
export abstract class BodyRequest extends BaseRequest {
  /**
   * Sets the request body with appropriate content type handling
   */
  withBody(body: Body): this {
    if (body === undefined || body === null) {
      this.requestOptions.body = null;
      return this;
    }

    // Handle special body types that don't need transformation
    if (
      body instanceof Blob ||
      body instanceof FormData ||
      body instanceof URLSearchParams ||
      body instanceof ArrayBuffer ||
      body instanceof ReadableStream
    ) {
      this.requestOptions.body = body;

      // For FormData, make sure to NOT explicitly set Content-Type
      // The browser will set it automatically with the correct boundary
      // If we set it manually, it would be missing the boundary parameter
      return this;
    }

    // Handle strings
    if (typeof body === "string") {
      this.requestOptions.body = body;
      return this;
    }

    // For objects and other types, stringify and set JSON content-type
    try {
      this.requestOptions.body = JSON.stringify(body);
      this.requestOptions.headers = {
        "Content-Type": "application/json",
        ...((this.requestOptions.headers as Record<string, string>) || {}),
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to stringify request body: ${errorMessage}`);
    }

    return this;
  }
}
