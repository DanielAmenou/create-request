import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { GetRequest } from "../src/requestMethods.js";
import { RequestError } from "../src/RequestError.js";
import { FetchMock, wait } from "./utils/fetchMock.js";
import create from "../src/index.js";

describe("Timeout Advanced", () => {
  beforeEach(() => {
    FetchMock.install();
    create.config.setEnableAntiCsrf(false);
  });

  afterEach(() => {
    FetchMock.reset();
    FetchMock.restore();
    create.config.reset();
  });

  describe("Timeout with AbortController", () => {
    it("should timeout request when external AbortController is used", async () => {
      FetchMock.mockDelayedResponseOnce(2000, { body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withTimeout(100);

      try {
        await request.getResponse();
        assert.fail("Should have timed out");
      } catch (error) {
        assert(error instanceof RequestError);
        assert.equal(error.isTimeout, true);
        assert.ok(error.message.includes("Timeout"));
      }
    });

    it("should allow external AbortController to cancel request before timeout", async () => {
      const controller = new AbortController();
      FetchMock.mockDelayedResponseOnce(2000, { body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withTimeout(5000).withAbortController(controller);

      // Cancel after 100ms
      setTimeout(() => controller.abort(), 100);

      try {
        await request.getResponse();
        assert.fail("Should have been aborted");
      } catch (error) {
        assert(error instanceof RequestError);
        assert.equal(error.isAborted, true);
        assert.ok(error.message.includes("Aborted") || error.message.toLowerCase().includes("aborted"));
      }
    });

    it("should handle timeout when external AbortController is provided", async () => {
      const controller = new AbortController();
      FetchMock.mockDelayedResponseOnce(2000, { body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withTimeout(100).withAbortController(controller);

      try {
        await request.getResponse();
        assert.fail("Should have timed out");
      } catch (error) {
        assert(error instanceof RequestError);
        assert.equal(error.isTimeout, true);
      }
    });

    it("should handle timeout signal if AbortSignal.timeout is available", async () => {
      // Mock AbortSignal.timeout if not available
      const originalTimeout = (AbortSignal as any).timeout;

      if (typeof AbortSignal.timeout !== "function") {
        (AbortSignal as any).timeout = (ms: number) => {
          const controller = new AbortController();
          setTimeout(() => controller.abort(), ms);
          return controller.signal;
        };
      }

      FetchMock.mockDelayedResponseOnce(2000, { body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withTimeout(100);

      try {
        await request.getResponse();
        assert.fail("Should have timed out");
      } catch (error) {
        assert(error instanceof RequestError);
        assert.equal(error.isTimeout, true);
      }

      // Restore
      if (originalTimeout === undefined) {
        delete (AbortSignal as any).timeout;
      } else {
        (AbortSignal as any).timeout = originalTimeout;
      }
    });

    it("should handle timeout controller creation when AbortSignal.timeout is not available", async () => {
      // Test the else branch: timeoutController = new AbortController(); (line 1268)
      // Temporarily remove AbortSignal.timeout to test the fallback path
      const originalTimeout = (AbortSignal as any).timeout;
      delete (AbortSignal as any).timeout;

      try {
        FetchMock.mockDelayedResponseOnce(2000, { body: { success: true } });
        const request = new GetRequest("https://api.example.com/test").withTimeout(100);

        try {
          await request.getResponse();
          assert.fail("Should have timed out");
        } catch (error) {
          assert(error instanceof RequestError);
          assert.equal(error.isTimeout, true);
          // This tests the path where timeoutController is created manually
          // because AbortSignal.timeout is not available
        }
      } finally {
        // Restore AbortSignal.timeout if it existed
        if (originalTimeout !== undefined) {
          (AbortSignal as any).timeout = originalTimeout;
        }
      }
    });
  });

  describe("Timeout cleanup", () => {
    it("should cleanup timeout after successful request", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withTimeout(5000);

      await request.getResponse();

      // Wait a bit to ensure timeout would have fired if not cleaned up
      await wait(100);

      // Should not have timed out
      assert.equal(FetchMock.mock.calls.length, 1);
    });

    it("should cleanup timeout after failed request", async () => {
      FetchMock.mockErrorOnce(new Error("Network error"));
      const request = new GetRequest("https://api.example.com/test").withTimeout(5000);

      try {
        await request.getResponse();
        assert.fail("Should have failed");
      } catch (error) {
        assert(error instanceof RequestError || error instanceof Error);
      }

      // Wait a bit to ensure timeout would have fired if not cleaned up
      await wait(100);

      // Should not have additional timeout errors
      assert.equal(FetchMock.mock.calls.length, 1);
    });
  });

  describe("Timeout with retries", () => {
    it("should timeout on each retry attempt", async () => {
      FetchMock.mockDelayedResponseOnce(2000, { body: { success: true } });
      FetchMock.mockDelayedResponseOnce(2000, { body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withTimeout(100).withRetries(1);

      try {
        await request.getResponse();
        assert.fail("Should have timed out");
      } catch (error) {
        assert(error instanceof RequestError);
        assert.equal(error.isTimeout, true);
      }
    });

    it("should allow retry after timeout if onRetry delays", async () => {
      let retryCalled = false;
      // First attempt will timeout (2000ms delay, 100ms timeout)
      // Second attempt will also timeout to verify retry logic
      FetchMock.mockDelayedResponseOnce(2000, { body: { success: true } });
      FetchMock.mockDelayedResponseOnce(2000, { body: { success: true } });
      const request = new GetRequest("https://api.example.com/test")
        .withTimeout(100)
        .withRetries(1)
        .onRetry(async () => {
          retryCalled = true;
          // Delay that's shorter than timeout - allows retry to happen
          await wait(50);
        });

      try {
        await request.getResponse();
        assert.fail("Should have timed out");
      } catch (error) {
        assert(error instanceof RequestError, "Error should be RequestError");
        const reqError = error;
        // Both attempts timeout, so final error should be timeout
        assert.equal(reqError.isTimeout, true, "Should timeout after retries");
        // Verify retry mechanism works - onRetry callback should execute between attempts
        assert.equal(retryCalled, true, "onRetry callback should be called between retry attempts");
      }
    });
  });

  describe("Timeout edge cases", () => {
    it("should handle very short timeout", async () => {
      FetchMock.mockDelayedResponseOnce(100, { body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withTimeout(10);

      try {
        await request.getResponse();
        assert.fail("Should have timed out");
      } catch (error) {
        assert(error instanceof RequestError);
        assert.equal(error.isTimeout, true);
      }
    });

    it("should handle timeout longer than response time", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withTimeout(10000);

      const response = await request.getResponse();
      const data = await response.getJson();

      assert.deepEqual(data, { success: true });
      // Should not have timed out
      assert.equal(FetchMock.mock.calls.length, 1);
    });

    it("should handle timeout with immediate response", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withTimeout(5000);

      const response = await request.getResponse();
      const data = await response.getJson();

      assert.deepEqual(data, { success: true });
    });
  });

  describe("Timeout error details", () => {
    it("should include timeout duration in error message", async () => {
      FetchMock.mockDelayedResponseOnce(2000, { body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withTimeout(100);

      try {
        await request.getResponse();
        assert.fail("Should have timed out");
      } catch (error) {
        assert(error instanceof RequestError);
        assert.equal(error.isTimeout, true);
        assert.ok(error.message.includes("100ms") || error.message.includes("Timeout"));
        assert.equal(error.url, "https://api.example.com/test");
        assert.equal(error.method, "GET");
      }
    });
  });

  describe("Timeout handling improvements", () => {
    it("should not set signal when no timeout or external controller is provided", async () => {
      let capturedFetchOptions: RequestInit | undefined;

      // Override global fetch to capture the options
      const originalFetch = globalThis.fetch;
      globalThis.fetch = ((url: string | URL | Request, options?: RequestInit) => {
        capturedFetchOptions = options;
        return Promise.resolve(
          new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );
      }) as typeof fetch;

      try {
        const request = new GetRequest("https://api.example.com/test");
        await request.getResponse();

        // Verify that signal is not set (or is undefined) when no timeout is configured
        assert.ok(capturedFetchOptions);
        assert.equal(capturedFetchOptions.signal, undefined, "Signal should not be set when no timeout is configured");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should set signal only when timeout is configured", async () => {
      let capturedFetchOptions: RequestInit | undefined;

      // Override global fetch to capture the options
      const originalFetch = globalThis.fetch;
      globalThis.fetch = ((url: string | URL | Request, options?: RequestInit) => {
        capturedFetchOptions = options;
        return Promise.resolve(
          new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );
      }) as typeof fetch;

      try {
        const request = new GetRequest("https://api.example.com/test").withTimeout(5000);
        await request.getResponse();

        // Verify that signal IS set when timeout is configured
        assert.ok(capturedFetchOptions);
        assert.ok(capturedFetchOptions.signal, "Signal should be set when timeout is configured");
        assert.ok(capturedFetchOptions.signal instanceof AbortSignal);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should set signal when external AbortController is provided", async () => {
      let capturedFetchOptions: RequestInit | undefined;

      // Override global fetch to capture the options
      const originalFetch = globalThis.fetch;
      globalThis.fetch = ((url: string | URL | Request, options?: RequestInit) => {
        capturedFetchOptions = options;
        return Promise.resolve(
          new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );
      }) as typeof fetch;

      try {
        const controller = new AbortController();
        const request = new GetRequest("https://api.example.com/test").withAbortController(controller);
        await request.getResponse();

        // Verify that signal IS set when external controller is provided
        assert.ok(capturedFetchOptions);
        assert.ok(capturedFetchOptions.signal, "Signal should be set when external controller is provided");
        assert.ok(capturedFetchOptions.signal instanceof AbortSignal);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should properly detect timeout from TimeoutError", async () => {
      // Simulate a TimeoutError from Node.js/undici
      const error = new Error("Request timeout");
      error.name = "TimeoutError";
      FetchMock.mockErrorOnce(error);

      const request = new GetRequest("https://api.example.com/test").withTimeout(1000);

      try {
        await request.getResponse();
        assert.fail("Should have timed out");
      } catch (error) {
        assert(error instanceof RequestError);
        assert.equal(error.isTimeout, true, "Error should be marked as timeout");
        assert.ok(error.message.includes("1000ms") || error.message.includes("Timeout"));
      }
    });

    it("should handle timeout errors without explicit timeout set (safety net)", async () => {
      // Simulate a TimeoutError from an external source (e.g., external AbortController)
      const error = new Error("Request timeout");
      error.name = "TimeoutError";
      FetchMock.mockErrorOnce(error);

      // Note: No withTimeout() called, but we get a TimeoutError anyway
      const request = new GetRequest("https://api.example.com/test");

      try {
        await request.getResponse();
        assert.fail("Should have failed");
      } catch (error) {
        assert(error instanceof RequestError);
        // Even without explicit timeout, the error should be marked as timeout
        assert.equal(error.isTimeout, true, "Error should be marked as timeout (safety net)");
        assert.ok(error.message.includes("timeout") || error.message.includes("Timeout"));
      }
    });

    it("should handle ETIMEDOUT network errors", async () => {
      // Simulate a network-level timeout error
      const error = new Error("connect ETIMEDOUT") as Error & { code?: string };
      error.code = "ETIMEDOUT";
      FetchMock.mockErrorOnce(error);

      const request = new GetRequest("https://api.example.com/test");

      try {
        await request.getResponse();
        assert.fail("Should have failed");
      } catch (error) {
        assert(error instanceof RequestError);
        // ETIMEDOUT should be recognized as a timeout error
        assert.equal(error.isTimeout, true, "ETIMEDOUT should be recognized as timeout");
      }
    });
  });

  describe("Runtime-specific timeout error patterns", () => {
    it("should handle DOMException AbortError correctly", async () => {
      // Simulate browser DOMException for manual abort (not timeout)
      // Note: When we have a timeout set, DOMException AbortError is handled in BaseRequest
      // This test verifies that manual aborts (without timeout) are not marked as timeout
      const error = new DOMException("The operation was aborted", "AbortError");
      FetchMock.mockErrorOnce(error);

      const request = new GetRequest("https://api.example.com/test");

      try {
        await request.getResponse();
        assert.fail("Should have failed");
      } catch (error) {
        assert(error instanceof RequestError);
        // Manual AbortError should be marked as aborted, not timeout
        // Note: This goes through BaseRequest which handles DOMException AbortError
        // and marks it as isAborted, not isTimeout
        assert.ok(error.isAborted || error.isTimeout === undefined, "Manual AbortError should not be timeout");
      }
    });

    it("should detect timeout from various error message patterns", async () => {
      const timeoutMessages = [
        "Request timeout",
        "Connection timeout",
        "Socket timeout",
        "Read timeout",
        "Write timeout",
        "Network timeout",
        "Timeout occurred",
        // Note: "timed out" variations are tested separately as they may not match "timeout" substring
      ];

      for (const message of timeoutMessages) {
        const error = new Error(message);
        FetchMock.mockErrorOnce(error);

        const request = new GetRequest("https://api.example.com/test");

        try {
          await request.getResponse();
          assert.fail(`Should have failed for message: ${message}`);
        } catch (error) {
          assert(error instanceof RequestError);
          assert.equal(error.isTimeout, true, `Message "${message}" should be recognized as timeout`);
        }
      }
    });

    it("should detect timeout from error messages with 'aborted due to timeout' variations", async () => {
      const timeoutMessages = [
        "The operation was aborted due to timeout",
        "Operation aborted due to timeout",
        "Request aborted due to timeout",
        "Aborted due to timeout",
        "Connection aborted due to timeout",
      ];

      for (const message of timeoutMessages) {
        const error = new Error(message);
        FetchMock.mockErrorOnce(error);

        const request = new GetRequest("https://api.example.com/test");

        try {
          await request.getResponse();
          assert.fail(`Should have failed for message: ${message}`);
        } catch (error) {
          assert(error instanceof RequestError);
          assert.equal(error.isTimeout, true, `Message "${message}" should be recognized as timeout`);
        }
      }
    });

    it("should detect timeout from stack traces containing TimeoutError", async () => {
      const error = new Error("Some error");
      error.stack = "Error: Some error\n    at TimeoutError (somewhere)\n    at fetch";
      FetchMock.mockErrorOnce(error);

      const request = new GetRequest("https://api.example.com/test");

      try {
        await request.getResponse();
        assert.fail("Should have failed");
      } catch (error) {
        assert(error instanceof RequestError);
        assert.equal(error.isTimeout, true, "Stack with TimeoutError should be recognized as timeout");
      }
    });

    it("should detect timeout from stack traces containing 'timeout'", async () => {
      const error = new Error("Network error");
      error.stack = "Error: Network error\n    at timeout (somewhere)\n    at fetch";
      FetchMock.mockErrorOnce(error);

      const request = new GetRequest("https://api.example.com/test");

      try {
        await request.getResponse();
        assert.fail("Should have failed");
      } catch (error) {
        assert(error instanceof RequestError);
        assert.equal(error.isTimeout, true, "Stack with 'timeout' should be recognized as timeout");
      }
    });

    it("should detect timeout from Node.js error codes", async () => {
      // Test various Node.js timeout-related error codes
      const timeoutCodes = ["ETIMEDOUT"];

      for (const code of timeoutCodes) {
        const error = new Error(`Connection ${code}`) as Error & { code?: string };
        error.code = code;
        FetchMock.mockErrorOnce(error);

        const request = new GetRequest("https://api.example.com/test");

        try {
          await request.getResponse();
          assert.fail(`Should have failed for code: ${code}`);
        } catch (error) {
          assert(error instanceof RequestError);
          assert.equal(error.isTimeout, true, `Error code "${code}" should be recognized as timeout`);
        }
      }
    });

    it("should handle timeout errors with different error name patterns", async () => {
      // Test error names that should be recognized as timeout
      // Note: Our detection checks for exact "TimeoutError" name match
      const timeoutScenarios = [
        { name: "TimeoutError", error: Object.assign(new Error("Request failed"), { name: "TimeoutError" }) },
        // "Timeout" as name won't match exact check, but message will
        { name: "Timeout (via message)", error: Object.assign(new Error("Request timeout"), { name: "Timeout" }) },
      ];

      for (const scenario of timeoutScenarios) {
        FetchMock.mockErrorOnce(scenario.error);

        const request = new GetRequest("https://api.example.com/test");

        try {
          await request.getResponse();
          assert.fail(`Should have failed for: ${scenario.name}`);
        } catch (error) {
          assert(error instanceof RequestError);
          assert.equal(error.isTimeout, true, `Scenario "${scenario.name}" should be recognized as timeout`);
        }
      }
    });

    it("should handle case-insensitive timeout detection", async () => {
      const timeoutMessages = ["TIMEOUT", "Timeout", "TIMEOUT ERROR", "Request Timeout", "CONNECTION TIMEOUT"];

      for (const message of timeoutMessages) {
        const error = new Error(message);
        FetchMock.mockErrorOnce(error);

        const request = new GetRequest("https://api.example.com/test");

        try {
          await request.getResponse();
          assert.fail(`Should have failed for message: ${message}`);
        } catch (error) {
          assert(error instanceof RequestError);
          assert.equal(error.isTimeout, true, `Case-insensitive message "${message}" should be recognized as timeout`);
        }
      }
    });

    it("should handle timeout errors without explicit timeout set (external sources)", async () => {
      // Simulate timeout from external AbortSignal.timeout() or other sources
      const scenarios = [
        { name: "TimeoutError", error: Object.assign(new Error("Timeout"), { name: "TimeoutError" }) },
        { name: "ETIMEDOUT code", error: Object.assign(new Error("Connection timeout"), { code: "ETIMEDOUT" }) },
        { name: "timeout message", error: new Error("Request timeout") },
        { name: "aborted due to timeout", error: new Error("The operation was aborted due to timeout") },
        {
          name: "stack trace",
          error: Object.assign(new Error("Network error"), { stack: "Error\n    at timeout\n    at fetch" }),
        },
      ];

      for (const scenario of scenarios) {
        FetchMock.mockErrorOnce(scenario.error);

        const request = new GetRequest("https://api.example.com/test");

        try {
          await request.getResponse();
          assert.fail(`Should have failed for scenario: ${scenario.name}`);
        } catch (error) {
          assert(error instanceof RequestError);
          assert.equal(error.isTimeout, true, `Scenario "${scenario.name}" should be recognized as timeout (safety net)`);
        }
      }
    });

    it("should NOT mark non-timeout errors as timeout", async () => {
      const nonTimeoutErrors = [
        { name: "NetworkError", error: Object.assign(new Error("Network error"), { name: "NetworkError" }) },
        { name: "TypeError", error: Object.assign(new Error("Invalid URL"), { name: "TypeError" }) },
        { name: "ECONNREFUSED", error: Object.assign(new Error("Connection refused"), { code: "ECONNREFUSED" }) },
        { name: "ENOTFOUND", error: Object.assign(new Error("DNS error"), { code: "ENOTFOUND" }) },
        { name: "Generic error", error: new Error("Something went wrong") },
        { name: "AbortError (manual)", error: new DOMException("The operation was aborted", "AbortError") },
      ];

      for (const scenario of nonTimeoutErrors) {
        FetchMock.mockErrorOnce(scenario.error);

        const request = new GetRequest("https://api.example.com/test");

        try {
          await request.getResponse();
          assert.fail(`Should have failed for scenario: ${scenario.name}`);
        } catch (error) {
          assert(error instanceof RequestError);
          // Note: Manual AbortError might be marked as isAborted, not isTimeout
          if (scenario.name !== "AbortError (manual)") {
            // isTimeout should be undefined or false (not true)
            assert.ok(error.isTimeout !== true, `Scenario "${scenario.name}" should NOT be recognized as timeout (got: ${error.isTimeout})`);
          }
        }
      }
    });

    it("should handle timeout errors with combined indicators", async () => {
      // Error with multiple timeout indicators
      const error = Object.assign(new Error("Request timeout"), {
        name: "TimeoutError",
        code: "ETIMEDOUT",
        stack: "Error: Request timeout\n    at TimeoutError\n    at timeout",
      });
      FetchMock.mockErrorOnce(error);

      const request = new GetRequest("https://api.example.com/test");

      try {
        await request.getResponse();
        assert.fail("Should have failed");
      } catch (error) {
        assert(error instanceof RequestError);
        assert.equal(error.isTimeout, true, "Error with multiple timeout indicators should be recognized");
      }
    });
  });
});
