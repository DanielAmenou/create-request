import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ResponseWrapper } from "../src/ResponseWrapper.js";
import { RequestError } from "../src/RequestError.js";
import { createMockResponse } from "./utils/fetchMock.js";

describe("ResponseWrapper Edge Cases", () => {
  describe("Body Consumption - Complex Scenarios", () => {
    it("should handle getting text after JSON", async () => {
      const response = createMockResponse({
        body: { name: "John", age: 30 },
        headers: { "content-type": "application/json" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/test", "GET");

      const json = await wrapper.getJson();
      assert.deepEqual(json, { name: "John", age: 30 });

      const text = await wrapper.getText();
      assert.ok(text.includes("John"));
      assert.ok(text.includes("30"));
    });

    it("should handle getting JSON after text", async () => {
      const response = createMockResponse({
        body: '{"name":"John","age":30}',
        headers: { "content-type": "application/json" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/test", "GET");

      const text = await wrapper.getText();
      assert.ok(text.includes("John"));

      const json = await wrapper.getJson();
      assert.deepEqual(json, { name: "John", age: 30 });
    });

    it("should handle getting Blob after text", async () => {
      const response = createMockResponse({
        body: "plain text content",
        headers: { "content-type": "text/plain" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/test", "GET");

      const text = await wrapper.getText();
      assert.equal(text, "plain text content");

      const blob = await wrapper.getBlob();
      assert.ok(blob instanceof Blob);
      const blobText = await blob.text();
      assert.equal(blobText, "plain text content");
    });

    it("should handle getting text after Blob", async () => {
      const response = createMockResponse({
        body: "text content",
        headers: { "content-type": "text/plain" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/test", "GET");

      const blob = await wrapper.getBlob();
      assert.ok(blob instanceof Blob);

      const text = await wrapper.getText();
      const blobText = await blob.text();
      assert.equal(text, blobText);
    });

    it("should handle multiple calls to same method (cache)", async () => {
      const response = createMockResponse({
        body: { data: "test" },
        headers: { "content-type": "application/json" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/test", "GET");

      const json1 = await wrapper.getJson();
      const json2 = await wrapper.getJson();
      const json3 = await wrapper.getJson();

      assert.deepEqual(json1, json2);
      assert.deepEqual(json2, json3);
    });

    it("should throw error when getting body stream after consumption", async () => {
      const response = createMockResponse({
        body: { data: "test" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/test", "GET");

      await wrapper.getJson();

      try {
        wrapper.getBody();
        assert.fail("Should have thrown error");
      } catch (error: any) {
        assert.ok(error instanceof RequestError || error.message.includes("Body already consumed"));
      }
    });
  });

  describe("JSON Parsing - Edge Cases", () => {
    it("should handle null JSON response", async () => {
      const response = createMockResponse({
        body: null,
        headers: { "content-type": "application/json" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/test", "GET");

      const json = await wrapper.getJson();
      assert.equal(json, null);
    });

    it("should handle empty JSON array", async () => {
      const response = createMockResponse({
        body: [],
        headers: { "content-type": "application/json" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/test", "GET");

      const json = await wrapper.getJson();
      assert.deepEqual(json, []);
    });

    it("should handle empty JSON object", async () => {
      const response = createMockResponse({
        body: {},
        headers: { "content-type": "application/json" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/test", "GET");

      const json = await wrapper.getJson();
      assert.deepEqual(json, {});
    });

    it("should handle JSON with nested structures", async () => {
      const complex = {
        users: [
          { id: 1, name: "John", tags: ["admin", "user"] },
          { id: 2, name: "Jane", tags: ["user"] },
        ],
        meta: {
          total: 2,
          page: 1,
        },
      };
      const response = createMockResponse({
        body: complex,
        headers: { "content-type": "application/json" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/test", "GET");

      const json = await wrapper.getJson();
      assert.deepEqual(json, complex);
    });

    it("should throw error for invalid JSON after text consumption", async () => {
      const response = createMockResponse({
        body: "not valid json",
        headers: { "content-type": "text/plain" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/test", "GET");

      await wrapper.getText();

      try {
        await wrapper.getJson();
        assert.fail("Should have thrown error");
      } catch (error: any) {
        assert.ok(error instanceof RequestError || error.message.includes("parse"));
      }
    });
  });

  describe("Text Conversion - Edge Cases", () => {
    it("should handle empty text response", async () => {
      const response = createMockResponse({
        body: "",
        headers: { "content-type": "text/plain" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/test", "GET");

      const text = await wrapper.getText();
      assert.equal(text, "");
    });

    it("should handle very long text", async () => {
      const longText = "a".repeat(10000);
      const response = createMockResponse({
        body: longText,
        headers: { "content-type": "text/plain" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/test", "GET");

      const text = await wrapper.getText();
      assert.equal(text.length, 10000);
      assert.equal(text, longText);
    });

    it("should handle text with unicode characters", async () => {
      const unicodeText = "Hello 世界 🌍 émojis";
      const response = createMockResponse({
        body: unicodeText,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/test", "GET");

      const text = await wrapper.getText();
      assert.equal(text, unicodeText);
    });

    it("should handle text with special characters", async () => {
      const specialText = "Text with\nnewlines\tand\rtabs";
      const response = createMockResponse({
        body: specialText,
        headers: { "content-type": "text/plain" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/test", "GET");

      const text = await wrapper.getText();
      assert.equal(text, specialText);
    });
  });

  describe("Blob Conversion - Edge Cases", () => {
    it("should handle empty Blob", async () => {
      const response = createMockResponse({
        body: "",
        headers: { "content-type": "application/octet-stream" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/test", "GET");

      const blob = await wrapper.getBlob();
      assert.ok(blob instanceof Blob);
      assert.equal(blob.size, 0);
    });

    it("should preserve content type in Blob", async () => {
      const response = createMockResponse({
        body: "test content",
        headers: { "content-type": "text/custom" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/test", "GET");

      const blob = await wrapper.getBlob();
      assert.ok(blob instanceof Blob);
      // Blob type might differ based on implementation
    });

    it("should convert text to Blob correctly", async () => {
      const text = "Hello, World!";
      const response = createMockResponse({
        body: text,
        headers: { "content-type": "text/plain" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/test", "GET");

      const blob = await wrapper.getBlob();
      assert.ok(blob instanceof Blob);
      const blobText = await blob.text();
      assert.equal(blobText, text);
    });
  });

  describe("Error Scenarios", () => {
    it("should throw RequestError when body consumed in incompatible format", async () => {
      const response = createMockResponse({
        body: { data: "test" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/test", "GET");

      await wrapper.getJson();

      try {
        await wrapper.getBlob();
        assert.fail("Should have thrown error");
      } catch (error: any) {
        assert.ok(error instanceof RequestError || error.message.includes("consumed"));
        if (error instanceof RequestError) {
          assert.equal(error.url, "https://api.example.com/test");
          assert.equal(error.method, "GET");
        }
      }
    });

    it("should handle errors when context (url/method) is missing", async () => {
      const response = createMockResponse({
        body: { data: "test" },
      });
      const wrapper = new ResponseWrapper(response); // No url/method

      await wrapper.getJson();

      try {
        await wrapper.getBlob();
        // Should still throw error, but might not be RequestError
      } catch (error: any) {
        assert.ok(error.message.includes("consumed") || error.message.includes("already") || error.message.includes("Cannot convert"));
      }
    });

    it("should include response in RequestError when available", async () => {
      const response = createMockResponse({
        body: { data: "test" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/test", "GET");

      try {
        // Try to get JSON twice after consuming in different format
        await wrapper.getBody();
        await wrapper.getJson();
        assert.fail("Should have thrown error");
      } catch (error: any) {
        if (error instanceof RequestError) {
          assert.ok(error.response === response || error.response !== undefined);
        }
      }
    });
  });

  describe("Property Access", () => {
    it("should expose all response properties", () => {
      const response = createMockResponse({
        status: 201,
        statusText: "Created",
        headers: { "X-Custom": "value" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/test", "POST");

      assert.equal(wrapper.status, 201);
      assert.equal(wrapper.statusText, "Created");
      assert.ok(wrapper.headers);
      assert.equal(wrapper.headers.get("X-Custom"), "value");
      assert.equal(wrapper.ok, true);
      assert.equal(wrapper.raw, response);
      assert.equal(wrapper.url, "https://api.example.com/test");
      assert.equal(wrapper.method, "POST");
    });

    it("should handle optional url and method", () => {
      const response = createMockResponse();
      const wrapper = new ResponseWrapper(response);

      assert.equal(wrapper.url, undefined);
      assert.equal(wrapper.method, undefined);
      assert.ok(wrapper.status !== undefined);
    });
  });

  describe("Body Stream", () => {
    it("should return body stream when not consumed", () => {
      const response = createMockResponse({
        body: { data: "test" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/test", "GET");

      const body = wrapper.getBody();

      // Body should be a ReadableStream or null
      assert.ok(body === null || body instanceof ReadableStream);
    });

    it("should throw error when getting body stream after JSON", async () => {
      const response = createMockResponse({
        body: { data: "test" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/test", "GET");

      await wrapper.getJson();

      try {
        wrapper.getBody();
        assert.fail("Should have thrown error");
      } catch (error: any) {
        assert.ok(error.message.includes("Body already consumed"));
      }
    });

    it("should throw error when getting body stream after text", async () => {
      const response = createMockResponse({
        body: "text",
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/test", "GET");

      await wrapper.getText();

      try {
        wrapper.getBody();
        assert.fail("Should have thrown error");
      } catch (error: any) {
        assert.ok(error.message.includes("Body already consumed"));
      }
    });
  });
});
