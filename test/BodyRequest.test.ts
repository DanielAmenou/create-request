import assert from "node:assert/strict";
import { Blob } from "node:buffer";
import { describe, it, beforeEach, afterEach } from "node:test";
import { PostRequest } from "../src/requestMethods";

import { FetchMock } from "./utils/fetchMock";

describe("BodyRequest", () => {
  beforeEach(() => {
    FetchMock.install();
  });

  afterEach(() => {
    FetchMock.reset();
    FetchMock.restore();
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
    const request = new PostRequest().withBody("plain text content");

    // Act
    await request.sendTo("https://api.example.com/text");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    assert.equal(options.body, "plain text content");
    // No content-type should be set automatically for plain strings
    assert.equal(options.headers, undefined);
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
    // Content-type should not be set for FormData
    assert.equal(options.headers, undefined);
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
    // Content-type should not be set for Blob
    assert.equal(options.headers, undefined);
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
    // Content-type should not be set for URLSearchParams
    assert.equal(options.headers, undefined);
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
    // Content-type should not be set for ArrayBuffer
    assert.equal(options.headers, undefined);
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
    const request = new PostRequest()
      .withHeaders({ "Content-Type": "application/vnd.custom+json" })
      .withBody(data);

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
