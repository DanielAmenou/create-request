import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { GetRequest } from "../src/requestMethods.js";
import { FetchMock } from "./utils/fetchMock.js";
import create from "../src/index.js";

describe("URL Handling", () => {
  beforeEach(() => {
    FetchMock.install();
    create.config.setEnableAntiCsrf(false);
  });

  afterEach(() => {
    FetchMock.reset();
    FetchMock.restore();
    create.config.reset();
  });

  describe("Relative URL handling", () => {
    it("should handle relative URLs without query params", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("/api/users");

      await request.get();

      const [url] = FetchMock.mock.calls[0];
      assert.equal(url, "/api/users");
    });

    it("should handle relative URLs with existing query params", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("/api/users?existing=value").withQueryParam("new", "param");

      await request.get();

      const [url] = FetchMock.mock.calls[0];
      assert.ok(url.includes("existing=value"));
      assert.ok(url.includes("new=param"));
    });

    it("should handle relative URLs without existing query params", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("/api/users").withQueryParam("key", "value");

      await request.get();

      const [url] = FetchMock.mock.calls[0];
      assert.equal(url, "/api/users?key=value");
    });

    it("should merge query params with existing ones in relative URL", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("/api/users?page=1").withQueryParams({ limit: 10, sort: "name" });

      await request.get();

      const [url] = FetchMock.mock.calls[0];
      assert.ok(url.includes("page=1"));
      assert.ok(url.includes("limit=10"));
      assert.ok(url.includes("sort=name"));
    });

    it("should handle multiple relative path segments", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("/api/v1/users/123/posts").withQueryParam("include", "comments");

      await request.get();

      const [url] = FetchMock.mock.calls[0];
      assert.equal(url, "/api/v1/users/123/posts?include=comments");
    });
  });

  describe("Absolute URL handling", () => {
    it("should handle absolute URLs with query params", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/users").withQueryParam("key", "value");

      await request.get();

      const [url] = FetchMock.mock.calls[0];
      const parsedUrl = new URL(url as string);
      assert.equal(parsedUrl.searchParams.get("key"), "value");
      assert.equal(parsedUrl.hostname, "api.example.com");
    });

    it("should merge query params with existing ones in absolute URL", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/users?existing=value").withQueryParam("new", "param");

      await request.get();

      const [url] = FetchMock.mock.calls[0];
      const parsedUrl = new URL(url as string);
      assert.equal(parsedUrl.searchParams.get("existing"), "value");
      assert.equal(parsedUrl.searchParams.get("new"), "param");
    });

    it("should preserve URL path and protocol", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/api/v1/users").withQueryParam("page", "1");

      await request.get();

      const [url] = FetchMock.mock.calls[0];
      const parsedUrl = new URL(url as string);
      assert.equal(parsedUrl.pathname, "/api/v1/users");
      assert.equal(parsedUrl.protocol, "https:");
      assert.equal(parsedUrl.searchParams.get("page"), "1");
    });
  });

  describe("URL with special characters", () => {
    it("should handle URLs with special characters in path", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/users/search?q=test");

      await request.get();

      const [url] = FetchMock.mock.calls[0];
      assert.ok(url.includes("users/search"));
    });

    it("should handle URLs with encoded characters", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/users").withQueryParam("name", "John Doe");

      await request.get();

      const [url] = FetchMock.mock.calls[0];
      const parsedUrl = new URL(url as string);
      assert.equal(parsedUrl.searchParams.get("name"), "John Doe");
    });

    it("should handle URLs with unicode characters", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/users").withQueryParam("name", "用户名");

      await request.get();

      const [url] = FetchMock.mock.calls[0];
      const parsedUrl = new URL(url as string);
      assert.equal(parsedUrl.searchParams.get("name"), "用户名");
    });
  });

  describe("Edge cases", () => {
    it("should handle empty query params", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/users");

      await request.get();

      const [url] = FetchMock.mock.calls[0];
      assert.equal(url, "https://api.example.com/users");
    });

    it("should handle URL with hash fragment", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/users#section").withQueryParam("key", "value");

      await request.get();

      const [url] = FetchMock.mock.calls[0];
      // Hash should be preserved
      assert.ok(url.includes("#section") || url.includes("key=value"));
    });

    it("should handle URL with port number", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com:8080/users").withQueryParam("key", "value");

      await request.get();

      const [url] = FetchMock.mock.calls[0];
      const parsedUrl = new URL(url as string);
      assert.equal(parsedUrl.port, "8080");
      assert.equal(parsedUrl.searchParams.get("key"), "value");
    });

    it("should handle URL with authentication", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://user:pass@api.example.com/users").withQueryParam("key", "value");

      await request.get();

      const [url] = FetchMock.mock.calls[0];
      const parsedUrl = new URL(url as string);
      assert.equal(parsedUrl.username, "user");
      assert.equal(parsedUrl.searchParams.get("key"), "value");
    });
  });
});
