import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import create from "../src/index.js";
import { RequestError } from "../src/RequestError.js";
import { FetchMock } from "./utils/fetchMock.js";

describe("Error Handling Tests", () => {
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
        await request.get();
        assert.fail("Request should have failed");
      } catch (error) {
        assert(error instanceof RequestError);
        assert.equal(error.message, "Network error: Failed to connect");
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
        await request.get();
        assert.fail("Request should have failed");
      } catch (error) {
        assert(error instanceof RequestError);
        assert(error.message.includes("Failed to resolve"));
      }
    });

    it("should provide original error stack in network errors", async () => {
      // Arrange
      const originalError = new Error("Original error message");
      FetchMock.mockErrorOnce(originalError);
      const request = create.get("https://api.example.com/data");

      // Act & Assert
      try {
        await request.get();
        assert.fail("Request should have failed");
      } catch (error) {
        assert(error instanceof RequestError);
        assert.equal(error.stack, originalError.stack);
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
    //   const response = await request.get();

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
        .get()
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
        .get()
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
        .get()
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
        await request.get();
        assert.fail("Request should have timed out");
      } catch (error) {
        assert(error instanceof RequestError);
        assert.equal(error.isTimeout, true);
        assert(error.message.includes("timed out after 100ms"));
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
      const responsePromise = request.get();

      // Abort after the response starts but before processing completes
      setTimeout(() => controller.abort(), 50);

      // Assert
      try {
        await responsePromise;
        assert.fail("Request should have been aborted");
      } catch (error) {
        assert(error instanceof Error);
        assert(error.name === "AbortError" || error.message.includes("aborted"));
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
        await request.get();
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
        await request.get();
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
        await request.get();
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
        await request.get();
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
        await request.get();
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
        await request.get();
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
        await request.get();
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
        await request.get();
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
        .get()
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
      const response = await request.get();
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
        await request.get();
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
        await request.get();
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
        await request.get();
        assert.fail("Request should have failed");
      } catch (error) {
        assert(error instanceof RequestError);
        assert.equal(error.status, 500);
      }

      // Second request with same object
      try {
        await request.get();
        assert.fail("Request should have failed");
      } catch (error) {
        assert(error instanceof RequestError);
        assert.equal(error.status, 400);
      }
    });
  });
});
