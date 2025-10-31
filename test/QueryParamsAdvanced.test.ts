import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { GetRequest } from "../src/requestMethods.js";
import { FetchMock } from "./utils/fetchMock.js";
import create from "../src/index.js";

describe("Query Parameters Advanced", () => {
  beforeEach(() => {
    FetchMock.install();
    create.config.setEnableAntiCsrf(false);
  });

  afterEach(() => {
    FetchMock.reset();
    FetchMock.restore();
    create.config.reset();
  });

  describe("Array query parameters", () => {
    it("should handle array query params with duplicate keys", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withQueryParams({
        tags: ["javascript", "typescript", "node"],
      });

      await request.get();

      const [url] = FetchMock.mock.calls[0];
      const parsedUrl = new URL(url as string);
      const tags = parsedUrl.searchParams.getAll("tags");
      assert.deepEqual(tags, ["javascript", "typescript", "node"]);
    });

    it("should handle multiple array query params", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withQueryParams({
        tags: ["js", "ts"],
        categories: ["frontend", "backend"],
      });

      await request.get();

      const [url] = FetchMock.mock.calls[0];
      const parsedUrl = new URL(url as string);
      const tags = parsedUrl.searchParams.getAll("tags");
      const categories = parsedUrl.searchParams.getAll("categories");
      assert.deepEqual(tags, ["js", "ts"]);
      assert.deepEqual(categories, ["frontend", "backend"]);
    });

    it("should handle array query param with single value", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withQueryParam("tags", ["single"]);

      await request.get();

      const [url] = FetchMock.mock.calls[0];
      const parsedUrl = new URL(url as string);
      const tags = parsedUrl.searchParams.getAll("tags");
      assert.deepEqual(tags, ["single"]);
    });

    it("should handle empty array in query params", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withQueryParams({
        tags: [],
        other: "value",
      });

      await request.get();

      const [url] = FetchMock.mock.calls[0];
      const parsedUrl = new URL(url as string);
      const tags = parsedUrl.searchParams.getAll("tags");
      assert.deepEqual(tags, []);
      assert.equal(parsedUrl.searchParams.get("other"), "value");
    });
  });

  describe("Special characters and unicode", () => {
    it("should handle query params with special characters", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withQueryParams({
        search: "test@example.com",
        filter: "status:active",
        path: "/api/users",
      });

      await request.get();

      const [url] = FetchMock.mock.calls[0];
      const parsedUrl = new URL(url as string);
      assert.equal(parsedUrl.searchParams.get("search"), "test@example.com");
      assert.equal(parsedUrl.searchParams.get("filter"), "status:active");
      assert.equal(parsedUrl.searchParams.get("path"), "/api/users");
    });

    it("should handle query params with unicode characters", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withQueryParams({
        name: "用户名",
        description: "Описание",
      });

      await request.get();

      const [url] = FetchMock.mock.calls[0];
      const parsedUrl = new URL(url as string);
      assert.equal(parsedUrl.searchParams.get("name"), "用户名");
      assert.equal(parsedUrl.searchParams.get("description"), "Описание");
    });

    it("should handle query params with spaces", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withQueryParams({
        search: "hello world",
        phrase: "test phrase with spaces",
      });

      await request.get();

      const [url] = FetchMock.mock.calls[0];
      const parsedUrl = new URL(url as string);
      assert.equal(parsedUrl.searchParams.get("search"), "hello world");
      assert.equal(parsedUrl.searchParams.get("phrase"), "test phrase with spaces");
    });

    it("should handle query params with special URL characters", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withQueryParams({
        value: "a=b&c=d",
        encoded: "value%20with%20encoding",
      });

      await request.get();

      const [url] = FetchMock.mock.calls[0];
      const parsedUrl = new URL(url as string);
      // Should handle special characters properly
      assert.ok(parsedUrl.searchParams.has("value"));
      assert.ok(parsedUrl.searchParams.has("encoded"));
    });
  });

  describe("Type handling", () => {
    it("should handle number query params", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withQueryParams({
        page: 1,
        limit: 20,
        price: 99.99,
      });

      await request.get();

      const [url] = FetchMock.mock.calls[0];
      const parsedUrl = new URL(url as string);
      assert.equal(parsedUrl.searchParams.get("page"), "1");
      assert.equal(parsedUrl.searchParams.get("limit"), "20");
      assert.equal(parsedUrl.searchParams.get("price"), "99.99");
    });

    it("should handle boolean query params", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withQueryParams({
        active: true,
        verified: false,
      });

      await request.get();

      const [url] = FetchMock.mock.calls[0];
      const parsedUrl = new URL(url as string);
      assert.equal(parsedUrl.searchParams.get("active"), "true");
      assert.equal(parsedUrl.searchParams.get("verified"), "false");
    });

    it("should ignore null values in query params", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withQueryParams({
        valid: "value",
        nullValue: null,
        other: "other",
      });

      await request.get();

      const [url] = FetchMock.mock.calls[0];
      const parsedUrl = new URL(url as string);
      assert.equal(parsedUrl.searchParams.get("valid"), "value");
      assert.equal(parsedUrl.searchParams.get("nullValue"), null);
      assert.equal(parsedUrl.searchParams.get("other"), "other");
    });

    it("should ignore undefined values in query params", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withQueryParams({
        valid: "value",
        undefinedValue: undefined,
        other: "other",
      } as any);

      await request.get();

      const [url] = FetchMock.mock.calls[0];
      const parsedUrl = new URL(url as string);
      assert.equal(parsedUrl.searchParams.get("valid"), "value");
      assert.equal(parsedUrl.searchParams.get("undefinedValue"), null);
      assert.equal(parsedUrl.searchParams.get("other"), "other");
    });
  });

  describe("withQueryParam single values", () => {
    it("should handle string value", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withQueryParam("key", "value");

      await request.get();

      const [url] = FetchMock.mock.calls[0];
      const parsedUrl = new URL(url as string);
      assert.equal(parsedUrl.searchParams.get("key"), "value");
    });

    it("should handle number value", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withQueryParam("page", 42);

      await request.get();

      const [url] = FetchMock.mock.calls[0];
      const parsedUrl = new URL(url as string);
      assert.equal(parsedUrl.searchParams.get("page"), "42");
    });

    it("should handle boolean value", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withQueryParam("active", true);

      await request.get();

      const [url] = FetchMock.mock.calls[0];
      const parsedUrl = new URL(url as string);
      assert.equal(parsedUrl.searchParams.get("active"), "true");
    });

    it("should ignore null value", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withQueryParam("valid", "value").withQueryParam("nullValue", null as string | null);

      await request.get();

      const [url] = FetchMock.mock.calls[0];
      const parsedUrl = new URL(url as string);
      assert.equal(parsedUrl.searchParams.get("valid"), "value");
      assert.equal(parsedUrl.searchParams.get("nullValue"), null);
    });

    it("should handle array value", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withQueryParam("tags", ["a", "b", "c"]);

      await request.get();

      const [url] = FetchMock.mock.calls[0];
      const parsedUrl = new URL(url as string);
      const tags = parsedUrl.searchParams.getAll("tags");
      assert.deepEqual(tags, ["a", "b", "c"]);
    });
  });

  describe("Complex scenarios", () => {
    it("should handle mixing withQueryParams and withQueryParam", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test")
        .withQueryParams({ page: 1, limit: 20 })
        .withQueryParam("sort", "name")
        .withQueryParam("order", ["asc", "desc"]);

      await request.get();

      const [url] = FetchMock.mock.calls[0];
      const parsedUrl = new URL(url as string);
      assert.equal(parsedUrl.searchParams.get("page"), "1");
      assert.equal(parsedUrl.searchParams.get("limit"), "20");
      assert.equal(parsedUrl.searchParams.get("sort"), "name");
      const orders = parsedUrl.searchParams.getAll("order");
      assert.deepEqual(orders, ["asc", "desc"]);
    });

    it("should handle very long query parameter values", async () => {
      const longValue = "a".repeat(10000);
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withQueryParam("long", longValue);

      await request.get();

      const [url] = FetchMock.mock.calls[0];
      const parsedUrl = new URL(url as string);
      assert.equal(parsedUrl.searchParams.get("long"), longValue);
    });

    it("should handle many query parameters", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const params: Record<string, string | number> = {};
      for (let i = 0; i < 100; i++) {
        params[`key${i}`] = `value${i}`;
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const request = new GetRequest("https://api.example.com/test").withQueryParams(params as Record<string, string | string[] | number | boolean | null | undefined>);

      await request.get();

      const [url] = FetchMock.mock.calls[0];
      const parsedUrl = new URL(url as string);
      for (let i = 0; i < 100; i++) {
        assert.equal(parsedUrl.searchParams.get(`key${i}`), `value${i}`);
      }
    });

    it("should merge query params with existing ones in URL", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test?existing=value").withQueryParams({
        new: "param",
        another: "value",
      });

      await request.get();

      const [url] = FetchMock.mock.calls[0];
      const parsedUrl = new URL(url as string);
      assert.equal(parsedUrl.searchParams.get("existing"), "value");
      assert.equal(parsedUrl.searchParams.get("new"), "param");
      assert.equal(parsedUrl.searchParams.get("another"), "value");
    });

    it("should handle calling withQueryParams multiple times", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test")
        .withQueryParams({ page: 1, limit: 20 })
        .withQueryParams({ sort: "name", order: "asc" })
        .withQueryParams({ filter: "active" });

      await request.get();

      const [url] = FetchMock.mock.calls[0];
      const parsedUrl = new URL(url as string);
      assert.equal(parsedUrl.searchParams.get("page"), "1");
      assert.equal(parsedUrl.searchParams.get("limit"), "20");
      assert.equal(parsedUrl.searchParams.get("sort"), "name");
      assert.equal(parsedUrl.searchParams.get("order"), "asc");
      assert.equal(parsedUrl.searchParams.get("filter"), "active");
    });

    it("should append duplicate keys when calling withQueryParams multiple times", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test")
        .withQueryParams({ tag: "javascript" })
        .withQueryParams({ tag: "typescript" })
        .withQueryParams({ tag: "nodejs" });

      await request.get();

      const [url] = FetchMock.mock.calls[0];
      const parsedUrl = new URL(url as string);
      const tags = parsedUrl.searchParams.getAll("tag");
      assert.deepEqual(tags, ["javascript", "typescript", "nodejs"]);
    });
  });
});
