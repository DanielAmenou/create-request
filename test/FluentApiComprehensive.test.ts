import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { GetRequest } from "../src/requestMethods.js";
import { CredentialsPolicy, ReferrerPolicy, RedirectMode, RequestMode, RequestPriority } from "../src/enums.js";
import { FetchMock } from "./utils/fetchMock.js";
import create from "../src/index.js";

describe("Fluent API Comprehensive Tests", () => {
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

  describe("withCredentials - Fluent API", () => {
    it("should support callable form with enum value", async () => {
      FetchMock.mockResponseOnce();
      const request = new GetRequest("https://api.example.com/test").withCredentials(CredentialsPolicy.INCLUDE);

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.credentials, "include");
    });

    it("should support callable form with string value", async () => {
      FetchMock.mockResponseOnce();
      const request = new GetRequest("https://api.example.com/test").withCredentials("same-origin");

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.credentials, "same-origin");
    });

    it("should support convenience method INCLUDE()", async () => {
      FetchMock.mockResponseOnce();
      const request = new GetRequest("https://api.example.com/test").withCredentials.INCLUDE();

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.credentials, "include");
    });

    it("should support convenience method OMIT()", async () => {
      FetchMock.mockResponseOnce();
      const request = new GetRequest("https://api.example.com/test").withCredentials.OMIT();

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.credentials, "omit");
    });

    it("should support convenience method SAME_ORIGIN()", async () => {
      FetchMock.mockResponseOnce();
      const request = new GetRequest("https://api.example.com/test").withCredentials.SAME_ORIGIN();

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.credentials, "same-origin");
    });

    it("should allow chaining after fluent method", async () => {
      FetchMock.mockResponseOnce();
      const request = new GetRequest("https://api.example.com/test").withCredentials.INCLUDE().withHeader("X-Test", "value");

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.credentials, "include");
      const headers = options.headers as Record<string, string>;
      assert.equal(headers["X-Test"], "value");
    });
  });

  describe("withReferrerPolicy - Fluent API", () => {
    it("should support callable form with enum value", async () => {
      FetchMock.mockResponseOnce();
      const request = new GetRequest("https://api.example.com/test").withReferrerPolicy(ReferrerPolicy.NO_REFERRER);

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.referrerPolicy, "no-referrer");
    });

    it("should support callable form with string value", async () => {
      FetchMock.mockResponseOnce();
      const request = new GetRequest("https://api.example.com/test").withReferrerPolicy("strict-origin");

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.referrerPolicy, "strict-origin");
    });

    it("should support all convenience methods", async () => {
      const policies = [
        { method: "ORIGIN", expected: "origin" },
        { method: "UNSAFE_URL", expected: "unsafe-url" },
        { method: "SAME_ORIGIN", expected: "same-origin" },
        { method: "NO_REFERRER", expected: "no-referrer" },
        { method: "STRICT_ORIGIN", expected: "strict-origin" },
        { method: "ORIGIN_WHEN_CROSS_ORIGIN", expected: "origin-when-cross-origin" },
        { method: "NO_REFERRER_WHEN_DOWNGRADE", expected: "no-referrer-when-downgrade" },
        { method: "STRICT_ORIGIN_WHEN_CROSS_ORIGIN", expected: "strict-origin-when-cross-origin" },
      ];

      for (const { method, expected } of policies) {
        FetchMock.reset();
        FetchMock.mockResponseOnce();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const request = new GetRequest("https://api.example.com/test").withReferrerPolicy[method as keyof typeof request.withReferrerPolicy]() as any;

        await request.getResponse();

        const [, options] = FetchMock.mock.calls[0];
        assert.equal(options.referrerPolicy, expected, `Policy ${method} should set referrerPolicy to ${expected}`);
      }
    });
  });

  describe("withRedirect - Fluent API", () => {
    it("should support callable form with enum value", async () => {
      FetchMock.mockResponseOnce();
      const request = new GetRequest("https://api.example.com/test").withRedirect(RedirectMode.ERROR);

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.redirect, "error");
    });

    it("should support callable form with string value", async () => {
      FetchMock.mockResponseOnce();
      const request = new GetRequest("https://api.example.com/test").withRedirect("manual");

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.redirect, "manual");
    });

    it("should support convenience method FOLLOW()", async () => {
      FetchMock.mockResponseOnce();
      const request = new GetRequest("https://api.example.com/test").withRedirect.FOLLOW();

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.redirect, "follow");
    });

    it("should support convenience method ERROR()", async () => {
      FetchMock.mockResponseOnce();
      const request = new GetRequest("https://api.example.com/test").withRedirect.ERROR();

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.redirect, "error");
    });

    it("should support convenience method MANUAL()", async () => {
      FetchMock.mockResponseOnce();
      const request = new GetRequest("https://api.example.com/test").withRedirect.MANUAL();

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.redirect, "manual");
    });
  });

  describe("withMode - Fluent API", () => {
    it("should support callable form with enum value", async () => {
      FetchMock.mockResponseOnce();
      const request = new GetRequest("https://api.example.com/test").withMode(RequestMode.CORS);

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.mode, "cors");
    });

    it("should support callable form with string value", async () => {
      FetchMock.mockResponseOnce();
      const request = new GetRequest("https://api.example.com/test").withMode("no-cors");

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.mode, "no-cors");
    });

    it("should support all convenience methods", async () => {
      const modes = [
        { method: "CORS", expected: "cors" },
        { method: "NO_CORS", expected: "no-cors" },
        { method: "SAME_ORIGIN", expected: "same-origin" },
        { method: "NAVIGATE", expected: "navigate" },
      ];

      for (const { method, expected } of modes) {
        FetchMock.reset();
        FetchMock.mockResponseOnce();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const request = new GetRequest("https://api.example.com/test").withMode[method as keyof typeof request.withMode]() as any;

        await request.getResponse();

        const [, options] = FetchMock.mock.calls[0];
        assert.equal(options.mode, expected, `Mode ${method} should set mode to ${expected}`);
      }
    });
  });

  describe("withPriority - Fluent API", () => {
    it("should support callable form with enum value", async () => {
      FetchMock.mockResponseOnce();
      const request = new GetRequest("https://api.example.com/test").withPriority(RequestPriority.HIGH);

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.priority, "high");
    });

    it("should support callable form with string value", async () => {
      FetchMock.mockResponseOnce();
      const request = new GetRequest("https://api.example.com/test").withPriority("low");

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.priority, "low");
    });

    it("should support convenience method HIGH()", async () => {
      FetchMock.mockResponseOnce();
      const request = new GetRequest("https://api.example.com/test").withPriority.HIGH();

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.priority, "high");
    });

    it("should support convenience method LOW()", async () => {
      FetchMock.mockResponseOnce();
      const request = new GetRequest("https://api.example.com/test").withPriority.LOW();

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.priority, "low");
    });

    it("should support convenience method AUTO()", async () => {
      FetchMock.mockResponseOnce();
      const request = new GetRequest("https://api.example.com/test").withPriority.AUTO();

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.priority, "auto");
    });
  });

  describe("Fluent API Method Chaining", () => {
    it("should allow chaining multiple fluent methods", async () => {
      FetchMock.mockResponseOnce();
      const request = new GetRequest("https://api.example.com/test").withCredentials
        .INCLUDE()
        .withMode.CORS()
        .withRedirect.ERROR()
        .withPriority.HIGH()
        .withReferrerPolicy.NO_REFERRER();

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.credentials, "include");
      assert.equal(options.mode, "cors");
      assert.equal(options.redirect, "error");
      assert.equal(options.priority, "high");
      assert.equal(options.referrerPolicy, "no-referrer");
    });

    it("should allow mixing callable and convenience forms", async () => {
      FetchMock.mockResponseOnce();
      const request = new GetRequest("https://api.example.com/test")
        .withCredentials(CredentialsPolicy.INCLUDE)
        .withMode.CORS()
        .withRedirect(RedirectMode.ERROR)
        .withPriority.HIGH();

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.credentials, "include");
      assert.equal(options.mode, "cors");
      assert.equal(options.redirect, "error");
      assert.equal(options.priority, "high");
    });

    it("should allow overriding fluent settings", async () => {
      FetchMock.mockResponseOnce();
      const request = new GetRequest("https://api.example.com/test").withCredentials.INCLUDE().withCredentials.OMIT(); // Override

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.credentials, "omit");
    });

    it("should allow chaining with other methods", async () => {
      FetchMock.mockResponseOnce();
      const request = new GetRequest("https://api.example.com/test").withCredentials.INCLUDE().withHeader("X-Test", "value").withQueryParam("key", "value").withTimeout(5000);

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.credentials, "include");
      const headers = options.headers as Record<string, string>;
      assert.equal(headers["X-Test"], "value");
    });
  });

  describe("Fluent API Edge Cases", () => {
    it("should handle custom string values that are not in enum", async () => {
      FetchMock.mockResponseOnce();
      // Using a custom string value that's not in the enum
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const request = new GetRequest("https://api.example.com/test").withCredentials("custom-value" as string);

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.credentials, "custom-value");
    });

    it("should maintain type safety for fluent methods", () => {
      const request = new GetRequest("https://api.example.com/test");

      // TypeScript should allow these
      assert.ok(typeof request.withCredentials.INCLUDE === "function");
      assert.ok(typeof request.withMode.CORS === "function");
      assert.ok(typeof request.withRedirect.FOLLOW === "function");
      assert.ok(typeof request.withPriority.HIGH === "function");
      assert.ok(typeof request.withReferrerPolicy.NO_REFERRER === "function");
    });
  });
});
