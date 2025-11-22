import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { GetRequest, PostRequest } from "../src/requestMethods.js";
import { get, post } from "../src/requestFactories.js";

describe("Request Validation", { timeout: 10000 }, () => {
  describe("withTimeout validation", () => {
    it("should throw error for negative timeout value", () => {
      // Arrange
      const request = new GetRequest("https://api.example.com/test");

      // Act & Assert
      assert.throws(() => {
        request.withTimeout(-100);
      }, /Timeout must be a positive number/);
    });

    it("should throw error for zero timeout value", () => {
      // Arrange
      const request = new GetRequest("https://api.example.com/test");

      // Act & Assert
      assert.throws(() => {
        request.withTimeout(0);
      }, /Timeout must be a positive number/);
    });

    it("should throw error for non-finite timeout values", () => {
      // Arrange
      const request = new GetRequest("https://api.example.com/test");

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
      const request = new GetRequest("https://api.example.com/test");

      // Act & Assert
      assert.doesNotThrow(() => {
        request.withTimeout(1000);
      });
    });
  });

  describe("withRetries validation", () => {
    it("should throw error for negative retry count", () => {
      // Arrange
      const request = new GetRequest("https://api.example.com/test");

      // Act & Assert
      assert.throws(() => {
        request.withRetries(-1);
      }, /Invalid retries: -1/);
    });

    it("should throw error for non-integer retry count", () => {
      // Arrange
      const request = new GetRequest("https://api.example.com/test");

      // Act & Assert
      assert.throws(() => {
        request.withRetries(1.5);
      }, /Invalid retries: 1.5/);
    });

    it("should throw error for NaN retry count", () => {
      // Arrange
      const request = new GetRequest("https://api.example.com/test");

      // Act & Assert
      assert.throws(() => {
        request.withRetries(NaN);
      }, /Invalid retries: NaN/);
    });

    it("should accept zero retry count", () => {
      // Arrange
      const request = new GetRequest("https://api.example.com/test");

      // Act & Assert
      assert.doesNotThrow(() => {
        request.withRetries(0);
      });
    });

    it("should accept positive integer retry count", () => {
      // Arrange
      const request = new GetRequest("https://api.example.com/test");

      // Act & Assert
      assert.doesNotThrow(() => {
        request.withRetries(3);
      });
    });
  });

  describe("URL validation", () => {
    it("should throw error for empty string URL at execution time", async () => {
      // Arrange
      const request = new GetRequest("");

      // Act & Assert
      await assert.rejects(
        () => request.getResponse(),
        (error: unknown) => {
          assert(error instanceof Error);
          return error.message.includes("URL cannot be empty");
        }
      );
    });

    it("should throw error for whitespace-only URL at execution time", async () => {
      // Arrange
      const request = new GetRequest("   ");

      // Act & Assert
      await assert.rejects(
        () => request.getResponse(),
        (error: unknown) => {
          assert(error instanceof Error);
          return error.message.includes("URL cannot be empty");
        }
      );
    });

    it("should throw error for invalid absolute URL at execution time", async () => {
      // Arrange
      const request = new GetRequest("https://invalid url with spaces.com");

      // Act & Assert
      await assert.rejects(
        async () => {
          await request.getResponse();
        },
        (error: unknown) => {
          assert(error instanceof Error);
          return error.message.includes("Invalid URL");
        }
      );
    });

    it("should throw error for malformed absolute URL at execution time", async () => {
      // Arrange
      const request = new GetRequest("https://");

      // Act & Assert
      await assert.rejects(
        async () => {
          await request.getResponse();
        },
        (error: unknown) => {
          assert(error instanceof Error);
          return error.message.includes("Invalid URL");
        }
      );
    });

    it("should throw error for relative URL with null character at execution time", async () => {
      // Arrange
      const request = new GetRequest("/api/users\0");

      // Act & Assert
      await assert.rejects(
        () => request.getResponse(),
        (error: unknown) => {
          assert(error instanceof Error);
          return error.message.includes("Invalid URL");
        }
      );
    });

    it("should throw error for relative URL with newline at execution time", async () => {
      // Arrange
      const request = new GetRequest("/api/users\n");

      // Act & Assert
      await assert.rejects(
        () => request.getResponse(),
        (error: unknown) => {
          assert(error instanceof Error);
          return error.message.includes("Invalid URL");
        }
      );
    });

    it("should throw error for relative URL with carriage return at execution time", async () => {
      // Arrange
      const request = new GetRequest("/api/users\r");

      // Act & Assert
      await assert.rejects(
        () => request.getResponse(),
        (error: unknown) => {
          assert(error instanceof Error);
          return error.message.includes("Invalid URL");
        }
      );
    });

    it("should accept valid absolute URL with http://", () => {
      // Act & Assert
      assert.doesNotThrow(() => {
        new GetRequest("http://api.example.com/test");
      });
    });

    it("should accept valid absolute URL with https://", () => {
      // Act & Assert
      assert.doesNotThrow(() => {
        new GetRequest("https://api.example.com/test");
      });
    });

    it("should accept valid absolute URL with query parameters", () => {
      // Act & Assert
      assert.doesNotThrow(() => {
        new GetRequest("https://api.example.com/test?param=value");
      });
    });

    it("should accept valid relative URL starting with /", () => {
      // Act & Assert
      assert.doesNotThrow(() => {
        new GetRequest("/api/users");
      });
    });

    it("should accept valid relative URL without leading slash", () => {
      // Act & Assert
      assert.doesNotThrow(() => {
        new GetRequest("api/users");
      });
    });

    it("should accept valid relative URL with query parameters", () => {
      // Act & Assert
      assert.doesNotThrow(() => {
        new GetRequest("/api/users?id=123");
      });
    });

    it("should accept valid relative URL with hash", () => {
      // Act & Assert
      assert.doesNotThrow(() => {
        new GetRequest("/api/users#section");
      });
    });

    it("should validate URL for PostRequest at execution time", async () => {
      // Arrange
      const request = new PostRequest("");

      // Act & Assert
      await assert.rejects(
        () => request.getResponse(),
        (error: unknown) => {
          assert(error instanceof Error);
          return error.message.includes("URL cannot be empty");
        }
      );
    });

    it("should validate URL for PostRequest with valid URL", () => {
      // Act & Assert
      assert.doesNotThrow(() => {
        new PostRequest("https://api.example.com/users");
      });
    });

    it("should validate URL in factory function get() at execution time", async () => {
      // Arrange
      const request = get("");

      // Act & Assert
      await assert.rejects(
        () => request.getResponse(),
        (error: unknown) => {
          assert(error instanceof Error);
          return error.message.includes("URL cannot be empty");
        }
      );
    });

    it("should validate URL in factory function post() at execution time", async () => {
      // Arrange
      const request = post("");

      // Act & Assert
      await assert.rejects(
        () => request.getResponse(),
        (error: unknown) => {
          assert(error instanceof Error);
          return error.message.includes("URL cannot be empty");
        }
      );
    });

    it("should accept valid URL in factory function get()", () => {
      // Act & Assert
      assert.doesNotThrow(() => {
        get("https://api.example.com/users");
      });
    });

    it("should validate URL modified by interceptor at execution time", async () => {
      // Arrange
      const request = new GetRequest("https://api.example.com/valid").withRequestInterceptor(config => {
        // Interceptor modifies URL to invalid one
        config.url = "https://invalid url.com";
        return config;
      });

      // Act & Assert
      await assert.rejects(
        async () => {
          await request.getResponse();
        },
        (error: unknown) => {
          assert(error instanceof Error);
          return error.message.includes("Invalid URL");
        }
      );
    });

    it("should validate URL with control characters modified by interceptor", async () => {
      // Arrange
      const request = new GetRequest("https://api.example.com/valid").withRequestInterceptor(config => {
        // Interceptor adds control character
        config.url = "/api/users\n";
        return config;
      });

      // Act & Assert
      await assert.rejects(
        () => request.getResponse(),
        (error: unknown) => {
          assert(error instanceof Error);
          return error.message.includes("Invalid URL");
        }
      );
    });
  });
});
