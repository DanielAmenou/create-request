import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseSize } from "../src/utils/sizeUtils.js";

describe("sizeUtils Edge Cases", { timeout: 10000 }, () => {
  describe("parseSize - Number Input", () => {
    it("should return number as-is", () => {
      assert.equal(parseSize(0), 0);
      assert.equal(parseSize(1024), 1024);
      assert.equal(parseSize(123456), 123456);
      assert.equal(parseSize(-100), -100); // Negative numbers are passed through
    });

    it("should handle large numbers", () => {
      assert.equal(parseSize(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER);
      assert.equal(parseSize(Number.MAX_VALUE), Number.MAX_VALUE);
    });

    it("should handle negative numbers", () => {
      assert.equal(parseSize(-1024), -1024);
      assert.equal(parseSize(-0), -0);
    });

    it("should handle zero", () => {
      assert.equal(parseSize(0), 0);
    });
  });

  describe("parseSize - String Input - Valid Formats", () => {
    it("should parse bytes (no unit)", () => {
      assert.equal(parseSize("0"), 0);
      assert.equal(parseSize("1024"), 1024);
      assert.equal(parseSize("123456"), 123456);
    });

    it("should parse KB", () => {
      assert.equal(parseSize("1KB"), 1024);
      assert.equal(parseSize("10KB"), 10 * 1024);
      assert.equal(parseSize("1kb"), 1024); // Case insensitive
      assert.equal(parseSize("1Kb"), 1024);
      assert.equal(parseSize("1kB"), 1024);
    });

    it("should parse MB", () => {
      assert.equal(parseSize("1MB"), 1024 * 1024);
      assert.equal(parseSize("10MB"), 10 * 1024 * 1024);
      assert.equal(parseSize("1mb"), 1024 * 1024); // Case insensitive
      assert.equal(parseSize("1Mb"), 1024 * 1024);
      assert.equal(parseSize("1mB"), 1024 * 1024);
    });

    it("should parse GB", () => {
      assert.equal(parseSize("1GB"), 1024 * 1024 * 1024);
      assert.equal(parseSize("10GB"), 10 * 1024 * 1024 * 1024);
      assert.equal(parseSize("1gb"), 1024 * 1024 * 1024); // Case insensitive
      assert.equal(parseSize("1Gb"), 1024 * 1024 * 1024);
      assert.equal(parseSize("1gB"), 1024 * 1024 * 1024);
    });

    it("should parse decimal values", () => {
      assert.equal(parseSize("1.5KB"), Math.floor(1.5 * 1024));
      assert.equal(parseSize("2.5MB"), Math.floor(2.5 * 1024 * 1024));
      assert.equal(parseSize("0.5GB"), Math.floor(0.5 * 1024 * 1024 * 1024));
      assert.equal(parseSize("10.75KB"), Math.floor(10.75 * 1024));
    });

    it("should handle whitespace around number and unit", () => {
      assert.equal(parseSize("1 KB"), 1024);
      assert.equal(parseSize("1  KB"), 1024);
      assert.equal(parseSize("1\tKB"), 1024);
      assert.equal(parseSize("10  MB"), 10 * 1024 * 1024);
    });

    it("should parse values without unit as bytes", () => {
      assert.equal(parseSize("1234"), 1234);
      assert.equal(parseSize("0"), 0);
      assert.equal(parseSize("999999"), 999999);
    });
  });

  describe("parseSize - String Input - Edge Cases", () => {
    it("should return 0 for invalid format", () => {
      assert.equal(parseSize("invalid"), 0);
      assert.equal(parseSize("abc"), 0);
      assert.equal(parseSize("not a size"), 0);
      assert.equal(parseSize("KB"), 0); // No number
      assert.equal(parseSize("MB"), 0);
      assert.equal(parseSize(""), 0);
    });

    it("should handle empty string", () => {
      assert.equal(parseSize(""), 0);
    });

    it("should handle strings with only whitespace", () => {
      assert.equal(parseSize("   "), 0);
      assert.equal(parseSize("\t"), 0);
      assert.equal(parseSize("\n"), 0);
    });

    it("should return 0 for negative string values", () => {
      assert.equal(parseSize("-10KB"), 0); // Regex won't match negative
      assert.equal(parseSize("-100"), 0);
    });

    it("should handle very large numbers", () => {
      assert.equal(parseSize("999999999KB"), 999999999 * 1024);
      assert.equal(parseSize("999999999MB"), 999999999 * 1024 * 1024);
    });

    it("should handle zero with units", () => {
      assert.equal(parseSize("0KB"), 0);
      assert.equal(parseSize("0MB"), 0);
      assert.equal(parseSize("0GB"), 0);
    });

    it("should handle decimal zero", () => {
      assert.equal(parseSize("0.0KB"), 0);
      assert.equal(parseSize("0.00MB"), 0);
    });

    it("should handle invalid unit formats", () => {
      // 'B', 'TB', 'PB' don't match the regex pattern, so returns 0
      assert.equal(parseSize("100B"), 0);
      assert.equal(parseSize("100TB"), 0);
      assert.equal(parseSize("100PB"), 0);
    });

    it("should handle strings with extra characters", () => {
      assert.equal(parseSize("100KB extra"), 0); // Doesn't match regex
      assert.equal(parseSize("prefix 100KB"), 0); // Doesn't match regex
      assert.equal(parseSize("100KB and more"), 0); // Doesn't match regex
    });

    it("should handle special number formats", () => {
      // Scientific notation might not match regex
      assert.equal(parseSize("1e10KB"), 0);
      assert.equal(parseSize("1E10KB"), 0);

      // Regular decimal should work and return the exact calculation
      assert.equal(parseSize("1.234KB"), 1.234 * 1024);
    });
  });

  describe("parseSize - Conversion Accuracy", () => {
    it("should accurately convert KB to bytes", () => {
      assert.equal(parseSize("1KB"), 1024);
      assert.equal(parseSize("2KB"), 2048);
      assert.equal(parseSize("512KB"), 512 * 1024);
    });

    it("should accurately convert MB to bytes", () => {
      assert.equal(parseSize("1MB"), 1048576); // 1024 * 1024
      assert.equal(parseSize("2MB"), 2097152);
      assert.equal(parseSize("100MB"), 100 * 1024 * 1024);
    });

    it("should accurately convert GB to bytes", () => {
      assert.equal(parseSize("1GB"), 1073741824); // 1024^3
      assert.equal(parseSize("2GB"), 2147483648);
    });

    it("should handle decimal precision", () => {
      const result = parseSize("1.5KB");
      assert.equal(result, 1536); // 1.5 * 1024 = 1536
    });

    it("should handle decimal results", () => {
      // parseSize uses parseFloat and then multiplies, so 1.9 * 1024 = 1945.6
      // It returns the actual result, not truncated
      const result = parseSize("1.9KB");
      assert.equal(result, 1.9 * 1024);
    });
  });

  describe("parseSize - Type Coercion", () => {
    it("should handle number as string", () => {
      assert.equal(parseSize("1024"), 1024);
      assert.equal(parseSize(String(1024)), 1024);
    });

    it("should handle numeric input", () => {
      assert.equal(parseSize(1024), 1024);
      assert.equal(parseSize(0), 0);
    });
  });
});
