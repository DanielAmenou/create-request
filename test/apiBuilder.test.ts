import create from "../src/index.js";
import assert from "node:assert/strict";
import { FetchMock } from "./utils/fetchMock.js";
import { describe, it, beforeEach, afterEach } from "node:test";
import { RequestError } from "../src/RequestError.js";

describe("API Builder", { timeout: 10000 }, () => {
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

    describe("withQueryParam on API builder", () => {
      it("should add a single query parameter to all requests", async () => {
        FetchMock.mockResponseOnce({ body: { success: true } });
        const api = create.api().withBaseURL("https://api.example.com").withQueryParam("key", "value");
        await api.get("/test").getJson();

        const [url] = FetchMock.mock.calls[0] as [string, RequestInit];
        const parsedUrl = new URL(url);
        assert.equal(parsedUrl.searchParams.get("key"), "value");
      });

      it("should handle string values", async () => {
        FetchMock.mockResponseOnce({ body: { success: true } });
        const api = create.api().withBaseURL("https://api.example.com").withQueryParam("search", "test");
        await api.get("/test").getJson();

        const [url] = FetchMock.mock.calls[0] as [string, RequestInit];
        const parsedUrl = new URL(url);
        assert.equal(parsedUrl.searchParams.get("search"), "test");
      });

      it("should handle number values", async () => {
        FetchMock.mockResponseOnce({ body: { success: true } });
        const api = create.api().withBaseURL("https://api.example.com").withQueryParam("page", 42);
        await api.get("/test").getJson();

        const [url] = FetchMock.mock.calls[0] as [string, RequestInit];
        const parsedUrl = new URL(url);
        assert.equal(parsedUrl.searchParams.get("page"), "42");
      });

      it("should handle boolean values", async () => {
        FetchMock.mockResponseOnce({ body: { success: true } });
        const api = create.api().withBaseURL("https://api.example.com").withQueryParam("active", true);
        await api.get("/test").getJson();

        const [url] = FetchMock.mock.calls[0] as [string, RequestInit];
        const parsedUrl = new URL(url);
        assert.equal(parsedUrl.searchParams.get("active"), "true");
      });

      it("should handle array values", async () => {
        FetchMock.mockResponseOnce({ body: { success: true } });
        const api = create.api().withBaseURL("https://api.example.com").withQueryParam("tags", ["js", "ts", "node"]);
        await api.get("/test").getJson();

        const [url] = FetchMock.mock.calls[0] as [string, RequestInit];
        const parsedUrl = new URL(url);
        const tags = parsedUrl.searchParams.getAll("tags");
        assert.deepEqual(tags, ["js", "ts", "node"]);
      });

      it("should ignore null values", async () => {
        FetchMock.mockResponseOnce({ body: { success: true } });
        const api = create
          .api()
          .withBaseURL("https://api.example.com")
          .withQueryParam("valid", "value")
          .withQueryParam("nullValue", null as string | null);
        await api.get("/test").getJson();

        const [url] = FetchMock.mock.calls[0] as [string, RequestInit];
        const parsedUrl = new URL(url);
        assert.equal(parsedUrl.searchParams.get("valid"), "value");
        assert.equal(parsedUrl.searchParams.has("nullValue"), false);
      });

      it("should ignore undefined values", async () => {
        FetchMock.mockResponseOnce({ body: { success: true } });
        const api = create
          .api()
          .withBaseURL("https://api.example.com")
          .withQueryParam("valid", "value")
          .withQueryParam("undefinedValue", undefined as string | undefined);
        await api.get("/test").getJson();

        const [url] = FetchMock.mock.calls[0] as [string, RequestInit];
        const parsedUrl = new URL(url);
        assert.equal(parsedUrl.searchParams.get("valid"), "value");
        assert.equal(parsedUrl.searchParams.has("undefinedValue"), false);
      });

      it("should allow multiple calls to withQueryParam", async () => {
        FetchMock.mockResponseOnce({ body: { success: true } });
        const api = create.api().withBaseURL("https://api.example.com").withQueryParam("page", 1).withQueryParam("limit", 10).withQueryParam("sort", "name");
        await api.get("/test").getJson();

        const [url] = FetchMock.mock.calls[0] as [string, RequestInit];
        const parsedUrl = new URL(url);
        assert.equal(parsedUrl.searchParams.get("page"), "1");
        assert.equal(parsedUrl.searchParams.get("limit"), "10");
        assert.equal(parsedUrl.searchParams.get("sort"), "name");
      });

      it("should apply to all HTTP methods", async () => {
        FetchMock.mockResponseOnce();
        FetchMock.mockResponseOnce();
        FetchMock.mockResponseOnce();
        FetchMock.mockResponseOnce();

        const api = create.api().withBaseURL("https://api.example.com").withQueryParam("apiKey", "secret123");

        await api.get("/test").getResponse();
        await api.post("/test").withBody({}).getResponse();
        await api.put("/test").withBody({}).getResponse();
        await api.del("/test").getResponse();

        assert.equal(FetchMock.mock.calls.length, 4);
        for (const call of FetchMock.mock.calls) {
          const [url] = call as [string, RequestInit];
          const parsedUrl = new URL(url);
          assert.equal(parsedUrl.searchParams.get("apiKey"), "secret123");
        }
      });

      it("should work with requests that have existing query params in URL", async () => {
        FetchMock.mockResponseOnce({ body: { success: true } });
        const api = create.api().withBaseURL("https://api.example.com").withQueryParam("default", "value");
        await api.get("/test?existing=param").getJson();

        const [url] = FetchMock.mock.calls[0] as [string, RequestInit];
        const parsedUrl = new URL(url);
        assert.equal(parsedUrl.searchParams.get("existing"), "param");
        assert.equal(parsedUrl.searchParams.get("default"), "value");
      });

      it("should allow per-request override of default query params", async () => {
        FetchMock.mockResponseOnce({ body: { success: true } });
        const api = create.api().withBaseURL("https://api.example.com").withQueryParam("page", 1);
        await api.get("/test").withQueryParam("page", 2).getJson();

        const [url] = FetchMock.mock.calls[0] as [string, RequestInit];
        const parsedUrl = new URL(url);
        // The per-request param should be added, but both may exist (append behavior)
        const pages = parsedUrl.searchParams.getAll("page");
        assert.ok(pages.includes("1"));
        assert.ok(pages.includes("2"));
      });
    });

    describe("withQueryParams on API builder", () => {
      it("should add multiple query parameters to all requests", async () => {
        FetchMock.mockResponseOnce({ body: { success: true } });
        const api = create.api().withBaseURL("https://api.example.com").withQueryParams({ page: 1, limit: 10 });
        await api.get("/test").getJson();

        const [url] = FetchMock.mock.calls[0] as [string, RequestInit];
        const parsedUrl = new URL(url);
        assert.equal(parsedUrl.searchParams.get("page"), "1");
        assert.equal(parsedUrl.searchParams.get("limit"), "10");
      });

      it("should handle mixed value types", async () => {
        FetchMock.mockResponseOnce({ body: { success: true } });
        const api = create.api().withBaseURL("https://api.example.com").withQueryParams({
          page: 1,
          limit: 20,
          active: true,
          name: "test",
          price: 99.99,
        });
        await api.get("/test").getJson();

        const [url] = FetchMock.mock.calls[0] as [string, RequestInit];
        const parsedUrl = new URL(url);
        assert.equal(parsedUrl.searchParams.get("page"), "1");
        assert.equal(parsedUrl.searchParams.get("limit"), "20");
        assert.equal(parsedUrl.searchParams.get("active"), "true");
        assert.equal(parsedUrl.searchParams.get("name"), "test");
        assert.equal(parsedUrl.searchParams.get("price"), "99.99");
      });

      it("should handle array values", async () => {
        FetchMock.mockResponseOnce({ body: { success: true } });
        const api = create
          .api()
          .withBaseURL("https://api.example.com")
          .withQueryParams({
            tags: ["javascript", "typescript", "node"],
          });
        await api.get("/test").getJson();

        const [url] = FetchMock.mock.calls[0] as [string, RequestInit];
        const parsedUrl = new URL(url);
        const tags = parsedUrl.searchParams.getAll("tags");
        assert.deepEqual(tags, ["javascript", "typescript", "node"]);
      });

      it("should handle multiple array query params", async () => {
        FetchMock.mockResponseOnce({ body: { success: true } });
        const api = create
          .api()
          .withBaseURL("https://api.example.com")
          .withQueryParams({
            tags: ["js", "ts"],
            categories: ["frontend", "backend"],
          });
        await api.get("/test").getJson();

        const [url] = FetchMock.mock.calls[0] as [string, RequestInit];
        const parsedUrl = new URL(url);
        const tags = parsedUrl.searchParams.getAll("tags");
        const categories = parsedUrl.searchParams.getAll("categories");
        assert.deepEqual(tags, ["js", "ts"]);
        assert.deepEqual(categories, ["frontend", "backend"]);
      });

      it("should ignore null and undefined values", async () => {
        FetchMock.mockResponseOnce({ body: { success: true } });
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        const api = create
          .api()
          .withBaseURL("https://api.example.com")
          .withQueryParams({
            valid: "value",
            nullValue: null,
            undefinedValue: undefined,
            other: "other",
          } as Record<string, string | string[] | number | boolean | null | undefined>);
        await api.get("/test").getJson();

        const [url] = FetchMock.mock.calls[0] as [string, RequestInit];
        const parsedUrl = new URL(url);
        assert.equal(parsedUrl.searchParams.get("valid"), "value");
        assert.equal(parsedUrl.searchParams.get("other"), "other");
        assert.equal(parsedUrl.searchParams.has("nullValue"), false);
        assert.equal(parsedUrl.searchParams.has("undefinedValue"), false);
      });

      it("should handle special characters", async () => {
        FetchMock.mockResponseOnce({ body: { success: true } });
        const api = create.api().withBaseURL("https://api.example.com").withQueryParams({
          search: "test@example.com",
          filter: "status:active",
          path: "/api/users",
        });
        await api.get("/test").getJson();

        const [url] = FetchMock.mock.calls[0] as [string, RequestInit];
        const parsedUrl = new URL(url);
        assert.equal(parsedUrl.searchParams.get("search"), "test@example.com");
        assert.equal(parsedUrl.searchParams.get("filter"), "status:active");
        assert.equal(parsedUrl.searchParams.get("path"), "/api/users");
      });

      it("should handle unicode characters", async () => {
        FetchMock.mockResponseOnce({ body: { success: true } });
        const api = create.api().withBaseURL("https://api.example.com").withQueryParams({
          name: "用户名",
          description: "Описание",
        });
        await api.get("/test").getJson();

        const [url] = FetchMock.mock.calls[0] as [string, RequestInit];
        const parsedUrl = new URL(url);
        assert.equal(parsedUrl.searchParams.get("name"), "用户名");
        assert.equal(parsedUrl.searchParams.get("description"), "Описание");
      });

      it("should allow multiple calls to withQueryParams", async () => {
        FetchMock.mockResponseOnce({ body: { success: true } });
        const api = create
          .api()
          .withBaseURL("https://api.example.com")
          .withQueryParams({ page: 1, limit: 20 })
          .withQueryParams({ sort: "name", order: "asc" })
          .withQueryParams({ filter: "active" });
        await api.get("/test").getJson();

        const [url] = FetchMock.mock.calls[0] as [string, RequestInit];
        const parsedUrl = new URL(url);
        assert.equal(parsedUrl.searchParams.get("page"), "1");
        assert.equal(parsedUrl.searchParams.get("limit"), "20");
        assert.equal(parsedUrl.searchParams.get("sort"), "name");
        assert.equal(parsedUrl.searchParams.get("order"), "asc");
        assert.equal(parsedUrl.searchParams.get("filter"), "active");
      });

      it("should append duplicate keys when calling withQueryParams multiple times", async () => {
        FetchMock.mockResponseOnce({ body: { success: true } });
        const api = create
          .api()
          .withBaseURL("https://api.example.com")
          .withQueryParams({ tag: "javascript" })
          .withQueryParams({ tag: "typescript" })
          .withQueryParams({ tag: "nodejs" });
        await api.get("/test").getJson();

        const [url] = FetchMock.mock.calls[0] as [string, RequestInit];
        const parsedUrl = new URL(url);
        const tags = parsedUrl.searchParams.getAll("tag");
        assert.ok(tags.includes("javascript"));
        assert.ok(tags.includes("typescript"));
        assert.ok(tags.includes("nodejs"));
      });

      it("should apply to all HTTP methods", async () => {
        FetchMock.mockResponseOnce();
        FetchMock.mockResponseOnce();
        FetchMock.mockResponseOnce();
        FetchMock.mockResponseOnce();

        const api = create.api().withBaseURL("https://api.example.com").withQueryParams({ apiVersion: "v2", format: "json" });

        await api.get("/test").getResponse();
        await api.post("/test").withBody({}).getResponse();
        await api.put("/test").withBody({}).getResponse();
        await api.del("/test").getResponse();

        assert.equal(FetchMock.mock.calls.length, 4);
        for (const call of FetchMock.mock.calls) {
          const [url] = call as [string, RequestInit];
          const parsedUrl = new URL(url);
          assert.equal(parsedUrl.searchParams.get("apiVersion"), "v2");
          assert.equal(parsedUrl.searchParams.get("format"), "json");
        }
      });

      it("should work with requests that have existing query params in URL", async () => {
        FetchMock.mockResponseOnce({ body: { success: true } });
        const api = create.api().withBaseURL("https://api.example.com").withQueryParams({ default: "value", other: "param" });
        await api.get("/test?existing=param").getJson();

        const [url] = FetchMock.mock.calls[0] as [string, RequestInit];
        const parsedUrl = new URL(url);
        assert.equal(parsedUrl.searchParams.get("existing"), "param");
        assert.equal(parsedUrl.searchParams.get("default"), "value");
        assert.equal(parsedUrl.searchParams.get("other"), "param");
      });

      it("should allow mixing withQueryParams and withQueryParam", async () => {
        FetchMock.mockResponseOnce({ body: { success: true } });
        const api = create
          .api()
          .withBaseURL("https://api.example.com")
          .withQueryParams({ page: 1, limit: 20 })
          .withQueryParam("sort", "name")
          .withQueryParam("order", ["asc", "desc"]);
        await api.get("/test").getJson();

        const [url] = FetchMock.mock.calls[0] as [string, RequestInit];
        const parsedUrl = new URL(url);
        assert.equal(parsedUrl.searchParams.get("page"), "1");
        assert.equal(parsedUrl.searchParams.get("limit"), "20");
        assert.equal(parsedUrl.searchParams.get("sort"), "name");
        const orders = parsedUrl.searchParams.getAll("order");
        assert.deepEqual(orders, ["asc", "desc"]);
      });

      it("should allow per-request override of default query params", async () => {
        FetchMock.mockResponseOnce({ body: { success: true } });
        const api = create.api().withBaseURL("https://api.example.com").withQueryParams({ page: 1, limit: 10 });
        await api.get("/test").withQueryParams({ page: 2, offset: 20 }).getJson();

        const [url] = FetchMock.mock.calls[0] as [string, RequestInit];
        const parsedUrl = new URL(url);
        // The per-request params should be added, but both may exist (append behavior)
        const pages = parsedUrl.searchParams.getAll("page");
        assert.ok(pages.includes("1"));
        assert.ok(pages.includes("2"));
        assert.equal(parsedUrl.searchParams.get("limit"), "10");
        assert.equal(parsedUrl.searchParams.get("offset"), "20");
      });

      it("should handle empty arrays", async () => {
        FetchMock.mockResponseOnce({ body: { success: true } });
        const api = create.api().withBaseURL("https://api.example.com").withQueryParams({
          tags: [],
          other: "value",
        });
        await api.get("/test").getJson();

        const [url] = FetchMock.mock.calls[0] as [string, RequestInit];
        const parsedUrl = new URL(url);
        const tags = parsedUrl.searchParams.getAll("tags");
        assert.deepEqual(tags, []);
        assert.equal(parsedUrl.searchParams.get("other"), "value");
      });
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

    it("should return baseURL when url is undefined and baseURL is set", async () => {
      // Test: if (!url) return baseURL || "";
      FetchMock.mockResponseOnce({ body: { success: true } });

      const api = create.api().withBaseURL("https://api.example.com");
      const result = await api.get(undefined as unknown as string).getJson();

      assert.deepEqual(result, { success: true });
      const [url] = FetchMock.mock.calls[0] as [string, RequestInit];
      assert.equal(url, "https://api.example.com");
    });

    it("should return empty string when url is undefined and baseURL is not set", async () => {
      // Test: if (!url) return baseURL || "";
      // Note: resolveURL returns "", but then validation fails because "" is not a valid URL
      const api = create.api();

      try {
        await api.get(undefined as unknown as string).getJson();
        assert.fail("Expected validation error for empty URL");
      } catch (error) {
        assert.ok(error instanceof RequestError);
        assert.ok(error.message.includes("Bad URL") || error.message.includes("empty"));
      }
    });

    it("should return baseURL when url is null and baseURL is set", async () => {
      // Test: if (!url) return baseURL || "";
      FetchMock.mockResponseOnce({ body: { success: true } });

      const api = create.api().withBaseURL("https://api.example.com");
      const result = await api.get(null as unknown as string).getJson();

      assert.deepEqual(result, { success: true });
      const [url] = FetchMock.mock.calls[0] as [string, RequestInit];
      assert.equal(url, "https://api.example.com");
    });

    it("should return empty string when url is null and baseURL is not set", async () => {
      // Test: if (!url) return baseURL || "";
      // Note: resolveURL returns "", but then validation fails because "" is not a valid URL
      const api = create.api();

      try {
        await api.get(null as unknown as string).getJson();
        assert.fail("Expected validation error for empty URL");
      } catch (error) {
        assert.ok(error instanceof RequestError);
        assert.ok(error.message.includes("Bad URL") || error.message.includes("empty"));
      }
    });

    it("should return baseURL when url is empty string and baseURL is set", async () => {
      // Test: if (!url) return baseURL || "";
      FetchMock.mockResponseOnce({ body: { success: true } });

      const api = create.api().withBaseURL("https://api.example.com");
      const result = await api.get("").getJson();

      assert.deepEqual(result, { success: true });
      const [url] = FetchMock.mock.calls[0] as [string, RequestInit];
      assert.equal(url, "https://api.example.com");
    });

    it("should return empty string when url is empty string and baseURL is not set", async () => {
      // Test: if (!url) return baseURL || "";
      // Note: resolveURL returns "", but then validation fails because "" is not a valid URL
      const api = create.api();

      try {
        await api.get("").getJson();
        assert.fail("Expected validation error for empty URL");
      } catch (error) {
        assert.ok(error instanceof RequestError);
        assert.ok(error.message.includes("Bad URL") || error.message.includes("empty"));
      }
    });

    it("should apply modifiers to head requests", async () => {
      // Test: if (this.modifiers) for (const modifier of this.modifiers) modifier(request);
      FetchMock.mockResponseOnce();

      const api = create.api().withBaseURL("https://api.example.com").withHeaders({ "X-Custom": "value" });
      await api.head("/test").getResponse();

      const [, options] = FetchMock.mock.calls[0] as [string, RequestInit];
      const headers = options.headers as Record<string, string>;
      assert.equal(headers["X-Custom"], "value");
      assert.equal(options.method, "HEAD");
    });

    it("should apply multiple modifiers to head requests", async () => {
      // Test: if (this.modifiers) for (const modifier of this.modifiers) modifier(request);
      FetchMock.mockResponseOnce();

      const api = create.api().withBaseURL("https://api.example.com").withHeaders({ "X-Custom": "value1" }).withTimeout(5000);
      (api as any).withHeaders({ "X-Another": "value2" });

      await api.head("/test").getResponse();

      const [, options] = FetchMock.mock.calls[0] as [string, RequestInit];
      const headers = options.headers as Record<string, string>;
      assert.equal(headers["X-Custom"], "value1");
      assert.equal(headers["X-Another"], "value2");
      assert.equal(options.method, "HEAD");
    });

    it("should not apply modifiers when modifiers array is empty", async () => {
      // Test: if (this.modifiers) for (const modifier of this.modifiers) modifier(request);
      FetchMock.mockResponseOnce();

      const api = create.api().withBaseURL("https://api.example.com");
      // No modifiers added, so the condition should be false
      await api.head("/test").getResponse();

      const [, options] = FetchMock.mock.calls[0] as [string, RequestInit];
      assert.equal(options.method, "HEAD");
      // Should still work, just without modifiers
    });
  });
});
