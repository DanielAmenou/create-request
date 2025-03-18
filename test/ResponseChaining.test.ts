import assert from "node:assert/strict";
import { Blob } from "node:buffer";
import { describe, it, beforeEach, afterEach } from "node:test";
import { GetRequest } from "../src/requestMethods";
import { FetchMock } from "./utils/fetchMock";

describe("Response Chaining API", () => {
  beforeEach(() => {
    FetchMock.install();
  });

  afterEach(() => {
    FetchMock.reset();
    FetchMock.restore();
  });

  it("should support chained getJson() call after sendTo", async () => {
    // Arrange
    const expectedData = { name: "John", age: 30 };
    FetchMock.mockResponseOnce({ body: expectedData });
    const request = new GetRequest();

    // Act
    const result = await request.sendTo("https://api.example.com/user").getJson();

    // Assert
    assert.deepEqual(result, expectedData);
  });

  it("should support chained getText() call after sendTo", async () => {
    // Arrange
    const expectedText = "Hello, World!";
    FetchMock.mockResponseOnce({ body: expectedText });
    const request = new GetRequest();

    // Act
    const result = await request.sendTo("https://api.example.com/text").getText();

    // Assert
    assert.equal(result, expectedText);
  });

  it("should support chained getBlob() call after sendTo", async () => {
    // Arrange
    FetchMock.mockResponseOnce({ body: "Binary data" });
    const request = new GetRequest();

    // Act
    const result = await request.sendTo("https://api.example.com/file").getBlob();

    // Assert
    assert(result instanceof Blob);
  });

  it("should support chained getArrayBuffer() call after sendTo", async () => {
    // Arrange
    FetchMock.mockResponseOnce({ body: "Binary data" });
    const request = new GetRequest();

    // Act
    const result = await request.sendTo("https://api.example.com/binary").getArrayBuffer();

    // Assert
    assert(result instanceof ArrayBuffer);
  });

  it("should support chained getBody() call after sendTo", async () => {
    // Arrange
    FetchMock.mockResponseOnce({ body: "Stream content" });
    const request = new GetRequest();

    // Act
    const result = await request.sendTo("https://api.example.com/stream").getBody();

    // Assert
    assert(result instanceof ReadableStream);
  });

  it("should handle types in getJson() generic parameter", async () => {
    // Arrange
    interface User {
      id: number;
      name: string;
      isActive: boolean;
    }

    const userData: User = {
      id: 123,
      name: "John Doe",
      isActive: true,
    };

    FetchMock.mockResponseOnce({ body: userData });
    const request = new GetRequest();

    // Act
    const result = await request.sendTo("https://api.example.com/user").getJson<User>();

    // Assert
    assert.equal(result.id, 123);
    assert.equal(result.name, "John Doe");
    assert.equal(result.isActive, true);
  });

  it("should allow accessing raw response and chaining methods", async () => {
    // Arrange
    const expectedData = { success: true };
    FetchMock.mockResponseOnce({
      status: 201,
      statusText: "Created",
      body: expectedData,
      headers: { Location: "/resources/123" },
    });

    const request = new GetRequest();

    // Act
    const response = await request.sendTo("https://api.example.com/create");

    // Assert response properties first
    assert.equal(response.status, 201);
    assert.equal(response.statusText, "Created");
    assert.equal(response.headers.get("Location"), "/resources/123");

    // Then chain a method
    const data = await response.getJson();
    assert.deepEqual(data, expectedData);
  });

  it("should support Promise-style then() chaining after sendTo", async () => {
    // Arrange
    const expectedData = { name: "Jane", age: 25 };
    FetchMock.mockResponseOnce({ body: expectedData });
    const request = new GetRequest();

    // Act & Assert
    await request
      .sendTo("https://api.example.com/user")
      .then(response => {
        assert.equal(response.ok, true);
        return response.getJson();
      })
      .then(data => {
        assert.deepEqual(data, expectedData);
      });
  });

  it("should handle errors with separate await statements", async () => {
    // Arrange
    FetchMock.mockResponseOnce({
      status: 400,
      statusText: "Bad Request",
      body: { error: "Invalid request" },
    });
    const request = new GetRequest();

    // Act & Assert
    try {
      await request.sendTo("https://api.example.com/error");
      assert.fail("Should have thrown an error for status 400");
    } catch (error: any) {
      // Assert error properties
      assert.equal(error.status, 400);
      assert.equal(error.url, "https://api.example.com/error");
      assert.equal(error.method, "GET");
    }
  });

  it("should handle invalid JSON with separate await statements", async () => {
    // Arrange
    FetchMock.mockResponseOnce({
      body: "Not valid JSON",
      headers: { "Content-Type": "application/json" },
    });
    const request = new GetRequest();

    // Act
    const response = await request.sendTo("https://api.example.com/invalid");

    // Assert
    try {
      await response.getJson();
      assert.fail("Should have thrown an error for invalid JSON");
    } catch (error) {
      assert(error instanceof Error);
    }
  });

  it("should handle errors with Promise-style then/catch chaining", async () => {
    // Arrange
    FetchMock.mockResponseOnce({
      status: 500,
      statusText: "Server Error",
      body: "Internal Server Error",
    });
    const request = new GetRequest();

    // Act & Assert
    let errorStatus = 0;
    let errorUrl = "";

    await request
      .sendTo("https://api.example.com/server-error")
      .then(() => {
        assert.fail("Should not reach this point for status 500");
      })
      .catch(error => {
        errorStatus = error.status;
        errorUrl = error.url;
      });

    assert.equal(errorStatus, 500);
    assert.equal(errorUrl, "https://api.example.com/server-error");
  });

  it("should handle error responses appropriately", async () => {
    // Arrange
    FetchMock.mockResponseOnce({
      status: 404,
      statusText: "Not Found",
      body: { message: "Resource not found" },
    });
    const request = new GetRequest();

    // Act & Assert
    try {
      await request.sendTo("https://api.example.com/missing");
      assert.fail("Should have thrown for 404 status");
    } catch (error: any) {
      // Assert proper error properties
      assert.equal(error.status, 404);
      assert.equal(error.url, "https://api.example.com/missing");

      // Test that the error contains the response data if available
      if (error.response) {
        const errorData = await error.response.json().catch(() => ({}));
        assert.deepEqual(errorData, { message: "Resource not found" });
      }
    }
  });

  it("should handle JSON response with special characters and unicode", async () => {
    // Arrange
    const expectedData = {
      specialChars: "!@#$%^&*()",
      unicodeText: "你好，世界",
      emojis: "😀🚀✨🌍",
    };
    FetchMock.mockResponseOnce({ body: expectedData });
    const request = new GetRequest();

    // Act
    const result = await request.sendTo("https://api.example.com/unicode").getJson();

    // Assert
    assert.deepEqual(result, expectedData);
  });

  it("should handle empty response bodies correctly", async () => {
    // Arrange
    FetchMock.mockResponseOnce({
      status: 200,
      statusText: "OK",
      body: "",
    });
    const request = new GetRequest();

    // Act
    const response = await request.sendTo("https://api.example.com/no-content");

    // Assert
    assert.equal(response.status, 200);
    const textContent = await response.getText();
    assert.equal(textContent, "");
  });

  it("should handle error with null response", async () => {
    // Arrange
    FetchMock.mockResponseOnce({
      status: 503,
      statusText: "Service Unavailable",
      body: null,
    });
    const request = new GetRequest();

    // Act & Assert
    try {
      await request.sendTo("https://api.example.com/unavailable");
      assert.fail("Should have thrown an error for status 503");
    } catch (error: any) {
      // Assert error properties
      assert.equal(error.status, 503);
      assert.equal(error.url, "https://api.example.com/unavailable");
      // Verify the error response can handle null body
      if (error.response) {
        const textResponse = await error.response.text();
        assert.equal(textResponse, "");
      }
    }
  });

  it("should handle malformed JSON with specific parsing error", async () => {
    // Arrange
    const malformedJson = "{ name: 'John', age: 30 }"; // Missing quotes around name
    FetchMock.mockResponseOnce({
      body: malformedJson,
      headers: { "Content-Type": "application/json" },
    });
    const request = new GetRequest();

    // Act
    const response = await request.sendTo("https://api.example.com/malformed");

    // Assert
    try {
      await response.getJson();
      assert.fail("Should have thrown a SyntaxError for malformed JSON");
    } catch (error) {
      assert(error instanceof SyntaxError);
    }
  });

  it("should chain multiple operations after sendTo", async () => {
    // Arrange
    interface UserData {
      users: Array<{ id: number; name: string }>;
    }

    const userData = {
      users: [
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
      ],
    };
    FetchMock.mockResponseOnce({
      status: 200,
      body: userData,
    });
    const request = new GetRequest();

    // Act - multiple chained operations
    let responseStatus = 0;
    let data: UserData | null = null;
    let firstUserName = "";

    await request
      .sendTo("https://api.example.com/users")
      .then(response => {
        responseStatus = response.status;
        return response.getJson<UserData>();
      })
      .then(result => {
        data = result;
        return result.users[0];
      })
      .then(firstUser => {
        firstUserName = firstUser.name;
      });

    // Assert
    assert.equal(responseStatus, 200);
    assert.deepEqual(data, userData);
    assert.equal(firstUserName, "Alice");
  });

  it("should support async error handling with Promise catch", async () => {
    // Arrange
    FetchMock.mockResponseOnce({
      status: 429,
      statusText: "Too Many Requests",
      body: { message: "Rate limit exceeded" },
    });
    const request = new GetRequest();

    // Act
    const errorResult = await request
      .sendTo("https://api.example.com/rate-limited")
      .then(() => {
        return "This should not execute";
      })
      .catch(async error => {
        // Check if we can extract the response data from the error
        if (error.response) {
          try {
            const errorBody = (await error.response.json()) as { message: string };
            return errorBody.message;
          } catch {
            return "Error parsing response";
          }
        }
        return "Unknown error";
      });

    // Assert
    assert.equal(errorResult, "Rate limit exceeded");
  });

  it("should handle nested promise chains with response data", async () => {
    // Arrange
    const orderData = { id: "order-123", items: [1, 2, 3] };
    const userData = { id: "user-456", name: "Jane" };

    // Mock sequential responses
    FetchMock.mockResponseOnce({ body: orderData });
    FetchMock.mockResponseOnce({ body: userData });

    const request = new GetRequest();

    // Act - nested promise chain
    const result = await request
      .sendTo("https://api.example.com/order")
      .then(response => {
        return response.getJson();
      })
      .then(order => {
        // Use order data to make another request
        return new GetRequest()
          .sendTo(`https://api.example.com/user`)
          .then(response => response.getJson())
          .then(user => {
            // Combine data from both requests
            return {
              orderInfo: order,
              userInfo: user,
            };
          });
      });

    // Assert
    assert.deepEqual(result.orderInfo, orderData);
    assert.deepEqual(result.userInfo, userData);
  });

  it("should handle response type conversion failures", async () => {
    // Arrange
    const plainTextContent = "This is plain text";

    // Mock the response twice since we'll need to consume it twice
    FetchMock.mockResponseOnce({
      body: plainTextContent,
      headers: { "Content-Type": "text/plain" },
    });

    FetchMock.mockResponseOnce({
      body: plainTextContent,
      headers: { "Content-Type": "text/plain" },
    });

    const request = new GetRequest();

    // Act & Assert - First attempt as JSON should fail
    const response1 = await request.sendTo("https://api.example.com/text-only");
    try {
      await response1.getJson();
      assert.fail("Should have thrown an error when parsing text as JSON");
    } catch (error) {
      assert(error instanceof SyntaxError);
    }

    // Second request - getting it as text should work
    const response2 = await request.sendTo("https://api.example.com/text-only");
    const textContent = await response2.getText();
    assert.equal(textContent, plainTextContent);
  });

  it("should handle finally clauses in promise chains", async () => {
    // Arrange
    FetchMock.mockResponseOnce({
      status: 403,
      statusText: "Forbidden",
      body: { reason: "Access denied" },
    });
    const request = new GetRequest();

    // Variables to track execution flow
    let finallyExecuted = false;
    let errorCaught = false;

    // Act
    await request
      .sendTo("https://api.example.com/restricted")
      .then(() => {
        assert.fail("Should not execute then block on error");
      })
      .catch(error => {
        errorCaught = true;
        assert.equal(error.status, 403);
      })
      .finally(() => {
        finallyExecuted = true;
      });

    // Assert
    assert.equal(errorCaught, true);
    assert.equal(finallyExecuted, true);
  });
});
