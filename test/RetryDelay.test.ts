import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import create, { RequestError } from "../src/index.js";
import { FetchMock } from "./utils/fetchMock.js";
import { GetRequest } from "../src/requestMethods.js";

describe("Retry Delay", () => {
  beforeEach(() => {
    FetchMock.install();
    FetchMock.reset();
  });

  afterEach(() => {
    FetchMock.restore();
  });

  describe("withRetries() - number (backward compatibility)", () => {
    it("should accept number and work without delay", async () => {
      FetchMock.mockErrorOnce(new Error("Network failure 1"));
      FetchMock.mockErrorOnce(new Error("Network failure 2"));
      FetchMock.mockResponseOnce({ body: { success: true } });

      const startTime = Date.now();
      const request = create.get("https://api.example.com/data").withRetries(2);

      const result = await request.getJson();
      const duration = Date.now() - startTime;

      assert.deepEqual(result, { success: true });
      // Should complete quickly without delay
      assert(duration < 100, "Should complete without delay");
    });

    it("should throw error for negative number", () => {
      const request = new GetRequest("https://api.example.com/test");
      assert.throws(() => {
        request.withRetries(-1);
      }, /Invalid retries: -1/);
    });

    it("should throw error for non-integer number", () => {
      const request = new GetRequest("https://api.example.com/test");
      assert.throws(() => {
        request.withRetries(1.5);
      }, /Invalid retries: 1.5/);
    });
  });

  describe("withRetries() - config object with fixed delay", () => {
    it("should retry with fixed delay between attempts", async () => {
      FetchMock.mockErrorOnce(new Error("Network failure 1"));
      FetchMock.mockErrorOnce(new Error("Network failure 2"));
      FetchMock.mockResponseOnce({ body: { success: true } });

      const startTime = Date.now();
      const request = create.get("https://api.example.com/data").withRetries({
        attempts: 2,
        delay: 10,
      });

      const result = await request.getJson();
      const duration = Date.now() - startTime;

      assert.deepEqual(result, { success: true });
      // Should have waited at least 20ms (2 retries * 10ms delay)
      assert(duration >= 20, `Expected at least 20ms delay, got ${duration}ms`);
      // But not too long (allowing some buffer)
      assert(duration < 100, `Expected less than 100ms, got ${duration}ms`);
    });

    it("should handle zero delay", async () => {
      FetchMock.mockErrorOnce(new Error("Network failure 1"));
      FetchMock.mockResponseOnce({ body: { success: true } });

      const startTime = Date.now();
      const request = create.get("https://api.example.com/data").withRetries({
        attempts: 1,
        delay: 0,
      });

      const result = await request.getJson();
      const duration = Date.now() - startTime;

      assert.deepEqual(result, { success: true });
      // Should complete quickly with zero delay
      assert(duration < 100, "Should complete quickly with zero delay");
    });

    it("should throw error for negative delay", () => {
      const request = new GetRequest("https://api.example.com/test");
      assert.throws(() => {
        request.withRetries({
          attempts: 1,
          delay: -100,
        });
      }, /Invalid delay: -100/);
    });

    it("should throw error for non-finite delay", () => {
      const request = new GetRequest("https://api.example.com/test");
      assert.throws(() => {
        request.withRetries({
          attempts: 1,
          delay: Infinity,
        });
      }, /Invalid delay: Infinity/);
    });

    it("should throw error for invalid delay type", () => {
      const request = new GetRequest("https://api.example.com/test");
      assert.throws(() => {
        request.withRetries({
          attempts: 1,
          delay: "invalid" as any,
        });
      }, /Invalid delay: string/);
    });
  });

  describe("withRetries() - config object with delay function", () => {
    it("should retry with delay calculated by function", async () => {
      FetchMock.mockErrorOnce(new Error("Network failure 1"));
      FetchMock.mockErrorOnce(new Error("Network failure 2"));
      FetchMock.mockResponseOnce({ body: { success: true } });

      const startTime = Date.now();
      const request = create.get("https://api.example.com/data").withRetries({
        attempts: 2,
        delay: ({ attempt }) => attempt * 5, // 5ms, 10ms
      });

      const result = await request.getJson();
      const duration = Date.now() - startTime;

      assert.deepEqual(result, { success: true });
      // Should have waited at least 15ms (5ms + 10ms)
      assert(duration >= 15, `Expected at least 15ms delay, got ${duration}ms`);
      assert(duration < 50, `Expected less than 50ms, got ${duration}ms`);
    });

    it("should pass correct attempt number to delay function", async () => {
      FetchMock.mockErrorOnce(new Error("Network failure 1"));
      FetchMock.mockErrorOnce(new Error("Network failure 2"));
      FetchMock.mockResponseOnce({ body: { success: true } });

      const attempts: number[] = [];
      const request = create.get("https://api.example.com/data").withRetries({
        attempts: 2,
        delay: ({ attempt }) => {
          attempts.push(attempt);
          return 10; // Small delay for testing
        },
      });

      await request.getJson();

      assert.deepEqual(attempts, [1, 2], "Delay function should receive correct attempt numbers");
    });

    it("should pass error to delay function", async () => {
      FetchMock.mockResponseOnce({
        status: 429,
        statusText: "Too Many Requests",
        body: { message: "Rate limit exceeded" },
      });
      FetchMock.mockResponseOnce({ body: { success: true } });

      let receivedError: RequestError | null = null;
      const request = create.get("https://api.example.com/data").withRetries({
        attempts: 1,
        delay: ({ error }) => {
          receivedError = error;
          return 10;
        },
      });

      await request.getJson();

      assert(receivedError !== null, "Delay function should receive error");
      const error = receivedError as RequestError;
      assert.equal(error.status, 429, "Error should have correct status");
    });

    it("should throw error if delay function returns negative number", async () => {
      FetchMock.mockErrorOnce(new Error("Network failure 1"));
      FetchMock.mockErrorOnce(new Error("Network failure 2"));

      const request = create.get("https://api.example.com/data").withRetries({
        attempts: 2,
        delay: () => -100,
      });

      try {
        await request.getResponse();
        assert.fail("Should have thrown error for negative delay");
      } catch (error) {
        assert(error instanceof RequestError);
        assert(error.message.includes("Invalid retry delay: -100"));
      }
    });

    it("should throw error if delay function returns non-number", async () => {
      FetchMock.mockErrorOnce(new Error("Network failure 1"));

      const request = create.get("https://api.example.com/data").withRetries({
        attempts: 1,
        // @ts-expect-error - Testing invalid delay return type
        delay: () => "invalid",
      });

      try {
        await request.getResponse();
        assert.fail("Should have thrown error for invalid delay");
      } catch (error) {
        assert(error instanceof RequestError);
        assert(error.message.includes("Invalid retry delay: invalid"));
      }
    });

    it("should throw error if delay function returns Infinity", async () => {
      FetchMock.mockErrorOnce(new Error("Network failure 1"));

      const request = create.get("https://api.example.com/data").withRetries({
        attempts: 1,
        delay: () => Infinity,
      });

      try {
        await request.getResponse();
        assert.fail("Should have thrown error for Infinity delay");
      } catch (error) {
        assert(error instanceof RequestError);
        assert(error.message.includes("Invalid retry delay: Infinity"));
      }
    });
  });

  describe("withRetries() - exponential backoff examples", () => {
    it("should support exponential backoff", async () => {
      FetchMock.mockErrorOnce(new Error("Network failure 1"));
      FetchMock.mockErrorOnce(new Error("Network failure 2"));
      FetchMock.mockResponseOnce({ body: { success: true } });

      const delays: number[] = [];
      const request = create.get("https://api.example.com/data").withRetries({
        attempts: 2,
        delay: ({ attempt }) => {
          const delay = Math.min(10 * Math.pow(2, attempt - 1), 100);
          delays.push(delay);
          return delay;
        },
      });

      await request.getJson();

      // First retry: 10ms, second retry: 20ms
      assert.deepEqual(delays, [10, 20], "Should use exponential backoff");
    });

    it("should support rate limit aware delay", async () => {
      FetchMock.mockResponseOnce({
        status: 429,
        statusText: "Too Many Requests",
        body: { message: "Rate limit exceeded" },
      });
      FetchMock.mockResponseOnce({ body: { success: true } });

      const delays: number[] = [];
      const request = create.get("https://api.example.com/data").withRetries({
        attempts: 1,
        delay: ({ attempt, error }) => {
          let delay: number;
          if (error.status === 429) {
            delay = 50; // Wait longer for rate limits
          } else {
            delay = attempt * 10; // Exponential backoff for other errors
          }
          delays.push(delay);
          return delay;
        },
      });

      const startTime = Date.now();
      await request.getJson();
      const duration = Date.now() - startTime;

      assert.deepEqual(delays, [50], "Should use longer delay for rate limits");
      assert(duration >= 50, "Should wait at least 50ms for rate limit");
    });
  });

  describe("withRetries() - common retry patterns", () => {
    it("should support exponential backoff pattern with cap", async () => {
      FetchMock.mockErrorOnce(new Error("Network failure 1"));
      FetchMock.mockErrorOnce(new Error("Network failure 2"));
      FetchMock.mockErrorOnce(new Error("Network failure 3"));
      FetchMock.mockErrorOnce(new Error("Network failure 4"));
      FetchMock.mockErrorOnce(new Error("Network failure 5"));
      FetchMock.mockResponseOnce({ body: { success: true } });

      const delays: number[] = [];
      const request = create.get("https://api.example.com/data").withRetries({
        attempts: 5,
        delay: ({ attempt }) => {
          const delay = Math.min(10 * Math.pow(2, attempt - 1), 100);
          delays.push(delay);
          return delay;
        },
      });

      await request.getJson();

      // First retry: 10ms, second: 20ms, third: 40ms, fourth: 80ms, fifth: 100ms (capped)
      assert.deepEqual(delays, [10, 20, 40, 80, 100], "Should use exponential backoff with cap");
    });

    it("should support linear backoff pattern", async () => {
      FetchMock.mockErrorOnce(new Error("Network failure 1"));
      FetchMock.mockErrorOnce(new Error("Network failure 2"));
      FetchMock.mockResponseOnce({ body: { success: true } });

      const delays: number[] = [];
      const request = create.get("https://api.example.com/data").withRetries({
        attempts: 3,
        delay: ({ attempt }) => {
          const delay = attempt * 10;
          delays.push(delay);
          return delay;
        },
      });

      await request.getJson();

      // First retry: 10ms, second: 20ms
      assert.deepEqual(delays, [10, 20], "Should use linear backoff");
    });

    it("should support rate limit aware pattern with Retry-After header", async () => {
      FetchMock.mockResponseOnce({
        status: 429,
        statusText: "Too Many Requests",
        body: { message: "Rate limit exceeded" },
        headers: {
          "Content-Type": "application/json",
          "Retry-After": "3", // 3 seconds
        },
      });
      FetchMock.mockResponseOnce({ body: { success: true } });

      const delays: number[] = [];
      const request = create.get("https://api.example.com/data").withRetries({
        attempts: 3,
        delay: ({ error }) => {
          let delay: number;
          if (error.status === 429) {
            // Check Retry-After header if available
            const retryAfter = error.response?.headers.get("Retry-After");
            delay = retryAfter ? parseInt(retryAfter) * 10 : 50;
          } else {
            delay = 10; // Default delay
          }
          delays.push(delay);
          return delay;
        },
      });

      const startTime = Date.now();
      await request.getJson();
      const duration = Date.now() - startTime;

      assert.deepEqual(delays, [30], "Should use Retry-After header value");
      assert(duration >= 30, "Should wait at least 30ms from Retry-After header");
    });

    it("should support rate limit aware pattern without Retry-After header (fallback)", async () => {
      FetchMock.mockResponseOnce({
        status: 429,
        statusText: "Too Many Requests",
        body: { message: "Rate limit exceeded" },
        // No Retry-After header
      });
      FetchMock.mockResponseOnce({ body: { success: true } });

      const delays: number[] = [];
      const request = create.get("https://api.example.com/data").withRetries({
        attempts: 3,
        delay: ({ error }) => {
          let delay: number;
          if (error.status === 429) {
            // Check Retry-After header if available
            const retryAfter = error.response?.headers.get("Retry-After");
            delay = retryAfter ? parseInt(retryAfter) * 10 : 50;
          } else {
            delay = 10; // Default delay
          }
          delays.push(delay);
          return delay;
        },
      });

      const startTime = Date.now();
      await request.getJson();
      const duration = Date.now() - startTime;

      assert.deepEqual(delays, [50], "Should use fallback delay when Retry-After header missing");
      assert(duration >= 50, "Should wait at least 50ms (fallback)");
    });

    it("should support error-aware delay pattern", async () => {
      FetchMock.mockResponseOnce({
        status: 429,
        statusText: "Too Many Requests",
        body: { message: "Rate limit exceeded" },
      });
      FetchMock.mockResponseOnce({ body: { success: true } });

      const request = create.get("https://api.example.com/data").withRetries({
        attempts: 3,
        delay: ({ attempt, error }) => {
          if (error.status === 429) {
            return 50; // Wait 50ms for rate limit errors
          }
          return attempt * 10; // Exponential backoff for other errors
        },
      });

      const startTime = Date.now();
      await request.getJson();
      const duration = Date.now() - startTime;

      // Should use 50ms for rate limit error
      assert(duration >= 50, "Should wait 50ms for rate limit error");
    });

    it("should support error-aware delay pattern for non-rate-limit errors", async () => {
      FetchMock.mockResponseOnce({
        status: 500,
        statusText: "Internal Server Error",
        body: { message: "Server error" },
      });
      FetchMock.mockResponseOnce({ body: { success: true } });

      const delays: number[] = [];
      const request = create.get("https://api.example.com/data").withRetries({
        attempts: 3,
        delay: ({ attempt, error }) => {
          if (error.status === 429) {
            return 50; // Wait 50ms for rate limit errors
          }
          const delay = attempt * 10; // Linear backoff for other errors
          delays.push(delay);
          return delay;
        },
      });

      await request.getJson();

      // Should use attempt * 10 for non-rate-limit errors (first retry = 1 * 10 = 10ms)
      assert.deepEqual(delays, [10], "Should calculate delay for non-rate-limit errors");
    });

    it("should support onRetry callback pattern", async () => {
      FetchMock.mockErrorOnce(new Error("Network failure 1"));
      FetchMock.mockResponseOnce({ body: { success: true } });

      const logMessages: string[] = [];
      const request = create
        .get("https://api.example.com/data")
        .withRetries({
          attempts: 3,
          delay: 10,
        })
        .onRetry(({ attempt, error }) => {
          logMessages.push(`Retry ${attempt} after error: ${error.message}`);
        });

      await request.getJson();

      assert.equal(logMessages.length, 1, "Should log retry attempt");
      assert(logMessages[0].includes("Retry 1"), "Should include attempt number");
      assert(logMessages[0].includes("Network failure 1"), "Should include error message");
    });
  });

  describe("withRetries() - config object validation", () => {
    it("should throw error for negative count in config", () => {
      const request = new GetRequest("https://api.example.com/test");
      assert.throws(() => {
        request.withRetries({
          attempts: -1,
          delay: 100,
        });
      }, /Invalid attempts: -1/);
    });

    it("should throw error for non-integer count in config", () => {
      const request = new GetRequest("https://api.example.com/test");
      assert.throws(() => {
        request.withRetries({
          attempts: 1.5,
          delay: 100,
        });
      }, /Invalid attempts: 1.5/);
    });

    it("should accept config without delay", async () => {
      FetchMock.mockErrorOnce(new Error("Network failure 1"));
      FetchMock.mockResponseOnce({ body: { success: true } });

      const startTime = Date.now();
      const request = create.get("https://api.example.com/data").withRetries({
        attempts: 1,
      });

      const result = await request.getJson();
      const duration = Date.now() - startTime;

      assert.deepEqual(result, { success: true });
      // Should complete quickly without delay
      assert(duration < 100, "Should complete without delay when delay not specified");
    });
  });

  describe("withRetries() - combined with onRetry callback", () => {
    it("should call onRetry callback before applying delay", async () => {
      FetchMock.mockErrorOnce(new Error("Network failure 1"));
      FetchMock.mockResponseOnce({ body: { success: true } });

      const callOrder: string[] = [];
      const request = create
        .get("https://api.example.com/data")
        .withRetries({
          attempts: 1,
          delay: () => {
            callOrder.push("delay");
            return 10;
          },
        })
        .onRetry(() => {
          callOrder.push("onRetry");
        });

      await request.getJson();

      // onRetry should be called before delay
      assert.deepEqual(callOrder, ["onRetry", "delay"], "onRetry should be called before delay");
    });

    it("should work with both delay and onRetry callback", async () => {
      FetchMock.mockErrorOnce(new Error("Network failure 1"));
      FetchMock.mockResponseOnce({ body: { success: true } });

      let retryCalled = false;
      const startTime = Date.now();
      const request = create
        .get("https://api.example.com/data")
        .withRetries({
          attempts: 1,
          delay: 10,
        })
        .onRetry(() => {
          retryCalled = true;
        });

      const result = await request.getJson();
      const duration = Date.now() - startTime;

      assert.deepEqual(result, { success: true });
      assert.equal(retryCalled, true, "onRetry callback should be called");
      assert(duration >= 10, "Should have applied delay");
    });
  });

  describe("withRetries() - edge cases", () => {
    it("should handle zero retries with delay", async () => {
      FetchMock.mockErrorOnce(new Error("Network failure 1"));

      const request = create.get("https://api.example.com/data").withRetries({
        attempts: 0,
        delay: 10,
      });

      try {
        await request.getResponse();
        assert.fail("Should have failed");
      } catch (error) {
        assert(error instanceof RequestError);
        // Should fail immediately without retrying
      }
    });

    it("should work correctly when delay function returns zero", async () => {
      FetchMock.mockErrorOnce(new Error("Network failure 1"));
      FetchMock.mockResponseOnce({ body: { success: true } });

      const startTime = Date.now();
      const request = create.get("https://api.example.com/data").withRetries({
        attempts: 1,
        delay: () => 0,
      });

      const result = await request.getJson();
      const duration = Date.now() - startTime;

      assert.deepEqual(result, { success: true });
      // Should complete quickly when delay is zero
      assert(duration < 100, "Should complete quickly with zero delay");
    });
  });
});
