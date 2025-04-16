import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { GetRequest } from "../src/requestMethods.js";

describe("Request Validation", () => {
  describe("withTimeout validation", () => {
    it("should throw error for negative timeout value", () => {
      // Arrange
      const request = new GetRequest();

      // Act & Assert
      assert.throws(() => {
        request.withTimeout(-100);
      }, /Timeout must be a positive number/);
    });

    it("should throw error for zero timeout value", () => {
      // Arrange
      const request = new GetRequest();

      // Act & Assert
      assert.throws(() => {
        request.withTimeout(0);
      }, /Timeout must be a positive number/);
    });

    it("should throw error for non-finite timeout values", () => {
      // Arrange
      const request = new GetRequest();

      // Act & Assert - NaN
      assert.throws(() => {
        request.withTimeout(NaN);
      }, /Timeout must be a positive number/);

      // Act & Assert - Infinity
      assert.throws(() => {
        request.withTimeout(Infinity);
      }, /Timeout must be a positive number/);
    });

    it("should accept valid timeout value", () => {
      // Arrange
      const request = new GetRequest();

      // Act & Assert
      assert.doesNotThrow(() => {
        request.withTimeout(1000);
      });
    });
  });

  describe("withRetries validation", () => {
    it("should throw error for negative retry count", () => {
      // Arrange
      const request = new GetRequest();

      // Act & Assert
      assert.throws(() => {
        request.withRetries(-1);
      }, /Retry count must be a non-negative integer/);
    });

    it("should throw error for non-integer retry count", () => {
      // Arrange
      const request = new GetRequest();

      // Act & Assert
      assert.throws(() => {
        request.withRetries(1.5);
      }, /Retry count must be a non-negative integer/);
    });

    it("should throw error for NaN retry count", () => {
      // Arrange
      const request = new GetRequest();

      // Act & Assert
      assert.throws(() => {
        request.withRetries(NaN);
      }, /Retry count must be a non-negative integer/);
    });

    it("should accept zero retry count", () => {
      // Arrange
      const request = new GetRequest();

      // Act & Assert
      assert.doesNotThrow(() => {
        request.withRetries(0);
      });
    });

    it("should accept positive integer retry count", () => {
      // Arrange
      const request = new GetRequest();

      // Act & Assert
      assert.doesNotThrow(() => {
        request.withRetries(3);
      });
    });
  });
});
