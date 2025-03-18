import { BaseRequest } from "./BaseRequest";
import { BodyType } from "./enums";
import type { Body } from "./types";

/**
 * Base class for requests that can have a body (POST, PUT, PATCH)
 */
export abstract class BodyRequest extends BaseRequest {
  protected body?: Body;
  private bodyType?: BodyType;

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

  private setContentTypeIfNeeded(contentType: string): void {
    // Only set if not already set
    const headers = this.requestOptions.headers as Record<string, string>;
    if (!Object.keys(headers).some(header => header.toLowerCase() === "content-type")) {
      this.withContentType(contentType);
    }
  }

  /**
   * Send the request to the specified URL
   * Overrides the base implementation to add body handling
   */
  sendTo(url: string): ReturnType<BaseRequest["sendTo"]> {
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

    return super.sendTo(url);
  }
}
