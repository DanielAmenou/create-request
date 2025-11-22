import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GetRequest } from "../src/requestMethods.js";
import { RequestError } from "../src/RequestError.js";
import { FetchMock } from "./utils/fetchMock.js";

describe("URL Validation Edge Cases", { timeout: 10000 }, () => {
  it("should throw error for empty URL", async () => {
    FetchMock.install();
    try {
      const request = new GetRequest("");
      await assert.rejects(
        async () => request.getResponse(),
        (error: unknown) => {
          return error instanceof RequestError && error.message.includes("URL cannot be empty");
        }
      );
    } finally {
      FetchMock.reset();
      FetchMock.restore();
    }
  });

  it("should throw error for whitespace-only URL", async () => {
    FetchMock.install();
    try {
      const request = new GetRequest("   ");
      await assert.rejects(
        async () => request.getResponse(),
        (error: unknown) => {
          return error instanceof RequestError && error.message.includes("URL cannot be empty");
        }
      );
    } finally {
      FetchMock.reset();
      FetchMock.restore();
    }
  });

  it("should throw error for URL with null character", async () => {
    FetchMock.install();
    try {
      const request = new GetRequest("https://example.com/test\0");
      await assert.rejects(
        async () => request.getResponse(),
        (error: unknown) => {
          return error instanceof RequestError && error.message.includes("Invalid URL");
        }
      );
    } finally {
      FetchMock.reset();
      FetchMock.restore();
    }
  });

  it("should throw error for URL with carriage return", async () => {
    FetchMock.install();
    try {
      const request = new GetRequest("https://example.com/test\r");
      await assert.rejects(
        async () => request.getResponse(),
        (error: unknown) => {
          return error instanceof RequestError && error.message.includes("Invalid URL");
        }
      );
    } finally {
      FetchMock.reset();
      FetchMock.restore();
    }
  });

  it("should throw error for URL with newline", async () => {
    FetchMock.install();
    try {
      const request = new GetRequest("https://example.com/test\n");
      await assert.rejects(
        async () => request.getResponse(),
        (error: unknown) => {
          return error instanceof RequestError && error.message.includes("Invalid URL");
        }
      );
    } finally {
      FetchMock.reset();
      FetchMock.restore();
    }
  });

  it("should throw error for URL with multiple control characters", async () => {
    FetchMock.install();
    try {
      const request = new GetRequest("https://example.com/test\0\r\n");
      await assert.rejects(
        async () => request.getResponse(),
        (error: unknown) => {
          return error instanceof RequestError && error.message.includes("Invalid URL");
        }
      );
    } finally {
      FetchMock.reset();
      FetchMock.restore();
    }
  });

  it("should throw error for invalid absolute URL", async () => {
    FetchMock.install();
    try {
      const request = new GetRequest("https://invalid url with spaces");
      await assert.rejects(
        async () => request.getResponse(),
        (error: unknown) => {
          return error instanceof RequestError && error.message.includes("Invalid URL");
        }
      );
    } finally {
      FetchMock.reset();
      FetchMock.restore();
    }
  });

  it("should throw error for malformed URL with protocol", async () => {
    FetchMock.install();
    try {
      const request = new GetRequest("http://[invalid");
      await assert.rejects(
        async () => request.getResponse(),
        (error: unknown) => {
          return error instanceof RequestError && error.message.includes("Invalid URL");
        }
      );
    } finally {
      FetchMock.reset();
      FetchMock.restore();
    }
  });

  it("should accept valid absolute URLs", () => {
    // Should not throw
    const request1 = new GetRequest("https://example.com");
    assert.ok(request1);

    const request2 = new GetRequest("http://example.com/path");
    assert.ok(request2);

    const request3 = new GetRequest("https://example.com:8080/path?query=value");
    assert.ok(request3);
  });

  it("should accept relative URLs", () => {
    // Should not throw
    const request1 = new GetRequest("/path");
    assert.ok(request1);

    const request2 = new GetRequest("/path/to/resource");
    assert.ok(request2);

    const request3 = new GetRequest("./relative");
    assert.ok(request3);

    const request4 = new GetRequest("../parent");
    assert.ok(request4);
  });

  it("should accept URLs with query parameters", () => {
    const request = new GetRequest("https://example.com/path?key=value");
    assert.ok(request);
  });

  it("should accept URLs with hash fragments", () => {
    const request = new GetRequest("https://example.com/path#fragment");
    assert.ok(request);
  });

  it("should accept URLs with special characters in path", () => {
    const request = new GetRequest("https://example.com/path%20with%20spaces");
    assert.ok(request);
  });

  it("should accept URLs with unicode characters", () => {
    const request = new GetRequest("https://example.com/测试");
    assert.ok(request);
  });

  it("should validate URL during execution, not construction", () => {
    // URL validation happens during getResponse(), not during construction
    // This allows for relative URLs that might be valid in context
    const request = new GetRequest("relative/path");
    assert.ok(request);
    // The actual validation would happen when fetch is called
  });
});
