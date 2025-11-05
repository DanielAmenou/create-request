import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { GetRequest, PostRequest, PutRequest, DeleteRequest, PatchRequest, HeadRequest, OptionsRequest } from "../src/requestMethods.js";
import create from "../src/index.js";
import { get, post, put, del, patch, head, options } from "../src/requestFactories.js";
import { FetchMock } from "./utils/fetchMock.js";

describe("Request Methods Comprehensive Tests", () => {
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

  describe("Request Classes", () => {
    it("should create GetRequest with correct method", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test");

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.method, "GET");
    });

    it("should create PostRequest with correct method", async () => {
      FetchMock.mockResponseOnce();
      const request = new PostRequest("https://api.example.com/test").withBody({ data: "test" });

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.method, "POST");
    });

    it("should create PutRequest with correct method", async () => {
      FetchMock.mockResponseOnce();
      const request = new PutRequest("https://api.example.com/test").withBody({ data: "test" });

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.method, "PUT");
    });

    it("should create DeleteRequest with correct method", async () => {
      FetchMock.mockResponseOnce();
      const request = new DeleteRequest("https://api.example.com/test");

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.method, "DELETE");
    });

    it("should create PatchRequest with correct method", async () => {
      FetchMock.mockResponseOnce();
      const request = new PatchRequest("https://api.example.com/test").withBody({ data: "test" });

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.method, "PATCH");
    });

    it("should create HeadRequest with correct method", async () => {
      FetchMock.mockResponseOnce();
      const request = new HeadRequest("https://api.example.com/test");

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.method, "HEAD");
    });

    it("should create OptionsRequest with correct method", async () => {
      FetchMock.mockResponseOnce();
      const request = new OptionsRequest("https://api.example.com/test");

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.method, "OPTIONS");
    });
  });

  describe("Factory Functions", () => {
    it("should create GET request using factory function", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = get("https://api.example.com/test");

      assert.ok(request instanceof GetRequest);
      const result = await request.getJson();
      assert.deepEqual(result, { success: true });
    });

    it("should create POST request using factory function", async () => {
      FetchMock.mockResponseOnce();
      const request = post("https://api.example.com/test").withBody({ data: "test" });

      assert.ok(request instanceof PostRequest);
      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.method, "POST");
    });

    it("should create PUT request using factory function", async () => {
      FetchMock.mockResponseOnce();
      const request = put("https://api.example.com/test").withBody({ data: "test" });

      assert.ok(request instanceof PutRequest);
      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.method, "PUT");
    });

    it("should create DELETE request using factory function", async () => {
      FetchMock.mockResponseOnce();
      const request = del("https://api.example.com/test");

      assert.ok(request instanceof DeleteRequest);
      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.method, "DELETE");
    });

    it("should create PATCH request using factory function", async () => {
      FetchMock.mockResponseOnce();
      const request = patch("https://api.example.com/test").withBody({ data: "test" });

      assert.ok(request instanceof PatchRequest);
      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.method, "PATCH");
    });

    it("should create HEAD request using factory function", async () => {
      FetchMock.mockResponseOnce();
      const request = head("https://api.example.com/test");

      assert.ok(request instanceof HeadRequest);
      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.method, "HEAD");
    });

    it("should create OPTIONS request using factory function", async () => {
      FetchMock.mockResponseOnce();
      const request = options("https://api.example.com/test");

      assert.ok(request instanceof OptionsRequest);
      await request.getResponse();

      const [, requestOptions] = FetchMock.mock.calls[0];
      assert.equal(requestOptions.method, "OPTIONS");
    });
  });

  describe("Main API Object", () => {
    it("should expose all factory methods", () => {
      assert.ok(typeof create.get === "function");
      assert.ok(typeof create.post === "function");
      assert.ok(typeof create.put === "function");
      assert.ok(typeof create.del === "function");
      assert.ok(typeof create.patch === "function");
      assert.ok(typeof create.head === "function");
      assert.ok(typeof create.options === "function");
    });

    it("should expose config object", () => {
      assert.ok(create.config);
      assert.ok(typeof create.config.setEnableAntiCsrf === "function");
      assert.ok(typeof create.config.reset === "function");
    });

    it("should create requests using main API object", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = create.get("https://api.example.com/test");

      const result = await request.getJson();
      assert.deepEqual(result, { success: true });
    });
  });

  describe("Request Methods with Body Support", () => {
    it("should support body on POST request", async () => {
      FetchMock.mockResponseOnce();
      const request = new PostRequest("https://api.example.com/test").withBody({ data: "test" });

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.method, "POST");
      assert.equal(options.body, JSON.stringify({ data: "test" }));
    });

    it("should support body on PUT request", async () => {
      FetchMock.mockResponseOnce();
      const request = new PutRequest("https://api.example.com/test").withBody({ data: "test" });

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.method, "PUT");
      assert.equal(options.body, JSON.stringify({ data: "test" }));
    });

    it("should support body on PATCH request", async () => {
      FetchMock.mockResponseOnce();
      const request = new PatchRequest("https://api.example.com/test").withBody({ data: "test" });

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.method, "PATCH");
      assert.equal(options.body, JSON.stringify({ data: "test" }));
    });
  });

  describe("Request Methods without Body Support", () => {
    it("should not support body on GET request", () => {
      const request = new GetRequest("https://api.example.com/test");
      // GET request should not have withBody method
      assert.ok(!("withBody" in request));
    });

    it("should not support body on DELETE request", () => {
      const request = new DeleteRequest("https://api.example.com/test");
      // DELETE request should not have withBody method
      assert.ok(!("withBody" in request));
    });

    it("should not support body on HEAD request", () => {
      const request = new HeadRequest("https://api.example.com/test");
      // HEAD request should not have withBody method
      assert.ok(!("withBody" in request));
    });

    it("should not support body on OPTIONS request", () => {
      const request = new OptionsRequest("https://api.example.com/test");
      // OPTIONS request should not have withBody method
      assert.ok(!("withBody" in request));
    });
  });

  describe("Request Methods Common Functionality", () => {
    it("should support headers on all request methods", async () => {
      const methods = [
        new GetRequest("https://api.example.com/test"),
        new PostRequest("https://api.example.com/test"),
        new PutRequest("https://api.example.com/test"),
        new DeleteRequest("https://api.example.com/test"),
        new PatchRequest("https://api.example.com/test"),
        new HeadRequest("https://api.example.com/test"),
        new OptionsRequest("https://api.example.com/test"),
      ];

      for (const request of methods) {
        FetchMock.reset();
        FetchMock.mockResponseOnce();

        request.withHeader("X-Test", "value");
        await request.getResponse();

        const [, options] = FetchMock.mock.calls[0];
        const headers = options.headers as Record<string, string>;
        assert.equal(headers["X-Test"], "value");
      }
    });

    it("should support query parameters on all request methods", async () => {
      const methods = [
        new GetRequest("https://api.example.com/test"),
        new PostRequest("https://api.example.com/test"),
        new PutRequest("https://api.example.com/test"),
        new DeleteRequest("https://api.example.com/test"),
        new PatchRequest("https://api.example.com/test"),
        new HeadRequest("https://api.example.com/test"),
        new OptionsRequest("https://api.example.com/test"),
      ];

      for (const request of methods) {
        FetchMock.reset();
        FetchMock.mockResponseOnce();

        request.withQueryParam("key", "value");
        await request.getResponse();

        const [url] = FetchMock.mock.calls[0];
        assert.ok((url as string).includes("key=value"));
      }
    });

    it("should support timeout on all request methods", () => {
      const methods = [
        new GetRequest("https://api.example.com/test"),
        new PostRequest("https://api.example.com/test"),
        new PutRequest("https://api.example.com/test"),
        new DeleteRequest("https://api.example.com/test"),
        new PatchRequest("https://api.example.com/test"),
        new HeadRequest("https://api.example.com/test"),
        new OptionsRequest("https://api.example.com/test"),
      ];

      for (const request of methods) {
        request.withTimeout(5000);
        // Should not throw
        assert.ok(request);
      }
    });

    it("should support retries on all request methods", () => {
      const methods = [
        new GetRequest("https://api.example.com/test"),
        new PostRequest("https://api.example.com/test"),
        new PutRequest("https://api.example.com/test"),
        new DeleteRequest("https://api.example.com/test"),
        new PatchRequest("https://api.example.com/test"),
        new HeadRequest("https://api.example.com/test"),
        new OptionsRequest("https://api.example.com/test"),
      ];

      for (const request of methods) {
        request.withRetries(2);
        // Should not throw
        assert.ok(request);
      }
    });
  });

  describe("Request Methods Chaining", () => {
    it("should allow chaining on GET request", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withHeader("X-Test", "value").withQueryParam("key", "value").withTimeout(5000);

      const result = await request.getJson();
      assert.deepEqual(result, { success: true });
    });

    it("should allow chaining on POST request", async () => {
      FetchMock.mockResponseOnce();
      const request = new PostRequest("https://api.example.com/test").withBody({ data: "test" }).withHeader("X-Test", "value").withBearerToken("token123");

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      const headers = options.headers as Record<string, string>;
      assert.equal(headers["X-Test"], "value");
      assert.equal(headers.Authorization, "Bearer token123");
    });

    it("should allow chaining on PUT request", async () => {
      FetchMock.mockResponseOnce();
      const request = new PutRequest("https://api.example.com/test").withBody({ data: "test" }).withQueryParam("id", "123").withContentType("application/json");

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      const headers = options.headers as Record<string, string>;
      assert.equal(headers["Content-Type"], "application/json");
    });
  });
});
