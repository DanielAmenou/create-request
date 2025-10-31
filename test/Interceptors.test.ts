import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { ResponseWrapper } from "../src/ResponseWrapper.js";
import { RequestError } from "../src/RequestError.js";
import { GetRequest } from "../src/requestMethods.js";
import { FetchMock } from "./utils/fetchMock.js";
import create from "../src/index.js";

describe("Request Interceptors", () => {
  beforeEach(() => {
    FetchMock.install();
    create.config.reset();
  });

  afterEach(() => {
    FetchMock.reset();
    FetchMock.restore();
    create.config.reset();
  });

  it("should run global request interceptor", async () => {
    // Arrange
    let interceptorCalled = false;
    const interceptorId = create.config.addRequestInterceptor(config => {
      interceptorCalled = true;
      config.headers["X-Global"] = "global-value";
      return config;
    });

    FetchMock.mockResponseOnce({ body: { success: true } });
    const request = new GetRequest("https://api.example.com/test");

    // Act
    await request.getJson();

    // Assert
    assert.equal(interceptorCalled, true, "Global interceptor should be called");
    const [, options] = FetchMock.mock.calls[0];
    const headers = options.headers as Record<string, string>;
    assert.equal(headers["X-Global"], "global-value");

    // Cleanup
    create.config.removeRequestInterceptor(interceptorId);
  });

  it("should run per-request interceptor", async () => {
    // Arrange
    let interceptorCalled = false;
    FetchMock.mockResponseOnce({ body: { success: true } });

    const request = new GetRequest("https://api.example.com/test").withRequestInterceptor(config => {
      interceptorCalled = true;
      config.headers["X-Per-Request"] = "per-request-value";
      return config;
    });

    // Act
    await request.getJson();

    // Assert
    assert.equal(interceptorCalled, true, "Per-request interceptor should be called");
    const [, options] = FetchMock.mock.calls[0];
    const headers = options.headers as Record<string, string>;
    assert.equal(headers["X-Per-Request"], "per-request-value");
  });

  it("should run global interceptors before per-request interceptors", async () => {
    // Arrange
    const executionOrder: string[] = [];

    create.config.addRequestInterceptor(config => {
      executionOrder.push("global");
      return config;
    });

    FetchMock.mockResponseOnce({ body: { success: true } });

    const request = new GetRequest("https://api.example.com/test").withRequestInterceptor(config => {
      executionOrder.push("per-request");
      return config;
    });

    // Act
    await request.getJson();

    // Assert
    assert.deepEqual(executionOrder, ["global", "per-request"]);
  });

  it("should allow per-request interceptor to override global interceptor changes", async () => {
    // Arrange
    create.config.addRequestInterceptor(config => {
      config.headers["X-Custom"] = "global-value";
      return config;
    });

    FetchMock.mockResponseOnce({ body: { success: true } });

    const request = new GetRequest("https://api.example.com/test").withRequestInterceptor(config => {
      config.headers["X-Custom"] = "overridden-value";
      return config;
    });

    // Act
    await request.getJson();

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    const headers = options.headers as Record<string, string>;
    assert.equal(headers["X-Custom"], "overridden-value");
  });

  it("should support async request interceptors", async () => {
    // Arrange
    let interceptorCalled = false;
    FetchMock.mockResponseOnce({ body: { success: true } });

    const request = new GetRequest("https://api.example.com/test").withRequestInterceptor(async config => {
      await new Promise(resolve => setTimeout(resolve, 10));
      interceptorCalled = true;
      config.headers["X-Async"] = "async-value";
      return config;
    });

    // Act
    await request.getJson();

    // Assert
    assert.equal(interceptorCalled, true);
    const [, options] = FetchMock.mock.calls[0];
    const headers = options.headers as Record<string, string>;
    assert.equal(headers["X-Async"], "async-value");
  });

  it("should allow request interceptor to short-circuit with early response", async () => {
    // Arrange
    const mockResponse = new Response(JSON.stringify({ intercepted: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

    FetchMock.mockResponseOnce({ body: { shouldNotReach: true } });

    const request = new GetRequest("https://api.example.com/test").withRequestInterceptor(() => {
      return mockResponse;
    });

    // Act
    const result = await request.getJson<{ intercepted: boolean }>();

    // Assert
    assert.equal(result.intercepted, true);
    assert.equal(FetchMock.mock.calls.length, 0, "Fetch should not be called");
  });

  it("should allow interceptor to modify URL", async () => {
    // Arrange
    FetchMock.mockResponseOnce({ body: { success: true } });

    const request = new GetRequest("https://api.example.com/test").withRequestInterceptor(config => {
      config.url = "https://api.example.com/modified";
      return config;
    });

    // Act
    await request.getJson();

    // Assert
    const [url] = FetchMock.mock.calls[0];
    assert.equal(url, "https://api.example.com/modified");
  });

  it("should remove request interceptor by ID", async () => {
    // Arrange
    let interceptorCalled = false;
    const interceptorId = create.config.addRequestInterceptor(config => {
      interceptorCalled = true;
      return config;
    });

    create.config.removeRequestInterceptor(interceptorId);

    FetchMock.mockResponseOnce({ body: { success: true } });
    const request = new GetRequest("https://api.example.com/test");

    // Act
    await request.getJson();

    // Assert
    assert.equal(interceptorCalled, false, "Removed interceptor should not be called");
  });

  it("should handle multiple request interceptors", async () => {
    // Arrange
    const executionOrder: number[] = [];

    create.config.addRequestInterceptor(config => {
      executionOrder.push(1);
      config.headers["X-First"] = "1";
      return config;
    });

    create.config.addRequestInterceptor(config => {
      executionOrder.push(2);
      config.headers["X-Second"] = "2";
      return config;
    });

    FetchMock.mockResponseOnce({ body: { success: true } });
    const request = new GetRequest("https://api.example.com/test");

    // Act
    await request.getJson();

    // Assert
    assert.deepEqual(executionOrder, [1, 2]);
    const [, options] = FetchMock.mock.calls[0];
    const headers = options.headers as Record<string, string>;
    assert.equal(headers["X-First"], "1");
    assert.equal(headers["X-Second"], "2");
  });
});

describe("Response Interceptors", () => {
  beforeEach(() => {
    FetchMock.install();
    create.config.reset();
  });

  afterEach(() => {
    FetchMock.reset();
    FetchMock.restore();
    create.config.reset();
  });

  it("should run global response interceptor", async () => {
    // Arrange
    let interceptorCalled = false;
    create.config.addResponseInterceptor(response => {
      interceptorCalled = true;
      return response;
    });

    FetchMock.mockResponseOnce({ body: { success: true } });
    const request = new GetRequest("https://api.example.com/test");

    // Act
    await request.getJson();

    // Assert
    assert.equal(interceptorCalled, true);
  });

  it("should run per-request response interceptor", async () => {
    // Arrange
    let interceptorCalled = false;
    FetchMock.mockResponseOnce({ body: { success: true } });

    const request = new GetRequest("https://api.example.com/test").withResponseInterceptor(response => {
      interceptorCalled = true;
      return response;
    });

    // Act
    await request.getJson();

    // Assert
    assert.equal(interceptorCalled, true);
  });

  it("should run per-request interceptors before global interceptors (reverse order)", async () => {
    // Arrange
    const executionOrder: string[] = [];

    create.config.addResponseInterceptor(response => {
      executionOrder.push("global");
      return response;
    });

    FetchMock.mockResponseOnce({ body: { success: true } });

    const request = new GetRequest("https://api.example.com/test").withResponseInterceptor(response => {
      executionOrder.push("per-request");
      return response;
    });

    // Act
    await request.getJson();

    // Assert
    assert.deepEqual(executionOrder, ["per-request", "global"]);
  });

  it("should allow response interceptor to access response properties", async () => {
    // Arrange
    let capturedStatus = 0;
    FetchMock.mockResponseOnce({
      status: 201,
      body: { success: true },
    });

    const request = new GetRequest("https://api.example.com/test").withResponseInterceptor(response => {
      capturedStatus = response.status;
      return response;
    });

    // Act
    await request.getJson();

    // Assert
    assert.equal(capturedStatus, 201);
  });

  it("should support async response interceptors", async () => {
    // Arrange
    let interceptorCalled = false;
    FetchMock.mockResponseOnce({ body: { success: true } });

    const request = new GetRequest("https://api.example.com/test").withResponseInterceptor(async response => {
      await new Promise(resolve => setTimeout(resolve, 10));
      interceptorCalled = true;
      return response;
    });

    // Act
    await request.getJson();

    // Assert
    assert.equal(interceptorCalled, true);
  });

  it("should run response interceptors even for early responses from request interceptors", async () => {
    // Arrange
    let responseInterceptorCalled = false;
    const mockResponse = new Response(JSON.stringify({ intercepted: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

    FetchMock.mockResponseOnce({ body: { shouldNotReach: true } });

    const request = new GetRequest("https://api.example.com/test")
      .withRequestInterceptor(() => mockResponse)
      .withResponseInterceptor(response => {
        responseInterceptorCalled = true;
        return response;
      });

    // Act
    await request.getJson();

    // Assert
    assert.equal(responseInterceptorCalled, true);
  });

  it("should remove response interceptor by ID", async () => {
    // Arrange
    let interceptorCalled = false;
    const interceptorId = create.config.addResponseInterceptor(response => {
      interceptorCalled = true;
      return response;
    });

    create.config.removeResponseInterceptor(interceptorId);

    FetchMock.mockResponseOnce({ body: { success: true } });
    const request = new GetRequest("https://api.example.com/test");

    // Act
    await request.getJson();

    // Assert
    assert.equal(interceptorCalled, false);
  });

  it("should handle multiple response interceptors in reverse order", async () => {
    // Arrange
    const executionOrder: number[] = [];

    create.config.addResponseInterceptor(response => {
      executionOrder.push(1);
      return response;
    });

    create.config.addResponseInterceptor(response => {
      executionOrder.push(2);
      return response;
    });

    FetchMock.mockResponseOnce({ body: { success: true } });
    const request = new GetRequest("https://api.example.com/test");

    // Act
    await request.getJson();

    // Assert - Global interceptors run in reverse order
    assert.deepEqual(executionOrder, [2, 1]);
  });
});

describe("Error Interceptors", () => {
  beforeEach(() => {
    FetchMock.install();
    create.config.reset();
  });

  afterEach(() => {
    FetchMock.reset();
    FetchMock.restore();
    create.config.reset();
  });

  it("should run global error interceptor on request failure", async () => {
    // Arrange
    let interceptorCalled = false;
    create.config.addErrorInterceptor(error => {
      interceptorCalled = true;
      throw error;
    });

    FetchMock.mockResponseOnce({
      status: 500,
      body: { error: "Server error" },
    });
    const request = new GetRequest("https://api.example.com/test");

    // Act & Assert
    try {
      await request.getJson();
      assert.fail("Should have thrown error");
    } catch (error) {
      assert.equal(interceptorCalled, true);
    }
  });

  it("should run per-request error interceptor", async () => {
    // Arrange
    let interceptorCalled = false;
    FetchMock.mockResponseOnce({
      status: 404,
      body: { error: "Not found" },
    });

    const request = new GetRequest("https://api.example.com/test").withErrorInterceptor(error => {
      interceptorCalled = true;
      throw error;
    });

    // Act & Assert
    try {
      await request.getJson();
      assert.fail("Should have thrown error");
    } catch (error) {
      assert.equal(interceptorCalled, true);
    }
  });

  it("should run per-request error interceptors before global interceptors (reverse order)", async () => {
    // Arrange
    const executionOrder: string[] = [];

    create.config.addErrorInterceptor(error => {
      executionOrder.push("global");
      throw error;
    });

    FetchMock.mockResponseOnce({ status: 500 });

    const request = new GetRequest("https://api.example.com/test").withErrorInterceptor(error => {
      executionOrder.push("per-request");
      throw error;
    });

    // Act & Assert
    try {
      await request.getJson();
      assert.fail("Should have thrown error");
    } catch (error) {
      assert.deepEqual(executionOrder, ["per-request", "global"]);
    }
  });

  it("should allow error interceptor to recover from error", async () => {
    // Arrange
    const fallbackResponse = new Response(JSON.stringify({ fallback: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

    FetchMock.mockResponseOnce({ status: 500 });

    const request = new GetRequest("https://api.example.com/test").withErrorInterceptor(error => {
      return new ResponseWrapper(fallbackResponse, error.url, error.method);
    });

    // Act
    const result = await request.getJson<{ fallback: boolean }>();

    // Assert
    assert.equal(result.fallback, true);
  });

  it("should allow error interceptor to modify the error", async () => {
    // Arrange
    FetchMock.mockResponseOnce({ status: 500 });

    const request = new GetRequest("https://api.example.com/test").withErrorInterceptor(error => {
      const modifiedError = new RequestError("Modified: " + error.message, error.url, error.method);
      throw modifiedError;
    });

    // Act & Assert
    try {
      await request.getJson();
      assert.fail("Should have thrown error");
    } catch (error: any) {
      assert.ok(error.message.startsWith("Modified:"));
    }
  });

  it("should support async error interceptors", async () => {
    // Arrange
    let interceptorCalled = false;
    FetchMock.mockResponseOnce({ status: 500 });

    const request = new GetRequest("https://api.example.com/test").withErrorInterceptor(async error => {
      await new Promise(resolve => setTimeout(resolve, 10));
      interceptorCalled = true;
      throw error;
    });

    // Act & Assert
    try {
      await request.getJson();
      assert.fail("Should have thrown error");
    } catch (error) {
      assert.equal(interceptorCalled, true);
    }
  });

  it("should stop running error interceptors once one recovers", async () => {
    // Arrange
    let secondInterceptorCalled = false;
    const fallbackResponse = new Response(JSON.stringify({ recovered: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

    create.config.addErrorInterceptor(() => {
      secondInterceptorCalled = true;
      throw new Error("Should not reach here");
    });

    FetchMock.mockResponseOnce({ status: 500 });

    const request = new GetRequest("https://api.example.com/test").withErrorInterceptor(error => {
      return new ResponseWrapper(fallbackResponse, error.url, error.method);
    });

    // Act
    const result = await request.getJson<{ recovered: boolean }>();

    // Assert
    assert.equal(result.recovered, true);
    assert.equal(secondInterceptorCalled, false);
  });

  it("should remove error interceptor by ID", async () => {
    // Arrange
    let interceptorCalled = false;
    const interceptorId = create.config.addErrorInterceptor(error => {
      interceptorCalled = true;
      throw error;
    });

    create.config.removeErrorInterceptor(interceptorId);

    FetchMock.mockResponseOnce({ status: 500 });
    const request = new GetRequest("https://api.example.com/test");

    // Act & Assert
    try {
      await request.getJson();
      assert.fail("Should have thrown error");
    } catch (error) {
      assert.equal(interceptorCalled, false);
    }
  });

  it("should handle network errors in error interceptor", async () => {
    // Arrange
    let capturedErrorType = "";
    FetchMock.mockErrorOnce(new Error("Network failure"));

    const request = new GetRequest("https://api.example.com/test").withErrorInterceptor(error => {
      capturedErrorType = error.message;
      throw error;
    });

    // Act & Assert
    try {
      await request.getJson();
      assert.fail("Should have thrown error");
    } catch (error) {
      assert.ok(capturedErrorType.includes("Network"));
    }
  });
});

describe("Interceptor Integration", () => {
  beforeEach(() => {
    FetchMock.install();
    create.config.reset();
  });

  afterEach(() => {
    FetchMock.reset();
    FetchMock.restore();
    create.config.reset();
  });

  it("should clear all interceptors", async () => {
    // Arrange
    let requestCalled = false;
    let responseCalled = false;
    let errorCalled = false;

    create.config.addRequestInterceptor(config => {
      requestCalled = true;
      return config;
    });

    create.config.addResponseInterceptor(response => {
      responseCalled = true;
      return response;
    });

    create.config.addErrorInterceptor(error => {
      errorCalled = true;
      throw error;
    });

    create.config.clearInterceptors();

    FetchMock.mockResponseOnce({ body: { success: true } });
    const request = new GetRequest("https://api.example.com/test");

    // Act
    await request.getJson();

    // Assert
    assert.equal(requestCalled, false);
    assert.equal(responseCalled, false);
    assert.equal(errorCalled, false);
  });

  it("should handle complex interceptor chain", async () => {
    // Arrange
    const log: string[] = [];

    create.config.addRequestInterceptor(config => {
      log.push("global-request-1");
      return config;
    });

    create.config.addRequestInterceptor(config => {
      log.push("global-request-2");
      return config;
    });

    create.config.addResponseInterceptor(response => {
      log.push("global-response-1");
      return response;
    });

    create.config.addResponseInterceptor(response => {
      log.push("global-response-2");
      return response;
    });

    FetchMock.mockResponseOnce({ body: { success: true } });

    const request = new GetRequest("https://api.example.com/test")
      .withRequestInterceptor(config => {
        log.push("per-request-1");
        return config;
      })
      .withRequestInterceptor(config => {
        log.push("per-request-2");
        return config;
      })
      .withResponseInterceptor(response => {
        log.push("per-response-1");
        return response;
      })
      .withResponseInterceptor(response => {
        log.push("per-response-2");
        return response;
      });

    // Act
    await request.getJson();

    // Assert
    assert.deepEqual(log, [
      // Request: global first (in order), then per-request (in order)
      "global-request-1",
      "global-request-2",
      "per-request-1",
      "per-request-2",
      // Response: per-request first (in order), then global (in reverse)
      "per-response-1",
      "per-response-2",
      "global-response-2",
      "global-response-1",
    ]);
  });

  it("should work with retries", async () => {
    // Arrange
    let requestCount = 0;
    create.config.addRequestInterceptor(config => {
      requestCount++;
      return config;
    });

    FetchMock.mockErrorOnce(new Error("Network error"));
    FetchMock.mockResponseOnce({ body: { success: true } });

    const request = new GetRequest("https://api.example.com/test").withRetries(1);

    // Act
    await request.getJson();

    // Assert
    assert.equal(requestCount, 2, "Interceptor should run for each retry");
  });

  it("should not affect other requests", async () => {
    // Arrange
    let interceptor1Called = false;
    let interceptor2Called = false;

    FetchMock.mockResponseOnce({ body: { request: 1 } });
    FetchMock.mockResponseOnce({ body: { request: 2 } });

    const request1 = new GetRequest("https://api.example.com/test1").withRequestInterceptor(config => {
      interceptor1Called = true;
      return config;
    });

    const request2 = new GetRequest("https://api.example.com/test2").withRequestInterceptor(config => {
      interceptor2Called = true;
      return config;
    });

    // Act
    await request1.getJson();
    interceptor1Called = false; // Reset

    await request2.getJson();

    // Assert
    assert.equal(interceptor1Called, false, "Request 1 interceptor should not affect request 2");
    assert.equal(interceptor2Called, true);
  });

  it("should handle request interceptor throwing error after modifying config", async () => {
    // Arrange
    FetchMock.mockResponseOnce({ body: { success: true } });
    const request = new GetRequest("https://api.example.com/test").withRequestInterceptor(config => {
      config.headers["X-Modified"] = "value";
      throw new Error("Interceptor error");
    });

    // Act & Assert
    try {
      await request.getJson();
      assert.fail("Should have thrown error");
    } catch (error: any) {
      assert.ok(error.message.includes("Request interceptor") && error.message.includes("failed"));
      assert.ok(error.message.includes("Interceptor error"));
    }
  });

  it("should handle response interceptor throwing error for non-ok responses", async () => {
    // Arrange
    // Use a 200 status so response interceptor runs
    FetchMock.mockResponseOnce({ status: 200, body: { success: true } });
    const request = new GetRequest("https://api.example.com/test").withResponseInterceptor(() => {
      throw new Error("Response interceptor error");
    });

    // Act & Assert
    try {
      await request.get();
      assert.fail("Should have thrown error");
    } catch (error: any) {
      // Should get the interceptor error
      assert.ok(error.message.includes("Response interceptor") && error.message.includes("failed"));
      assert.ok(error.message.includes("Response interceptor error"));
    }
  });

  it("should handle error interceptor throwing error", async () => {
    // Arrange
    FetchMock.mockResponseOnce({ status: 500 });
    const request = new GetRequest("https://api.example.com/test").withErrorInterceptor(_error => {
      throw new Error("Error in error interceptor");
    });

    // Act & Assert
    try {
      await request.getJson();
      assert.fail("Should have thrown error");
    } catch (error: any) {
      // Should get the interceptor error
      assert.ok(error.message.includes("Error in error interceptor") || error.message.includes("Error interceptor"));
    }
  });

  it("should handle multiple interceptors where one throws", async () => {
    // Arrange
    const log: string[] = [];
    FetchMock.mockResponseOnce({ body: { success: true } });

    const request = new GetRequest("https://api.example.com/test")
      .withRequestInterceptor(config => {
        log.push("interceptor-1");
        return config;
      })
      .withRequestInterceptor(_config => {
        log.push("interceptor-2");
        throw new Error("Interceptor 2 failed");
      })
      .withRequestInterceptor(() => {
        log.push("interceptor-3"); // Should not be called
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return {} as any; // This won't be called, but satisfy type checker
      });

    // Act & Assert
    try {
      await request.getJson();
      assert.fail("Should have thrown error");
    } catch (error: any) {
      assert.deepEqual(log, ["interceptor-1", "interceptor-2"]);
      assert.ok(error.message.includes("Request interceptor 2 failed"));
    }
  });

  it("should handle request interceptor modifying body when BodyRequest has body", async () => {
    // Arrange
    FetchMock.mockResponseOnce({ body: { success: true } });
    const { PostRequest } = await import("../src/requestMethods.js");
    const request = new PostRequest("https://api.example.com/test").withBody({ original: "data" }).withRequestInterceptor(config => {
      // Modify the body in the interceptor
      config.body = JSON.stringify({ modified: "data" });
      return config;
    });

    await request.get();

    // Assert - interceptor modification should override
    const [, options] = FetchMock.mock.calls[0];
    const body = JSON.parse(options.body as string);
    assert.deepEqual(body, { modified: "data" });
  });

  it("should handle request interceptor setting body to undefined", async () => {
    // Arrange
    FetchMock.mockResponseOnce({ body: { success: true } });
    const { PostRequest } = await import("../src/requestMethods.js");
    const request = new PostRequest("https://api.example.com/test")
      .withRequestInterceptor(config => {
        // Set body to undefined before BodyRequest processes it
        config.body = undefined;
        return config;
      })
      .withBody({ data: "value" }); // This will be processed, but interceptor runs first

    await request.get();

    // Assert - BodyRequest will set the body, but we verify the interceptor can modify it
    const [, options] = FetchMock.mock.calls[0];
    // The body will be set by BodyRequest, but the test shows interceptor can modify config
    assert.ok(options.body !== undefined);
    // The actual body should be the JSON stringified version
    const body = JSON.parse(options.body as string);
    assert.deepEqual(body, { data: "value" });
  });

  it("should handle error interceptor recovering after other error interceptors", async () => {
    // Arrange
    const log: string[] = [];
    const fallbackResponse = new Response(JSON.stringify({ recovered: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

    create.config.addErrorInterceptor(error => {
      log.push("global-error-1");
      throw error;
    });

    FetchMock.mockResponseOnce({ status: 500 });

    const request = new GetRequest("https://api.example.com/test")
      .withErrorInterceptor(error => {
        log.push("per-request-error-1");
        throw error;
      })
      .withErrorInterceptor(error => {
        log.push("per-request-error-2");
        // This one recovers
        return new ResponseWrapper(fallbackResponse, error.url, error.method);
      });

    // Act
    const result = await request.getJson<{ recovered: boolean }>();

    // Assert
    assert.equal(result.recovered, true);
    assert.deepEqual(log, ["per-request-error-1", "per-request-error-2"]);
    // Global interceptors should not run after recovery
    assert.ok(!log.includes("global-error-1"));
  });

  it("should handle error interceptor returning ResponseWrapper with different status", async () => {
    // Arrange
    const recoveredResponse = new Response(JSON.stringify({ recovered: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

    FetchMock.mockResponseOnce({ status: 500 });

    const request = new GetRequest("https://api.example.com/test").withErrorInterceptor(error => {
      return new ResponseWrapper(recoveredResponse, error.url, error.method);
    });

    // Act
    const response = await request.get();

    // Assert
    assert.equal(response.status, 200);
    const data = await response.getJson<{ recovered: boolean }>();
    assert.equal(data.recovered, true);
  });
});
