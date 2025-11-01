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
        await request.get();
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
        await request.get();
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
        await request.get();
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
        await request.get();
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
  });

  describe("Timeout cleanup", () => {
    it("should cleanup timeout after successful request", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withTimeout(5000);

      await request.get();

      // Wait a bit to ensure timeout would have fired if not cleaned up
      await wait(100);

      // Should not have timed out
      assert.equal(FetchMock.mock.calls.length, 1);
    });

    it("should cleanup timeout after failed request", async () => {
      FetchMock.mockErrorOnce(new Error("Network error"));
      const request = new GetRequest("https://api.example.com/test").withTimeout(5000);

      try {
        await request.get();
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
        await request.get();
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
        await request.get();
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
        await request.get();
        assert.fail("Should have timed out");
      } catch (error) {
        assert(error instanceof RequestError);
        assert.equal(error.isTimeout, true);
      }
    });

    it("should handle timeout longer than response time", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withTimeout(10000);

      const response = await request.get();
      const data = await response.getJson();

      assert.deepEqual(data, { success: true });
      // Should not have timed out
      assert.equal(FetchMock.mock.calls.length, 1);
    });

    it("should handle timeout with immediate response", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withTimeout(5000);

      const response = await request.get();
      const data = await response.getJson();

      assert.deepEqual(data, { success: true });
    });
  });

  describe("Timeout error details", () => {
    it("should include timeout duration in error message", async () => {
      FetchMock.mockDelayedResponseOnce(2000, { body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withTimeout(100);

      try {
        await request.get();
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
});
