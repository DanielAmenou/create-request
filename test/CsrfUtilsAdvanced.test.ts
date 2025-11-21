import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { CsrfUtils } from "../src/utils/CsrfUtils.js";

describe("CsrfUtils Advanced Tests", { timeout: 10000 }, () => {
  let originalDocument: typeof document | undefined;

  beforeEach(() => {
    if (typeof document !== "undefined") {
      originalDocument = document;
    }
  });

  afterEach(() => {
    if (originalDocument) {
      globalThis.document = originalDocument;
    } else {
      globalThis.document = undefined as any;
    }
  });

  describe("getTokenFromCookie - Edge Cases", () => {
    it("should handle cookies with encoded values", () => {
      globalThis.document = {
        cookie: "csrf-token=" + encodeURIComponent("token with spaces"),
      } as any;

      const token = CsrfUtils.getTokenFromCookie("csrf-token");

      // Should decode URL-encoded values
      assert.equal(token, "token with spaces");
    });

    it("should handle cookies with special characters in value", () => {
      globalThis.document = {
        cookie: "csrf-token=token%20with%20spaces; other=value",
      } as any;

      const token = CsrfUtils.getTokenFromCookie("csrf-token");

      // Should decode the cookie value
      assert.equal(token, "token with spaces");
    });

    it("should handle cookie at start of cookie string", () => {
      globalThis.document = {
        cookie: "csrf-token=value123; other=value",
      } as any;

      const token = CsrfUtils.getTokenFromCookie("csrf-token");

      assert.equal(token, "value123");
    });

    it("should handle cookie at end of cookie string", () => {
      globalThis.document = {
        cookie: "other=value; csrf-token=value123",
      } as any;

      const token = CsrfUtils.getTokenFromCookie("csrf-token");

      assert.equal(token, "value123");
    });

    it("should handle cookie in middle of cookie string", () => {
      globalThis.document = {
        cookie: "first=value1; csrf-token=middle-value; last=value2",
      } as any;

      const token = CsrfUtils.getTokenFromCookie("csrf-token");

      assert.equal(token, "middle-value");
    });

    it("should handle cookie with no value (equals sign only)", () => {
      globalThis.document = {
        cookie: "csrf-token=; other=value",
      } as any;

      const token = CsrfUtils.getTokenFromCookie("csrf-token");

      assert.equal(token, "");
    });

    it("should handle cookie name that appears as substring of another cookie", () => {
      globalThis.document = {
        cookie: "csrf-token-long=wrong-value; csrf-token=correct-value; other=value",
      } as any;

      const token = CsrfUtils.getTokenFromCookie("csrf-token");

      assert.equal(token, "correct-value");
    });

    it("should handle cookies with whitespace around equals sign", () => {
      globalThis.document = {
        cookie: "csrf-token = value123",
      } as any;

      const token = CsrfUtils.getTokenFromCookie("csrf-token");

      // Should handle whitespace in cookie string
      assert.equal(token, null); // or might be "value123" depending on implementation
    });

    it("should return null when document is undefined (Node.js environment)", () => {
      globalThis.document = undefined as any;

      const token = CsrfUtils.getTokenFromCookie("csrf-token");

      assert.equal(token, null);
    });

    it("should handle cookie string with multiple cookies with same name (takes first)", () => {
      globalThis.document = {
        cookie: "csrf-token=first-value; csrf-token=second-value",
      } as any;

      const token = CsrfUtils.getTokenFromCookie("csrf-token");

      // Should return first occurrence
      assert.equal(token, "first-value");
    });
  });

  describe("getTokenFromMeta - Edge Cases", () => {
    it("should handle meta tag with empty content", () => {
      globalThis.document = {
        querySelector: (selector: string) => {
          if (selector === 'meta[name="csrf-token"]') {
            return {
              getAttribute: (attr: string) => (attr === "content" ? "" : null),
            };
          }
          return null;
        },
      } as any;

      const token = CsrfUtils.getTokenFromMeta();

      // getAttribute returns empty string for empty content, then || null makes it null
      // Actually, let's check: getAttribute returns "" for empty, then || null would still be ""
      // But the implementation does: return meta?.getAttribute("content") || null;
      // So if getAttribute returns "", then "" || null = null
      assert.equal(token, null);
    });

    it("should handle meta tag with only whitespace content", () => {
      globalThis.document = {
        querySelector: (selector: string) => {
          if (selector === 'meta[name="csrf-token"]') {
            return {
              getAttribute: (attr: string) => (attr === "content" ? "   " : null),
            };
          }
          return null;
        },
      } as any;

      const token = CsrfUtils.getTokenFromMeta();

      assert.equal(token, "   ");
    });

    it("should return null when document is undefined", () => {
      globalThis.document = undefined as any;

      const token = CsrfUtils.getTokenFromMeta();

      assert.equal(token, null);
    });

    it("should handle querySelector returning null", () => {
      globalThis.document = {
        querySelector: () => null,
      } as any;

      const token = CsrfUtils.getTokenFromMeta();

      assert.equal(token, null);
    });

    it("should handle meta tag with special characters", () => {
      globalThis.document = {
        querySelector: (selector: string) => {
          if (selector === 'meta[name="csrf-token"]') {
            return {
              getAttribute: (attr: string) => (attr === "content" ? "token-with-special@chars!#$" : null),
            };
          }
          return null;
        },
      } as any;

      const token = CsrfUtils.getTokenFromMeta();

      assert.equal(token, "token-with-special@chars!#$");
    });

    it("should handle meta tag with unicode characters", () => {
      globalThis.document = {
        querySelector: (selector: string) => {
          if (selector === 'meta[name="csrf-token"]') {
            return {
              getAttribute: (attr: string) => (attr === "content" ? "token-with-émojis-🎉" : null),
            };
          }
          return null;
        },
      } as any;

      const token = CsrfUtils.getTokenFromMeta();

      assert.equal(token, "token-with-émojis-🎉");
    });
  });

  describe("isValidToken - Comprehensive Validation", () => {
    it("should reject tokens shorter than 8 characters", () => {
      assert.equal(CsrfUtils.isValidToken("short"), false);
      assert.equal(CsrfUtils.isValidToken("1234567"), false);
      assert.equal(CsrfUtils.isValidToken("abc"), false);
    });

    it("should accept tokens of exactly 8 characters", () => {
      assert.equal(CsrfUtils.isValidToken("12345678"), true);
      assert.equal(CsrfUtils.isValidToken("abcdefgh"), true);
    });

    it("should accept tokens of 9-10 characters", () => {
      assert.equal(CsrfUtils.isValidToken("123456789"), true);
      assert.equal(CsrfUtils.isValidToken("abcdefghij"), true);
      assert.equal(CsrfUtils.isValidToken("a".repeat(10)), true);
    });

    it("should validate tokens longer than 10 characters", () => {
      // Valid: has letters and numbers
      assert.equal(CsrfUtils.isValidToken("abc123DEF456"), true);

      // Invalid: only lowercase letters (only 1 character type) - but need > 10 chars
      // "abcdefghijklmnop" is 16 chars, should fail character type check
      // However, if it's exactly 8-10 chars, it passes without character type check
      // So let's test with a clearly > 10 char token that has only lowercase
      const onlyLowercase = "a".repeat(15); // 15 chars, only lowercase
      assert.equal(CsrfUtils.isValidToken(onlyLowercase), false);

      // Invalid: only uppercase letters (only 1 character type)
      assert.equal(CsrfUtils.isValidToken("ABCDEFGHIJKLMNOP"), false);

      // Invalid: only numbers (only 1 character type)
      assert.equal(CsrfUtils.isValidToken("1234567890123456"), false);

      // Invalid: only special characters (only 1 character type) - but need > 10 chars
      // "--------" is 8 chars, so it passes (8-10 chars don't need character type check)
      // So let's test with > 10 chars
      const onlySpecials = "-".repeat(15); // 15 chars, only specials
      assert.equal(CsrfUtils.isValidToken(onlySpecials), false);

      // Valid: lowercase + uppercase (2 character types)
      assert.equal(CsrfUtils.isValidToken("abcDEFghi"), true);

      // Valid: letters + numbers (2 character types)
      assert.equal(CsrfUtils.isValidToken("abc123ghi"), true);

      // Valid: letters + special characters (2 character types)
      assert.equal(CsrfUtils.isValidToken("abc-def-ghi"), true);

      // Valid: numbers + special characters (2 character types)
      assert.equal(CsrfUtils.isValidToken("123-456-789"), true);
    });

    it("should reject tokens with invalid characters", () => {
      assert.equal(CsrfUtils.isValidToken("token with spaces"), false);
      assert.equal(CsrfUtils.isValidToken("token\nwith\nnewlines"), false);
      assert.equal(CsrfUtils.isValidToken("token\twith\ttabs"), false);
      assert.equal(CsrfUtils.isValidToken("token<script>alert('xss')</script>"), false);
      assert.equal(CsrfUtils.isValidToken("token@#$%^&*()"), false);
    });

    it("should accept tokens with valid special characters", () => {
      assert.equal(CsrfUtils.isValidToken("token-with-dashes"), true);
      assert.equal(CsrfUtils.isValidToken("token_with_underscores"), true);
      assert.equal(CsrfUtils.isValidToken("token=with=equals"), true);
      assert.equal(CsrfUtils.isValidToken("token/with/slashes"), true);
      assert.equal(CsrfUtils.isValidToken("token+with+plus"), true);
      assert.equal(CsrfUtils.isValidToken("token.with.dots"), true);
    });

    it("should handle null and undefined", () => {
      assert.equal(CsrfUtils.isValidToken(null), false);
      assert.equal(CsrfUtils.isValidToken(undefined), false);
    });

    it("should reject non-string types", () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      assert.equal(CsrfUtils.isValidToken(12345 as any), false);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      assert.equal(CsrfUtils.isValidToken(true as any), false);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      assert.equal(CsrfUtils.isValidToken({} as any), false);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      assert.equal(CsrfUtils.isValidToken([] as any), false);
    });

    it("should validate realistic CSRF tokens", () => {
      // Common CSRF token formats
      assert.equal(CsrfUtils.isValidToken("aBc123XyZ789"), true);
      assert.equal(CsrfUtils.isValidToken("MTIzNDU2Nzg5MA=="), true); // Base64-like
      assert.equal(CsrfUtils.isValidToken("random-uuid-like-token-12345"), true);

      // Too short
      assert.equal(CsrfUtils.isValidToken("abc"), false);

      // Too homogeneous
      assert.equal(CsrfUtils.isValidToken("aaaaaaaaaaaaaaaa"), false);
    });

    it("should require at least 2 character types for long tokens", () => {
      // Has only letters (but both cases count as different types?)
      // Actually, let's check the implementation: hasUpperCase, hasLowerCase, hasNumbers, hasSpecials
      // So a token with both upper and lower case should be valid
      assert.equal(CsrfUtils.isValidToken("ABCDEFGHIJKLMNOPqrstuvwxyz"), true);

      // Has letters and numbers
      assert.equal(CsrfUtils.isValidToken("ABCDEF123456"), true);

      // Has only one type (numbers)
      assert.equal(CsrfUtils.isValidToken("123456789012345"), false);

      // Has only one type (lowercase)
      assert.equal(CsrfUtils.isValidToken("abcdefghijklmnop"), false);
    });

    it("should handle edge case with exactly 11 characters", () => {
      // 11 chars > 10, so needs validation
      // Only lowercase (one type)
      assert.equal(CsrfUtils.isValidToken("abcdefghijk"), false);

      // Lowercase + numbers (two types)
      assert.equal(CsrfUtils.isValidToken("abcdef12345"), true);
    });

    it("should handle very long tokens", () => {
      const longToken = "aB1cD2eF3gH4iJ5kL6mN7oP8qR9sT0uV1wX2yZ3";
      assert.equal(CsrfUtils.isValidToken(longToken), true);

      const longInvalidToken = "a".repeat(100);
      assert.equal(CsrfUtils.isValidToken(longInvalidToken), false);
    });
  });
});
