import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { RequestError } from "../src/RequestError.js";

describe("RequestError", () => {
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
    assert.equal(error.isTimeout, undefined);
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
    assert.equal(error.message, "Timeout: 5000ms");
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
    assert.equal(error.isTimeout, undefined);
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
    assert.equal(error.isTimeout, undefined);
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
});
