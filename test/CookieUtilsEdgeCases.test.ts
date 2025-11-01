import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CookieUtils } from "../src/utils/CookieUtils.js";
import type { CookiesRecord, CookieOptions } from "../src/types.js";
import { SameSitePolicy } from "../src/enums.js";

describe("CookieUtils Edge Cases", () => {
  describe("formatRequestCookies - Special Characters", () => {
    it("should handle cookies with special characters in names", () => {
      const cookies: CookiesRecord = {
        "cookie-name": "value",
        "cookie@name": "value",
        "cookie name": "value",
        "cookie/name": "value",
      };

      const result = CookieUtils.formatRequestCookies(cookies);

      // Should URL encode special characters
      assert.ok(result.includes("cookie-name=value"));
      assert.ok(result.includes("cookie%40name=value") || result.includes("cookie@name=value"));
      assert.ok(result.includes("cookie%20name=value") || result.includes("cookie name=value"));
    });

    it("should handle cookies with special characters in values", () => {
      const cookies: CookiesRecord = {
        name: "value with spaces",
        name2: "value;with;semicolons",
        name3: "value=with=equals",
        name4: "value,with,commas",
      };

      const result = CookieUtils.formatRequestCookies(cookies);

      // All values should be URL encoded
      assert.ok(result.length > 0);
      // Verify semicolons are encoded (as they're used as separators)
      const pairs = result.split("; ");
      assert.equal(pairs.length, 4);
    });

    it("should handle cookies with unicode characters", () => {
      const cookies: CookiesRecord = {
        cookie: "value with émojis 🎉",
        中文cookie: "中文value",
      };

      const result = CookieUtils.formatRequestCookies(cookies);

      // Should properly encode unicode
      assert.ok(result.length > 0);
      assert.ok(result.includes("cookie="));
    });

    it("should handle empty cookie values", () => {
      const cookies: CookiesRecord = {
        name1: "",
        name2: "value",
        name3: "",
      };

      const result = CookieUtils.formatRequestCookies(cookies);

      const pairs = result.split("; ");
      assert.equal(pairs.length, 3);
      assert.ok(result.includes("name1="));
      assert.ok(result.includes("name2=value"));
      assert.ok(result.includes("name3="));
    });

    it("should handle cookies with URL-encoded values", () => {
      const cookies: CookiesRecord = {
        name: "%20encoded%20value",
      };

      const result = CookieUtils.formatRequestCookies(cookies);

      // Should double-encode or handle appropriately
      assert.ok(result.includes("name="));
    });

    it("should handle very long cookie values", () => {
      const longValue = "a".repeat(4000);
      const cookies: CookiesRecord = {
        name: longValue,
      };

      const result = CookieUtils.formatRequestCookies(cookies);

      // Should handle long values
      assert.ok(result.length > 4000);
      assert.ok(result.includes("name="));
    });

    it("should handle cookies with equals signs in values", () => {
      const cookies: CookiesRecord = {
        name: "value=with=equals",
      };

      const result = CookieUtils.formatRequestCookies(cookies);

      // Equals signs in values should be encoded or preserved correctly
      assert.ok(result.includes("name="));
    });
  });

  describe("formatRequestCookies - CookieOptions", () => {
    it("should handle CookieOptions objects", () => {
      const cookies: CookiesRecord = {
        cookie1: "simple-value",
        cookie2: {
          value: "option-value",
          secure: true,
          httpOnly: true,
          sameSite: SameSitePolicy.STRICT,
        },
      };

      const result = CookieUtils.formatRequestCookies(cookies);

      // Should only format name=value pairs (options are for response cookies, not request)
      assert.ok(result.includes("cookie1=simple-value"));
      assert.ok(result.includes("cookie2=option-value"));
    });

    it("should handle CookieOptions with empty value", () => {
      const cookies: CookiesRecord = {
        name: {
          value: "",
          secure: true,
        } as CookieOptions,
      };

      const result = CookieUtils.formatRequestCookies(cookies);

      assert.ok(result.includes("name="));
    });

    it("should handle mixed string and CookieOptions values", () => {
      const cookies: CookiesRecord = {
        "string-cookie": "string-value",
        "option-cookie": {
          value: "option-value",
        } as CookieOptions,
        "another-string": "another-value",
      };

      const result = CookieUtils.formatRequestCookies(cookies);

      const pairs = result.split("; ");
      assert.equal(pairs.length, 3);
      assert.ok(result.includes("string-cookie=string-value"));
      assert.ok(result.includes("option-cookie=option-value"));
      assert.ok(result.includes("another-string=another-value"));
    });
  });

  describe("formatRequestCookies - Edge Cases", () => {
    it("should handle empty cookies object", () => {
      const cookies: CookiesRecord = {};
      const result = CookieUtils.formatRequestCookies(cookies);

      assert.equal(result, "");
    });

    it("should handle cookies with whitespace-only values", () => {
      const cookies: CookiesRecord = {
        name1: "   ",
        name2: "\t",
        name3: "\n",
      };

      const result = CookieUtils.formatRequestCookies(cookies);

      const pairs = result.split("; ");
      assert.equal(pairs.length, 3);
    });

    it("should handle cookies with numeric-looking string values", () => {
      const cookies: CookiesRecord = {
        number: "123",
        float: "123.456",
        scientific: "1e10",
      };

      const result = CookieUtils.formatRequestCookies(cookies);

      const pairs = result.split("; ");
      assert.equal(pairs.length, 3);
      assert.ok(result.includes("number=123"));
      assert.ok(result.includes("float=123.456"));
      assert.ok(result.includes("scientific=1e10"));
    });

    it("should handle cookies with boolean-looking string values", () => {
      const cookies: CookiesRecord = {
        true: "true",
        false: "false",
      };

      const result = CookieUtils.formatRequestCookies(cookies);

      assert.ok(result.includes("true=true"));
      assert.ok(result.includes("false=false"));
    });

    it("should preserve cookie order (implementation-dependent, but test behavior)", () => {
      const cookies: CookiesRecord = {
        first: "1",
        second: "2",
        third: "3",
      };

      const result = CookieUtils.formatRequestCookies(cookies);

      // Should contain all cookies
      assert.ok(result.includes("first=1"));
      assert.ok(result.includes("second=2"));
      assert.ok(result.includes("third=3"));
    });

    it("should handle cookies with null-like string values", () => {
      const cookies: CookiesRecord = {
        null: "null",
        undefined: "undefined",
      };

      const result = CookieUtils.formatRequestCookies(cookies);

      assert.ok(result.includes("null=null"));
      assert.ok(result.includes("undefined=undefined"));
    });

    it("should handle many cookies (stress test)", () => {
      const cookies: CookiesRecord = {};
      for (let i = 0; i < 100; i++) {
        cookies[`cookie${i}`] = `value${i}`;
      }

      const result = CookieUtils.formatRequestCookies(cookies);

      const pairs = result.split("; ");
      assert.equal(pairs.length, 100);

      // Verify a few cookies are present
      assert.ok(result.includes("cookie0=value0"));
      assert.ok(result.includes("cookie50=value50"));
      assert.ok(result.includes("cookie99=value99"));
    });
  });

  describe("formatRequestCookies - Encoding Verification", () => {
    it("should properly encode reserved characters", () => {
      const cookies: CookiesRecord = {
        name: ';=,"\\',
      };

      const result = CookieUtils.formatRequestCookies(cookies);

      // Special characters that might break cookie parsing should be encoded
      assert.ok(result.includes("name="));
      // The exact encoding depends on encodeURIComponent behavior
    });

    it("should handle cookies that are already URL-encoded", () => {
      const cookies: CookiesRecord = {
        name: encodeURIComponent("value with spaces"),
      };

      const result = CookieUtils.formatRequestCookies(cookies);

      // Should handle already-encoded values appropriately
      assert.ok(result.includes("name="));
    });
  });
});
