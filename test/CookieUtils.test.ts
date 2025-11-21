import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CookieUtils } from "../src/utils/CookieUtils.js";
import type { CookiesRecord } from "../src/types.js";

describe("CookieUtils", { timeout: 10000 }, () => {
  describe("formatRequestCookies", () => {
    it("should format simple string cookies", () => {
      const cookies: CookiesRecord = {
        sessionId: "abc123",
        userId: "user456",
      };

      const result = CookieUtils.formatRequestCookies(cookies);
      assert.equal(result, "sessionId=abc123; userId=user456");
    });

    it("should format cookies with CookieOptions", () => {
      const cookies: CookiesRecord = {
        sessionId: { value: "abc123" },
        userId: { value: "user456" },
      };

      const result = CookieUtils.formatRequestCookies(cookies);
      assert.equal(result, "sessionId=abc123; userId=user456");
    });

    it("should handle mixed string and CookieOptions", () => {
      const cookies: CookiesRecord = {
        sessionId: "abc123",
        userId: { value: "user456" },
      };

      const result = CookieUtils.formatRequestCookies(cookies);
      assert.equal(result, "sessionId=abc123; userId=user456");
    });

    it("should URL encode cookie names and values", () => {
      const cookies: CookiesRecord = {
        "session id": "abc=123",
        "user name": "john@example.com",
      };

      const result = CookieUtils.formatRequestCookies(cookies);
      assert.equal(result, "session%20id=abc%3D123; user%20name=john%40example.com");
    });

    it("should handle special characters in values", () => {
      const cookies: CookiesRecord = {
        token: "a=b;c=d",
        data: "value with spaces",
      };

      const result = CookieUtils.formatRequestCookies(cookies);
      assert.equal(result, "token=a%3Db%3Bc%3Dd; data=value%20with%20spaces");
    });

    it("should handle single cookie", () => {
      const cookies: CookiesRecord = {
        sessionId: "abc123",
      };

      const result = CookieUtils.formatRequestCookies(cookies);
      assert.equal(result, "sessionId=abc123");
    });

    it("should handle empty object", () => {
      const cookies: CookiesRecord = {};

      const result = CookieUtils.formatRequestCookies(cookies);
      assert.equal(result, "");
    });

    it("should handle CookieOptions with all fields (only value is used)", () => {
      const cookies: CookiesRecord = {
        sessionId: {
          value: "abc123",
          secure: true,
          httpOnly: true,
          sameSite: "Lax" as const,
          expires: new Date(),
          path: "/",
          domain: "example.com",
          maxAge: 3600,
        },
      };

      const result = CookieUtils.formatRequestCookies(cookies);
      // Only the value should be used in the Cookie header
      assert.equal(result, "sessionId=abc123");
    });

    it("should handle cookies with empty string values", () => {
      const cookies: CookiesRecord = {
        emptyCookie: "",
        anotherCookie: { value: "" },
      };

      const result = CookieUtils.formatRequestCookies(cookies);
      assert.equal(result, "emptyCookie=; anotherCookie=");
    });

    it("should handle unicode characters", () => {
      const cookies: CookiesRecord = {
        name: "测试",
        value: "café",
      };

      const result = CookieUtils.formatRequestCookies(cookies);
      // URL encoding should handle unicode
      assert.equal(result, "name=%E6%B5%8B%E8%AF%95; value=caf%C3%A9");
    });
  });
});
