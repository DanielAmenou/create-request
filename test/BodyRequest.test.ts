import assert from "node:assert/strict";
import { Blob } from "node:buffer";
import { describe, it, beforeEach, afterEach } from "node:test";
import create from "../src/index";
import { PostRequest } from "../src/requestMethods";

import { FetchMock } from "./utils/fetchMock";

describe("BodyRequest", () => {
  beforeEach(() => {
    FetchMock.install();
    // Disable anti-CSRF globally for these tests
    create.config.setEnableAntiCsrf(false);
  });

  afterEach(() => {
    FetchMock.reset();
    FetchMock.restore();
    // Reset global config after each test
    create.config.reset();
  });

  it("should properly handle JSON object body", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const data = { name: "John Doe", age: 30, active: true };
    const request = new PostRequest().withBody(data);

    // Act
    await request.sendTo("https://api.example.com/users");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    assert.equal(options.body, JSON.stringify(data));
    assert.deepEqual(options.headers, {
      "Content-Type": "application/json",
    });
  });

  it("should handle string body", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const textContent = "Hello, world!";
    const request = new PostRequest().withBody(textContent);

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    assert.equal(options.body, textContent);
    assert.deepEqual(options.headers, { "Content-Type": "text/plain" });
  });

  it("should handle FormData body", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const formData = new FormData();
    formData.append("name", "John Doe");
    formData.append("age", "30");

    const request = new PostRequest().withBody(formData);

    // Act
    await request.sendTo("https://api.example.com/form");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    assert.equal(options.body, formData);

    // For FormData, we should not set Content-Type header explicitly
    // as the browser will set it to 'multipart/form-data' with boundary
    assert.deepEqual(options.headers, {});

    // Verify Content-Type is not being manually set
    assert.equal(options.headers["Content-Type"], undefined);

    // Check if the request correctly passed FormData without modification
    const mockFetchCall = FetchMock.mock.calls[0];
    assert.equal(mockFetchCall[1].body, formData);
  });

  it("should handle Blob body", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const blob = new Blob(["Hello, world!"], { type: "text/plain" });
    const request = new PostRequest().withBody(blob);

    // Act
    await request.sendTo("https://api.example.com/blob");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    assert.equal(options.body, blob);
    assert.deepEqual(options.headers, {});
  });

  it("should handle URLSearchParams body", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const params = new URLSearchParams();
    params.append("name", "John Doe");
    params.append("age", "30");

    const request = new PostRequest().withBody(params);

    // Act
    await request.sendTo("https://api.example.com/params");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    assert.equal(options.body, params);
    assert.deepEqual(options.headers, {});
  });

  it("should handle ArrayBuffer body", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const buffer = new ArrayBuffer(8);
    const request = new PostRequest().withBody(buffer);

    // Act
    await request.sendTo("https://api.example.com/buffer");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    assert.equal(options.body, buffer);
    assert.deepEqual(options.headers, {});
  });

  it("should handle null body", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const request = new PostRequest().withBody(null);

    // Act
    await request.sendTo("https://api.example.com/empty");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    assert.equal(options.body, null);
  });

  it("should throw error for unstringifiable body", () => {
    // Arrange
    const circularObj: any = {};
    circularObj.self = circularObj;

    // Act & Assert
    assert.throws(() => {
      new PostRequest().withBody(circularObj as Body);
    }, /Failed to stringify request body/);
  });

  it("should respect existing Content-Type header when using withBody", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const data = { name: "John Doe", age: 30 };
    const request = new PostRequest().withHeaders({ "Content-Type": "application/vnd.custom+json" }).withBody(data);

    // Act
    await request.sendTo("https://api.example.com/users");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    assert.equal(options.body, JSON.stringify(data));
    assert.deepEqual(options.headers, {
      "Content-Type": "application/vnd.custom+json", // Original header preserved
    });
  });

  it("should preserve headers case sensitivity", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const request = new PostRequest()
      .withHeaders({
        "Content-Type": "application/json",
        "X-Custom-ID": "123",
        Authorization: "Bearer token",
      })
      .withBody({ test: true });

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    assert.deepEqual(options.headers, {
      "Content-Type": "application/json",
      "X-Custom-ID": "123",
      Authorization: "Bearer token",
    });
  });
});
