import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseSize } from "../src/utils/sizeUtils.js";

describe("sizeUtils", { timeout: 10000 }, () => {
  describe("parseSize", () => {
    it("should return number as-is when input is a number", () => {
      assert.equal(parseSize(1024), 1024);
      assert.equal(parseSize(0), 0);
      assert.equal(parseSize(12345), 12345);
      assert.equal(parseSize(1.5), 1.5);
    });

    it("should parse bytes without unit", () => {
      assert.equal(parseSize("1024"), 1024);
      assert.equal(parseSize("0"), 0);
      assert.equal(parseSize("12345"), 12345);
    });

    it("should parse decimal bytes", () => {
      assert.equal(parseSize("1024.5"), 1024.5);
      assert.equal(parseSize("0.5"), 0.5);
    });

    it("should parse KB units", () => {
      assert.equal(parseSize("1KB"), 1024);
      assert.equal(parseSize("1kb"), 1024); // case insensitive
      assert.equal(parseSize("1Kb"), 1024);
      assert.equal(parseSize("10KB"), 10 * 1024);
      assert.equal(parseSize("1.5KB"), 1.5 * 1024);
      assert.equal(parseSize("0KB"), 0);
    });

    it("should parse MB units", () => {
      assert.equal(parseSize("1MB"), 1024 * 1024);
      assert.equal(parseSize("1mb"), 1024 * 1024); // case insensitive
      assert.equal(parseSize("1Mb"), 1024 * 1024);
      assert.equal(parseSize("10MB"), 10 * 1024 * 1024);
      assert.equal(parseSize("1.5MB"), 1.5 * 1024 * 1024);
      assert.equal(parseSize("0MB"), 0);
    });

    it("should parse GB units", () => {
      assert.equal(parseSize("1GB"), 1024 * 1024 * 1024);
      assert.equal(parseSize("1gb"), 1024 * 1024 * 1024); // case insensitive
      assert.equal(parseSize("1Gb"), 1024 * 1024 * 1024);
      assert.equal(parseSize("10GB"), 10 * 1024 * 1024 * 1024);
      assert.equal(parseSize("1.5GB"), 1.5 * 1024 * 1024 * 1024);
      assert.equal(parseSize("0GB"), 0);
    });

    it("should handle whitespace before unit", () => {
      assert.equal(parseSize("1 KB"), 1024);
      assert.equal(parseSize("10 MB"), 10 * 1024 * 1024);
      assert.equal(parseSize("1 GB"), 1024 * 1024 * 1024);
      assert.equal(parseSize("1  KB"), 1024); // multiple spaces
    });

    it("should return 0 for invalid strings", () => {
      assert.equal(parseSize("invalid"), 0);
      assert.equal(parseSize("abcKB"), 0);
      assert.equal(parseSize("KB"), 0);
      assert.equal(parseSize(""), 0);
      assert.equal(parseSize("  "), 0);
    });

    it("should return 0 for strings that don't match pattern", () => {
      assert.equal(parseSize("1.2.3KB"), 0);
      assert.equal(parseSize("1KB2"), 0);
      assert.equal(parseSize("KB1"), 0);
      assert.equal(parseSize("1TB"), 0); // unsupported unit
    });

    it("should handle edge cases", () => {
      assert.equal(parseSize("0.001KB"), 0.001 * 1024);
      assert.equal(parseSize("999999GB"), 999999 * 1024 * 1024 * 1024);
      assert.equal(parseSize("0.0"), 0);
      assert.equal(parseSize("0.0KB"), 0);
    });

    it("should handle large decimal values", () => {
      assert.equal(parseSize("1.23456789MB"), 1.23456789 * 1024 * 1024);
      assert.equal(parseSize("999.999GB"), 999.999 * 1024 * 1024 * 1024);
    });
  });
});
