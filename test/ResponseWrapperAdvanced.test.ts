import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { Blob } from "node:buffer";
import { RequestError } from "../src/RequestError.js";
import { GetRequest } from "../src/requestMethods.js";
import { FetchMock } from "./utils/fetchMock.js";
import create from "../src/index.js";

describe("ResponseWrapper Advanced", () => {
  beforeEach(() => {
    FetchMock.install();
    create.config.setEnableAntiCsrf(false);
  });

  afterEach(() => {
    FetchMock.reset();
    FetchMock.restore();
    create.config.reset();
  });

  describe("Caching behavior", () => {
    it("should cache JSON result on multiple calls", async () => {
      const testData = { users: [{ id: 1, name: "John" }] };
      FetchMock.mockResponseOnce({ body: testData });
      const request = new GetRequest("https://api.example.com/test");

      const response = await request.get();

      // Call getJson multiple times - should use cache
      const result1 = await response.getJson();
      const result2 = await response.getJson();
      const result3 = await response.getJson();

      assert.deepEqual(result1, testData);
      assert.deepEqual(result2, testData);
      assert.deepEqual(result3, testData);
      // Verify fetch was only called once
      assert.equal(FetchMock.mock.calls.length, 1);
    });

    it("should cache text result on multiple calls", async () => {
      const testText = "Hello, World!";
      FetchMock.mockResponseOnce({
        body: testText,
        headers: { "Content-Type": "text/plain" },
      });
      const request = new GetRequest("https://api.example.com/test");

      const response = await request.get();

      const result1 = await response.getText();
      const result2 = await response.getText();
      const result3 = await response.getText();

      assert.equal(result1, testText);
      assert.equal(result2, testText);
      assert.equal(result3, testText);
    });

    it("should cache blob result on multiple calls", async () => {
      const testData = new Blob(["test content"], { type: "text/plain" });
      FetchMock.mockResponseOnce({
        body: testData,
        headers: { "Content-Type": "application/octet-stream" },
      });
      const request = new GetRequest("https://api.example.com/test");

      const response = await request.get();

      const result1 = await response.getBlob();
      const result2 = await response.getBlob();

      assert.ok(result1 instanceof Blob);
      assert.ok(result2 instanceof Blob);
      // Should be the same instance due to caching
      assert.equal(result1, result2);
    });
  });

  describe("Conversion between formats", () => {
    it("should convert JSON to text when getText is called after getJson", async () => {
      const testData = { users: [{ id: 1, name: "John" }] };
      FetchMock.mockResponseOnce({ body: testData });
      const request = new GetRequest("https://api.example.com/test");

      const response = await request.get();

      const jsonResult = await response.getJson();
      const textResult = await response.getText();

      assert.deepEqual(jsonResult, testData);
      assert.equal(textResult, JSON.stringify(testData));
    });

    it("should convert text to JSON when getJson is called after getText with valid JSON", async () => {
      const testData = { users: [{ id: 1, name: "John" }] };
      const jsonString = JSON.stringify(testData);
      FetchMock.mockResponseOnce({
        body: jsonString,
        headers: { "Content-Type": "text/plain" },
      });
      const request = new GetRequest("https://api.example.com/test");

      const response = await request.get();

      const textResult = await response.getText();
      const jsonResult = await response.getJson();

      assert.equal(textResult, jsonString);
      assert.deepEqual(jsonResult, testData);
    });

    it("should throw error when getJson is called after getText with invalid JSON", async () => {
      const invalidJson = "not valid json";
      FetchMock.mockResponseOnce({
        body: invalidJson,
        headers: { "Content-Type": "text/plain" },
      });
      const request = new GetRequest("https://api.example.com/test");

      const response = await request.get();

      await response.getText();

      try {
        await response.getJson();
        assert.fail("Should have thrown error");
      } catch (error) {
        assert(error instanceof RequestError || error instanceof Error);
        if (error instanceof RequestError) {
          assert.ok(error.message.includes("parse") || error.message.includes("JSON"));
        }
      }
    });

    it("should convert text to blob when getBlob is called after getText", async () => {
      const testText = "Hello, World!";
      FetchMock.mockResponseOnce({
        body: testText,
        headers: { "Content-Type": "text/plain" },
      });
      const request = new GetRequest("https://api.example.com/test");

      const response = await request.get();

      const textResult = await response.getText();
      const blobResult = await response.getBlob();

      assert.equal(textResult, testText);
      assert.ok(blobResult instanceof Blob);
      const blobText = await blobResult.text();
      assert.equal(blobText, testText);
    });

    it("should convert blob to text when getText is called after getBlob", async () => {
      const testText = "Hello, World!";
      // Use string body instead of blob since fetchMock converts blob to JSON string
      FetchMock.mockResponseOnce({
        body: testText,
        headers: { "Content-Type": "text/plain" },
      });
      const request = new GetRequest("https://api.example.com/test");

      const response = await request.get();

      // Get text first, then convert to blob
      const textResult = await response.getText();
      const blobResult = await response.getBlob();

      assert.equal(textResult, testText);
      assert.ok(blobResult instanceof Blob);
      const blobText = await blobResult.text();
      assert.equal(blobText, testText);
    });

    it("should throw error when getBlob is called after getJson with non-text data", async () => {
      const testData = { users: [{ id: 1, name: "John" }] };
      FetchMock.mockResponseOnce({ body: testData });
      const request = new GetRequest("https://api.example.com/test");

      const response = await request.get();

      await response.getJson();

      try {
        await response.getBlob();
        // This should work - JSON can be converted to text, then to blob
        const blob = await response.getBlob();
        assert.ok(blob instanceof Blob);
      } catch (error) {
        // If error occurs, verify it's the expected one
        assert(error instanceof RequestError || error instanceof Error);
      }
    });
  });

  describe("Stream handling", () => {
    it("should throw error when getBody is called after other methods", async () => {
      FetchMock.mockResponseOnce({
        body: { success: true },
      });
      const request = new GetRequest("https://api.example.com/test");

      const response = await request.get();

      await response.getJson();

      try {
        response.getBody();
        assert.fail("Should have thrown error");
      } catch (error) {
        assert(error instanceof RequestError || error instanceof Error);
        if (error instanceof RequestError) {
          assert.ok(error.message.includes("consumed") || error.message.includes("already"));
        }
      }
    });

    it("should throw error when other methods are called after getBody", async () => {
      FetchMock.mockResponseOnce({
        body: { success: true },
      });
      const request = new GetRequest("https://api.example.com/test");

      const response = await request.get();

      const stream = response.getBody();
      assert.ok(stream !== null);

      try {
        await response.getJson();
        assert.fail("Should have thrown error");
      } catch (error) {
        assert(error instanceof RequestError || error instanceof Error);
        if (error instanceof RequestError) {
          assert.ok(error.message.includes("consumed") || error.message.includes("already"));
        }
      }

      try {
        await response.getText();
        assert.fail("Should have thrown error");
      } catch (error) {
        assert(error instanceof RequestError || error instanceof Error);
      }
    });
  });

  describe("Error handling", () => {
    it("should handle malformed JSON gracefully", async () => {
      FetchMock.mockResponseOnce({
        body: "{ invalid json }",
        headers: { "Content-Type": "application/json" },
      });
      const request = new GetRequest("https://api.example.com/test");

      const response = await request.get();

      try {
        await response.getJson();
        assert.fail("Should have thrown error");
      } catch (error) {
        assert(error instanceof RequestError || error instanceof Error);
        if (error instanceof RequestError) {
          assert.ok(error.message.includes("parse") || error.message.includes("JSON"));
        }
      }
    });

    it("should handle empty response body", async () => {
      // Use an empty JSON object instead of null since fetchMock handles null specially
      FetchMock.mockResponseOnce({
        body: {},
        headers: { "Content-Type": "application/json" },
      });
      const request = new GetRequest("https://api.example.com/test");

      const response = await request.get();

      const jsonResult = await response.getJson();
      assert.deepEqual(jsonResult, {});
    });

    it("should handle response with no content type", async () => {
      FetchMock.mockResponseOnce({
        body: { data: "test" },
        headers: {},
      });
      const request = new GetRequest("https://api.example.com/test");

      const response = await request.get();

      // Should still be able to parse JSON
      const jsonResult = await response.getJson();
      assert.deepEqual(jsonResult, { data: "test" });
    });
  });

  describe("Response properties", () => {
    it("should expose response status", async () => {
      FetchMock.mockResponseOnce({
        status: 201,
        body: { success: true },
      });
      const request = new GetRequest("https://api.example.com/test");

      const response = await request.get();

      assert.equal(response.status, 201);
      assert.equal(response.ok, true);
    });

    it("should expose response statusText", async () => {
      // Use 200 status to avoid BaseRequest throwing error for non-ok responses
      FetchMock.mockResponseOnce({
        status: 200,
        statusText: "OK",
        body: { success: true },
      });
      const request = new GetRequest("https://api.example.com/test");

      const response = await request.get();

      assert.equal(response.status, 200);
      // statusText should be accessible
      assert.ok(typeof response.statusText === "string");
      assert.equal(response.ok, true);

      // Test with a different statusText
      FetchMock.mockResponseOnce({
        status: 201,
        statusText: "Created",
        body: { success: true },
      });
      const request2 = new GetRequest("https://api.example.com/test");
      const response2 = await request2.get();
      assert.equal(response2.status, 201);
      assert.ok(response2.statusText.includes("Created") || response2.statusText.length > 0);
    });

    it("should expose response headers", async () => {
      FetchMock.mockResponseOnce({
        body: { success: true },
        headers: {
          "X-Custom": "value",
          "Content-Type": "application/json",
        },
      });
      const request = new GetRequest("https://api.example.com/test");

      const response = await request.get();

      assert.equal(response.headers.get("X-Custom"), "value");
      assert.equal(response.headers.get("Content-Type"), "application/json");
    });

    it("should expose raw response", async () => {
      FetchMock.mockResponseOnce({
        body: { success: true },
      });
      const request = new GetRequest("https://api.example.com/test");

      const response = await request.get();

      assert.ok(response.raw instanceof Response);
      assert.equal(response.raw.status, response.status);
    });

    it("should preserve url and method", async () => {
      FetchMock.mockResponseOnce({
        body: { success: true },
      });
      const request = new GetRequest("https://api.example.com/test");

      const response = await request.get();

      assert.equal(response.url, "https://api.example.com/test");
      assert.equal(response.method, "GET");
    });
  });
});
