import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { GetRequest, PostRequest } from "../src/requestMethods.js";
import { CacheMode } from "../src/enums.js";
import { FetchMock } from "./utils/fetchMock.js";
import create from "../src/index.js";

describe("Cache Mode Options", { timeout: 10000 }, () => {
  beforeEach(() => {
    FetchMock.install();
  });

  afterEach(() => {
    FetchMock.reset();
    FetchMock.restore();
  });

  it("should support cache option with string value", async () => {
    // Arrange
    FetchMock.mockResponseOnce({ body: {} });
    const request = new GetRequest("https://api.example.com/test");

    // Act
    request.withCache("no-cache");
    await request.getResponse();

    // Assert
    const lastOptions = FetchMock.mock.calls[0][1];
    assert.equal(lastOptions.cache, "no-cache");
  });

  it("should support cache option with fluent API", async () => {
    // Arrange
    FetchMock.mockResponseOnce({ body: {} });
    const request = new GetRequest("https://api.example.com/test");

    // Act
    request.withCache.NO_CACHE();
    await request.getResponse();

    // Assert
    const lastOptions = FetchMock.mock.calls[0][1];
    assert.equal(lastOptions.cache, "no-cache");
  });

  it("should support all cache modes via fluent API", async () => {
    // Arrange
    const cacheModes = [
      { method: "DEFAULT", expected: "default" },
      { method: "NO_STORE", expected: "no-store" },
      { method: "RELOAD", expected: "reload" },
      { method: "NO_CACHE", expected: "no-cache" },
      { method: "FORCE_CACHE", expected: "force-cache" },
      { method: "ONLY_IF_CACHED", expected: "only-if-cached" },
    ];

    for (const { method, expected } of cacheModes) {
      FetchMock.mockResponseOnce({ body: {} });
      const request = new GetRequest("https://api.example.com/test");

      // Act
      (request.withCache as any)[method]();
      await request.getResponse();

      // Assert
      const lastOptions = FetchMock.mock.calls[FetchMock.mock.calls.length - 1][1];
      assert.equal(lastOptions.cache, expected, `Cache mode ${method} should be ${expected}`);
    }
  });

  describe("withCache - Comprehensive Tests", () => {
    it("should support callable form with enum value", async () => {
      FetchMock.mockResponseOnce({ body: {} });
      const request = new GetRequest("https://api.example.com/test").withCache(CacheMode.NO_CACHE);

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.cache, "no-cache");
    });

    it("should support callable form with string value", async () => {
      FetchMock.mockResponseOnce({ body: {} });
      const request = new GetRequest("https://api.example.com/test").withCache("force-cache");

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.cache, "force-cache");
    });

    it("should support all convenience methods", async () => {
      const methods = [
        { methodName: "DEFAULT", expected: "default" },
        { methodName: "NO_STORE", expected: "no-store" },
        { methodName: "RELOAD", expected: "reload" },
        { methodName: "NO_CACHE", expected: "no-cache" },
        { methodName: "FORCE_CACHE", expected: "force-cache" },
        { methodName: "ONLY_IF_CACHED", expected: "only-if-cached" },
      ];

      for (const { methodName, expected } of methods) {
        FetchMock.mockResponseOnce({ body: {} });
        const request = new GetRequest("https://api.example.com/test");
        (request.withCache as any)[methodName]();
        await request.getResponse();

        const callIndex = FetchMock.mock.calls.length - 1;
        const [, options] = FetchMock.mock.calls[callIndex];
        assert.equal(options.cache, expected);
      }
    });

    it("should allow chaining after fluent method", async () => {
      FetchMock.mockResponseOnce({ body: {} });
      const request = new GetRequest("https://api.example.com/test").withCache.NO_CACHE().withHeader("X-Custom", "value");

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.cache, "no-cache");
      assert.equal(options.headers["X-Custom"], "value");
    });

    it("should allow overriding cache settings", async () => {
      FetchMock.mockResponseOnce({ body: {} });
      const request = new GetRequest("https://api.example.com/test").withCache("default").withCache("no-cache");

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.cache, "no-cache");
    });

    it("should allow overriding with fluent API after string", async () => {
      FetchMock.mockResponseOnce({ body: {} });
      const request = new GetRequest("https://api.example.com/test").withCache("default").withCache.NO_STORE();

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.cache, "no-store");
    });

    it("should allow overriding with string after fluent API", async () => {
      FetchMock.mockResponseOnce({ body: {} });
      const request = new GetRequest("https://api.example.com/test").withCache.NO_CACHE().withCache("force-cache");

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.cache, "force-cache");
    });

    it("should work with POST requests", async () => {
      FetchMock.mockResponseOnce({ body: {} });
      const request = new PostRequest("https://api.example.com/test")
        .withCache("no-store")
        // @ts-expect-error - withBody is available on PostRequest via BodyRequest
        .withBody({ data: "test" });

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.cache, "no-store");
      assert.equal(options.method, "POST");
    });

    it("should work with other fetch options", async () => {
      FetchMock.mockResponseOnce({ body: {} });
      const request = new GetRequest("https://api.example.com/test").withCache("reload").withCredentials.INCLUDE().withMode.CORS().withPriority.HIGH();

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.cache, "reload");
      assert.equal(options.credentials, "include");
      assert.equal(options.mode, "cors");
      assert.equal(options.priority, "high");
    });

    it("should work with factory methods", async () => {
      FetchMock.mockResponseOnce({ body: {} });
      const request = create.get("https://api.example.com/test").withCache("only-if-cached");

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.cache, "only-if-cached");
    });

    it("should work with integrity option combined", async () => {
      FetchMock.mockResponseOnce({ body: {} });
      const request = new GetRequest("https://api.example.com/test").withCache("no-cache").withIntegrity("sha256-abcdef1234567890");

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.cache, "no-cache");
      assert.equal(options.integrity, "sha256-abcdef1234567890");
    });

    it("should work with timeout and retries", async () => {
      FetchMock.mockResponseOnce({ body: {} });
      const request = new GetRequest("https://api.example.com/test").withCache("no-store").withTimeout(5000).withRetries(2);

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.cache, "no-store");
    });

    it("should work with query parameters", async () => {
      FetchMock.mockResponseOnce({ body: {} });
      const request = new GetRequest("https://api.example.com/test").withCache("reload").withQueryParams({ page: 1, limit: 10 });

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.cache, "reload");
      assert(FetchMock.mock.calls[0][0].includes("page=1"));
      assert(FetchMock.mock.calls[0][0].includes("limit=10"));
    });

    it("should work with headers", async () => {
      FetchMock.mockResponseOnce({ body: {} });
      const request = new GetRequest("https://api.example.com/test").withCache("force-cache").withHeaders({ "X-Custom": "value", Accept: "application/json" });

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.cache, "force-cache");
      assert.equal(options.headers["X-Custom"], "value");
      assert.equal(options.headers["Accept"], "application/json");
    });

    it("should work with interceptors", async () => {
      FetchMock.mockResponseOnce({ body: {} });
      let interceptorCalled = false;
      const request = new GetRequest("https://api.example.com/test").withCache("default").withRequestInterceptor(config => {
        interceptorCalled = true;
        assert.equal(config.cache, "default");
        return config;
      });

      await request.getResponse();

      assert.equal(interceptorCalled, true);
      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.cache, "default");
    });

    it("should allow interceptor to modify cache", async () => {
      FetchMock.mockResponseOnce({ body: {} });
      const request = new GetRequest("https://api.example.com/test").withCache("default").withRequestInterceptor(config => {
        config.cache = "no-cache";
        return config;
      });

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.cache, "no-cache");
    });

    it("should handle custom cache string values", async () => {
      FetchMock.mockResponseOnce({ body: {} });
      const request = new GetRequest("https://api.example.com/test").withCache("custom-cache-value");

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.cache, "custom-cache-value");
    });

    it("should work with all cache modes in sequence", async () => {
      const modes = ["default", "no-store", "reload", "no-cache", "force-cache", "only-if-cached"];

      for (const mode of modes) {
        FetchMock.mockResponseOnce({ body: {} });
        const request = new GetRequest("https://api.example.com/test").withCache(mode);
        await request.getResponse();

        const callIndex = FetchMock.mock.calls.length - 1;
        const [, options] = FetchMock.mock.calls[callIndex];
        assert.equal(options.cache, mode, `Cache mode ${mode} should be set correctly`);
      }
    });
  });
});
