import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { CsrfUtils } from "../src/utils/CsrfUtils";

describe("CsrfUtils", () => {
  // Mock document object
  let originalDocument: typeof document | undefined;

  beforeEach(() => {
    // Save original document if it exists
    if (typeof document !== "undefined") {
      originalDocument = document;
    }

    // Create a minimal document mock
    globalThis.document = {
      querySelector: function (selector: string) {
        if (selector === 'meta[name="csrf-token"]') {
          return {
            getAttribute: function (attr: string) {
              if (attr === "content") {
                return "test-csrf-token-12345";
              }
              return null;
            },
          };
        }
        if (selector === 'meta[name="custom-token"]') {
          return {
            getAttribute: function (attr: string) {
              if (attr === "content") {
                return "custom-token-value";
              }
              return null;
            },
          };
        }
        return null;
      },
      cookie: "csrf-token=token123; other-cookie=value; custom-csrf=customvalue",
    } as any;
  });

  afterEach(() => {
    // Restore original document
    if (originalDocument) {
      globalThis.document = originalDocument;
    } else {
      // Type-safe way to unset document
      globalThis.document = undefined as any;
    }
  });

  it("should extract CSRF token from meta tag", () => {
    const token = CsrfUtils.getTokenFromMeta();
    assert.equal(token, "test-csrf-token-12345");
  });

  it("should extract CSRF token from meta tag with custom name", () => {
    const token = CsrfUtils.getTokenFromMeta("custom-token");
    assert.equal(token, "custom-token-value");
  });

  it("should extract CSRF token from cookie", () => {
    const token = CsrfUtils.getTokenFromCookie("csrf-token");
    assert.equal(token, "token123");
  });

  it("should extract CSRF token from cookie with custom name", () => {
    const token = CsrfUtils.getTokenFromCookie("custom-csrf");
    assert.equal(token, "customvalue");
  });

  it("should return null when meta tag not found", () => {
    const token = CsrfUtils.getTokenFromMeta("non-existent");
    assert.equal(token, null);
  });

  it("should return null when cookie not found", () => {
    const token = CsrfUtils.getTokenFromCookie("non-existent");
    assert.equal(token, null);
  });

  it("should validate tokens correctly", () => {
    assert.equal(CsrfUtils.isValidToken("validtoken12345"), true);
    assert.equal(CsrfUtils.isValidToken("short"), false);
    assert.equal(CsrfUtils.isValidToken(""), false);
    assert.equal(CsrfUtils.isValidToken(null), false);
    assert.equal(CsrfUtils.isValidToken(undefined), false);
  });
});
