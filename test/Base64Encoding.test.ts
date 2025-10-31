import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { GetRequest } from "../src/requestMethods.js";
import { FetchMock } from "./utils/fetchMock.js";
import create from "../src/index.js";

describe("Base64 Encoding", () => {
  beforeEach(() => {
    FetchMock.install();
    create.config.setEnableAntiCsrf(false);
  });

  afterEach(() => {
    FetchMock.reset();
    FetchMock.restore();
    create.config.reset();
  });

  describe("withBasicAuth", () => {
    it("should encode basic auth credentials correctly", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withBasicAuth("username", "password");

      await request.get();

      const [, options] = FetchMock.mock.calls[0];
      const headers = options.headers as Record<string, string>;
      const authHeader = headers.Authorization;

      assert.ok(authHeader?.startsWith("Basic "));
      const encoded = authHeader.substring(6);

      // Decode and verify
      const decoded = Buffer.from(encoded, "base64").toString("utf-8");
      assert.equal(decoded, "username:password");
    });

    it("should handle special characters in credentials", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withBasicAuth("user@domain.com", "p@ssw0rd!");

      await request.get();

      const [, options] = FetchMock.mock.calls[0];
      const headers = options.headers as Record<string, string>;
      const authHeader = headers.Authorization;

      assert.ok(authHeader?.startsWith("Basic "));
      const encoded = authHeader.substring(6);
      const decoded = Buffer.from(encoded, "base64").toString("utf-8");
      assert.equal(decoded, "user@domain.com:p@ssw0rd!");
    });

    it("should handle unicode characters in credentials", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withBasicAuth("用户名", "密码");

      await request.get();

      const [, options] = FetchMock.mock.calls[0];
      const headers = options.headers as Record<string, string>;
      const authHeader = headers.Authorization;

      assert.ok(authHeader?.startsWith("Basic "));
      const encoded = authHeader.substring(6);
      const decoded = Buffer.from(encoded, "base64").toString("utf-8");
      assert.equal(decoded, "用户名:密码");
    });

    it("should handle empty username and password", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withBasicAuth("", "");

      await request.get();

      const [, options] = FetchMock.mock.calls[0];
      const headers = options.headers as Record<string, string>;
      const authHeader = headers.Authorization;

      assert.ok(authHeader?.startsWith("Basic "));
      const encoded = authHeader.substring(6);
      const decoded = Buffer.from(encoded, "base64").toString("utf-8");
      assert.equal(decoded, ":");
    });

    it("should handle long credentials", async () => {
      const longUsername = "a".repeat(1000);
      const longPassword = "b".repeat(1000);

      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withBasicAuth(longUsername, longPassword);

      await request.get();

      const [, options] = FetchMock.mock.calls[0];
      const headers = options.headers as Record<string, string>;
      const authHeader = headers.Authorization;

      assert.ok(authHeader?.startsWith("Basic "));
      const encoded = authHeader.substring(6);
      const decoded = Buffer.from(encoded, "base64").toString("utf-8");
      assert.equal(decoded, `${longUsername}:${longPassword}`);
    });

    it("should handle colon in credentials", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withBasicAuth("user:name", "pass:word");

      await request.get();

      const [, options] = FetchMock.mock.calls[0];
      const headers = options.headers as Record<string, string>;
      const authHeader = headers.Authorization;

      assert.ok(authHeader?.startsWith("Basic "));
      const encoded = authHeader.substring(6);
      const decoded = Buffer.from(encoded, "base64").toString("utf-8");
      assert.equal(decoded, "user:name:pass:word");
    });

    it("should work with TextEncoder path when available", async () => {
      // This tests the modern approach using TextEncoder
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withBasicAuth("test", "test");

      await request.get();

      const [, options] = FetchMock.mock.calls[0];
      const headers = options.headers as Record<string, string>;
      const authHeader = headers.Authorization;

      // Should produce valid base64
      assert.ok(authHeader?.startsWith("Basic "));
      const encoded = authHeader.substring(6);
      // Verify it's valid base64 by attempting to decode
      assert.doesNotThrow(() => {
        Buffer.from(encoded, "base64");
      });
    });
  });

  describe("Basic Auth with other methods", () => {
    it("should chain withBasicAuth with other methods", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withBasicAuth("user", "pass").withHeader("X-Custom", "value").withQueryParam("key", "value");

      await request.get();

      const [, options] = FetchMock.mock.calls[0];
      const headers = options.headers as Record<string, string>;
      assert.ok(headers.Authorization?.startsWith("Basic "));
      assert.equal(headers["X-Custom"], "value");
    });

    it("should allow withBearerToken to override withBasicAuth", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withBasicAuth("user", "pass").withBearerToken("token123");

      await request.get();

      const [, options] = FetchMock.mock.calls[0];
      const headers = options.headers as Record<string, string>;
      assert.equal(headers.Authorization, "Bearer token123");
      // Basic auth should be overridden
      assert.ok(!headers.Authorization.startsWith("Basic "));
    });
  });
});
