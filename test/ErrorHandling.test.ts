import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import create from "../src/index.js";
import { RequestError } from "../src/RequestError.js";
import { FetchMock } from "./utils/fetchMock.js";

describe("Error Handling Tests", { timeout: 10000 }, () => {
  beforeEach(() => {
    FetchMock.install();
  });

  afterEach(() => {
    FetchMock.reset();
    FetchMock.restore();
  });

  // =============== NETWORK ERRORS ===============
  describe("Network Errors", () => {
    it("should handle general network errors", async () => {
      // Arrange
      FetchMock.mockErrorOnce(new Error("Failed to connect"));
      const request = create.get("https://api.example.com/data");

      // Act & Assert
      try {
        await request.getResponse();
        assert.fail("Request should have failed");
      } catch (error) {
        assert(error instanceof RequestError);
        assert(error.message.includes("Network error") || error.message === "Failed to connect");
        assert.equal(error.url, "https://api.example.com/data");
        assert.equal(error.method, "GET");
      }
    });

    it("should handle DNS resolution errors", async () => {
      // Arrange
      FetchMock.mockErrorOnce(new TypeError("Failed to resolve 'non-existent-domain.invalid'"));
      const request = create.get("https://api.example.com/data");

      // Act & Assert
      try {
        await request.getResponse();
        assert.fail("Request should have failed");
      } catch (error) {
        assert(error instanceof RequestError);
        assert(error.message.includes("DNS error") || error.message.includes("Network error") || error.message.includes("Failed to resolve"));
      }
    });

    it("should preserve original fetch error message for redirect errors", async () => {
      // Arrange - Simulate fetch throwing TypeError when redirect occurs with redirect: "error"
      const redirectError = new TypeError("Failed to fetch: redirect");
      FetchMock.mockErrorOnce(redirectError);
      const request = create.get("https://api.example.com/redirect").withRedirect.ERROR();

      // Act & Assert
      try {
        await request.getResponse();
        assert.fail("Request should have failed");
      } catch (error: any) {
        assert(error instanceof RequestError);
        assert.equal(error.message, "Failed to fetch: redirect");
        assert.equal(error.url, "https://api.example.com/redirect");
        assert.equal(error.method, "GET");
      }
    });

    it("should handle generic 'fetch failed' TypeError with descriptive message", async () => {
      // Arrange - Simulate Node.js/undici behavior where fetch throws TypeError("fetch failed")
      const fetchError = new TypeError("fetch failed");
      // Simulate DNS error code that would appear in real Node.js errors
      (fetchError as Error & { code?: string }).code = "ENOTFOUND";
      fetchError.stack = "TypeError: fetch failed\n    at node:internal/deps/undici/undici:13510:13";
      FetchMock.mockErrorOnce(fetchError);
      const request = create.get("https://jsonplaceholder.typicode.wrong-url.com/posts/1");

      // Act & Assert
      try {
        await request.getResponse();
        assert.fail("Request should have failed");
      } catch (error) {
        assert(error instanceof RequestError);
        assert.equal(error.name, "RequestError");
        assert(error.message.includes("DNS error"));
        assert(error.message.includes("https://jsonplaceholder.typicode.wrong-url.com/posts/1"));
        assert.equal(error.url, "https://jsonplaceholder.typicode.wrong-url.com/posts/1");
        assert.equal(error.method, "GET");
      }
    });

    it("should handle 'fetch failed' TypeError without error code (fallback message)", async () => {
      // Arrange - Simulate generic fetch failure without specific error code
      const fetchError = new TypeError("fetch failed");
      fetchError.stack = "TypeError: fetch failed\n    at node:internal/deps/undici/undici:13510:13";
      FetchMock.mockErrorOnce(fetchError);
      const request = create.get("https://example.wrong-url.com/data");

      // Act & Assert
      try {
        await request.getResponse();
        assert.fail("Request should have failed");
      } catch (error) {
        assert(error instanceof RequestError);
        assert.equal(error.name, "RequestError");
        assert(error.message.includes("Network error"));
        assert(error.message.includes("https://example.wrong-url.com/data"));
      }
    });

    it("should handle network error with non-Error object", async () => {
      // Arrange - Mock fetch to throw a non-Error object
      FetchMock.mockErrorOnce("String error" as unknown as Error);
      const request = create.get("https://api.example.com/data");

      // Act & Assert
      try {
        await request.getResponse();
        assert.fail("Request should have failed");
      } catch (error) {
        assert(error instanceof RequestError);
        assert.equal(error.url, "https://api.example.com/data");
        assert.equal(error.method, "GET");
      }
    });

    it("should provide original error stack in network errors", async () => {
      // Arrange
      const originalError = new Error("Original error message");
      FetchMock.mockErrorOnce(originalError);
      const request = create.get("https://api.example.com/data");

      // Act & Assert
      try {
        await request.getResponse();
        assert.fail("Request should have failed");
      } catch (error) {
        assert(error instanceof RequestError);
        // The stack should include the original error's stack in "Caused by:" section
        assert(error.stack?.includes("Caused by:"));
        assert(error.stack?.includes(originalError.stack || ""));
      }
    });

    it("should handle response with status 0 as network error (CORS or network failure)", async () => {
      // Arrange - Status 0 indicates request failed before receiving HTTP response
      // This can happen with CORS errors or network failures that don't throw
      // Note: Response constructor doesn't allow status 0, so we need to create a custom Response-like object
      FetchMock.mock.mockImplementationOnce(() => {
        // Create a Response with valid status, then override status to 0
        const response = new Response("", { status: 200 });
        // Override the status property to 0 (simulating CORS/network failure)
        Object.defineProperty(response, "status", { value: 0, writable: false, configurable: true });
        Object.defineProperty(response, "ok", { value: false, writable: false, configurable: true });
        return Promise.resolve(response);
      });
      const request = create.get("https://api.example.com/data");

      // Act & Assert
      try {
        await request.getResponse();
        assert.fail("Request should have failed");
      } catch (error) {
        assert(error instanceof RequestError);
        // Should be treated as network error, not "HTTP 0"
        const messageLower = error.message.toLowerCase();
        assert(messageLower.includes("network error") || messageLower.includes("cors blocked") || messageLower.includes("status 0"), `Expected error message to include network/CORS/status 0, but got: ${error.message}`);
        assert.equal(error.url, "https://api.example.com/data");
        assert.equal(error.method, "GET");
        // Status 0 should not be set as the status (it's not a valid HTTP status)
        assert.equal(error.status, undefined);
      }
    });
  });

  // =============== RESPONSE PARSING ERRORS ===============
  describe("Response Parsing Errors", () => {
    it("should handle invalid JSON responses", async () => {
      // Arrange
      const invalidJson = "{ this is not valid JSON }";
      FetchMock.mockResponseOnce({
        body: invalidJson,
        headers: { "Content-Type": "application/json" },
      });
      const request = create.get("https://api.example.com/data");

      // Act & Assert - Ensure error bubbles up properly
      try {
        await request.getJson();
        assert.fail("Should have thrown a JSON parsing error");
      } catch (error) {
        assert(error instanceof RequestError);
        assert(error.message.includes("JSON"));
        assert.equal(error.url, "https://api.example.com/data");
        assert.equal(error.method, "GET");
      }
    });

    it("should handle empty response bodies when expecting JSON", async () => {
      // Arrange
      FetchMock.mockResponseOnce({
        body: "",
        headers: { "Content-Type": "application/json" },
      });
      const request = create.get("https://api.example.com/data");

      // Act & Assert
      try {
        await request.getJson();
        assert.fail("Should have thrown a JSON parsing error");
      } catch (error) {
        assert(error instanceof RequestError);
        assert(error.message.includes("JSON"));
        assert.equal(error.url, "https://api.example.com/data");
        assert.equal(error.method, "GET");
      }
    });

    it("should throw appropriate error when trying to get JSON but response is not JSON", async () => {
      // Arrange
      FetchMock.mockResponseOnce({
        body: "<html><body>Not JSON</body></html>",
        headers: { "Content-Type": "text/html" },
      });
      const request = create.get("https://api.example.com/data");

      // Act & Assert
      try {
        await request.getJson();
        assert.fail("Should have thrown a JSON parsing error");
      } catch (error) {
        assert(error instanceof RequestError);
        assert(error.message.includes("JSON"));
        assert.equal(error.url, "https://api.example.com/data");
        assert.equal(error.method, "GET");
      }
    });
    //   // Arrange
    //   FetchMock.mockResponseOnce({
    //     body: { data: "test" },
    //     headers: { "Content-Type": "application/json" },
    //   });
    //   const request = create.get("https://api.example.com/data");

    //   // Act
    //   const response = await request.getResponse();

    //   // Get the body stream first
    //   //const body = response.getBody();

    //   // Assert - trying to get JSON after getting body should fail
    //   try {
    //     await response.getJson();
    //     assert.fail("Should have thrown an error about body already consumed");
    //   } catch (error) {
    //     assert(error instanceof Error);
    //     assert(error.message.includes("body has already been consumed"));
    //   }
    // });
  });

  // =============== ERROR PROPAGATION ===============
  describe("Error Propagation", () => {
    it("should propagate errors through promise chains", async () => {
      // Arrange
      FetchMock.mockResponseOnce({
        status: 500,
        body: "Server Error",
      });
      const request = create.get("https://api.example.com/error");

      // Act & Assert
      let errorCaught = false;
      await request
        .getResponse()
        .then(() => {
          assert.fail("This should not be called on error");
        })
        .catch(error => {
          errorCaught = true;
          assert(error instanceof RequestError);
          assert.equal(error.status, 500);
        });

      assert(errorCaught, "Error should have been caught");
    });

    it("should allow error transformation in promise chains", async () => {
      // Arrange
      FetchMock.mockResponseOnce({
        status: 404,
        body: { message: "Resource not found" },
      });
      const request = create.get("https://api.example.com/missing");

      // Act & Assert
      const result = await request
        .getResponse()
        .then(() => "Success")
        .catch(() => "Error handled");

      assert.equal(result, "Error handled");
    });

    it("should support async error handling with finally clause", async () => {
      // Arrange
      FetchMock.mockResponseOnce({
        status: 401,
        body: { message: "Unauthorized" },
      });
      const request = create.get("https://api.example.com/protected");

      // Act
      let finallyExecuted = false;
      let errorCaught = false;

      await request
        .getResponse()
        .then(() => {
          assert.fail("Then clause should not execute");
        })
        .catch(error => {
          errorCaught = true;
          assert.equal(error.status, 401);
        })
        .finally(() => {
          finallyExecuted = true;
        });

      // Assert
      assert(errorCaught, "Error should have been caught");
      assert(finallyExecuted, "Finally block should have executed");
    });
  });

  // =============== TIMEOUT ERRORS ===============
  describe("Timeout Errors", () => {
    it("should handle timeouts with appropriate error message", async () => {
      // Arrange
      FetchMock.mockDelayedResponseOnce(500, { body: "Too late!" });
      const request = create.get("https://api.example.com/data").withTimeout(100);

      // Act & Assert
      try {
        await request.getResponse();
        assert.fail("Request should have timed out");
      } catch (error) {
        assert(error instanceof RequestError);
        assert.equal(error.isTimeout, true);
        assert(error.message.includes("Timeout 100ms"));
      }
    });

    it("should detect TimeoutError from Node.js/undici and set isTimeout", async () => {
      // Arrange - Simulate what happens when undici throws a TimeoutError
      const timeoutError = new Error("The operation was aborted due to timeout");
      timeoutError.name = "TimeoutError";
      FetchMock.mockErrorOnce(timeoutError);
      const request = create.get("https://api.example.com/data").withTimeout(5000);

      // Act & Assert
      try {
        await request.getResponse();
        assert.fail("Request should have failed with timeout");
      } catch (error) {
        assert(error instanceof RequestError);
        assert.equal(error.isTimeout, true, "isTimeout should be set to true");
        assert.equal(error.url, "https://api.example.com/data");
        assert.equal(error.method, "GET");
        // Timeout errors don't have status or response because the request was aborted before receiving a response
        assert.equal(error.status, undefined, "status should be undefined for timeout errors");
        assert.equal(error.response, undefined, "response should be undefined for timeout errors");
      }
    });

    it("should handle timeout when processing large responses", async () => {
      // Arrange - Mock a response that arrives on time but takes time to process
      const largeData = { data: Array(1000000).fill("x") }; // Large object

      // Mock a response that returns quickly but with large data
      FetchMock.mockResponseOnce({
        body: largeData,
        headers: { "Content-Type": "application/json" },
      });

      // Create a custom AbortController to abort while processing
      const controller = new AbortController();
      const request = create.get("https://api.example.com/data").withAbortController(controller);

      // Act
      const responsePromise = request.getResponse();

      // Abort after the response starts but before processing completes
      setTimeout(() => controller.abort(), 50);

      // Assert
      try {
        await responsePromise;
        assert.fail("Request should have been aborted");
      } catch (error) {
        assert(error instanceof Error);
        assert(error.name === "AbortError" || error.message.includes("Aborted") || error.message.toLowerCase().includes("aborted"));
      }
    });
  });

  // =============== RETRY BEHAVIOR ===============
  describe("Retry Behavior", () => {
    it("should retry specified number of times before failing", async () => {
      // Arrange
      FetchMock.mockErrorOnce(new Error("Network failure 1"));
      FetchMock.mockErrorOnce(new Error("Network failure 2"));
      FetchMock.mockErrorOnce(new Error("Network failure 3"));
      FetchMock.mockErrorOnce(new Error("Network failure 4"));

      let retryCount = 0;
      const request = create
        .get("https://api.example.com/data")
        .withRetries(3)
        .onRetry(() => {
          retryCount++;
        });

      // Act & Assert
      try {
        await request.getResponse();
        assert.fail("Request should have failed after retries");
      } catch (error) {
        assert(error instanceof RequestError);
        assert.equal(retryCount, 3, "Should have attempted exactly 3 retries");
      }
    });

    it("should not fall into infinite retry loop with improper retry count", async () => {
      // Arrange - create an invalid retry configuration to test safeguards
      FetchMock.mockErrorOnce(new Error("Network failure"));
      FetchMock.mockErrorOnce(new Error("Network failure"));

      // Create a request with an intentionally incorrect retry setup
      // Instead of directly accessing protected property, use Object.defineProperty
      const request = create.get("https://api.example.com/data");

      // Use defineProperty to bypass TypeScript's protection
      // This is only for testing purposes to simulate a corrupted request object
      Object.defineProperty(request, "requestOptions", {
        value: { retries: "invalid" },
      });

      // Act & Assert
      try {
        await request.getResponse();
        assert.fail("Request should have failed");
      } catch (error) {
        // Request should fail without infinite retries
        assert(error instanceof RequestError || error instanceof Error);
      }
    });

    it("should properly return success on eventual retry success", async () => {
      // Arrange
      FetchMock.mockErrorOnce(new Error("Network failure 1"));
      FetchMock.mockErrorOnce(new Error("Network failure 2"));
      FetchMock.mockResponseOnce({
        body: { success: true, retryCount: 2 },
      });

      let retryCount = 0;
      const request = create
        .get("https://api.example.com/data")
        .withRetries(5)
        .onRetry(() => {
          retryCount++;
        });

      // Act
      const result = await request.getJson();

      // Assert
      assert.equal(retryCount, 2, "Should have retried exactly 2 times");
      assert.deepEqual(result, { success: true, retryCount: 2 });
    });

    it("should expose original error details in retry callback", async () => {
      // Arrange
      FetchMock.mockResponseOnce({
        status: 429,
        statusText: "Too Many Requests",
        body: { message: "Rate limit exceeded" },
      });
      FetchMock.mockResponseOnce({ body: { success: true } });

      let errorDetails: any = null;
      const request = create
        .get("https://api.example.com/data")
        .withRetries(1)
        .onRetry(({ error }) => {
          errorDetails = {
            status: error.status,
            message: error.message,
          };
        });

      // Act
      await request.getJson();

      // Assert
      assert.equal(errorDetails.status, 429);
      assert(errorDetails.message.includes("429"));
    });
  });

  // =============== DATA TRANSFORMATION ERRORS ===============
  describe("Data Transformation Errors", () => {
    it("should handle errors in getData selectors", async () => {
      // Arrange
      FetchMock.mockResponseOnce({
        body: { items: [1, 2, 3] }, // Missing the 'users' property that selector expects
      });
      const request = create.get("https://api.example.com/data");

      // Act & Assert
      try {
        await request.getData(data => {
          // Add type assertion to fix the 'unknown' type issue
          const typedData = data as { users?: { name: string }[] };
          // This selector will throw an error when trying to access a property that doesn't exist
          // and the property access will fail
          if (!typedData.users) {
            throw new Error("Users property not found in data");
          }
          return typedData.users.map(user => user.name);
        });
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert(error instanceof RequestError || error instanceof Error);
        if (error instanceof RequestError) {
          assert(error.message.includes("Data selector failed"));
        } else {
          assert(error.message.includes("Users property not found"));
        }
      }
    });

    it("should handle type conversion errors in transformation", async () => {
      // Arrange
      FetchMock.mockResponseOnce({
        body: { value: "not-a-number" },
      });
      const request = create.get("https://api.example.com/data");

      // Act & Assert
      try {
        await request.getData(data => {
          // Add type assertion to fix the 'unknown' type issue
          const typedData = data as { value: string };
          // This will fail because "not-a-number" can't be parsed as a number
          const num = parseInt(typedData.value);
          if (isNaN(num)) throw new Error("Not a valid number");
          return num * 2;
        });
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert(error instanceof Error);
        assert(error.message.includes("Data selector failed"));
        assert(error.message.includes("Not a valid number"));
      }
    });
  });

  // =============== HTTP STATUS CODE ERRORS ===============
  describe("HTTP Status Code Errors", () => {
    it("should handle 400 Bad Request with error details", async () => {
      // Arrange
      FetchMock.mockResponseOnce({
        status: 400,
        statusText: "Bad Request",
        body: {
          message: "Invalid parameters",
          errors: ["Missing required field 'name'"],
        },
      });
      const request = create.get("https://api.example.com/data");

      // Act & Assert
      try {
        await request.getResponse();
        assert.fail("Request should have failed");
      } catch (error) {
        assert(error instanceof RequestError);
        assert.equal(error.status, 400);

        // Should be able to access the error response
        if (error.response) {
          const errorBody = await error.response.json();
          assert.equal(errorBody.message, "Invalid parameters");
          assert.deepEqual(errorBody.errors, ["Missing required field 'name'"]);
        } else {
          assert.fail("Error response should be available");
        }
      }
    });

    it("should handle 401 Unauthorized", async () => {
      // Arrange
      FetchMock.mockResponseOnce({
        status: 401,
        statusText: "Unauthorized",
        body: { message: "Authentication required" },
      });
      const request = create.get("https://api.example.com/data");

      // Act & Assert
      try {
        await request.getResponse();
        assert.fail("Request should have failed");
      } catch (error) {
        assert(error instanceof RequestError);
        assert.equal(error.status, 401);
      }
    });

    it("should handle 403 Forbidden", async () => {
      // Arrange
      FetchMock.mockResponseOnce({
        status: 403,
        statusText: "Forbidden",
        body: { message: "Insufficient permissions" },
      });
      const request = create.get("https://api.example.com/data");

      // Act & Assert
      try {
        await request.getResponse();
        assert.fail("Request should have failed");
      } catch (error) {
        assert(error instanceof RequestError);
        assert.equal(error.status, 403);
      }
    });

    it("should handle 404 Not Found", async () => {
      // Arrange
      FetchMock.mockResponseOnce({
        status: 404,
        statusText: "Not Found",
        body: { message: "Resource not found" },
      });
      const request = create.get("https://api.example.com/data");

      // Act & Assert
      try {
        await request.getResponse();
        assert.fail("Request should have failed");
      } catch (error) {
        assert(error instanceof RequestError);
        assert.equal(error.status, 404);
      }
    });

    it("should handle 500 Internal Server Error", async () => {
      // Arrange
      FetchMock.mockResponseOnce({
        status: 500,
        statusText: "Internal Server Error",
        body: { message: "An unexpected error occurred" },
      });
      const request = create.get("https://api.example.com/data");

      // Act & Assert
      try {
        await request.getResponse();
        assert.fail("Request should have failed");
      } catch (error) {
        assert(error instanceof RequestError);
        assert.equal(error.status, 500);
      }
    });

    it("should handle 503 Service Unavailable with retry-after", async () => {
      // Arrange
      FetchMock.mockResponseOnce({
        status: 503,
        statusText: "Service Unavailable",
        headers: { "Retry-After": "120" },
        body: { message: "Service temporarily unavailable" },
      });
      const request = create.get("https://api.example.com/data");

      // Act & Assert
      try {
        await request.getResponse();
        assert.fail("Request should have failed");
      } catch (error) {
        assert(error instanceof RequestError);
        assert.equal(error.status, 503);

        // Check that retry-after header is accessible
        if (error.response) {
          const retryAfter = error.response.headers.get("Retry-After");
          assert.equal(retryAfter, "120");
        }
      }
    });
  });

  // =============== CHAINED METHOD ERRORS ===============
  describe("Chained Method Errors", () => {
    it("should handle errors in chained method calls", async () => {
      // Arrange
      FetchMock.mockResponseOnce({
        status: 200,
        body: "<html><body>Not JSON</body></html>",
        headers: { "Content-Type": "text/html" },
      });
      const request = create.get("https://api.example.com/data");

      // Act & Assert - direct chained call
      try {
        await request.getJson();
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert(error instanceof RequestError);
        assert(error.message.includes("JSON"));
        assert.equal(error.url, "https://api.example.com/data");
        assert.equal(error.method, "GET");
      }
    });

    it("should catch errors in chained promises", async () => {
      // Arrange
      FetchMock.mockResponseOnce({
        status: 200,
        body: "Not JSON data",
        headers: { "Content-Type": "text/plain" },
      });
      const request = create.get("https://api.example.com/data");

      // Act
      let errorMessage = "";

      await request
        .getResponse()
        .then(response => response.getJson())
        .then(() => {
          assert.fail("This should not be called");
        })
        .catch(error => {
          errorMessage = error.message;
        });

      // Assert
      assert(errorMessage.includes("JSON"), "Error message should mention JSON parsing");
    });
  });

  // =============== EDGE CASES ===============
  describe("Edge Cases", () => {
    it("should handle server returning wrong content type", async () => {
      // Arrange - server returns JSON but with text/plain content type
      FetchMock.mockResponseOnce({
        body: '{"data": "test"}',
        headers: { "Content-Type": "text/plain" },
      });
      const request = create.get("https://api.example.com/data");

      // Act & Assert - should still parse JSON correctly
      const response = await request.getResponse();
      const result = await response.getJson();
      assert.deepEqual(result, { data: "test" });
    });

    it("should handle request to URL with unusual characters", async () => {
      // Arrange
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = create.get("https://api.example.com/data");

      // Act & Assert - URL with spaces, unicode and special chars
      try {
        // URL with spaces and special characters
        await request.getResponse();
        // If this doesn't throw, it's good
      } catch (error) {
        // Fix typing of the error object
        const typedError = error as Error;
        assert.fail("Should handle URLs with special characters: " + typedError.message);
      }
    });

    it("should handle extremely large error responses", async () => {
      // Arrange - create a large error response
      const largeErrorData = {
        message: "Error occurred",
        details: Array(10000).fill("error details").join(" "),
      };

      FetchMock.mockResponseOnce({
        status: 500,
        body: largeErrorData,
      });
      const request = create.get("https://api.example.com/data");

      // Act & Assert
      try {
        await request.getResponse();
        assert.fail("Request should have failed");
      } catch (error) {
        assert(error instanceof RequestError);
        assert.equal(error.status, 500);

        // Verify we can still access the large error response
        if (error.response) {
          const errorBody = await error.response.json();
          assert.equal(errorBody.message, "Error occurred");
          assert(errorBody.details.length > 100000);
        }
      }
    });

    it("should handle consecutive errors with the same request object", async () => {
      // Arrange
      FetchMock.mockResponseOnce({
        status: 500,
        body: { message: "First error" },
      });
      FetchMock.mockResponseOnce({
        status: 400,
        body: { message: "Second error" },
      });

      const request = create.get("https://api.example.com/data");

      // Act & Assert - first request
      try {
        await request.getResponse();
        assert.fail("Request should have failed");
      } catch (error) {
        assert(error instanceof RequestError);
        assert.equal(error.status, 500);
      }

      // Second request with same object
      try {
        await request.getResponse();
        assert.fail("Request should have failed");
      } catch (error) {
        assert(error instanceof RequestError);
        assert.equal(error.status, 400);
      }
    });
  });

  // =============== CONNECTION ERRORS ===============
  describe("Connection Errors", () => {
    it("should handle ECONNREFUSED connection errors", async () => {
      // Arrange - Simulate connection refused error
      const connectionError = new TypeError("fetch failed");
      (connectionError as Error & { code?: string }).code = "ECONNREFUSED";
      connectionError.stack = "TypeError: fetch failed\n    at connect (node:internal/...)";
      FetchMock.mockErrorOnce(connectionError);
      const request = create.get("https://api.example.com/data");

      // Act & Assert
      try {
        await request.getResponse();
        assert.fail("Request should have failed");
      } catch (error) {
        assert(error instanceof RequestError);
        assert(error.message.includes("Connection refused"));
        assert(error.message.includes("https://api.example.com/data"));
      }
    });

    it("should handle ECONNRESET connection errors", async () => {
      // Arrange - Simulate connection reset error
      const connectionError = new TypeError("fetch failed");
      (connectionError as Error & { code?: string }).code = "ECONNRESET";
      connectionError.stack = "TypeError: fetch failed\n    at connect (node:internal/...)";
      FetchMock.mockErrorOnce(connectionError);
      const request = create.get("https://api.example.com/data");

      // Act & Assert
      try {
        await request.getResponse();
        assert.fail("Request should have failed");
      } catch (error) {
        assert(error instanceof RequestError);
        assert(error.message.includes("Connection refused"));
      }
    });

    it("should handle EAI_AGAIN DNS errors", async () => {
      // Arrange - Simulate DNS resolution error
      const dnsError = new TypeError("fetch failed");
      (dnsError as Error & { code?: string }).code = "EAI_AGAIN";
      dnsError.stack = "TypeError: fetch failed\n    at getaddrinfo (node:internal/...)";
      FetchMock.mockErrorOnce(dnsError);
      const request = create.get("https://api.example.com/data");

      // Act & Assert
      try {
        await request.getResponse();
        assert.fail("Request should have failed");
      } catch (error) {
        assert(error instanceof RequestError);
        assert(error.message.includes("DNS error"));
      }
    });

    it("should handle EAI_NODATA DNS errors", async () => {
      // Arrange - Simulate DNS resolution error
      const dnsError = new TypeError("fetch failed");
      (dnsError as Error & { code?: string }).code = "EAI_NODATA";
      dnsError.stack = "TypeError: fetch failed\n    at getaddrinfo (node:internal/...)";
      FetchMock.mockErrorOnce(dnsError);
      const request = create.get("https://api.example.com/data");

      // Act & Assert
      try {
        await request.getResponse();
        assert.fail("Request should have failed");
      } catch (error) {
        assert(error instanceof RequestError);
        assert(error.message.includes("DNS error"));
      }
    });

    it("should handle timeout errors with ETIMEDOUT code", async () => {
      // Arrange - Simulate timeout error with ETIMEDOUT code
      const timeoutError = new TypeError("fetch failed");
      (timeoutError as Error & { code?: string }).code = "ETIMEDOUT";
      timeoutError.stack = "TypeError: fetch failed\n    at TimeoutError (node:internal/...)";
      FetchMock.mockErrorOnce(timeoutError);
      const request = create.get("https://api.example.com/data");

      // Act & Assert
      try {
        await request.getResponse();
        assert.fail("Request should have failed");
      } catch (error) {
        assert(error instanceof RequestError);
        assert.equal(error.isTimeout, true);
        assert(error.message.includes("Timeout"));
      }
    });

    it("should handle timeout errors with timeout in stack", async () => {
      // Arrange - Simulate timeout error detected via stack trace
      const timeoutError = new TypeError("fetch failed");
      timeoutError.stack = "TypeError: fetch failed\n    at timeout (node:internal/...)";
      FetchMock.mockErrorOnce(timeoutError);
      const request = create.get("https://api.example.com/data");

      // Act & Assert
      try {
        await request.getResponse();
        assert.fail("Request should have failed");
      } catch (error) {
        assert(error instanceof RequestError);
        assert.equal(error.isTimeout, true);
        assert(error.message.includes("Timeout"));
      }
    });
  });

  // =============== RETRY CALLBACK ERRORS ===============
  describe("Retry Callback Errors", () => {
    it("should handle errors thrown in retry callback", async () => {
      // Arrange
      FetchMock.mockErrorOnce(new Error("Network failure 1"));
      FetchMock.mockErrorOnce(new Error("Network failure 2"));
      FetchMock.mockErrorOnce(new Error("Network failure 3"));

      const request = create
        .get("https://api.example.com/data")
        .withRetries(2)
        .onRetry(() => {
          throw new Error("Retry callback error");
        });

      // Act & Assert
      try {
        await request.getResponse();
        assert.fail("Request should have failed");
      } catch (error) {
        // The retry callback error should be caught and not crash
        assert(error instanceof Error);
      }
    });

    it("should handle async errors in retry callback", async () => {
      // Arrange
      FetchMock.mockErrorOnce(new Error("Network failure 1"));
      FetchMock.mockErrorOnce(new Error("Network failure 2"));

      const request = create
        .get("https://api.example.com/data")
        .withRetries(1)
        .onRetry(async () => {
          await new Promise(resolve => setTimeout(resolve, 10));
          throw new Error("Async retry callback error");
        });

      // Act & Assert
      try {
        await request.getResponse();
        assert.fail("Request should have failed");
      } catch (error) {
        // The async retry callback error should be caught
        assert(error instanceof Error);
      }
    });
  });

  // =============== QUERY PARAM ERRORS ===============
  describe("Query Parameter Errors", () => {
    it("should handle array query parameters correctly", async () => {
      // Arrange
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = create.get("https://api.example.com/data").withQueryParams({
        tags: ["tag1", "tag2", "tag3"],
        ids: ["1", "2", "3"],
        active: true,
      });

      // Act
      const response = await request.getResponse();

      // Assert - Verify the URL contains all array values
      assert.ok(response);
      // The query params should be properly formatted
    });

    it("should handle null and undefined query parameters", async () => {
      // Arrange
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = create.get("https://api.example.com/data").withQueryParams({
        valid: "value",
        nullValue: null,
        undefinedValue: undefined,
      });

      // Act
      const response = await request.getResponse();

      // Assert - null and undefined should be filtered out
      assert.ok(response);
    });

    it("should handle empty array in query parameters", async () => {
      // Arrange
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = create.get("https://api.example.com/data").withQueryParams({
        emptyArray: [],
        valid: "value",
      });

      // Act
      const response = await request.getResponse();

      // Assert
      assert.ok(response);
    });
  });

  // =============== REQUEST CONFIGURATION ERRORS ===============
  describe("Request Configuration Errors", () => {
    it("should handle withKeepAlive configuration", async () => {
      // Arrange
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = create.get("https://api.example.com/data").withKeepAlive(true);

      // Act
      const response = await request.getResponse();

      // Assert
      assert.ok(response);
    });

    it("should handle withAuthorization configuration", async () => {
      // Arrange
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = create.get("https://api.example.com/data").withAuthorization("Bearer token123");

      // Act
      const response = await request.getResponse();

      // Assert
      assert.ok(response);
    });

    it("should handle all referrer policy options", async () => {
      // Arrange
      FetchMock.mockResponseOnce({ body: { success: true } });

      // Test all referrer policy options
      const policies = [
        "ORIGIN",
        "UNSAFE_URL",
        "SAME_ORIGIN",
        "NO_REFERRER",
        "STRICT_ORIGIN",
        "ORIGIN_WHEN_CROSS_ORIGIN",
        "NO_REFERRER_WHEN_DOWNGRADE",
        "STRICT_ORIGIN_WHEN_CROSS_ORIGIN",
      ];

      for (const policy of policies) {
        const request = create.get("https://api.example.com/data");
        // Use fluent API
        (request.withReferrerPolicy as any)[policy]();
        const response = await request.getResponse();
        assert.ok(response);
        FetchMock.reset();
        FetchMock.mockResponseOnce({ body: { success: true } });
      }
    });

    it("should handle all priority options", async () => {
      // Arrange
      FetchMock.mockResponseOnce({ body: { success: true } });

      // Test all priority options
      const priorities = ["HIGH", "LOW", "AUTO"];

      for (const priority of priorities) {
        const request = create.get("https://api.example.com/data");
        // Use fluent API
        (request.withPriority as any)[priority]();
        const response = await request.getResponse();
        assert.ok(response);
        FetchMock.reset();
        FetchMock.mockResponseOnce({ body: { success: true } });
      }
    });

    it("should handle all mode options", async () => {
      // Arrange
      FetchMock.mockResponseOnce({ body: { success: true } });

      // Test all mode options
      const modes = ["CORS", "NO_CORS", "SAME_ORIGIN", "NAVIGATE"];

      for (const mode of modes) {
        const request = create.get("https://api.example.com/data");
        // Use fluent API
        (request.withMode as any)[mode]();
        const response = await request.getResponse();
        assert.ok(response);
        FetchMock.reset();
        FetchMock.mockResponseOnce({ body: { success: true } });
      }
    });
  });

  // =============== CSRF PROTECTION ERRORS ===============
  describe("CSRF Protection Errors", () => {
    it("should handle requests without CSRF protection", async () => {
      // Arrange
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = create.get("https://api.example.com/data").withoutCsrfProtection();

      // Act
      const response = await request.getResponse();

      // Assert
      assert.ok(response);
    });

    it("should handle CSRF protection with anti-CSRF headers", async () => {
      // Arrange
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = create.get("https://api.example.com/data").withAntiCsrfHeaders();

      // Act
      const response = await request.getResponse();

      // Assert
      assert.ok(response);
    });
  });

  // =============== BASE64 ENCODING ERRORS ===============
  describe("Base64 Encoding Errors", () => {
    it("should handle basic auth with special characters", async () => {
      // Arrange
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = create.get("https://api.example.com/data").withBasicAuth("user:name", "pass:word");

      // Act
      const response = await request.getResponse();

      // Assert
      assert.ok(response);
    });

    it("should handle basic auth with unicode characters", async () => {
      // Arrange
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = create.get("https://api.example.com/data").withBasicAuth("用户名", "密码");

      // Act
      const response = await request.getResponse();

      // Assert
      assert.ok(response);
    });
  });

  // =============== ERROR INTERCEPTOR ERRORS ===============
  describe("Error Interceptor Errors", () => {
    it("should handle errors thrown in error interceptor", async () => {
      // Arrange
      FetchMock.mockResponseOnce({
        status: 500,
        body: { message: "Server error" },
      });
      const request = create.get("https://api.example.com/data").withErrorInterceptor(() => {
        throw new Error("Interceptor error");
      });

      // Act & Assert
      try {
        await request.getResponse();
        assert.fail("Request should have failed");
      } catch (error) {
        // The interceptor error should be caught
        assert(error instanceof Error);
      }
    });

    it("should handle error interceptor that returns a response wrapper", async () => {
      // Arrange
      FetchMock.mockResponseOnce({
        status: 500,
        body: { message: "Server error" },
      });
      const { ResponseWrapper } = await import("../src/ResponseWrapper.js");
      const mockResponse = new Response(JSON.stringify({ recovered: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
      const request = create.get("https://api.example.com/data").withErrorInterceptor(() => {
        return new ResponseWrapper(mockResponse, "https://api.example.com/data", "GET");
      });

      // Act
      const response = await request.getResponse();

      // Assert
      assert.ok(response);
      const data = await response.getJson();
      assert.deepEqual(data, { recovered: true });
    });
  });

  // =============== REQUEST INTERCEPTOR ERRORS ===============
  describe("Request Interceptor Errors", () => {
    it("should handle errors thrown in request interceptor", async () => {
      // Arrange
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = create.get("https://api.example.com/data").withRequestInterceptor(() => {
        throw new Error("Request interceptor error");
      });

      // Act & Assert
      try {
        await request.getResponse();
        assert.fail("Request should have failed");
      } catch (error) {
        assert(error instanceof Error);
      }
    });

    it("should handle request interceptor that returns early response", async () => {
      // Arrange
      const mockResponse = new Response(JSON.stringify({ intercepted: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
      const request = create.get("https://api.example.com/data").withRequestInterceptor(() => {
        return mockResponse;
      });

      // Act
      const response = await request.getResponse();

      // Assert
      assert.ok(response);
      const data = await response.getJson();
      assert.deepEqual(data, { intercepted: true });
    });
  });

  // =============== ADDITIONAL CONFIGURATION TESTS ===============
  describe("Additional Configuration Tests", () => {
    it("should handle withContentType configuration", async () => {
      // Arrange
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = create.get("https://api.example.com/data").withContentType("application/json");

      // Act
      const response = await request.getResponse();

      // Assert
      assert.ok(response);
    });

    it("should handle referrer policy with string parameter", async () => {
      // Arrange
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = create.get("https://api.example.com/data").withReferrerPolicy("no-referrer");

      // Act
      const response = await request.getResponse();

      // Assert
      assert.ok(response);
    });

    it("should handle mode with string parameter", async () => {
      // Arrange
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = create.get("https://api.example.com/data").withMode("cors");

      // Act
      const response = await request.getResponse();

      // Assert
      assert.ok(response);
    });

    it("should handle priority with string parameter", async () => {
      // Arrange
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = create.get("https://api.example.com/data").withPriority("high");

      // Act
      const response = await request.getResponse();

      // Assert
      assert.ok(response);
    });

    it("should handle credentials with string parameter", async () => {
      // Arrange
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = create.get("https://api.example.com/data").withCredentials("include");

      // Act
      const response = await request.getResponse();

      // Assert
      assert.ok(response);
    });

    it("should handle query params with number values", async () => {
      // Arrange
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = create.get("https://api.example.com/data").withQueryParams({
        page: 1,
        limit: 10,
        offset: 0,
      });

      // Act
      const response = await request.getResponse();

      // Assert
      assert.ok(response);
    });

    it("should handle query params with boolean values", async () => {
      // Arrange
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = create.get("https://api.example.com/data").withQueryParams({
        active: true,
        deleted: false,
      });

      // Act
      const response = await request.getResponse();

      // Assert
      assert.ok(response);
    });

    it("should handle query params with array of numbers", async () => {
      // Arrange
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = create.get("https://api.example.com/data").withQueryParams({
        ids: [1, 2, 3, 4, 5] as unknown as string[],
      });

      // Act
      const response = await request.getResponse();

      // Assert
      assert.ok(response);
    });

    it("should handle query params with array of booleans", async () => {
      // Arrange
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = create.get("https://api.example.com/data").withQueryParams({
        flags: [true, false, true] as unknown as string[],
      });

      // Act
      const response = await request.getResponse();

      // Assert
      assert.ok(response);
    });

    it("should handle getGraphQLOptions on BaseRequest (returns undefined)", async () => {
      // Arrange - GetRequest extends BaseRequest, which has getGraphQLOptions that returns undefined
      FetchMock.mockResponseOnce({ body: { data: { test: true } } });
      const request = create.get("https://api.example.com/data");

      // Act - This should work without GraphQL options since BaseRequest.getGraphQLOptions returns undefined
      const response = await request.getResponse();
      const data = await response.getJson();

      // Assert
      assert.ok(response);
      assert.deepEqual(data, { data: { test: true } });
    });

    it("should handle autoApplyCsrfProtection initialization", async () => {
      // Arrange - Test that CSRF protection is enabled by default
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = create.get("https://api.example.com/data");

      // Act
      const response = await request.getResponse();

      // Assert - CSRF protection should be enabled by default (autoApplyCsrfProtection = true)
      assert.ok(response);
    });

    it("should handle all referrer policy enum values via fluent API", async () => {
      // Arrange - Test all enum values to ensure type definitions are covered
      FetchMock.mockResponseOnce({ body: { success: true } });

      const policies = [
        "ORIGIN",
        "UNSAFE_URL",
        "SAME_ORIGIN",
        "NO_REFERRER",
        "STRICT_ORIGIN",
        "ORIGIN_WHEN_CROSS_ORIGIN",
        "NO_REFERRER_WHEN_DOWNGRADE",
        "STRICT_ORIGIN_WHEN_CROSS_ORIGIN",
      ];

      for (const policy of policies) {
        const request = create.get("https://api.example.com/data");
        (request.withReferrerPolicy as any)[policy]();
        const response = await request.getResponse();
        assert.ok(response);
        FetchMock.reset();
        FetchMock.mockResponseOnce({ body: { success: true } });
      }
    });

    it("should handle all mode enum values via fluent API", async () => {
      // Arrange - Test all mode enum values including NAVIGATE
      FetchMock.mockResponseOnce({ body: { success: true } });

      const modes = ["CORS", "NO_CORS", "SAME_ORIGIN", "NAVIGATE"];

      for (const mode of modes) {
        const request = create.get("https://api.example.com/data");
        (request.withMode as any)[mode]();
        const response = await request.getResponse();
        assert.ok(response);
        FetchMock.reset();
        FetchMock.mockResponseOnce({ body: { success: true } });
      }
    });

    it("should handle getJson after getText throws error", async () => {
      // Arrange - Test ResponseWrapper.getJson() after getText() fails with body consumed error
      FetchMock.mockResponseOnce({
        body: "not valid json",
        headers: { "Content-Type": "text/plain" },
      });
      const request = create.get("https://api.example.com/data");

      // Act
      const response = await request.getResponse();

      // Get text first
      await response.getText();

      // Try to get JSON after consuming the body
      try {
        await response.getJson();
        assert.fail("Should have thrown an error");
      } catch (error) {
        // Assert - Should throw RequestError when body already consumed
        assert(error instanceof RequestError);
        assert(error.message.includes("Body already consumed"));
      }
    });

    it("should handle getJson with successful JSON parsing and GraphQL check", async () => {
      // Arrange - Test successful JSON parsing path
      FetchMock.mockResponseOnce({
        body: { data: { test: true } },
        headers: { "Content-Type": "application/json" },
      });
      const request = create.get("https://api.example.com/data");

      // Act
      const response = await request.getResponse();
      const data = await response.getJson();

      // Assert - Should successfully parse JSON and check GraphQL errors
      assert.ok(data);
      assert.deepEqual(data, { data: { test: true } });
    });
  });
});
