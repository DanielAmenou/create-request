import assert from "node:assert/strict";
import { describe, it, before, afterEach, after } from "node:test";

import create from "../src/index.js";
import { RequestError } from "../src/RequestError.js";
import { ResponseWrapper } from "../src/ResponseWrapper.js";
import { FetchMock } from "./utils/fetchMock.js";

describe("Empty Response Handling", { timeout: 10000 }, () => {
  before(() => {
    FetchMock.install();
  });

  afterEach(() => {
    FetchMock.reset();
  });

  after(() => {
    FetchMock.restore();
  });

  describe("204 No Content responses", () => {
    it("should return null for 204 No Content via getJson()", async () => {
      // Arrange - Jira-like PUT response
      FetchMock.mockResponseOnce({
        status: 204,
        statusText: "No Content",
        headers: {},
        body: null,
      });

      // Act
      const result = await create.put("https://api.example.com/issue/123").withBody({ summary: "Updated" }).getJson();

      // Assert
      assert.strictEqual(result, null);
    });

    it("should return null for 204 No Content via getData()", async () => {
      // Arrange
      FetchMock.mockResponseOnce({
        status: 204,
        statusText: "No Content",
        headers: {},
        body: null,
      });

      // Act
      const result = await create.put("https://api.example.com/update").withBody({ data: "test" }).getData();

      // Assert
      assert.strictEqual(result, null);
    });

    it("should return null for 204 with selector in getData()", async () => {
      // Arrange
      FetchMock.mockResponseOnce({
        status: 204,
        statusText: "No Content",
        headers: {},
        body: null,
      });

      // Act - When data is null, selector is applied and returns undefined (null?.users)
      const result = await create
        .put("https://api.example.com/update")
        .withBody({ data: "test" })
        .getData((d: { users?: unknown } | null) => d?.users);

      // Assert - selector(null) returns undefined since null?.users is undefined
      assert.strictEqual(result, undefined);
    });
  });

  describe("Empty body responses", () => {
    it("should return null for content-length: 0", async () => {
      // Arrange
      FetchMock.mockResponseOnce({
        status: 200,
        headers: { "content-length": "0" },
        body: "",
      });

      // Act
      const result = await create.get("https://api.example.com/empty").getJson();

      // Assert
      assert.strictEqual(result, null);
    });

    it("should return null for empty string body", async () => {
      // Arrange
      FetchMock.mockResponseOnce({
        status: 200,
        headers: { "content-type": "application/json" },
        body: "",
      });

      // Act
      const result = await create.get("https://api.example.com/empty").getJson();

      // Assert
      assert.strictEqual(result, null);
    });

    it("should return null for whitespace-only body", async () => {
      // Arrange
      FetchMock.mockResponseOnce({
        status: 200,
        headers: { "content-type": "application/json" },
        body: "   \n\t  ",
      });

      // Act
      const result = await create.get("https://api.example.com/whitespace").getJson();

      // Assert
      assert.strictEqual(result, null);
    });
  });

  describe("Valid JSON responses still work", () => {
    it("should parse valid JSON normally", async () => {
      // Arrange
      const data = { name: "John", age: 30 };
      FetchMock.mockResponseOnce({
        status: 200,
        headers: { "content-type": "application/json" },
        body: data,
      });

      // Act
      const result = await create.get("https://api.example.com/user").getJson();

      // Assert
      assert.deepEqual(result, data);
    });

    it("should parse JSON with selector", async () => {
      // Arrange
      const data = { users: [{ id: 1, name: "John" }] };
      FetchMock.mockResponseOnce({
        status: 200,
        headers: { "content-type": "application/json" },
        body: data,
      });

      // Act
      const result = await create.get("https://api.example.com/users").getData((d: typeof data) => d.users);

      // Assert
      assert.deepEqual(result, [{ id: 1, name: "John" }]);
    });
  });

  describe("Non-JSON responses still throw errors", () => {
    it("should throw error for plain text 'ok' response", async () => {
      // Arrange - Slack-like response
      FetchMock.mockResponseOnce({
        status: 200,
        headers: { "content-type": "text/plain" },
        body: "ok",
      });

      // Act & Assert
      await assert.rejects(
        () => create.post("https://slack.com/webhook").withBody({ text: "Hello" }).getJson(),
        (error: RequestError) => {
          assert(error instanceof RequestError);
          assert(error.message.includes("Bad JSON"));
          return true;
        }
      );
    });

    it("should throw error for HTML response", async () => {
      // Arrange
      FetchMock.mockResponseOnce({
        status: 200,
        headers: { "content-type": "text/html" },
        body: "<html><body>Error page</body></html>",
      });

      // Act & Assert
      await assert.rejects(
        () => create.get("https://api.example.com/error").getJson(),
        (error: RequestError) => {
          assert(error instanceof RequestError);
          assert(error.message.includes("Bad JSON"));
          return true;
        }
      );
    });

    it("should throw error for invalid JSON with application/json content type", async () => {
      // Arrange
      FetchMock.mockResponseOnce({
        status: 200,
        headers: { "content-type": "application/json" },
        body: "{invalid json}",
      });

      // Act & Assert
      await assert.rejects(
        () => create.get("https://api.example.com/malformed").getJson(),
        (error: RequestError) => {
          assert(error instanceof RequestError);
          assert(error.message.includes("Bad JSON"));
          return true;
        }
      );
    });
  });

  describe("Real-world scenarios", () => {
    it("should handle Jira PUT update (returns 204 No Content)", async () => {
      // Arrange - Simulate Jira PUT response
      FetchMock.mockResponseOnce({
        status: 204,
        statusText: "No Content",
        headers: {},
        body: null,
      });

      // Act - Simulate updating a Jira field (user's actual use case)
      const result = await create
        .put("https://jira.example.com/rest/api/2/issue/PROJ-123")
        .withBasicAuth("user", "pass")
        .withBody({
          fields: {
            customfield_12191: "new value",
          },
        })
        .getData();

      // Assert - No error, returns null
      assert.strictEqual(result, null);
    });

    it("should work with retries and return null for empty response", async () => {
      // Arrange - First call fails, second succeeds with 204
      FetchMock.mockErrorOnce(new Error("Network error"));
      FetchMock.mockResponseOnce({
        status: 204,
        statusText: "No Content",
        headers: {},
        body: null,
      });

      // Act
      const result = await create.put("https://api.example.com/update").withBody({ update: true }).withRetries(1).getData();

      // Assert
      assert.strictEqual(result, null);
    });

    it("should still throw for actual errors (4xx/5xx)", async () => {
      // Arrange
      FetchMock.mockResponseOnce({
        status: 500,
        statusText: "Internal Server Error",
        headers: { "content-type": "application/json" },
        body: { error: "Something went wrong" },
      });

      // Act & Assert
      await assert.rejects(
        () => create.put("https://api.example.com/fail").withBody({ data: "test" }).getData(),
        (error: RequestError) => {
          assert(error instanceof RequestError);
          assert.equal(error.status, 500);
          return true;
        }
      );
    });
  });

  describe("ResponseWrapper direct usage", () => {
    it("should return null for 204 No Content", async () => {
      // Arrange
      const mockResponse = new Response(null, {
        status: 204,
        statusText: "No Content",
      });
      const wrapper = new ResponseWrapper(mockResponse);

      // Act
      const result = await wrapper.getJson();

      // Assert
      assert.strictEqual(result, null);
    });

    it("should cache text during getJson() for subsequent getText() calls", async () => {
      // Arrange
      const data = { name: "John" };
      const mockResponse = new Response(JSON.stringify(data), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
      const wrapper = new ResponseWrapper(mockResponse);

      // Act
      const jsonResult = await wrapper.getJson();
      const textResult = await wrapper.getText();

      // Assert - both work because text is cached during JSON parsing
      assert.deepEqual(jsonResult, data);
      assert.equal(textResult, '{"name":"John"}');
    });
  });
});
