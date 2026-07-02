import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import create from "../src/index.js";
import { RequestError } from "../src/RequestError.js";
import { FetchMock } from "./utils/fetchMock.js";

/**
 * Tests for automatic error response body capture.
 * When a request fails with an HTTP error, the response body should be
 * available directly on the RequestError via `error.body` and `error.getJson()`.
 */
describe("Error Body Capture", { timeout: 10000 }, () => {
  beforeEach(() => {
    FetchMock.install();
  });

  afterEach(() => {
    FetchMock.reset();
    FetchMock.restore();
  });

  describe("HTTP errors", () => {
    it("should expose a JSON error body via error.body and error.getJson()", async () => {
      // Arrange
      const errorPayload = { message: "User not found", code: "USER_NOT_FOUND" };
      FetchMock.mockResponseOnce({ status: 404, statusText: "Not Found", body: errorPayload });

      // Act & Assert
      try {
        await create.get("https://api.example.com/users/42").getJson();
        assert.fail("Request should have failed");
      } catch (error) {
        assert(error instanceof RequestError);
        assert.equal(error.status, 404);
        assert.equal(error.body, JSON.stringify(errorPayload));
        assert.deepEqual(error.getJson(), errorPayload);
      }
    });

    it("should expose a plain text error body (getJson returns undefined)", async () => {
      // Arrange
      FetchMock.mockResponseOnce({
        status: 500,
        headers: { "content-type": "text/html" },
        body: "<html>Internal Server Error</html>",
      });

      // Act & Assert
      try {
        await create.get("https://api.example.com/data").getResponse();
        assert.fail("Request should have failed");
      } catch (error) {
        assert(error instanceof RequestError);
        assert.equal(error.status, 500);
        assert.equal(error.body, "<html>Internal Server Error</html>");
        assert.equal(error.getJson(), undefined);
      }
    });

    it("should capture the body for all execution methods (getText)", async () => {
      // Arrange
      FetchMock.mockResponseOnce({ status: 403, body: { message: "Forbidden" } });

      // Act & Assert
      try {
        await create.get("https://api.example.com/secret").getText();
        assert.fail("Request should have failed");
      } catch (error) {
        assert(error instanceof RequestError);
        assert.equal(error.getJson<{ message: string }>()?.message, "Forbidden");
      }
    });

    it("should keep error.response readable after the body was captured", async () => {
      // Arrange
      const errorPayload = { message: "Bad request" };
      FetchMock.mockResponseOnce({ status: 400, body: errorPayload });

      // Act & Assert
      try {
        await create.get("https://api.example.com/data").getJson();
        assert.fail("Request should have failed");
      } catch (error) {
        assert(error instanceof RequestError);
        assert.ok(error.response);
        // Reading from error.response still works (backward compatibility)
        assert.deepEqual(await error.response.json(), errorPayload);
      }
    });

    it("should set body to an empty string when the error response has no body", async () => {
      // Arrange
      FetchMock.mockResponseOnce({ status: 404, headers: { "content-type": "text/plain" } });

      // Act & Assert
      try {
        await create.get("https://api.example.com/missing").getResponse();
        assert.fail("Request should have failed");
      } catch (error) {
        assert(error instanceof RequestError);
        assert.equal(error.body, "");
        assert.equal(error.getJson(), undefined);
      }
    });
  });

  describe("errors without a response", () => {
    it("should leave body undefined for network errors", async () => {
      // Arrange
      FetchMock.mockErrorOnce(new Error("Failed to connect"));

      // Act & Assert
      try {
        await create.get("https://api.example.com/data").getResponse();
        assert.fail("Request should have failed");
      } catch (error) {
        assert(error instanceof RequestError);
        assert.equal(error.body, undefined);
        assert.equal(error.getJson(), undefined);
      }
    });
  });

  describe("retries", () => {
    it("should provide the error body to the retry delay function", async () => {
      // Arrange
      const seenBodies: (string | undefined)[] = [];
      FetchMock.mockResponseOnce({ status: 429, body: { retryIn: 1 } });
      FetchMock.mockResponseOnce({ body: { success: true } });

      // Act
      const result = await create
        .get("https://api.example.com/data")
        .withRetries({
          attempts: 1,
          delay: ({ error }) => {
            seenBodies.push(error.body);
            return error.getJson<{ retryIn: number }>()?.retryIn ?? 0;
          },
        })
        .getJson<{ success: boolean }>();

      // Assert
      assert.deepEqual(result, { success: true });
      assert.deepEqual(seenBodies, [JSON.stringify({ retryIn: 1 })]);
    });

    it("should provide the error body to the onRetry callback", async () => {
      // Arrange
      const seenBodies: (string | undefined)[] = [];
      FetchMock.mockResponseOnce({ status: 503, body: { reason: "maintenance" } });
      FetchMock.mockResponseOnce({ body: { ok: true } });

      // Act
      await create
        .get("https://api.example.com/data")
        .withRetries(1)
        .onRetry(({ error }) => {
          seenBodies.push(error.body);
        })
        .getJson();

      // Assert
      assert.deepEqual(seenBodies, [JSON.stringify({ reason: "maintenance" })]);
    });

    it("should expose the body of the last failed attempt when retries are exhausted", async () => {
      // Arrange
      FetchMock.mockResponseOnce({ status: 500, body: { attempt: "first" } });
      FetchMock.mockResponseOnce({ status: 500, body: { attempt: "second" } });

      // Act & Assert
      try {
        await create.get("https://api.example.com/data").withRetries(1).getJson();
        assert.fail("Request should have failed");
      } catch (error) {
        assert(error instanceof RequestError);
        assert.deepEqual(error.getJson(), { attempt: "second" });
      }
    });
  });

  describe("interceptors", () => {
    it("should provide the error body to error interceptors", async () => {
      // Arrange
      let interceptedBody: string | undefined;
      FetchMock.mockResponseOnce({ status: 401, body: { message: "Token expired" } });

      // Act & Assert
      try {
        await create
          .get("https://api.example.com/data")
          .withErrorInterceptor(error => {
            interceptedBody = error.body;
            return error;
          })
          .getJson();
        assert.fail("Request should have failed");
      } catch (error) {
        assert(error instanceof RequestError);
        assert.equal(interceptedBody, JSON.stringify({ message: "Token expired" }));
      }
    });

    it("should preserve the body when an error interceptor throws a non-RequestError", async () => {
      // Arrange
      FetchMock.mockResponseOnce({ status: 500, body: { message: "boom" } });

      // Act & Assert
      try {
        await create
          .get("https://api.example.com/data")
          .withErrorInterceptor(() => {
            throw new Error("interceptor exploded");
          })
          .getJson();
        assert.fail("Request should have failed");
      } catch (error) {
        assert(error instanceof RequestError);
        assert.equal(error.body, JSON.stringify({ message: "boom" }));
      }
    });
  });

  describe("response parsing errors", () => {
    it("should expose the raw body when JSON parsing fails on a successful response", async () => {
      // Arrange
      FetchMock.mockResponseOnce({
        headers: { "content-type": "application/json" },
        body: "this is not json",
      });

      // Act & Assert
      try {
        await create.get("https://api.example.com/data").getJson();
        assert.fail("Request should have failed");
      } catch (error) {
        assert(error instanceof RequestError);
        assert.ok(error.message.startsWith("Bad JSON"));
        assert.equal(error.body, "this is not json");
      }
    });

    it("should expose the raw body on GraphQL errors with throwOnError", async () => {
      // Arrange
      const graphQLResponse = { errors: [{ message: "Field 'user' not found" }] };
      FetchMock.mockResponseOnce({ body: graphQLResponse });

      // Act & Assert
      try {
        await create
          .post("https://api.example.com/graphql")
          .withGraphQL("query { user { id } }", undefined, { throwOnError: true })
          .getJson();
        assert.fail("Request should have failed");
      } catch (error) {
        assert(error instanceof RequestError);
        assert.equal(error.body, JSON.stringify(graphQLResponse));
        assert.deepEqual(error.getJson(), graphQLResponse);
      }
    });

    it("should expose the raw body when a selector throws in getData", async () => {
      // Arrange
      FetchMock.mockResponseOnce({ body: { items: null } });

      // Act & Assert
      try {
        await create.get("https://api.example.com/data").getData((data): unknown[] => (data as { items: unknown[] }).items.map(x => x));
        assert.fail("Request should have failed");
      } catch (error) {
        assert(error instanceof RequestError);
        assert.ok(error.message.startsWith("Selector"));
        assert.equal(error.body, JSON.stringify({ items: null }));
      }
    });
  });
});
