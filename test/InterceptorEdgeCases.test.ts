import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { GetRequest, PostRequest } from "../src/requestMethods.js";
import { RequestError } from "../src/RequestError.js";
import { ResponseWrapper } from "../src/ResponseWrapper.js";
import { FetchMock, createMockResponse } from "./utils/fetchMock.js";
import create from "../src/index.js";
import type { RequestConfig } from "../src/types.js";

describe("Interceptor Edge Cases", { timeout: 10000 }, () => {
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

  describe("Request Interceptor Edge Cases", () => {
    it("should handle interceptor that modifies URL", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/original");

      request.withRequestInterceptor((config: RequestConfig) => {
        return { ...config, url: "https://api.example.com/modified" };
      });

      await request.getResponse();

      const [url] = FetchMock.mock.calls[0];
      assert.equal(url, "https://api.example.com/modified");
    });

    it("should handle interceptor that modifies headers", async () => {
      FetchMock.mockResponseOnce();
      const request = new GetRequest("https://api.example.com/test").withHeader("X-Original", "value");

      request.withRequestInterceptor((config: RequestConfig) => {
        return {
          ...config,
          headers: {
            ...config.headers,
            "X-Modified": "modified-value",
            "X-Original": "modified-original",
          },
        };
      });

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      const headers = options.headers as Record<string, string>;
      assert.equal(headers["X-Original"], "modified-original");
      assert.equal(headers["X-Modified"], "modified-value");
    });

    it("should handle interceptor that short-circuits with Response", async () => {
      const mockResponse = createMockResponse({ body: { shortCircuit: true } });
      const request = new GetRequest("https://api.example.com/test");

      request.withRequestInterceptor(() => {
        return mockResponse;
      });

      const response = await request.getResponse();
      assert.equal(response.status, 200);
      const data = await response.getJson();
      assert.deepEqual(data, { shortCircuit: true });

      // Should not have called fetch
      assert.equal(FetchMock.mock.calls.length, 0);
    });

    it("should handle interceptor that throws error", async () => {
      FetchMock.mockResponseOnce();
      const request = new GetRequest("https://api.example.com/test");

      request.withRequestInterceptor(() => {
        throw new Error("Interceptor error");
      });

      try {
        await request.getResponse();
        assert.fail("Expected interceptor error");
      } catch (error) {
        assert(error instanceof RequestError);
        assert(error.message.includes("Req Interceptor failed"));
        assert(error.message.includes("Interceptor error"));
      }
    });

    it("should handle multiple interceptors in sequence", async () => {
      FetchMock.mockResponseOnce();
      const request = new GetRequest("https://api.example.com/test");

      request
        .withRequestInterceptor((config: RequestConfig) => {
          return { ...config, headers: { ...config.headers, "X-First": "first" } };
        })
        .withRequestInterceptor((config: RequestConfig) => {
          return { ...config, headers: { ...config.headers, "X-Second": "second" } };
        });

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      const headers = options.headers as Record<string, string>;
      assert.equal(headers["X-First"], "first");
      assert.equal(headers["X-Second"], "second");
    });

    it("should handle interceptor that modifies body", async () => {
      FetchMock.mockResponseOnce();
      const request = new PostRequest("https://api.example.com/test").withBody({ original: "data" });

      request.withRequestInterceptor((config: RequestConfig) => {
        return { ...config, body: JSON.stringify({ modified: "data" }) };
      });

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      const body = JSON.parse(options.body as string);
      assert.deepEqual(body, { modified: "data" });
    });

    it("should handle async interceptor", async () => {
      FetchMock.mockResponseOnce();
      const request = new GetRequest("https://api.example.com/test");

      request.withRequestInterceptor(async (config: RequestConfig) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return { ...config, headers: { ...config.headers, "X-Async": "async" } };
      });

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      const headers = options.headers as Record<string, string>;
      assert.equal(headers["X-Async"], "async");
    });

    it("should handle global and per-request interceptors together", async () => {
      FetchMock.mockResponseOnce();
      create.config.addRequestInterceptor((config: RequestConfig) => {
        return { ...config, headers: { ...config.headers, "X-Global": "global" } };
      });

      const request = new GetRequest("https://api.example.com/test");
      request.withRequestInterceptor((config: RequestConfig) => {
        return { ...config, headers: { ...config.headers, "X-Local": "local" } };
      });

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      const headers = options.headers as Record<string, string>;
      assert.equal(headers["X-Global"], "global");
      assert.equal(headers["X-Local"], "local");
    });
  });

  describe("Response Interceptor Edge Cases", () => {
    it("should handle interceptor that modifies response wrapper", async () => {
      FetchMock.mockResponseOnce({ body: { original: "data" } });
      const request = new GetRequest("https://api.example.com/test");

      request.withResponseInterceptor(async (response: ResponseWrapper) => {
        // Create a new response with modified data
        const originalData = await response.getJson<Record<string, unknown>>();
        const modifiedResponse = createMockResponse({ body: { ...originalData, modified: true } });
        return new ResponseWrapper(modifiedResponse, response.url || undefined, response.method || undefined);
      });

      const response = await request.getResponse();
      const data = await response.getJson();
      assert.deepEqual(data, { original: "data", modified: true });
    });

    it("should handle interceptor that throws error", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test");

      request.withResponseInterceptor(() => {
        throw new Error("Response interceptor error");
      });

      try {
        await request.getResponse();
        assert.fail("Expected interceptor error");
      } catch (error) {
        assert(error instanceof RequestError);
        assert(error.message.includes("Res Interceptor failed"));
      }
    });

    it("should handle multiple response interceptors in reverse order", async () => {
      FetchMock.mockResponseOnce({ body: { data: "original" } });
      const request = new GetRequest("https://api.example.com/test");

      const order: string[] = [];

      request
        .withResponseInterceptor((response: ResponseWrapper) => {
          order.push("local-1");
          return response;
        })
        .withResponseInterceptor((response: ResponseWrapper) => {
          order.push("local-2");
          return response;
        });

      create.config.addResponseInterceptor((response: ResponseWrapper) => {
        order.push("global-1");
        return response;
      });

      create.config.addResponseInterceptor((response: ResponseWrapper) => {
        order.push("global-2");
        return response;
      });

      await request.getResponse();

      // Per-request in order, then global in reverse
      assert.deepEqual(order, ["local-1", "local-2", "global-2", "global-1"]);
    });

    it("should handle async response interceptor", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test");

      request.withResponseInterceptor(async (response: ResponseWrapper) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return response;
      });

      const result = await request.getJson();
      assert.deepEqual(result, { success: true });
    });
  });

  describe("Error Interceptor Edge Cases", () => {
    it("should handle interceptor that recovers from error", async () => {
      FetchMock.mockErrorOnce(new Error("Network error"));
      const request = new GetRequest("https://api.example.com/test");

      request.withErrorInterceptor((error: RequestError) => {
        // Recover by returning a mock response
        const mockResponse = createMockResponse({ body: { recovered: true } });
        return new ResponseWrapper(mockResponse, error.url, error.method);
      });

      const response = await request.getResponse();
      const data = await response.getJson();
      assert.deepEqual(data, { recovered: true });
    });

    it("should handle interceptor that transforms error", async () => {
      FetchMock.mockErrorOnce(new Error("Original error"));
      const request = new GetRequest("https://api.example.com/test");

      request.withErrorInterceptor((error: RequestError) => {
        // Transform error
        return new RequestError(`Transformed: ${error.message}`, error.url, error.method);
      });

      try {
        await request.getResponse();
        assert.fail("Expected transformed error");
      } catch (error) {
        assert(error instanceof RequestError);
        assert(error.message.includes("Transformed"));
      }
    });

    it("should handle interceptor that throws new error", async () => {
      FetchMock.mockErrorOnce(new Error("Original error"));
      const request = new GetRequest("https://api.example.com/test");

      request.withErrorInterceptor(() => {
        throw new Error("Interceptor error");
      });

      try {
        await request.getResponse();
        assert.fail("Expected interceptor error");
      } catch (error) {
        assert(error instanceof RequestError);
        assert(error.message.includes("Err Interceptor"));
      }
    });

    it("should handle multiple error interceptors", async () => {
      FetchMock.mockErrorOnce(new Error("Network error"));
      const request = new GetRequest("https://api.example.com/test");

      const order: string[] = [];

      request
        .withErrorInterceptor((error: RequestError) => {
          order.push("local-1");
          return error;
        })
        .withErrorInterceptor((error: RequestError) => {
          order.push("local-2");
          return error;
        });

      create.config.addErrorInterceptor((error: RequestError) => {
        order.push("global-1");
        return error;
      });

      create.config.addErrorInterceptor((error: RequestError) => {
        order.push("global-2");
        return error;
      });

      try {
        await request.getResponse();
        assert.fail("Expected error");
      } catch (error) {
        // Per-request in order, then global in reverse
        assert.deepEqual(order, ["local-1", "local-2", "global-2", "global-1"]);
      }
    });

    it("should handle interceptor that stops processing on recovery", async () => {
      FetchMock.mockErrorOnce(new Error("Network error"));
      const request = new GetRequest("https://api.example.com/test");

      request
        .withErrorInterceptor((error: RequestError) => {
          // First interceptor recovers
          const mockResponse = createMockResponse({ body: { recovered: true } });
          return new ResponseWrapper(mockResponse, error.url, error.method);
        })
        .withErrorInterceptor((error: RequestError) => {
          // This should not be called
          return new RequestError("Should not reach here", error.url, error.method);
        });

      const response = await request.getResponse();
      const data = await response.getJson();
      assert.deepEqual(data, { recovered: true });
    });

    it("should handle interceptor recovery with ResponseWrapper", async () => {
      FetchMock.mockErrorOnce(new Error("Network error"));
      const request = new GetRequest("https://api.example.com/test");

      request.withErrorInterceptor((error: RequestError) => {
        const mockResponse = createMockResponse({ body: { recovered: true }, status: 200 });
        return new ResponseWrapper(mockResponse, error.url, error.method);
      });

      const response = await request.getResponse();
      assert.equal(response.status, 200);
      const data = await response.getJson();
      assert.deepEqual(data, { recovered: true });
    });
  });

  describe("Interceptor Complex Scenarios", () => {
    it("should handle request interceptor that short-circuits with error response", async () => {
      const request = new GetRequest("https://api.example.com/test");

      request.withRequestInterceptor(() => {
        // Return an error response
        return createMockResponse({ status: 500, body: { error: "Short circuit" } });
      });

      // When interceptor returns a Response, it gets wrapped and returned directly
      // without checking if it's ok. The response status is available.
      const response = await request.getResponse();
      assert.equal(response.status, 500);
      assert.equal(response.ok, false);

      // We can still get the JSON data from the error response
      const data = await response.getJson();
      assert.deepEqual(data, { error: "Short circuit" });
    });

    it("should handle chain of interceptors modifying request", async () => {
      FetchMock.mockResponseOnce();
      const request = new GetRequest("https://api.example.com/test");

      request
        .withRequestInterceptor((config: RequestConfig) => {
          return { ...config, headers: { ...config.headers, "X-Step1": "1" } };
        })
        .withRequestInterceptor((config: RequestConfig) => {
          return { ...config, headers: { ...config.headers, "X-Step2": "2" } };
        })
        .withRequestInterceptor((config: RequestConfig) => {
          return { ...config, headers: { ...config.headers, "X-Step3": "3" } };
        });

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      const headers = options.headers as Record<string, string>;
      assert.equal(headers["X-Step1"], "1");
      assert.equal(headers["X-Step2"], "2");
      assert.equal(headers["X-Step3"], "3");
    });

    it("should handle response interceptor chain", async () => {
      FetchMock.mockResponseOnce({ body: { value: 0 } });
      const request = new GetRequest("https://api.example.com/test");

      request
        .withResponseInterceptor(async (response: ResponseWrapper) => {
          const data = await response.getJson<{ value: number }>();
          const newResponse = createMockResponse({ body: { value: data.value + 1 } });
          return new ResponseWrapper(newResponse, response.url || undefined, response.method || undefined);
        })
        .withResponseInterceptor(async (response: ResponseWrapper) => {
          const data = await response.getJson<{ value: number }>();
          const newResponse = createMockResponse({ body: { value: data.value * 2 } });
          return new ResponseWrapper(newResponse, response.url || undefined, response.method || undefined);
        });

      const response = await request.getResponse();
      const data = await response.getJson();
      // Original: 0, +1 = 1, *2 = 2
      assert.deepEqual(data, { value: 2 });
    });
  });
});
