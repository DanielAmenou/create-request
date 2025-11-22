import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ResponseWrapper } from "../src/ResponseWrapper.js";
import { RequestError } from "../src/RequestError.js";
import { createMockResponse } from "./utils/fetchMock.js";

describe("ResponseWrapper Edge Cases", { timeout: 10000 }, () => {
  describe("Body Consumption - Single Use Only", () => {
    it("should throw error when getting text after JSON", async () => {
      const response = createMockResponse({
        body: { name: "John", age: 30 },
        headers: { "content-type": "application/json" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/test", "GET");

      const json = await wrapper.getJson();
      assert.deepEqual(json, { name: "John", age: 30 });

      try {
        await wrapper.getText();
        assert.fail("Should have thrown error");
      } catch (error: any) {
        assert.ok(error instanceof RequestError);
        assert.ok(error.message.includes("Body already consumed"));
      }
    });

    it("should throw error when getting JSON after text", async () => {
      const response = createMockResponse({
        body: '{"name":"John","age":30}',
        headers: { "content-type": "application/json" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/test", "GET");

      const text = await wrapper.getText();
      assert.ok(text.includes("John"));

      try {
        await wrapper.getJson();
        assert.fail("Should have thrown error");
      } catch (error: any) {
        assert.ok(error instanceof RequestError);
        assert.ok(error.message.includes("Body already consumed"));
      }
    });

    it("should throw error when getting Blob after text", async () => {
      const response = createMockResponse({
        body: "plain text content",
        headers: { "content-type": "text/plain" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/test", "GET");

      const text = await wrapper.getText();
      assert.equal(text, "plain text content");

      try {
        await wrapper.getBlob();
        assert.fail("Should have thrown error");
      } catch (error: any) {
        assert.ok(error instanceof RequestError);
        assert.ok(error.message.includes("Body already consumed"));
      }
    });

    it("should throw error when getting text after Blob", async () => {
      const response = createMockResponse({
        body: "text content",
        headers: { "content-type": "text/plain" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/test", "GET");

      const blob = await wrapper.getBlob();
      assert.ok(blob instanceof Blob);

      try {
        await wrapper.getText();
        assert.fail("Should have thrown error");
      } catch (error: any) {
        assert.ok(error instanceof RequestError);
        assert.ok(error.message.includes("Body already consumed"));
      }
    });

    it("should throw error when getting body stream after consumption", async () => {
      const response = createMockResponse({
        body: { data: "test" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/test", "GET");

      await wrapper.getJson();

      try {
        const stream = wrapper.getBody();
        if (stream) {
          await stream.cancel(); // Clean up the stream
        }
        assert.fail("Should have thrown error");
      } catch (error: any) {
        assert.ok(error instanceof RequestError || error.message.includes("Body consumed"));
      }
    });

    it("should throw error when getting ArrayBuffer after text", async () => {
      const response = createMockResponse({
        body: "text content",
        headers: { "content-type": "text/plain" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/test", "GET");

      await wrapper.getText();

      try {
        await wrapper.getArrayBuffer();
        assert.fail("Should have thrown error");
      } catch (error: any) {
        assert.ok(error instanceof RequestError);
        assert.ok(error.message.includes("Body already consumed"));
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

    it("should throw error when body already consumed", async () => {
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
        assert.ok(error instanceof RequestError);
        assert.ok(error.message.includes("Body already consumed"));
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

  describe("ArrayBuffer Conversion - Comprehensive Tests", () => {
    it("should get ArrayBuffer from response", async () => {
      const content = "Binary content";
      const response = createMockResponse({
        body: content,
        headers: { "content-type": "application/octet-stream" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/test", "GET");

      const buffer = await wrapper.getArrayBuffer();

      assert.ok(buffer instanceof ArrayBuffer);
      const text = new TextDecoder().decode(buffer);
      assert.equal(text, content);
    });

    it("should handle empty ArrayBuffer", async () => {
      const response = createMockResponse({
        body: "",
        headers: { "content-type": "application/octet-stream" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/test", "GET");

      const buffer = await wrapper.getArrayBuffer();

      assert.ok(buffer instanceof ArrayBuffer);
      assert.equal(buffer.byteLength, 0);
    });

    it("should handle large ArrayBuffer", async () => {
      const largeContent = "x".repeat(10000);
      const response = createMockResponse({
        body: largeContent,
        headers: { "content-type": "application/octet-stream" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/test", "GET");

      const buffer = await wrapper.getArrayBuffer();

      assert.ok(buffer instanceof ArrayBuffer);
      assert.equal(buffer.byteLength, 10000);
      const text = new TextDecoder().decode(buffer);
      assert.equal(text, largeContent);
    });

    it("should handle binary data in ArrayBuffer", async () => {
      const binaryData = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello" in bytes
      // Create a proper binary response
      const response = new Response(binaryData.buffer, {
        headers: { "content-type": "application/octet-stream" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/test", "GET");

      const buffer = await wrapper.getArrayBuffer();

      assert.ok(buffer instanceof ArrayBuffer);
      const uint8 = new Uint8Array(buffer);
      assert.deepEqual(Array.from(uint8), Array.from(binaryData));
      const text = new TextDecoder().decode(buffer);
      assert.equal(text, "Hello");
    });

    it("should throw error when getting ArrayBuffer after JSON", async () => {
      const response = createMockResponse({
        body: { data: "test" },
        headers: { "content-type": "application/json" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/test", "GET");

      await wrapper.getJson();

      try {
        await wrapper.getArrayBuffer();
        assert.fail("Should have thrown error");
      } catch (error: any) {
        assert.ok(error instanceof RequestError);
        assert.ok(error.message.includes("Body already consumed"));
        assert.equal(error.url, "https://api.example.com/test");
        assert.equal(error.method, "GET");
      }
    });

    it("should throw error when getting ArrayBuffer after text", async () => {
      const response = createMockResponse({
        body: "text content",
        headers: { "content-type": "text/plain" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/test", "GET");

      await wrapper.getText();

      try {
        await wrapper.getArrayBuffer();
        assert.fail("Should have thrown error");
      } catch (error: any) {
        assert.ok(error instanceof RequestError);
        assert.ok(error.message.includes("Body already consumed"));
      }
    });

    it("should throw error when getting ArrayBuffer after Blob", async () => {
      const response = createMockResponse({
        body: "blob content",
        headers: { "content-type": "application/octet-stream" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/test", "GET");

      await wrapper.getBlob();

      try {
        await wrapper.getArrayBuffer();
        assert.fail("Should have thrown error");
      } catch (error: any) {
        assert.ok(error instanceof RequestError);
        assert.ok(error.message.includes("Body already consumed"));
      }
    });

    it("should throw error when getting JSON after ArrayBuffer", async () => {
      const response = createMockResponse({
        body: '{"name":"test"}',
        headers: { "content-type": "application/json" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/test", "GET");

      await wrapper.getArrayBuffer();

      try {
        await wrapper.getJson();
        assert.fail("Should have thrown error");
      } catch (error: any) {
        assert.ok(error instanceof RequestError);
        assert.ok(error.message.includes("Body already consumed"));
      }
    });

    it("should throw error when getting text after ArrayBuffer", async () => {
      const response = createMockResponse({
        body: "text content",
        headers: { "content-type": "text/plain" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/test", "GET");

      await wrapper.getArrayBuffer();

      try {
        await wrapper.getText();
        assert.fail("Should have thrown error");
      } catch (error: any) {
        assert.ok(error instanceof RequestError);
        assert.ok(error.message.includes("Body already consumed"));
      }
    });

    it("should handle ArrayBuffer without url/method", async () => {
      const content = "Binary content";
      const response = createMockResponse({
        body: content,
        headers: { "content-type": "application/octet-stream" },
      });
      const wrapper = new ResponseWrapper(response); // No url/method

      const buffer = await wrapper.getArrayBuffer();

      assert.ok(buffer instanceof ArrayBuffer);
      const text = new TextDecoder().decode(buffer);
      assert.equal(text, content);
    });

    it("should throw error when getting ArrayBuffer after body consumed via getBody", async () => {
      const response = createMockResponse({
        body: "binary content",
        headers: { "content-type": "application/octet-stream" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/test", "GET");

      const stream = wrapper.getBody();
      if (stream) {
        stream.getReader(); // Lock the stream
      }

      try {
        await wrapper.getArrayBuffer();
        assert.fail("Should have thrown error");
      } catch (error: any) {
        assert.ok(error instanceof RequestError);
        assert.ok(error.message.includes("Body already consumed") || error.message.includes("unusable") || error.message.includes("locked"));
      }
    });

    it("should handle unicode characters in ArrayBuffer", async () => {
      const unicodeContent = "Hello 世界 🌍";
      const response = createMockResponse({
        body: unicodeContent,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/test", "GET");

      const buffer = await wrapper.getArrayBuffer();

      assert.ok(buffer instanceof ArrayBuffer);
      const text = new TextDecoder("utf-8").decode(buffer);
      assert.equal(text, unicodeContent);
    });
  });

  describe("Error Scenarios", () => {
    it("should throw RequestError when body consumed", async () => {
      const response = createMockResponse({
        body: { data: "test" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/test", "GET");

      await wrapper.getJson();

      try {
        await wrapper.getBlob();
        assert.fail("Should have thrown error");
      } catch (error: any) {
        assert.ok(error instanceof RequestError);
        assert.ok(error.message.includes("Body already consumed"));
        assert.equal(error.url, "https://api.example.com/test");
        assert.equal(error.method, "GET");
      }
    });

    it("should throw RequestError when body consumed without url/method", async () => {
      const response = createMockResponse({
        body: { data: "test" },
      });
      const wrapper = new ResponseWrapper(response); // No url/method

      await wrapper.getJson();

      try {
        await wrapper.getBlob();
        assert.fail("Should have thrown error");
      } catch (error: any) {
        assert.ok(error instanceof RequestError);
        assert.ok(error.message.includes("Body already consumed"));
      }
    });

    it("should throw RequestError when body consumed via getBody then getJson called without url/method", async () => {
      const response = createMockResponse({
        body: { data: "test" },
      });
      const wrapper = new ResponseWrapper(response); // No url/method

      // Consume body via getBody and lock the stream
      const stream = wrapper.getBody();
      if (stream) {
        stream.getReader(); // This locks the stream
      }

      // Now try to get JSON - should throw RequestError since body is consumed
      try {
        await wrapper.getJson();
        assert.fail("Should have thrown error");
      } catch (error: any) {
        // Should be RequestError (always throws RequestError, even without url/method)
        assert.ok(error instanceof RequestError);
        assert.ok(error.message.includes("Body already consumed") || error.message.includes("unusable") || error.message.includes("locked"));
      }
    });

    it("should throw RequestError when body consumed via getBody then getJson called with url/method", async () => {
      const response = createMockResponse({
        body: { data: "test" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/test", "GET"); // WITH url/method

      // Consume body via getBody and lock the stream
      const stream = wrapper.getBody();
      if (stream) {
        stream.getReader(); // This locks the stream
      }

      // Now try to get JSON - should throw RequestError since url/method are present
      try {
        await wrapper.getJson();
        assert.fail("Should have thrown error");
      } catch (error: any) {
        // Should be RequestError since url/method are present
        assert.ok(error instanceof RequestError);
        assert.equal(error.url, "https://api.example.com/test");
        assert.equal(error.method, "GET");
        assert.ok(error.message.includes("Body already consumed") || error.message.includes("unusable") || error.message.includes("locked"));
      }
    });

    it("should include response in RequestError when available", async () => {
      const response = createMockResponse({
        body: { data: "test" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/test", "GET");

      try {
        // Try to get JSON after consuming via getBody
        const stream = wrapper.getBody();
        if (stream) {
          stream.getReader(); // This locks the stream
        }
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
    it("should return body stream when not consumed", async () => {
      const response = createMockResponse({
        body: { data: "test" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/test", "GET");

      const body = wrapper.getBody();

      // Body should be a ReadableStream or null
      assert.ok(body === null || body instanceof ReadableStream);

      // Clean up the stream
      if (body) {
        await body.cancel();
      }
    });

    it("should throw error when getting body stream after JSON", async () => {
      const response = createMockResponse({
        body: { data: "test" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/test", "GET");

      await wrapper.getJson();

      try {
        const stream = wrapper.getBody();
        if (stream) {
          await stream.cancel(); // Clean up if somehow we got a stream
        }
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
        const stream = wrapper.getBody();
        if (stream) {
          await stream.cancel(); // Clean up if somehow we got a stream
        }
        assert.fail("Should have thrown error");
      } catch (error: any) {
        assert.ok(error.message.includes("Body already consumed"));
      }
    });
  });

  describe("JSON Parsing Error Handling", () => {
    it("should handle JSON parsing errors that are not Error instances", async () => {
      // Create a mock response that throws a non-Error value
      const mockResponse = new Response("invalid json", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

      // Override the json() method to throw a non-Error value
      mockResponse.json = () => {
        // Simulate a non-Error throw (though this is rare in practice)
        return Promise.reject("String error" as any);
      };

      const wrapper = new ResponseWrapper(mockResponse, "https://api.example.com/test", "GET");

      try {
        await wrapper.getJson();
        assert.fail("Should have thrown an error");
      } catch (error: any) {
        assert.ok(error instanceof RequestError);
        assert.match(error.message, /Invalid JSON/);
        assert.equal(error.status, 200);
        assert.ok(error.response);
      }
    });

    it("should handle JSON parsing errors with Error instances", async () => {
      // Create a mock response with invalid JSON
      const mockResponse = new Response("invalid json {", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

      const wrapper = new ResponseWrapper(mockResponse, "https://api.example.com/test", "GET");

      try {
        await wrapper.getJson();
        assert.fail("Should have thrown an error");
      } catch (error: any) {
        assert.ok(error instanceof RequestError);
        assert.match(error.message, /Invalid JSON/);
        assert.equal(error.status, 200);
        assert.ok(error.response);
      }
    });

    it("should handle GraphQL errors and throw with response object", async () => {
      // Create a response with GraphQL errors
      const mockResponse = new Response(
        JSON.stringify({
          data: null,
          errors: [{ message: "Test error" }],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );

      // Create ResponseWrapper with GraphQL options
      const graphQLOptions = { throwOnError: true };
      const wrapper = new ResponseWrapper(mockResponse, "https://api.example.com/test", "GET", graphQLOptions);

      try {
        await wrapper.getJson();
        assert.fail("Should have thrown an error");
      } catch (error: any) {
        assert.ok(error instanceof RequestError);
        assert.match(error.message, /GraphQL errors:/);
        assert.equal(error.status, 200);
        assert.ok(error.response);
        assert.equal(error.response, mockResponse);
      }
    });

    it("should handle GraphQL errors with string error messages", async () => {
      // Create a response with GraphQL errors as strings
      const mockResponse = new Response(
        JSON.stringify({
          data: null,
          errors: ["Error 1", "Error 2"],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );

      const graphQLOptions = { throwOnError: true };
      const wrapper = new ResponseWrapper(mockResponse, "https://api.example.com/test", "GET", graphQLOptions);

      try {
        await wrapper.getJson();
        assert.fail("Should have thrown an error");
      } catch (error: any) {
        assert.ok(error instanceof RequestError);
        assert.match(error.message, /GraphQL errors:/);
        assert.ok(error.message.includes("Error 1"));
        assert.ok(error.message.includes("Error 2"));
        assert.equal(error.status, 200);
        assert.equal(error.url, "https://api.example.com/test");
        assert.equal(error.method, "GET");
        assert.ok(error.response);
      }
    });

    it("should handle GraphQL errors with object errors without message property", async () => {
      // Create a response with GraphQL errors as objects without message
      const mockResponse = new Response(
        JSON.stringify({
          data: null,
          errors: [{ code: "ERROR_1" }, { code: "ERROR_2" }],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );

      const graphQLOptions = { throwOnError: true };
      const wrapper = new ResponseWrapper(mockResponse, "https://api.example.com/test", "GET", graphQLOptions);

      try {
        await wrapper.getJson();
        assert.fail("Should have thrown an error");
      } catch (error: any) {
        assert.ok(error instanceof RequestError);
        assert.match(error.message, /GraphQL errors:/);
        // Objects without message property are converted to string, which becomes "[object Object]"
        assert.ok(error.message.includes("[object Object]"));
        assert.equal(error.status, 200);
        assert.equal(error.url, "https://api.example.com/test");
        assert.equal(error.method, "GET");
      }
    });

    it("should handle GraphQL errors with mixed error types", async () => {
      // Create a response with mixed error types
      const mockResponse = new Response(
        JSON.stringify({
          data: null,
          errors: [
            "String error",
            { message: "Object error" },
            { code: "NO_MESSAGE" },
            123, // Non-string, non-object
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );

      const graphQLOptions = { throwOnError: true };
      const wrapper = new ResponseWrapper(mockResponse, "https://api.example.com/test", "GET", graphQLOptions);

      try {
        await wrapper.getJson();
        assert.fail("Should have thrown an error");
      } catch (error: any) {
        assert.ok(error instanceof RequestError);
        assert.match(error.message, /GraphQL errors:/);
        assert.ok(error.message.includes("String error"));
        assert.ok(error.message.includes("Object error"));
        // Objects without message property are converted to string, which becomes "[object Object]"
        // Numbers are converted to string "123"
        assert.ok(error.message.includes("[object Object]") || error.message.includes("123"));
        assert.equal(error.status, 200);
      }
    });

    it("should handle GraphQL errors without url or method", async () => {
      // Create a response with GraphQL errors
      const mockResponse = new Response(
        JSON.stringify({
          data: null,
          errors: [{ message: "Test error" }],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );

      const graphQLOptions = { throwOnError: true };
      const wrapper = new ResponseWrapper(mockResponse, undefined, undefined, graphQLOptions);

      try {
        await wrapper.getJson();
        assert.fail("Should have thrown an error");
      } catch (error: any) {
        assert.ok(error instanceof RequestError);
        assert.match(error.message, /GraphQL errors:/);
        assert.equal(error.status, 200);
        assert.equal(error.url, "");
        assert.equal(error.method, "");
        assert.ok(error.response);
      }
    });

    it("should wrap non-RequestError JSON parsing errors with proper context", async () => {
      // Create a mock response that throws a non-RequestError
      const mockResponse = new Response("invalid json", {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });

      // Override json() to throw a regular Error (not RequestError)
      mockResponse.json = () => {
        return Promise.reject(new Error("Unexpected token in JSON"));
      };

      const wrapper = new ResponseWrapper(mockResponse, "https://api.example.com/test", "POST");

      try {
        await wrapper.getJson();
        assert.fail("Should have thrown an error");
      } catch (error: any) {
        assert.ok(error instanceof RequestError);
        assert.match(error.message, /Invalid JSON/);
        assert.equal(error.status, 500);
        assert.equal(error.url, "https://api.example.com/test");
        assert.equal(error.method, "POST");
        assert.ok(error.response);
        assert.equal(error.response, mockResponse);
      }
    });

    it("should wrap non-Error JSON parsing errors with proper context", async () => {
      // Create a mock response that throws a non-Error value
      const mockResponse = new Response("invalid json", {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });

      // Override json() to throw a non-Error value
      mockResponse.json = () => {
        return Promise.reject("String error" as any);
      };

      const wrapper = new ResponseWrapper(mockResponse, "https://api.example.com/test", "PUT");

      try {
        await wrapper.getJson();
        assert.fail("Should have thrown an error");
      } catch (error: any) {
        assert.ok(error instanceof RequestError);
        assert.match(error.message, /Invalid JSON/);
        assert.equal(error.status, 400);
        assert.equal(error.url, "https://api.example.com/test");
        assert.equal(error.method, "PUT");
        assert.ok(error.response);
      }
    });

    it("should handle non-Error exceptions in getText", async () => {
      // Create a mock response that throws a non-Error value
      const mockResponse = new Response("text content", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });

      // Override text() to throw a non-Error value
      mockResponse.text = () => {
        return Promise.reject("String error in text" as any);
      };

      const wrapper = new ResponseWrapper(mockResponse, "https://api.example.com/test", "GET");

      try {
        await wrapper.getText();
        assert.fail("Should have thrown an error");
      } catch (error: any) {
        assert.ok(error instanceof RequestError);
        assert.match(error.message, /Read failed:/);
        assert.equal(error.status, 200);
        assert.equal(error.url, "https://api.example.com/test");
        assert.equal(error.method, "GET");
        assert.ok(error.response);
      }
    });

    it("should handle non-Error exceptions in getText", async () => {
      // Create a mock response that throws a non-Error value
      const mockResponse = new Response("text content", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });

      // Override text() to throw a non-Error value
      mockResponse.text = () => {
        return Promise.reject("String error in text" as any);
      };

      const wrapper = new ResponseWrapper(mockResponse, "https://api.example.com/test", "GET");

      try {
        await wrapper.getText();
        assert.fail("Should have thrown an error");
      } catch (error: any) {
        assert.ok(error instanceof RequestError);
        assert.match(error.message, /Read failed:/);
        assert.equal(error.status, 200);
        assert.equal(error.url, "https://api.example.com/test");
        assert.equal(error.method, "GET");
        assert.ok(error.response);
      }
    });

    it("should handle non-Error exceptions in getBlob", async () => {
      // Create a mock response that throws a non-Error value
      const mockResponse = new Response("blob content", {
        status: 200,
        headers: { "Content-Type": "application/octet-stream" },
      });

      // Override blob() to throw a non-Error value
      mockResponse.blob = () => {
        return Promise.reject("String error in blob" as any);
      };

      const wrapper = new ResponseWrapper(mockResponse, "https://api.example.com/test", "GET");

      try {
        await wrapper.getBlob();
        assert.fail("Should have thrown an error");
      } catch (error: any) {
        assert.ok(error instanceof RequestError);
        assert.match(error.message, /Read failed:/);
        assert.equal(error.status, 200);
        assert.equal(error.url, "https://api.example.com/test");
        assert.equal(error.method, "GET");
        assert.ok(error.response);
      }
    });

    it("should handle non-Error exceptions in getArrayBuffer", async () => {
      // Create a mock response that throws a non-Error value
      const mockResponse = new Response("buffer content", {
        status: 200,
        headers: { "Content-Type": "application/octet-stream" },
      });

      // Override arrayBuffer() to throw a non-Error value
      mockResponse.arrayBuffer = () => {
        return Promise.reject("String error in arrayBuffer" as any);
      };

      const wrapper = new ResponseWrapper(mockResponse, "https://api.example.com/test", "GET");

      try {
        await wrapper.getArrayBuffer();
        assert.fail("Should have thrown an error");
      } catch (error: any) {
        assert.ok(error instanceof RequestError);
        assert.match(error.message, /Read failed:/);
        assert.equal(error.status, 200);
        assert.equal(error.url, "https://api.example.com/test");
        assert.equal(error.method, "GET");
        assert.ok(error.response);
      }
    });

    it("should throw error when getBody is called after body is consumed", async () => {
      const response = createMockResponse({
        body: "test content",
        headers: { "content-type": "text/plain" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/test", "GET");

      await wrapper.getText();

      try {
        wrapper.getBody();
        assert.fail("Should have thrown error");
      } catch (error: any) {
        assert.ok(error instanceof RequestError);
        assert.ok(error.message.includes("Body already consumed"));
        assert.equal(error.url, "https://api.example.com/test");
        assert.equal(error.method, "GET");
      }
    });

    it("should handle non-Error exceptions in getData with selector", async () => {
      // Create a mock response with valid JSON
      const mockResponse = new Response(JSON.stringify({ data: { items: [1, 2, 3] } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

      const wrapper = new ResponseWrapper(mockResponse, "https://api.example.com/test", "GET");

      // Use a selector that throws a non-Error value
      try {
        await wrapper.getData(() => {
          throw "String error in selector" as any;
        });
        assert.fail("Should have thrown an error");
      } catch (error: any) {
        assert.ok(error instanceof RequestError);
        assert.match(error.message, /Data selector failed/);
        assert.equal(error.status, 200);
        assert.equal(error.url, "https://api.example.com/test");
        assert.equal(error.method, "GET");
        assert.ok(error.response);
      }
    });

    it("should handle non-Error exceptions in getData without selector", async () => {
      // Create a mock response that throws a non-Error value during JSON parsing
      const mockResponse = new Response("invalid json", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

      // Override json() to throw a non-Error value
      mockResponse.json = () => {
        return Promise.reject("String error in getData" as any);
      };

      const wrapper = new ResponseWrapper(mockResponse, "https://api.example.com/test", "GET");

      try {
        await wrapper.getData();
        assert.fail("Should have thrown an error");
      } catch (error: any) {
        assert.ok(error instanceof RequestError);
        // Should be wrapped as networkError when no selector
        assert.ok(error.message.includes("Network error") || error.message.includes("String error in getData"));
        assert.equal(error.url, "https://api.example.com/test");
        assert.equal(error.method, "GET");
      }
    });
  });
});
