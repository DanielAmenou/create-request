import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { RequestError } from "../src/RequestError.js";

describe("RequestError", { timeout: 10000 }, () => {
  it("should create a basic RequestError", () => {
    // Arrange & Act
    const error = new RequestError("Test error", "https://api.example.com", "GET");

    // Assert
    assert.equal(error.message, "Test error");
    assert.equal(error.url, "https://api.example.com");
    assert.equal(error.method, "GET");
    assert.equal(error.name, "RequestError");
    assert.equal(error.status, undefined);
    assert.equal(error.response, undefined);
    assert.equal(error.isTimeout, false);
    assert.equal(error.isAborted, false);
  });

  it("should create a RequestError with status and response", () => {
    // Arrange
    const mockResponse = new Response("Not found", { status: 404, statusText: "Not Found" });

    // Act
    const error = new RequestError("Request failed with status 404", "https://api.example.com", "GET", { status: 404, response: mockResponse });

    // Assert
    assert.equal(error.status, 404);
    assert.equal(error.response, mockResponse);
  });

  it("should create a timeout RequestError", () => {
    // Arrange & Act
    const error = RequestError.timeout("https://api.example.com", "GET", 5000);

    // Assert
    assert.equal(error.message, "Timeout:5000");
    assert.equal(error.url, "https://api.example.com");
    assert.equal(error.method, "GET");
    assert.equal(error.isTimeout, true);
    // Timeout errors don't have status or response because the request was aborted before receiving a response
    assert.equal(error.status, undefined);
    assert.equal(error.response, undefined);
  });

  it("should create a network error RequestError", () => {
    // Arrange
    const originalError = new Error("Connection failed");

    // Act
    const error = RequestError.networkError("https://api.example.com", "GET", originalError);

    // Assert
    assert.equal(error.message, "Connection failed");
    assert.equal(error.url, "https://api.example.com");
    assert.equal(error.method, "GET");
    assert.equal(error.isTimeout, false);
  });

  it("should detect TimeoutError from Node.js/undici and set isTimeout", () => {
    // Arrange - Simulate Node.js/undici TimeoutError
    const timeoutError = new Error("The operation was aborted due to timeout");
    timeoutError.name = "TimeoutError";

    // Act
    const error = RequestError.networkError("https://api.example.com", "GET", timeoutError);

    // Assert
    assert.equal(error.isTimeout, true);
    assert.ok(error.message.includes("timeout") || error.message.includes("Timeout"));
  });

  it("should detect timeout errors from error message", () => {
    // Arrange
    const timeoutError = new Error("Request timeout");

    // Act
    const error = RequestError.networkError("https://api.example.com", "GET", timeoutError);

    // Assert
    assert.equal(error.isTimeout, true);
  });

  it("should detect timeout errors with 'aborted due to timeout' message", () => {
    // Arrange
    const timeoutError = new Error("The operation was aborted due to timeout");

    // Act
    const error = RequestError.networkError("https://api.example.com", "GET", timeoutError);

    // Assert
    assert.equal(error.isTimeout, true);
  });

  it("should detect timeout errors with ETIMEDOUT error code", () => {
    // Arrange
    const timeoutError = new Error("Connection timeout") as Error & { code?: string };
    timeoutError.code = "ETIMEDOUT";

    // Act
    const error = RequestError.networkError("https://api.example.com", "GET", timeoutError);

    // Assert
    assert.equal(error.isTimeout, true);
  });

  it("should not set isTimeout for non-timeout network errors", () => {
    // Arrange
    const networkError = new Error("Connection failed");
    networkError.name = "Error";

    // Act
    const error = RequestError.networkError("https://api.example.com", "GET", networkError);

    // Assert
    assert.equal(error.isTimeout, false);
  });

  it("should handle error without stack property", () => {
    // Arrange - Test stack property access when stack is undefined
    const errorWithoutStack = new Error("Test error");
    delete (errorWithoutStack as any).stack;

    // Act
    const requestError = RequestError.networkError("https://api.example.com", "GET", errorWithoutStack);

    // Assert - should still work without stack
    assert.ok(requestError instanceof RequestError);
    assert.equal(requestError.message, "Test error");
  });

  it("should handle error with stack property in networkError", () => {
    // Arrange - Test stack property access
    const originalError = new Error("Original error");
    originalError.stack = "Error: Original error\n    at test.js:1:1";

    // Act
    const requestError = RequestError.networkError("https://api.example.com", "GET", originalError);

    // Assert - stack should be enhanced
    assert.ok(requestError.stack);
    assert.ok(requestError.stack.includes("Caused by:"));
    assert.ok(requestError.stack.includes(originalError.stack));
  });

  it("should create a RequestError from Response", () => {
    // Arrange
    // Arrange
    const mockResponse = new Response("Not found", { status: 404, statusText: "Not Found" });

    // Act
    const error = RequestError.fromResponse(mockResponse, "https://api.example.com", "GET");

    // Assert
    assert.equal(error.message, "HTTP 404");
    assert.equal(error.url, "https://api.example.com");
    assert.equal(error.method, "GET");
    assert.equal(error.status, 404);
    assert.equal(error.response, mockResponse);
  });

  it("should maintain instanceof checks", () => {
    // Arrange & Act
    const error = new RequestError("Test error", "https://api.example.com", "GET");

    // Assert
    assert.ok(error instanceof Error);
    assert.ok(error instanceof RequestError);
  });

  describe("body property", () => {
    it("should create a RequestError with a body", () => {
      // Arrange & Act
      const error = new RequestError("HTTP 400", "https://api.example.com", "POST", {
        status: 400,
        body: '{"message":"Invalid email"}',
      });

      // Assert
      assert.equal(error.body, '{"message":"Invalid email"}');
    });

    it("should leave body undefined when not provided", () => {
      // Arrange & Act
      const error = new RequestError("Test error", "https://api.example.com", "GET");

      // Assert
      assert.equal(error.body, undefined);
    });

    it("should include the body in fromResponse when provided", () => {
      // Arrange
      const mockResponse = new Response('{"error":"Not found"}', { status: 404 });

      // Act
      const error = RequestError.fromResponse(mockResponse, "https://api.example.com", "GET", '{"error":"Not found"}');

      // Assert
      assert.equal(error.status, 404);
      assert.equal(error.body, '{"error":"Not found"}');
    });

    it("should keep fromResponse backward compatible without a body", () => {
      // Arrange
      const mockResponse = new Response("Not found", { status: 404 });

      // Act
      const error = RequestError.fromResponse(mockResponse, "https://api.example.com", "GET");

      // Assert
      assert.equal(error.message, "HTTP 404");
      assert.equal(error.body, undefined);
    });
  });

  describe("getJson()", () => {
    it("should parse a JSON body", () => {
      // Arrange
      const error = new RequestError("HTTP 422", "https://api.example.com", "POST", {
        status: 422,
        body: '{"message":"Validation failed","fields":["email"]}',
      });

      // Act
      const data = error.getJson<{ message: string; fields: string[] }>();

      // Assert
      assert.deepEqual(data, { message: "Validation failed", fields: ["email"] });
    });

    it("should return undefined for a non-JSON body", () => {
      // Arrange
      const error = new RequestError("HTTP 500", "https://api.example.com", "GET", {
        status: 500,
        body: "<html>Internal Server Error</html>",
      });

      // Act & Assert - must not throw
      assert.equal(error.getJson(), undefined);
    });

    it("should return undefined when there is no body", () => {
      // Arrange
      const error = new RequestError("Aborted", "https://api.example.com", "GET", { isAborted: true });

      // Act & Assert
      assert.equal(error.getJson(), undefined);
    });

    it("should return undefined for an empty body", () => {
      // Arrange
      const error = new RequestError("HTTP 404", "https://api.example.com", "GET", { status: 404, body: "" });

      // Act & Assert
      assert.equal(error.getJson(), undefined);
    });

    it("should cache the parsed body across calls", () => {
      // Arrange
      const error = new RequestError("HTTP 400", "https://api.example.com", "GET", {
        status: 400,
        body: '{"a":1}',
      });

      // Act
      const first = error.getJson();
      const second = error.getJson();

      // Assert - the same object reference is returned (parsed only once)
      assert.equal(first, second);
      assert.deepEqual(first, { a: 1 });
    });
  });

  describe("captureBody()", () => {
    it("should read the body without consuming the original response", async () => {
      // Arrange
      const response = new Response('{"error":"Not found"}', { status: 404 });

      // Act
      const body = await RequestError.captureBody(response);

      // Assert
      assert.equal(body, '{"error":"Not found"}');
      assert.equal(response.bodyUsed, false);
      // The original response body is still readable
      assert.deepEqual(await response.json(), { error: "Not found" });
    });

    it("should return undefined when the body was already consumed", async () => {
      // Arrange
      const response = new Response("data", { status: 500 });
      await response.text();

      // Act & Assert
      assert.equal(await RequestError.captureBody(response), undefined);
    });

    it("should return an empty string for an empty body", async () => {
      // Arrange
      const response = new Response(null, { status: 404 });

      // Act & Assert
      assert.equal(await RequestError.captureBody(response), "");
    });
  });
});
