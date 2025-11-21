import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import create from "../src/index.js";
import { HttpMethod } from "../src/enums.js";
import { FetchMock } from "./utils/fetchMock.js";

describe("Request Factories", { timeout: 10000 }, () => {
  beforeEach(() => {
    FetchMock.install();
    create.config.setEnableAntiCsrf(false);
  });

  afterEach(() => {
    FetchMock.reset();
    FetchMock.restore();
    create.config.reset();
  });

  describe("create.get()", () => {
    it("should create a GET request", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });

      const request = create.get("https://api.example.com/test");
      const result = await request.getJson();

      assert.deepEqual(result, { success: true });
      const [, options] = FetchMock.mock.calls[0] as [string, RequestInit];
      assert.equal(options.method, HttpMethod.GET);
    });

    it("should support method chaining", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });

      const result = await create.get("https://api.example.com/test").withHeader("X-Custom", "value").withQueryParam("key", "value").getJson();

      assert.deepEqual(result, { success: true });
      const [url, options] = FetchMock.mock.calls[0] as [string, RequestInit];
      assert.ok(url.includes("key=value"));
      const headers = options.headers as Record<string, string>;
      assert.equal(headers["X-Custom"], "value");
    });
  });

  describe("create.post()", () => {
    it("should create a POST request", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });

      const request = create.post("https://api.example.com/test");
      await request.withBody({ data: "test" }).getResponse();

      const [, options] = FetchMock.mock.calls[0] as [string, RequestInit];
      assert.equal(options.method, HttpMethod.POST);
    });

    it("should send JSON body", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });

      await create.post("https://api.example.com/test").withBody({ name: "John" }).getResponse();

      const [, options] = FetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string);
      assert.deepEqual(body, { name: "John" });
      const headers = options.headers as Record<string, string>;
      assert.equal(headers["Content-Type"], "application/json");
    });
  });

  describe("create.put()", () => {
    it("should create a PUT request", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });

      const request = create.put("https://api.example.com/test");
      await request.withBody({ data: "test" }).getResponse();

      const [, options] = FetchMock.mock.calls[0] as [string, RequestInit];
      assert.equal(options.method, HttpMethod.PUT);
    });

    it("should send body with PUT request", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });

      await create.put("https://api.example.com/test").withBody({ id: 1, name: "Updated" }).getResponse();

      const [, options] = FetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string);
      assert.deepEqual(body, { id: 1, name: "Updated" });
    });
  });

  describe("create.patch()", () => {
    it("should create a PATCH request", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });

      const request = create.patch("https://api.example.com/test");
      await request.withBody({ name: "Updated" }).getResponse();

      const [, options] = FetchMock.mock.calls[0] as [string, RequestInit];
      assert.equal(options.method, HttpMethod.PATCH);
    });
  });

  describe("create.del()", () => {
    it("should create a DELETE request", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });

      const request = create.del("https://api.example.com/test");
      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0] as [string, RequestInit];
      assert.equal(options.method, HttpMethod.DELETE);
    });

    it("should support DELETE requests without body", async () => {
      FetchMock.mockResponseOnce({ body: { deleted: true } });

      const result = await create.del("https://api.example.com/users/123").getJson();

      assert.deepEqual(result, { deleted: true });
    });
  });

  describe("create.head()", () => {
    it("should create a HEAD request", async () => {
      FetchMock.mockResponseOnce({ status: 200 });

      const request = create.head("https://api.example.com/test");
      const response = await request.getResponse();

      assert.equal(response.status, 200);
      const [, options] = FetchMock.mock.calls[0] as [string, RequestInit];
      assert.equal(options.method, HttpMethod.HEAD);
    });
  });

  describe("create.options()", () => {
    it("should create an OPTIONS request", async () => {
      FetchMock.mockResponseOnce({ status: 200 });

      const request = create.options("https://api.example.com/test");
      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0] as [string, RequestInit];
      assert.equal(options.method, HttpMethod.OPTIONS);
    });
  });

  describe("Factory Methods - Integration", () => {
    it("should support all factory methods with common configurations", async () => {
      const url = "https://api.example.com/test";
      const config = {
        headers: { "X-Custom": "value" },
        queryParams: { key: "value" },
      };

      // Test each method
      const methods = [
        { factory: create.get, method: HttpMethod.GET },
        { factory: create.post, method: HttpMethod.POST },
        { factory: create.put, method: HttpMethod.PUT },
        { factory: create.patch, method: HttpMethod.PATCH },
        { factory: create.del, method: HttpMethod.DELETE },
        { factory: create.head, method: HttpMethod.HEAD },
        { factory: create.options, method: HttpMethod.OPTIONS },
      ];

      for (const { factory, method } of methods) {
        FetchMock.mockResponseOnce({ body: { success: true } });

        const request = factory(url).withHeaders(config.headers).withQueryParams(config.queryParams);

        if (method !== HttpMethod.GET && method !== HttpMethod.HEAD && method !== HttpMethod.OPTIONS && method !== HttpMethod.DELETE) {
          request.withBody({ data: "test" });
        }

        await request.getResponse();

        const [, options] = FetchMock.mock.calls[FetchMock.mock.calls.length - 1] as [string, RequestInit];
        assert.equal(options.method, method);
        const headers = options.headers as Record<string, string>;
        assert.equal(headers["X-Custom"], "value");
      }
    });

    it("should work with global config", async () => {
      create.config.setCsrfToken("global-token");
      FetchMock.mockResponseOnce({ body: { success: true } });

      const result = await create.get("https://api.example.com/test").getJson();

      assert.deepEqual(result, { success: true });
      const [, options] = FetchMock.mock.calls[0] as [string, RequestInit];
      // CSRF protection might be disabled, but test that factory works with config
      assert.ok(options.method === HttpMethod.GET);
    });

    it("should support interceptors on factory-created requests", async () => {
      let interceptorCalled = false;
      FetchMock.mockResponseOnce({ body: { success: true } });

      const request = create.get("https://api.example.com/test").withRequestInterceptor(config => {
        interceptorCalled = true;
        return config;
      });

      await request.getJson();

      assert.equal(interceptorCalled, true);
    });

    it("should support error handling on factory-created requests", async () => {
      FetchMock.mockResponseOnce({ status: 500 });

      try {
        await create.get("https://api.example.com/test").getJson();
        assert.fail("Should have thrown error");
      } catch (error: any) {
        assert.ok(error.message.includes("HTTP 500"));
      }
    });

    it("should support retries on factory-created requests", async () => {
      FetchMock.mockErrorOnce(new Error("Network error"));
      FetchMock.mockResponseOnce({ body: { success: true } });

      const result = await create.get("https://api.example.com/test").withRetries(1).getJson();

      assert.deepEqual(result, { success: true });
      assert.equal(FetchMock.mock.calls.length, 2);
    });

    it("should support timeout on factory-created requests", async () => {
      FetchMock.mockDelayedResponseOnce(1000, { body: { success: true } });

      try {
        await create.get("https://api.example.com/test").withTimeout(100).getJson();
        assert.fail("Should have timed out");
      } catch (error: any) {
        assert.ok(error.isTimeout || error.message.includes("Timeout") || error.message.toLowerCase().includes("timeout"));
      }
    });
  });

  describe("Factory Methods - Chaining Examples", () => {
    it("should support complex POST request with all options", async () => {
      FetchMock.mockResponseOnce({ body: { id: 1 } });

      const result = await create
        .post("https://api.example.com/users")
        .withBody({ name: "John", email: "john@example.com" })
        .withHeader("Authorization", "Bearer token123")
        .withQueryParam("format", "json")
        .withTimeout(5000)
        .withRetries(2)
        .getJson();

      assert.deepEqual(result, { id: 1 });
      const [, options] = FetchMock.mock.calls[0] as [string, RequestInit];
      const headers = options.headers as Record<string, string>;
      assert.equal(headers["Authorization"], "Bearer token123");
      assert.equal(options.timeout, 5000);
    });

    it("should support GraphQL requests using POST factory", async () => {
      FetchMock.mockResponseOnce({ body: { data: { user: { id: "1" } } } });

      const { PostRequest } = await import("../src/requestMethods.js");
      const request = new PostRequest("https://api.example.com/graphql").withGraphQL("query { user(id: $id) { id } }", { id: "1" });

      const result = await request.getJson();

      assert.deepEqual(result, { data: { user: { id: "1" } } });
      const [, options] = FetchMock.mock.calls[0] as [string, RequestInit];
      const headers = options.headers as Record<string, string>;
      assert.equal(headers["Content-Type"], "application/json");
    });
  });
});
