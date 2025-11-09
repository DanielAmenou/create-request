import assert from "node:assert/strict";
import { Blob } from "node:buffer";
import { describe, it } from "node:test";

import { RequestError } from "../src/RequestError.js";
import { ResponseWrapper } from "../src/ResponseWrapper.js";

describe("ResponseWrapper", () => {
  it("should properly wrap a Response object", () => {
    // Arrange
    const mockResponse = new Response("test body", {
      status: 200,
      statusText: "OK",
      headers: {
        "Content-Type": "text/plain",
      },
    });

    // Act
    const wrapper = new ResponseWrapper(mockResponse);

    // Assert
    assert.equal(wrapper.status, 200);
    assert.equal(wrapper.statusText, "OK");
    assert.equal(wrapper.headers.get("Content-Type"), "text/plain");
    assert.equal(wrapper.raw, mockResponse);
  });

  it("should parse JSON response", async () => {
    // Arrange
    const data = { name: "John", age: 30 };
    const mockResponse = new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
    });
    const wrapper = new ResponseWrapper(mockResponse);

    // Act
    const result = await wrapper.getJson();

    // Assert
    assert.deepEqual(result, data);
  });

  it("should get text response", async () => {
    // Arrange
    const textContent = "Hello, world!";
    const mockResponse = new Response(textContent, {
      headers: { "Content-Type": "text/plain" },
    });
    const wrapper = new ResponseWrapper(mockResponse);

    // Act
    const result = await wrapper.getText();

    // Assert
    assert.equal(result, textContent);
  });

  it("should get Blob response", async () => {
    // Arrange
    const content = "Blob content";
    const mockResponse = new Response(content, {
      headers: { "Content-Type": "application/octet-stream" },
    });
    const wrapper = new ResponseWrapper(mockResponse);

    // Act
    const result = await wrapper.getBlob();

    // Assert
    assert(result instanceof Blob);
    const text = await result.text();
    assert.equal(text, content);
  });

  it("should get ReadableStream response", () => {
    // Arrange
    const content = "Stream content";
    const mockResponse = new Response(content);
    const wrapper = new ResponseWrapper(mockResponse);

    // Act
    const result = wrapper.getBody();

    // Assert
    assert(result instanceof ReadableStream);
  });

  // Added empty response handling tests
  it("should handle empty JSON object response", async () => {
    // Arrange
    const emptyObject = {};
    const mockResponse = new Response(JSON.stringify(emptyObject), {
      headers: { "Content-Type": "application/json" },
    });
    const wrapper = new ResponseWrapper(mockResponse);

    // Act
    const result = await wrapper.getJson();

    // Assert
    assert.deepEqual(result, {});
    assert.equal(Object.keys(result).length, 0);
  });

  it("should handle empty JSON array response", async () => {
    // Arrange
    const emptyArray: any[] = [];
    const mockResponse = new Response(JSON.stringify(emptyArray), {
      headers: { "Content-Type": "application/json" },
    });
    const wrapper = new ResponseWrapper(mockResponse);

    // Act
    const result = await wrapper.getJson();

    // Assert
    assert.deepEqual(result, []);
    assert.equal(result.length, 0);
  });

  it("should handle null JSON response", async () => {
    // Arrange
    const mockResponse = new Response("null", {
      headers: { "Content-Type": "application/json" },
    });
    const wrapper = new ResponseWrapper(mockResponse);

    // Act
    const result = await wrapper.getJson();

    // Assert
    assert.strictEqual(result, null);
  });

  it("should handle completely empty response body with JSON content type", async () => {
    // Arrange
    const mockResponse = new Response("", {
      headers: { "Content-Type": "application/json" },
    });
    const wrapper = new ResponseWrapper(mockResponse);

    // Act & Assert
    try {
      await wrapper.getJson();
      assert.fail("Should have thrown an error for empty body with JSON content type");
    } catch (error) {
      assert(error instanceof RequestError);
      assert(error.message.includes("Invalid JSON") || error.message.includes("Unexpected end of JSON input"));
    }
  });

  it("should throw error when calling getJson() twice on the same response", async () => {
    // Arrange
    const data = { name: "John", age: 30 };
    const mockResponse = new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
    });
    const wrapper = new ResponseWrapper(mockResponse);

    // Act
    const result1 = await wrapper.getJson();

    // Assert
    assert.deepEqual(result1, data);
    await assert.rejects(() => wrapper.getJson(), /Body already consumed/);
  });

  it("should throw error when getting text after JSON", async () => {
    // Arrange
    const data = { name: "John", age: 30 };
    const jsonString = JSON.stringify(data);
    const mockResponse = new Response(jsonString, {
      headers: { "Content-Type": "application/json" },
    });
    const wrapper = new ResponseWrapper(mockResponse);

    // Act
    const jsonResult = await wrapper.getJson();

    // Assert
    assert.deepEqual(jsonResult, data);
    await assert.rejects(() => wrapper.getText(), /Body already consumed/);
  });

  it("should throw error when getting JSON after text", async () => {
    // Arrange
    const data = { name: "John", age: 30 };
    const jsonString = JSON.stringify(data);
    const mockResponse = new Response(jsonString, {
      headers: { "Content-Type": "application/json" },
    });
    const wrapper = new ResponseWrapper(mockResponse);

    // Act
    const textResult = await wrapper.getText();

    // Assert
    assert.equal(textResult, jsonString);
    await assert.rejects(() => wrapper.getJson(), /Body already consumed/);
  });

  it("should throw error when getting blob after text", async () => {
    // Arrange
    const content = "Hello, world!";
    const mockResponse = new Response(content, {
      headers: { "Content-Type": "text/plain" },
    });
    const wrapper = new ResponseWrapper(mockResponse);

    // Act
    const text = await wrapper.getText();

    // Assert
    assert.equal(text, content);
    await assert.rejects(() => wrapper.getBlob(), /Body already consumed/);
  });

  it("should throw a descriptive error when body stream is locked", async () => {
    // Arrange
    const mockResponse = new Response("Plain text content", {
      headers: { "Content-Type": "text/plain" },
    });
    const wrapper = new ResponseWrapper(mockResponse);

    // Act - Get the body stream and lock it by getting a reader
    const stream = wrapper.getBody();
    if (stream) {
      stream.getReader(); // This locks the stream and marks body as used
    }

    // Assert - now try to get JSON which should fail
    await assert.rejects(() => wrapper.getJson(), /Body (already consumed|is unusable|has already been read)/i);
  });

  it("should get ArrayBuffer response", async () => {
    // Arrange
    const content = "Binary content";
    const mockResponse = new Response(content, {
      headers: { "Content-Type": "application/octet-stream" },
    });
    const wrapper = new ResponseWrapper(mockResponse);

    // Act
    const result = await wrapper.getArrayBuffer();

    // Assert
    assert(result instanceof ArrayBuffer);
    const text = new TextDecoder().decode(result);
    assert.equal(text, content);
  });

  it("should throw error when getting ArrayBuffer after body consumed", async () => {
    // Arrange
    const content = "Binary content";
    const mockResponse = new Response(content, {
      headers: { "Content-Type": "application/octet-stream" },
    });
    const wrapper = new ResponseWrapper(mockResponse);

    // Act
    await wrapper.getText();

    // Assert
    await assert.rejects(() => wrapper.getArrayBuffer(), /Body already consumed/);
  });
});
