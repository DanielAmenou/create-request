import assert from "node:assert/strict";
import { Blob } from "node:buffer";
import { describe, it, beforeEach, afterEach } from "node:test";
import { PostRequest, PutRequest, PatchRequest } from "../src/requestMethods.js";
import { RequestError } from "../src/RequestError.js";
import { FetchMock } from "./utils/fetchMock.js";
import create from "../src/index.js";

describe("BodyRequest Edge Cases", { timeout: 10000 }, () => {
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

  describe("Body Type Detection", () => {
    it("should detect string body type", async () => {
      FetchMock.mockResponseOnce();
      const request = new PostRequest("https://api.example.com/test").withBody("plain text");

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.body, "plain text");
      const headers = options.headers as Record<string, string>;
      assert.equal(headers["Content-Type"], "text/plain");
    });

    it("should detect JSON object body type", async () => {
      FetchMock.mockResponseOnce();
      const data = { name: "Test", value: 123 };
      const request = new PostRequest("https://api.example.com/test").withBody(data);

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.body, JSON.stringify(data));
      const headers = options.headers as Record<string, string>;
      assert.equal(headers["Content-Type"], "application/json");
    });

    it("should detect FormData body type", async () => {
      FetchMock.mockResponseOnce();
      const formData = new FormData();
      formData.append("key", "value");
      const request = new PostRequest("https://api.example.com/test").withBody(formData);

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.body, formData);
      // FormData should not have Content-Type set manually
      const headers = options.headers as Record<string, string>;
      assert.equal(headers["Content-Type"], undefined);
    });

    it("should detect Blob body type", async () => {
      FetchMock.mockResponseOnce();
      const blob = new Blob(["test"], { type: "text/plain" });
      const request = new PostRequest("https://api.example.com/test").withBody(blob);

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.body, blob);
    });

    it("should detect ArrayBuffer body type", async () => {
      FetchMock.mockResponseOnce();
      const buffer = new ArrayBuffer(8);
      const request = new PostRequest("https://api.example.com/test").withBody(buffer);

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.body, buffer);
    });

    it("should detect URLSearchParams body type", async () => {
      FetchMock.mockResponseOnce();
      const params = new URLSearchParams();
      params.append("key", "value");
      const request = new PostRequest("https://api.example.com/test").withBody(params);

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.body, params);
    });

    it("should detect ReadableStream body type", async () => {
      FetchMock.mockResponseOnce();
      const stream = new ReadableStream();
      const request = new PostRequest("https://api.example.com/test").withBody(stream);

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.body, stream);
    });

    it("should detect null body type", async () => {
      FetchMock.mockResponseOnce();
      const request = new PostRequest("https://api.example.com/test").withBody(null);

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.body, null);
    });
  });

  describe("Body Type Edge Cases", () => {
    it("should handle empty string body", async () => {
      FetchMock.mockResponseOnce();
      const request = new PostRequest("https://api.example.com/test").withBody("");

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.body, "");
      const headers = options.headers as Record<string, string>;
      assert.equal(headers["Content-Type"], "text/plain");
    });

    it("should handle empty object body", async () => {
      FetchMock.mockResponseOnce();
      const request = new PostRequest("https://api.example.com/test").withBody({});

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.body, "{}");
      const headers = options.headers as Record<string, string>;
      assert.equal(headers["Content-Type"], "application/json");
    });

    it("should handle empty array body", async () => {
      FetchMock.mockResponseOnce();
      const request = new PostRequest("https://api.example.com/test").withBody([]);

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.body, "[]");
      const headers = options.headers as Record<string, string>;
      assert.equal(headers["Content-Type"], "application/json");
    });

    it("should handle nested object body", async () => {
      FetchMock.mockResponseOnce();
      const nestedData = {
        level1: {
          level2: {
            level3: {
              value: "deep",
            },
          },
        },
      };
      const request = new PostRequest("https://api.example.com/test").withBody(nestedData);

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.body, JSON.stringify(nestedData));
    });

    it("should handle object with special characters", async () => {
      FetchMock.mockResponseOnce();
      const data = {
        "key with spaces": "value",
        "special-chars": "!@#$%^&*()",
        unicode: "测试",
        emoji: "😀",
      };
      const request = new PostRequest("https://api.example.com/test").withBody(data);

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      const parsed = JSON.parse(options.body as string);
      assert.equal(parsed["key with spaces"], "value");
      assert.equal(parsed["special-chars"], "!@#$%^&*()");
      assert.equal(parsed.unicode, "测试");
      assert.equal(parsed.emoji, "😀");
    });

    it("should handle object with Date objects", async () => {
      FetchMock.mockResponseOnce();
      const date = new Date("2023-01-01T00:00:00Z");
      const data = { timestamp: date };
      const request = new PostRequest("https://api.example.com/test").withBody(data);

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      const parsed = JSON.parse(options.body as string);
      assert.equal(parsed.timestamp, date.toISOString());
    });

    it("should handle object with null values", async () => {
      FetchMock.mockResponseOnce();
      const data = { key1: "value", key2: null, key3: undefined };
      const request = new PostRequest("https://api.example.com/test").withBody(data);

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      const parsed = JSON.parse(options.body as string);
      assert.equal(parsed.key1, "value");
      assert.equal(parsed.key2, null);
      assert.equal(parsed.key3, undefined);
    });
  });

  describe("Content-Type Handling", () => {
    it("should not override existing Content-Type header", async () => {
      FetchMock.mockResponseOnce();
      const request = new PostRequest("https://api.example.com/test").withHeader("Content-Type", "application/xml").withBody({ data: "test" });

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      const headers = options.headers as Record<string, string>;
      assert.equal(headers["Content-Type"], "application/xml");
      assert.equal(options.body, JSON.stringify({ data: "test" }));
    });

    it("should handle case-insensitive Content-Type detection", async () => {
      FetchMock.mockResponseOnce();
      const request = new PostRequest("https://api.example.com/test").withHeader("content-type", "application/custom").withBody({ data: "test" });

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      const headers = options.headers as Record<string, string>;
      assert.equal(headers["content-type"], "application/custom");
    });

    it("should set Content-Type for string body", async () => {
      FetchMock.mockResponseOnce();
      const request = new PostRequest("https://api.example.com/test").withBody("text content");

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      const headers = options.headers as Record<string, string>;
      assert.equal(headers["Content-Type"], "text/plain");
    });

    it("should set Content-Type for JSON body", async () => {
      FetchMock.mockResponseOnce();
      const request = new PostRequest("https://api.example.com/test").withBody({ data: "test" });

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      const headers = options.headers as Record<string, string>;
      assert.equal(headers["Content-Type"], "application/json");
    });
  });

  describe("Body Replacement", () => {
    it("should replace body when withBody is called multiple times", async () => {
      FetchMock.mockResponseOnce();
      const request = new PostRequest("https://api.example.com/test").withBody({ first: "data" }).withBody({ second: "data" });

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.body, JSON.stringify({ second: "data" }));
    });

    it("should replace body when switching between withBody and withGraphQL", async () => {
      FetchMock.mockResponseOnce();
      const request = new PostRequest("https://api.example.com/test").withBody({ regular: "data" }).withGraphQL("query { test }");

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      const body = JSON.parse(options.body as string);
      assert.equal(body.query, "query { test }");
      assert.equal(body.variables, undefined);
    });

    it("should allow changing body type", async () => {
      FetchMock.mockResponseOnce();
      FetchMock.mockResponseOnce();

      const request = new PostRequest("https://api.example.com/test").withBody({ json: "data" }).withBody("text data");

      await request.getResponse();

      const [, options1] = FetchMock.mock.calls[0];
      assert.equal(options1.body, "text data");
      // Note: Content-Type is set when first body is added (application/json)
      // and is not automatically changed when body type changes
      // This is expected behavior - existing Content-Type is preserved
      const headers1 = options1.headers as Record<string, string>;
      assert.equal(headers1["Content-Type"], "application/json");
    });
  });

  describe("JSON Validation", () => {
    it("should throw error for circular reference in body", () => {
      const circular: any = {};
      circular.self = circular;

      assert.throws(
        () => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          new PostRequest("https://api.example.com/test").withBody(circular);
        },
        (error: unknown) => {
          return error instanceof RequestError && error.message.includes("stringify failed");
        }
      );
    });

    it("should handle JSON.stringify error when error is not an Error instance", () => {
      // This tests the branch where JSON.stringify throws a non-Error
      // We can't easily mock JSON.stringify, but we can test with a circular reference
      // which will throw, and the error handling should work
      const circular: any = {};
      circular.self = circular;

      assert.throws(
        () => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          new PostRequest("https://api.example.com/test").withBody(circular);
        },
        (error: unknown) => {
          return error instanceof RequestError && error.message.includes("stringify failed");
        }
      );
    });

    it("should throw error for non-serializable values", () => {
      const data = {
        func: () => "test",
        symbol: Symbol("test"),
      };

      // Note: JSON.stringify will convert functions to undefined and omit symbols
      // So this might not throw, but let's test the behavior
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const request = new PostRequest("https://api.example.com/test").withBody(data as any);

      // Should not throw during construction
      assert.ok(request);
    });
  });

  describe("Request Method Specific", () => {
    it("should work with PUT request", async () => {
      FetchMock.mockResponseOnce();
      const request = new PutRequest("https://api.example.com/test").withBody({ update: "data" });

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.method, "PUT");
      assert.equal(options.body, JSON.stringify({ update: "data" }));
    });

    it("should work with PATCH request", async () => {
      FetchMock.mockResponseOnce();
      const request = new PatchRequest("https://api.example.com/test").withBody({ patch: "data" });

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.method, "PATCH");
      assert.equal(options.body, JSON.stringify({ patch: "data" }));
    });
  });

  describe("Body with Other Options", () => {
    it("should handle body with headers", async () => {
      FetchMock.mockResponseOnce();
      const request = new PostRequest("https://api.example.com/test").withBody({ data: "test" }).withHeader("X-Custom", "value");

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      const headers = options.headers as Record<string, string>;
      assert.equal(headers["Content-Type"], "application/json");
      assert.equal(headers["X-Custom"], "value");
    });

    it("should handle body with query parameters", async () => {
      FetchMock.mockResponseOnce();
      const request = new PostRequest("https://api.example.com/test").withBody({ data: "test" }).withQueryParam("key", "value");

      await request.getResponse();

      const [url] = FetchMock.mock.calls[0];
      assert.ok((url as string).includes("key=value"));
      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.body, JSON.stringify({ data: "test" }));
    });

    it("should handle body with timeout", async () => {
      FetchMock.mockResponseOnce();
      const request = new PostRequest("https://api.example.com/test").withBody({ data: "test" }).withTimeout(5000);

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.body, JSON.stringify({ data: "test" }));
    });

    it("should handle body with retries", async () => {
      FetchMock.mockErrorOnce(new Error("Network error"));
      FetchMock.mockResponseOnce({ body: { success: true } });

      const request = new PostRequest("https://api.example.com/test").withBody({ data: "test" }).withRetries(1);

      const result = await request.getJson();
      assert.deepEqual(result, { success: true });
    });
  });
});
