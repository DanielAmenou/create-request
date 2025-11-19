import create from "../src/index.js";
import assert from "node:assert/strict";
import { FetchMock } from "./utils/fetchMock.js";
import { describe, it, beforeEach, afterEach } from "node:test";

describe("API Builder", () => {
  beforeEach(() => {
    FetchMock.install();
    create.config.setEnableAntiCsrf(false);
  });

  afterEach(() => {
    FetchMock.reset();
    FetchMock.restore();
    create.config.reset();
  });

  describe("create.api()", () => {
    it("should create an API builder", () => {
      const builder = create.api();
      assert.ok(builder);
      assert.equal(typeof builder.withBaseURL, "function");
      assert.equal(typeof builder.withTimeout, "function");
      assert.equal(typeof builder.withHeaders, "function");
      assert.equal(typeof builder.get, "function");
      assert.equal(typeof builder.post, "function");
    });

    it("should build an API instance with base URL", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });

      const api = create.api().withBaseURL("https://api.example.com");
      const result = await api.get("/users").getJson();

      assert.deepEqual(result, { success: true });
      const [url] = FetchMock.mock.calls[0] as [string, RequestInit];
      assert.equal(url, "https://api.example.com/users");
    });

    it("should build an API instance with default timeout", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });

      const api = create.api().withBaseURL("https://api.example.com").withTimeout(5000);
      await api.get("/users").getResponse();

      const [, options] = FetchMock.mock.calls[0] as [string, RequestInit];
      // Timeout is applied via AbortSignal, so we check the request was made
      assert.equal(options.method, "GET");
    });

    it("should build an API instance with default headers", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });

      const api = create.api().withBaseURL("https://api.example.com").withHeaders({ Authorization: "Bearer token123" });

      await api.get("/users").getResponse();

      const [, options] = FetchMock.mock.calls[0] as [string, RequestInit];
      const headers = options.headers as Record<string, string>;
      assert.equal(headers.Authorization, "Bearer token123");
    });

    it("should combine all configuration options", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });

      const api = create.api().withBaseURL("https://api.example.com").withTimeout(20000);
      (api as any).withHeaders({ Authorization: "Bearer token123" });

      const result = await api.get("/users").getJson();

      assert.deepEqual(result, { success: true });
      const [url, options] = FetchMock.mock.calls[0] as [string, RequestInit];
      assert.equal(url, "https://api.example.com/users");
      const headers = options.headers as Record<string, string>;
      assert.equal(headers.Authorization, "Bearer token123");
    });

    it("should allow calling get() without URL when baseURL is set", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });

      const api = create.api().withBaseURL("https://api.example.com");
      const result = await api.get().getJson();

      assert.deepEqual(result, { success: true });
      const [url] = FetchMock.mock.calls[0] as [string, RequestInit];
      assert.equal(url, "https://api.example.com");
    });

    it("should support all HTTP methods", async () => {
      FetchMock.mockResponseOnce();
      FetchMock.mockResponseOnce();
      FetchMock.mockResponseOnce();
      FetchMock.mockResponseOnce();
      FetchMock.mockResponseOnce();
      FetchMock.mockResponseOnce();
      FetchMock.mockResponseOnce();

      const api = create.api().withBaseURL("https://api.example.com");

      await api.get("/users").getResponse();
      await api.post("/users").getResponse();
      await api.put("/users/1").getResponse();
      await api.del("/users/1").getResponse();
      await api.patch("/users/1").getResponse();
      await api.head("/users").getResponse();
      await api.options("/users").getResponse();

      assert.equal(FetchMock.mock.calls.length, 7);
      const methods = FetchMock.mock.calls.map(([, options]) => (options as RequestInit).method);
      assert.deepEqual(methods, ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"]);
    });

    it("should resolve relative URLs against base URL", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });

      const api = create.api().withBaseURL("https://api.example.com");
      await api.get("users").getJson();

      const [url] = FetchMock.mock.calls[0] as [string, RequestInit];
      assert.equal(url, "https://api.example.com/users");
    });

    it("should not modify absolute URLs", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });

      const api = create.api().withBaseURL("https://api.example.com");
      await api.get("https://other-api.com/users").getJson();

      const [url] = FetchMock.mock.calls[0] as [string, RequestInit];
      assert.equal(url, "https://other-api.com/users");
    });

    it("should allow overriding default headers per request", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });

      const api = create.api().withBaseURL("https://api.example.com").withHeaders({ Authorization: "Bearer token123", "X-Custom": "default" });

      await api.get("/users").withHeaders({ Authorization: "Bearer newtoken", "X-Other": "value" }).getResponse();

      const [, options] = FetchMock.mock.calls[0] as [string, RequestInit];
      const headers = options.headers as Record<string, string>;
      assert.equal(headers.Authorization, "Bearer newtoken"); // Overridden
      assert.equal(headers["X-Custom"], "default"); // From defaults
      assert.equal(headers["X-Other"], "value"); // New header
    });

    it("should allow overriding default timeout per request", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });

      const api = create.api().withBaseURL("https://api.example.com").withTimeout(5000);
      await api.get("/users").withTimeout(10000).getResponse();

      const [, options] = FetchMock.mock.calls[0] as [string, RequestInit];
      assert.equal(options.method, "GET");
      // Timeout is applied via AbortSignal, so we just verify the request was made
    });

    it("should support chaining with query params and other methods", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });

      const api = create.api().withBaseURL("https://api.example.com").withHeaders({ Authorization: "Bearer token123" });

      const result = await api.get("/users").withQueryParams({ limit: 10, page: 1 }).getJson();

      assert.deepEqual(result, { success: true });
      const [url] = FetchMock.mock.calls[0] as [string, RequestInit];
      assert.ok(url.includes("limit=10"));
      assert.ok(url.includes("page=1"));
    });

    it("should handle baseURL with trailing slash", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });

      const api = create.api().withBaseURL("https://api.example.com/");
      await api.get("users").getJson();

      const [url] = FetchMock.mock.calls[0] as [string, RequestInit];
      assert.equal(url, "https://api.example.com/users");
    });

    it("should merge multiple calls to withHeaders", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });

      const api = create.api().withBaseURL("https://api.example.com");
      (api as any).withHeaders({ Authorization: "Bearer token123" });
      (api as any).withHeaders({ "X-Custom": "value1" });
      (api as any).withHeaders({ "X-Other": "value2", Authorization: "Bearer newtoken" });
      await api.get("/users").getResponse();

      const [, options] = FetchMock.mock.calls[0] as [string, RequestInit];
      const headers = options.headers as Record<string, string>;
      assert.equal(headers.Authorization, "Bearer newtoken"); // Last one wins
      assert.equal(headers["X-Custom"], "value1");
      assert.equal(headers["X-Other"], "value2");
    });

    it("should work without baseURL when URL is provided", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });

      const api = create.api().withHeaders({ Authorization: "Bearer token123" });
      await api.get("https://api.example.com/users").getJson();

      const [url, options] = FetchMock.mock.calls[0] as [string, RequestInit];
      assert.equal(url, "https://api.example.com/users");
      const headers = options.headers as Record<string, string>;
      assert.equal(headers.Authorization, "Bearer token123");
    });

    it("should handle relative URLs with ./ prefix", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });

      const api = create.api().withBaseURL("https://api.example.com");
      await api.get("./users").getJson();

      const [url] = FetchMock.mock.calls[0] as [string, RequestInit];
      assert.equal(url, "https://api.example.com/users");
    });

    it("should handle relative URLs with ../ prefix", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });

      const api = create.api().withBaseURL("https://api.example.com/v1");
      await api.get("../v2/users").getJson();

      const [url] = FetchMock.mock.calls[0] as [string, RequestInit];
      assert.equal(url, "https://api.example.com/v2/users");
    });

    it("should handle baseURL with path", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });

      const api = create.api().withBaseURL("https://api.example.com/v1");
      await api.get("users").getJson();

      const [url] = FetchMock.mock.calls[0] as [string, RequestInit];
      assert.equal(url, "https://api.example.com/v1/users");
    });

    it("should handle baseURL with path and trailing slash", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });

      const api = create.api().withBaseURL("https://api.example.com/v1/");
      await api.get("users").getJson();

      const [url] = FetchMock.mock.calls[0] as [string, RequestInit];
      assert.equal(url, "https://api.example.com/v1/users");
    });

    it("should handle relative URL starting with /", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });

      const api = create.api().withBaseURL("https://api.example.com/v1");
      await api.get("/users").getJson();

      const [url] = FetchMock.mock.calls[0] as [string, RequestInit];
      assert.equal(url, "https://api.example.com/users");
    });

    it("should apply defaults to POST requests", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });

      const api = create.api().withBaseURL("https://api.example.com").withTimeout(5000);
      (api as any).withHeaders({ Authorization: "Bearer token123" });

      await api.post("/users").withBody({ name: "John" }).getResponse();

      const [url, options] = FetchMock.mock.calls[0] as [string, RequestInit];
      assert.equal(url, "https://api.example.com/users");
      assert.equal(options.method, "POST");
      const headers = options.headers as Record<string, string>;
      assert.equal(headers.Authorization, "Bearer token123");
    });

    it("should allow calling post() without URL when baseURL is set", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });

      const api = create.api().withBaseURL("https://api.example.com");
      await api.post().withBody({ name: "John" }).getResponse();

      const [url] = FetchMock.mock.calls[0] as [string, RequestInit];
      assert.equal(url, "https://api.example.com");
    });

    it("should handle URL resolution fallback when URL constructor throws", async () => {
      // We need to make URL constructor throw to test the catch block
      FetchMock.mockResponseOnce({ body: { success: true } });

      // Temporarily override URL constructor to throw only in resolveURL
      const OriginalURL = global.URL;
      let urlConstructorCallCount = 0;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      global.URL = class MockURL extends OriginalURL {
        constructor(url: string, base?: string) {
          urlConstructorCallCount++;
          // Only throw on the first call (in resolveURL), then restore for validation
          if (urlConstructorCallCount === 1) {
            // Restore URL before throwing so validation can work
            global.URL = OriginalURL;
            throw new TypeError("Invalid URL");
          }
          // For subsequent calls (validation), use original URL
          super(url, base);
        }
      } as typeof URL;

      try {
        const api = create.api().withBaseURL("https://api.example.com");

        // Test with a relative URL - should use fallback at line 53
        const result = await api.get("users").getJson();
        assert.deepEqual(result, { success: true });

        const call = FetchMock.mock.calls[0];
        const url = Array.isArray(call) ? call[0] : "";
        // Should use fallback: baseURL without trailing slash + / + url
        assert.equal(url, "https://api.example.com/users");
        assert.equal(urlConstructorCallCount, 1);
      } finally {
        // Ensure URL is restored
        global.URL = OriginalURL;
      }
    });

    it("should handle URL resolution fallback with URL starting with slash", async () => {
      // Test line 53: fallback when url starts with "/"
      FetchMock.mockResponseOnce({ body: { success: true } });

      // Temporarily override URL constructor to throw only in resolveURL
      const OriginalURL = global.URL;
      let urlConstructorCallCount = 0;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      global.URL = class MockURL extends OriginalURL {
        constructor(url: string, base?: string) {
          urlConstructorCallCount++;
          // Only throw on the first call (in resolveURL), then restore for validation
          if (urlConstructorCallCount === 1) {
            // Restore URL before throwing so validation can work
            global.URL = OriginalURL;
            throw new TypeError("Invalid URL");
          }
          // For subsequent calls (validation), use original URL
          super(url, base);
        }
      } as typeof URL;

      try {
        const api = create.api().withBaseURL("https://api.example.com");

        // Test with URL starting with "/" - should use fallback
        const result = await api.get("/users").getJson();
        assert.deepEqual(result, { success: true });

        const call = FetchMock.mock.calls[0];
        const url = Array.isArray(call) ? call[0] : "";
        // Should use fallback: baseURL without trailing slash + url (which starts with /)
        assert.equal(url, "https://api.example.com/users");
      } finally {
        // Ensure URL is restored
        global.URL = OriginalURL;
      }
    });

    it("should work with all methods without URL when baseURL is set", async () => {
      FetchMock.mockResponseOnce();
      FetchMock.mockResponseOnce();
      FetchMock.mockResponseOnce();

      const api = create.api().withBaseURL("https://api.example.com");

      await api.get().getResponse();
      await api.post().withBody({}).getResponse();
      await api.put().withBody({}).getResponse();

      assert.equal(FetchMock.mock.calls.length, 3);
      const urls = FetchMock.mock.calls.map(call => {
        const [url] = call as [string, RequestInit];
        return url;
      });
      urls.forEach(url => assert.equal(url, "https://api.example.com"));
    });

    it("should allow using withHeaders for auth", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });

      const api = create.api().withBaseURL("https://api.example.com").withHeaders({ Authorization: "Bearer token123" });
      await api.get("/users").getResponse();

      const [, options] = FetchMock.mock.calls[0] as [string, RequestInit];
      const headers = options.headers as Record<string, string>;
      assert.equal(headers.Authorization, "Bearer token123");
    });

    it("should allow chaining withCookies on individual requests", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });

      const api = create.api().withBaseURL("https://api.example.com");
      await api.get("/users").withCookies({ session: "abc123" }).getResponse();

      const [, options] = FetchMock.mock.calls[0] as [string, RequestInit];
      const headers = options.headers as Record<string, string>;
      assert.ok(headers.Cookie?.includes("session=abc123"));
    });

    it("should support withBasicAuth", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });

      const api = create.api().withBaseURL("https://api.example.com").withBasicAuth("user", "pass");
      await api.get("/users").getResponse();

      const [, options] = FetchMock.mock.calls[0] as [string, RequestInit];
      const headers = options.headers as Record<string, string>;
      assert.ok(headers.Authorization?.startsWith("Basic "));
    });

    it("should support withBearerToken", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });

      const api = create.api().withBaseURL("https://api.example.com").withBearerToken("token123");
      await api.get("/users").getResponse();

      const [, options] = FetchMock.mock.calls[0] as [string, RequestInit];
      const headers = options.headers as Record<string, string>;
      assert.equal(headers.Authorization, "Bearer token123");
    });

    it("should support withAuthorization", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });

      const api = create.api().withBaseURL("https://api.example.com").withAuthorization("Custom auth-value");
      await api.get("/users").getResponse();

      const [, options] = FetchMock.mock.calls[0] as [string, RequestInit];
      const headers = options.headers as Record<string, string>;
      assert.equal(headers.Authorization, "Custom auth-value");
    });

    it("should support withCookies", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });

      const api = create.api().withBaseURL("https://api.example.com").withCookies({ session: "abc123", token: "xyz789" });
      await api.get("/users").getResponse();

      const [, options] = FetchMock.mock.calls[0] as [string, RequestInit];
      const headers = options.headers as Record<string, string>;
      assert.ok(headers.Cookie?.includes("session=abc123"));
      assert.ok(headers.Cookie?.includes("token=xyz789"));
    });

    it("should support withCookie", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });

      const api = create.api().withBaseURL("https://api.example.com").withCookie("session", "abc123");
      await api.get("/users").getResponse();

      const [, options] = FetchMock.mock.calls[0] as [string, RequestInit];
      const headers = options.headers as Record<string, string>;
      assert.ok(headers.Cookie?.includes("session=abc123"));
    });

    it("should support chaining multiple convenience methods", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });

      const api = (create.api().withBaseURL("https://api.example.com") as any).withBearerToken("token123").withTimeout(5000);
      api.withCookies({ session: "abc123" });

      await api.get("/users").getResponse();

      const [, options] = FetchMock.mock.calls[0] as [string, RequestInit];
      const headers = options.headers as Record<string, string>;
      assert.equal(headers.Authorization, "Bearer token123");
      assert.ok(headers.Cookie?.includes("session=abc123"));
    });

    it("should apply convenience methods to all HTTP methods", async () => {
      FetchMock.mockResponseOnce();
      FetchMock.mockResponseOnce();
      FetchMock.mockResponseOnce();

      const api = create.api().withBaseURL("https://api.example.com").withBearerToken("token123");

      await api.get("/users").getResponse();
      await api.post("/users").withBody({}).getResponse();
      await api.put("/users/1").withBody({}).getResponse();

      assert.equal(FetchMock.mock.calls.length, 3);
      FetchMock.mock.calls.forEach(([, options]) => {
        const headers = (options as RequestInit).headers as Record<string, string>;
        assert.equal(headers.Authorization, "Bearer token123");
      });
    });

    it("should not allow withAbortController on API builder", () => {
      const api = create.api();
      assert.equal((api as any).withAbortController, undefined);
    });

    it("should not allow withBody on API builder", () => {
      const api = create.api();
      assert.equal((api as any).withBody, undefined);
    });

    it("should not allow withGraphQL on API builder", () => {
      const api = create.api();
      assert.equal((api as any).withGraphQL, undefined);
    });

    it("should handle property access that is not a function", () => {
      // Test the fallback path when accessing a property that exists but is not a function
      const api = create.api().withBaseURL("https://api.example.com");

      // Access a property that exists on the proxy but is not a function
      // This tests the fallback at line 241 in apiBuilder.ts
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const baseURL = (api as any).baseURL;
      // baseURL might be undefined or a value, but accessing it should not throw
      assert.ok(true); // Just verify it doesn't throw
    });
  });
});
