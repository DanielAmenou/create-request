import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { GetRequest } from "../src/requestMethods.js";
import { FetchMock } from "./utils/fetchMock.js";
import create from "../src/index.js";

describe("Integrity Option", { timeout: 10000 }, () => {
  beforeEach(() => {
    FetchMock.install();
  });

  afterEach(() => {
    FetchMock.reset();
    FetchMock.restore();
  });

  it("should support integrity option", async () => {
    // Arrange
    FetchMock.mockResponseOnce({ body: {} });
    const request = new GetRequest("https://api.example.com/test");
    const integrityHash = "sha256-abcdef1234567890";

    // Act
    request.withIntegrity(integrityHash);
    await request.getResponse();

    // Assert
    const lastOptions = FetchMock.mock.calls[0][1];
    assert.equal(lastOptions.integrity, integrityHash);
  });

  it("should work with factory methods", async () => {
    FetchMock.mockResponseOnce({ body: {} });
    const request = create.get("https://api.example.com/test").withIntegrity("sha256-1234567890");

    await request.getResponse();

    const [, options] = FetchMock.mock.calls[0];
    assert.equal(options.integrity, "sha256-1234567890");
  });

  it("should work with other fetch options", async () => {
    FetchMock.mockResponseOnce({ body: {} });
    const request = new GetRequest("https://api.example.com/test").withIntegrity("sha256-abcdef1234567890").withCredentials.INCLUDE().withMode.CORS().withPriority.HIGH();

    await request.getResponse();

    const [, options] = FetchMock.mock.calls[0];
    assert.equal(options.integrity, "sha256-abcdef1234567890");
    assert.equal(options.credentials, "include");
    assert.equal(options.mode, "cors");
    assert.equal(options.priority, "high");
  });

  it("should work with timeout and retries", async () => {
    FetchMock.mockResponseOnce({ body: {} });
    const request = new GetRequest("https://api.example.com/test").withIntegrity("sha256-abcdef1234567890").withTimeout(5000).withRetries(2);

    await request.getResponse();

    const [, options] = FetchMock.mock.calls[0];
    assert.equal(options.integrity, "sha256-abcdef1234567890");
  });

  it("should work with query parameters", async () => {
    FetchMock.mockResponseOnce({ body: {} });
    const request = new GetRequest("https://api.example.com/test").withIntegrity("sha256-abcdef1234567890").withQueryParams({ page: 1, limit: 10 });

    await request.getResponse();

    const [, options] = FetchMock.mock.calls[0];
    assert.equal(options.integrity, "sha256-abcdef1234567890");
    assert(FetchMock.mock.calls[0][0].includes("page=1"));
    assert(FetchMock.mock.calls[0][0].includes("limit=10"));
  });

  it("should work with headers", async () => {
    FetchMock.mockResponseOnce({ body: {} });
    const request = new GetRequest("https://api.example.com/test").withIntegrity("sha256-abcdef1234567890").withHeaders({ "X-Custom": "value", Accept: "application/json" });

    await request.getResponse();

    const [, options] = FetchMock.mock.calls[0];
    assert.equal(options.integrity, "sha256-abcdef1234567890");
    assert.equal(options.headers["X-Custom"], "value");
    assert.equal(options.headers["Accept"], "application/json");
  });

  it("should work with interceptors", async () => {
    FetchMock.mockResponseOnce({ body: {} });
    let interceptorCalled = false;
    const request = new GetRequest("https://api.example.com/test").withIntegrity("sha256-abcdef1234567890").withRequestInterceptor(config => {
      interceptorCalled = true;
      assert.equal(config.integrity, "sha256-abcdef1234567890");
      return config;
    });

    await request.getResponse();

    assert.equal(interceptorCalled, true);
    const [, options] = FetchMock.mock.calls[0];
    assert.equal(options.integrity, "sha256-abcdef1234567890");
  });

  it("should allow interceptor to modify integrity", async () => {
    FetchMock.mockResponseOnce({ body: {} });
    const request = new GetRequest("https://api.example.com/test").withIntegrity("sha256-abcdef1234567890").withRequestInterceptor(config => {
      config.integrity = "sha256-modified";
      return config;
    });

    await request.getResponse();

    const [, options] = FetchMock.mock.calls[0];
    assert.equal(options.integrity, "sha256-modified");
  });

  it("should work with different hash algorithms", async () => {
    const hashes = ["sha256-abcdef1234567890", "sha384-abcdef1234567890abcdef1234567890", "sha512-abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"];

    for (const hash of hashes) {
      FetchMock.mockResponseOnce({ body: {} });
      const request = new GetRequest("https://api.example.com/test").withIntegrity(hash);
      await request.getResponse();

      const callIndex = FetchMock.mock.calls.length - 1;
      const [, options] = FetchMock.mock.calls[callIndex];
      assert.equal(options.integrity, hash, `Integrity hash ${hash} should be set correctly`);
    }
  });

  it("should allow chaining with other methods", async () => {
    FetchMock.mockResponseOnce({ body: {} });
    const request = new GetRequest("https://api.example.com/test").withIntegrity("sha256-abcdef1234567890").withHeader("X-Custom", "value");

    await request.getResponse();

    const [, options] = FetchMock.mock.calls[0];
    assert.equal(options.integrity, "sha256-abcdef1234567890");
    assert.equal(options.headers["X-Custom"], "value");
  });
});
