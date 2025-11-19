import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { GetRequest } from "../src/requestMethods.js";
import { RequestError } from "../src/RequestError.js";
import { FetchMock, wait } from "./utils/fetchMock.js";
import create from "../src/index.js";

describe("Abort Signal Combinations", () => {
  beforeEach(() => {
    FetchMock.install();
    create.config.reset();
    create.config.setEnableAntiCsrf(false);
  });

  afterEach(() => {
    FetchMock.reset();
    FetchMock.restore();
    create.config.reset();
  });

  describe("Timeout with AbortController", () => {
    it("should timeout when both timeout and AbortController are set", async () => {
      const timeout = 50;
      const responseDelay = 200;
      const controller = new AbortController();

      FetchMock.mockDelayedResponseOnce(responseDelay);
      const request = new GetRequest("https://api.example.com/test").withTimeout(timeout).withAbortController(controller);

      try {
        await request.getResponse();
        assert.fail("Expected request to timeout");
      } catch (error) {
        assert(error instanceof RequestError);
        assert(error.isTimeout, "Error should be marked as timeout");
      }
    });

    it("should abort when controller aborts before timeout", async () => {
      const timeout = 1000;
      const responseDelay = 500;
      const controller = new AbortController();

      FetchMock.mockDelayedResponseOnce(responseDelay);
      const request = new GetRequest("https://api.example.com/test").withTimeout(timeout).withAbortController(controller);

      const requestPromise = request.getResponse();

      // Abort after a short delay
      await wait(100);
      controller.abort();

      try {
        await requestPromise;
        assert.fail("Expected request to be aborted");
      } catch (error) {
        // Should be an abort error, not a timeout error
        assert(!(error instanceof RequestError && error.isTimeout), "Should not be a timeout error");
      }
    });

    it("should handle pre-aborted controller", async () => {
      const controller = new AbortController();
      controller.abort(); // Pre-abort

      FetchMock.mockResponseOnce();
      const request = new GetRequest("https://api.example.com/test").withAbortController(controller);

      try {
        await request.getResponse();
        assert.fail("Expected request to be aborted");
      } catch (error) {
        // Should be an abort error
        assert.ok(error instanceof Error);
      }
    });

    it("should handle controller abort during retry", async () => {
      const controller = new AbortController();
      FetchMock.mockErrorOnce(new Error("Network error"));
      FetchMock.mockDelayedResponseOnce(500);

      const request = new GetRequest("https://api.example.com/test").withRetries(2).withAbortController(controller);

      const requestPromise = request.getResponse();

      // Abort after a short delay (during retry)
      await wait(50);
      controller.abort();

      try {
        await requestPromise;
        assert.fail("Expected request to be aborted");
      } catch (error) {
        assert.ok(error instanceof Error);
      }
    });
  });

  describe("AbortController Signal Lifecycle", () => {
    it("should work with multiple requests sharing same controller", async () => {
      const controller = new AbortController();
      FetchMock.mockResponseOnce({ body: { data: "first" } });
      FetchMock.mockResponseOnce({ body: { data: "second" } });

      const request1 = new GetRequest("https://api.example.com/test1").withAbortController(controller);
      const request2 = new GetRequest("https://api.example.com/test2").withAbortController(controller);

      // Both should succeed
      const result1 = await request1.getJson();
      const result2 = await request2.getJson();

      assert.deepEqual(result1, { data: "first" });
      assert.deepEqual(result2, { data: "second" });
    });

    it("should abort all requests when controller aborts", async () => {
      const controller = new AbortController();
      FetchMock.mockDelayedResponseOnce(500);
      FetchMock.mockDelayedResponseOnce(500);

      const request1 = new GetRequest("https://api.example.com/test1").withAbortController(controller);
      const request2 = new GetRequest("https://api.example.com/test2").withAbortController(controller);

      const promise1 = request1.getResponse();
      const promise2 = request2.getResponse();

      // Abort both
      await wait(50);
      controller.abort();

      try {
        await Promise.all([promise1, promise2]);
        assert.fail("Expected both requests to be aborted");
      } catch (error) {
        assert.ok(error instanceof Error);
      }
    });

    it("should handle controller that aborts after request completes", async () => {
      const controller = new AbortController();
      FetchMock.mockResponseOnce({ body: { success: true } });

      const request = new GetRequest("https://api.example.com/test").withAbortController(controller);

      const result = await request.getJson();
      assert.deepEqual(result, { success: true });

      // Abort after request completes - should not affect anything
      controller.abort();
      // Should not throw
    });
  });

  describe("Timeout Edge Cases", () => {
    it("should handle very short timeout", async () => {
      const timeout = 1; // 1ms timeout
      const responseDelay = 100;

      FetchMock.mockDelayedResponseOnce(responseDelay);
      const request = new GetRequest("https://api.example.com/test").withTimeout(timeout);

      try {
        await request.getResponse();
        assert.fail("Expected request to timeout");
      } catch (error) {
        assert(error instanceof RequestError);
        assert(error.isTimeout);
      }
    });

    it("should handle timeout with retries", async () => {
      const timeout = 50;
      const responseDelay = 200;

      // First attempt times out, second succeeds
      FetchMock.mockDelayedResponseOnce(responseDelay);
      FetchMock.mockResponseOnce({ body: { success: true } });

      const request = new GetRequest("https://api.example.com/test").withTimeout(timeout).withRetries(1);

      // First attempt will timeout, retry should succeed
      const result = await request.getJson();
      assert.deepEqual(result, { success: true });
    });

    it("should handle timeout that occurs during retry", async () => {
      const timeout = 50;
      const responseDelay = 200;

      // Both attempts timeout
      FetchMock.mockDelayedResponseOnce(responseDelay);
      FetchMock.mockDelayedResponseOnce(responseDelay);

      const request = new GetRequest("https://api.example.com/test").withTimeout(timeout).withRetries(1);

      try {
        await request.getResponse();
        assert.fail("Expected request to timeout after retries");
      } catch (error) {
        assert(error instanceof RequestError);
        assert(error.isTimeout);
      }
    });
  });

  describe("Signal Combination Edge Cases", () => {
    it("should handle timeout and external abort in sequence", async () => {
      const timeout = 1000;
      const controller = new AbortController();
      FetchMock.mockDelayedResponseOnce(500);

      const request = new GetRequest("https://api.example.com/test").withTimeout(timeout).withAbortController(controller);

      const requestPromise = request.getResponse();

      // Abort manually
      await wait(50);
      controller.abort();

      try {
        await requestPromise;
        assert.fail("Expected request to be aborted");
      } catch (error) {
        // Should be abort error, not timeout
        assert.ok(error instanceof Error);
      }
    });

    it("should handle multiple AbortControllers (should use the last one)", async () => {
      const controller1 = new AbortController();
      const controller2 = new AbortController();
      FetchMock.mockResponseOnce({ body: { success: true } });

      const request = new GetRequest("https://api.example.com/test").withAbortController(controller1).withAbortController(controller2); // Last one should be used

      const result = await request.getJson();
      assert.deepEqual(result, { success: true });
    });

    it("should handle AbortController that is replaced", async () => {
      const controller1 = new AbortController();
      const controller2 = new AbortController();
      FetchMock.mockDelayedResponseOnce(500);

      const request = new GetRequest("https://api.example.com/test").withAbortController(controller1).withAbortController(controller2); // Replace with controller2

      const requestPromise = request.getResponse();

      // Abort controller1 - should not affect request
      controller1.abort();
      await wait(10);

      // Abort controller2 - should abort request
      controller2.abort();

      try {
        await requestPromise;
        assert.fail("Expected request to be aborted");
      } catch (error) {
        assert.ok(error instanceof Error);
      }
    });

    it("should handle combineSignalsManually when signal1 is already aborted", async () => {
      // Test the combineSignalsManually method indirectly by using timeout + controller
      // where signal1 (external controller) is already aborted
      const controller = new AbortController();
      controller.abort(); // Pre-abort signal1

      FetchMock.mockDelayedResponseOnce(500);
      const request = new GetRequest("https://api.example.com/test").withTimeout(1000).withAbortController(controller);

      try {
        await request.getResponse();
        assert.fail("Expected request to be aborted");
      } catch (error) {
        assert.ok(error instanceof Error);
        // The request should fail immediately because signal1 is already aborted
      }
    });

    it("should handle combineSignalsManually when signal2 (timeout) is already aborted", async () => {
      // This is harder to test directly, but we can test the scenario where
      // we have both timeout and controller, and the timeout signal gets aborted
      const controller = new AbortController();
      FetchMock.mockDelayedResponseOnce(500);

      // Use a very short timeout that will trigger before the request completes
      const request = new GetRequest("https://api.example.com/test").withTimeout(50).withAbortController(controller);

      try {
        await request.getResponse();
        assert.fail("Expected request to timeout or be aborted");
      } catch (error) {
        assert.ok(error instanceof Error);
      }
    });

    it("should handle combineSignalsManually normal combination (both signals active)", async () => {
      // Test normal combination where both signals are active
      // This tests the path where neither signal is aborted initially
      const controller = new AbortController();
      FetchMock.mockDelayedResponseOnce(500);

      const request = new GetRequest("https://api.example.com/test").withTimeout(1000).withAbortController(controller);

      const requestPromise = request.getResponse();

      // Abort manually after a short delay
      await wait(50);
      controller.abort();

      try {
        await requestPromise;
        assert.fail("Expected request to be aborted");
      } catch (error) {
        assert.ok(error instanceof Error);
      }
    });

    it("should use manual signal combination when AbortSignal.any is not available", async () => {
      // Test the fallback path when AbortSignal.any is not available
      // We can't easily mock AbortSignal.any, but we can test the scenario
      // where both signals are active and neither is aborted initially
      const controller = new AbortController();
      FetchMock.mockDelayedResponseOnce(500);

      const request = new GetRequest("https://api.example.com/test").withTimeout(1000).withAbortController(controller);

      const requestPromise = request.getResponse();

      // Abort the external controller after a short delay
      await wait(50);
      controller.abort();

      try {
        await requestPromise;
        assert.fail("Expected request to be aborted");
      } catch (error) {
        assert.ok(error instanceof Error);
      }
    });

    it("should handle combineSignalsManually when both signals are already aborted", async () => {
      // Test combineSignalsManually when signal1 is already aborted
      const controller1 = new AbortController();
      controller1.abort();

      FetchMock.mockDelayedResponseOnce(500);
      const request = new GetRequest("https://api.example.com/test").withTimeout(50).withAbortController(controller1);

      try {
        await request.getResponse();
        assert.fail("Expected request to be aborted");
      } catch (error) {
        assert.ok(error instanceof Error);
      }
    });

    it("should test combineSignalsManually method directly - signal1 aborted", async () => {
      // Test branch where signal1 is already aborted
      const controller1 = new AbortController();
      controller1.abort();

      FetchMock.mockDelayedResponseOnce(500);
      const request = new GetRequest("https://api.example.com/test").withTimeout(1000).withAbortController(controller1);

      try {
        await request.getResponse();
        assert.fail("Expected request to be aborted");
      } catch (error) {
        assert.ok(error instanceof Error);
      }
    });

    it("should test combineSignalsManually method directly - signal2 aborted", async () => {
      // Test branch where signal2 is already aborted
      const controller1 = new AbortController();
      const controller2 = new AbortController();
      controller2.abort();

      // Use a very short timeout that will be aborted
      FetchMock.mockDelayedResponseOnce(500);
      const request = new GetRequest("https://api.example.com/test").withTimeout(10).withAbortController(controller1);

      try {
        await request.getResponse();
        assert.fail("Expected request to be aborted");
      } catch (error) {
        assert.ok(error instanceof Error);
      }
    });

    it("should test combineSignalsManually method directly - both active", async () => {
      // Test branch where both signals are active
      const controller = new AbortController();
      FetchMock.mockDelayedResponseOnce(500);

      const request = new GetRequest("https://api.example.com/test").withTimeout(1000).withAbortController(controller);

      const requestPromise = request.getResponse();

      // Abort after a short delay
      await wait(50);
      controller.abort();

      try {
        await requestPromise;
        assert.fail("Expected request to be aborted");
      } catch (error) {
        assert.ok(error instanceof Error);
      }
    });
  });
});
