import assert from "node:assert/strict";
import { Blob } from "node:buffer";
import { describe, it } from "node:test";

import { ResponseWrapper } from "../src/ResponseWrapper";

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

  it("should get ArrayBuffer response", async () => {
    // Arrange
    const content = "Buffer content";
    const mockResponse = new Response(content, {
      headers: { "Content-Type": "application/octet-stream" },
    });
    const wrapper = new ResponseWrapper(mockResponse);

    // Act
    const result = await wrapper.getArrayBuffer();

    // Assert
    assert(result instanceof ArrayBuffer);
    const decoder = new TextDecoder();
    assert.equal(decoder.decode(result), content);
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
});
