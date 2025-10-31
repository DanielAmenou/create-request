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
    assert.equal(error.message, "Request timed out after 5000ms");
    assert.equal(error.url, "https://api.example.com");
    assert.equal(error.method, "GET");
    assert.equal(error.isTimeout, true);
  });

  it("should create a network error RequestError", () => {
    // Arrange
    const originalError = new Error("Connection failed");

    // Act
    const error = RequestError.networkError("https://api.example.com", "GET", originalError);

    // Assert
    assert.equal(error.message, "Network error: Connection failed");
    assert.equal(error.url, "https://api.example.com");
    assert.equal(error.method, "GET");
  });

  it("should create a RequestError from Response", () => {
    // Arrange
    // Arrange
    const mockResponse = new Response("Not found", { status: 404, statusText: "Not Found" });

    // Act
    const error = RequestError.fromResponse(mockResponse, "https://api.example.com", "GET");

    // Assert
    assert.equal(error.message, "Request failed with status 404");
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
