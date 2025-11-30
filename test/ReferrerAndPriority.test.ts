import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { ReferrerPolicy, RequestPriority } from "../src/enums.js";
import { GetRequest } from "../src/requestMethods.js";
import { FetchMock } from "./utils/fetchMock.js";
import create from "../src/index.js";

describe("Referrer Policy and Priority", { timeout: 10000 }, () => {
  beforeEach(() => {
    FetchMock.install();
    create.config.setEnableAntiCsrf(false);
  });

  afterEach(() => {
    FetchMock.reset();
    FetchMock.restore();
    create.config.reset();
  });

  describe("withReferrerPolicy", () => {
    it("should set referrer policy for all enum values", async () => {
      const policyTests = [
        { method: "ORIGIN", value: ReferrerPolicy.ORIGIN },
        { method: "UNSAFE_URL", value: ReferrerPolicy.UNSAFE_URL },
        { method: "SAME_ORIGIN", value: ReferrerPolicy.SAME_ORIGIN },
        { method: "NO_REFERRER", value: ReferrerPolicy.NO_REFERRER },
        { method: "STRICT_ORIGIN", value: ReferrerPolicy.STRICT_ORIGIN },
        { method: "ORIGIN_WHEN_CROSS_ORIGIN", value: ReferrerPolicy.ORIGIN_WHEN_CROSS_ORIGIN },
        { method: "NO_REFERRER_WHEN_DOWNGRADE", value: ReferrerPolicy.NO_REFERRER_WHEN_DOWNGRADE },
        { method: "STRICT_ORIGIN_WHEN_CROSS_ORIGIN", value: ReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN },
      ];

      for (const { method, value } of policyTests) {
        FetchMock.reset();
        FetchMock.mockResponseOnce({ body: { success: true } });
        const request = new GetRequest("https://api.example.com/test");
        // @ts-expect-error - dynamic method access for testing
        request.withReferrerPolicy[method]();

        await request.getResponse();

        const [, options] = FetchMock.mock.calls[0];
        assert.equal((options as RequestInit).referrerPolicy, value);
      }
    });

    it("should set referrer policy using explicit fluent API methods", async () => {
      // Test all explicit methods to ensure coverage
      FetchMock.mockResponseOnce();
      const request1 = new GetRequest("https://api.example.com/test").withReferrerPolicy.ORIGIN();
      await request1.getResponse();
      const [, options1] = FetchMock.mock.calls[0] as [string, RequestInit];
      assert.equal(options1.referrerPolicy, ReferrerPolicy.ORIGIN);

      FetchMock.reset();
      FetchMock.mockResponseOnce();
      const request2 = new GetRequest("https://api.example.com/test").withReferrerPolicy.UNSAFE_URL();
      await request2.getResponse();
      const [, options2] = FetchMock.mock.calls[0] as [string, RequestInit];
      assert.equal(options2.referrerPolicy, ReferrerPolicy.UNSAFE_URL);

      FetchMock.reset();
      FetchMock.mockResponseOnce();
      const request3 = new GetRequest("https://api.example.com/test").withReferrerPolicy.SAME_ORIGIN();
      await request3.getResponse();
      const [, options3] = FetchMock.mock.calls[0] as [string, RequestInit];
      assert.equal(options3.referrerPolicy, ReferrerPolicy.SAME_ORIGIN);

      FetchMock.reset();
      FetchMock.mockResponseOnce();
      const request4 = new GetRequest("https://api.example.com/test").withReferrerPolicy.NO_REFERRER();
      await request4.getResponse();
      const [, options4] = FetchMock.mock.calls[0] as [string, RequestInit];
      assert.equal(options4.referrerPolicy, ReferrerPolicy.NO_REFERRER);

      FetchMock.reset();
      FetchMock.mockResponseOnce();
      const request5 = new GetRequest("https://api.example.com/test").withReferrerPolicy.STRICT_ORIGIN();
      await request5.getResponse();
      const [, options5] = FetchMock.mock.calls[0] as [string, RequestInit];
      assert.equal(options5.referrerPolicy, ReferrerPolicy.STRICT_ORIGIN);

      FetchMock.reset();
      FetchMock.mockResponseOnce();
      const request6 = new GetRequest("https://api.example.com/test").withReferrerPolicy.ORIGIN_WHEN_CROSS_ORIGIN();
      await request6.getResponse();
      const [, options6] = FetchMock.mock.calls[0] as [string, RequestInit];
      assert.equal(options6.referrerPolicy, ReferrerPolicy.ORIGIN_WHEN_CROSS_ORIGIN);

      FetchMock.reset();
      FetchMock.mockResponseOnce();
      const request7 = new GetRequest("https://api.example.com/test").withReferrerPolicy.NO_REFERRER_WHEN_DOWNGRADE();
      await request7.getResponse();
      const [, options7] = FetchMock.mock.calls[0] as [string, RequestInit];
      assert.equal(options7.referrerPolicy, ReferrerPolicy.NO_REFERRER_WHEN_DOWNGRADE);

      FetchMock.reset();
      FetchMock.mockResponseOnce();
      const request8 = new GetRequest("https://api.example.com/test").withReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN();
      await request8.getResponse();
      const [, options8] = FetchMock.mock.calls[0] as [string, RequestInit];
      assert.equal(options8.referrerPolicy, ReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN);
    });

    it("should allow chaining withReferrerPolicy with other methods", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withReferrerPolicy.STRICT_ORIGIN().withHeader("X-Custom", "value").withTimeout(5000);

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal((options as RequestInit).referrerPolicy, ReferrerPolicy.STRICT_ORIGIN);
      const headers = options.headers as Record<string, string>;
      assert.equal(headers["X-Custom"], "value");
      // Note: withTimeout creates a signal, so we don't check it here
    });

    it("should override referrer policy when called multiple times", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withReferrerPolicy.NO_REFERRER().withReferrerPolicy.ORIGIN();

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.referrerPolicy, ReferrerPolicy.ORIGIN);
    });
  });

  describe("withPriority", () => {
    it("should set priority for all enum values", async () => {
      const priorityTests = [
        { method: "LOW", value: RequestPriority.LOW },
        { method: "HIGH", value: RequestPriority.HIGH },
        { method: "AUTO", value: RequestPriority.AUTO },
      ];

      for (const { method, value } of priorityTests) {
        FetchMock.reset();
        FetchMock.mockResponseOnce({ body: { success: true } });
        const request = new GetRequest("https://api.example.com/test");
        // @ts-expect-error - dynamic method access for testing
        request.withPriority[method]();

        await request.getResponse();

        const [, options] = FetchMock.mock.calls[0];
        assert.equal((options as RequestInit).priority, value);
      }
    });

    it("should allow chaining withPriority with other methods", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withPriority.HIGH().withHeader("X-Custom", "value").withReferrer("https://example.com");

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal((options as RequestInit).priority, RequestPriority.HIGH);
      const headers = options.headers as Record<string, string>;
      assert.equal(headers["X-Custom"], "value");
      assert.equal(options.referrer, "https://example.com");
    });

    it("should override priority when called multiple times", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withPriority.LOW().withPriority.HIGH();

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal((options as RequestInit).priority, RequestPriority.HIGH);
    });
  });

  describe("withKeepAlive", () => {
    it("should set keepalive to true", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withKeepAlive(true);

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.keepalive, true);
    });

    it("should set keepalive to false", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withKeepAlive(false);

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.keepalive, false);
    });

    it("should override keepalive when called multiple times", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withKeepAlive(true).withKeepAlive(false);

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.keepalive, false);
    });

    it("should allow chaining withKeepAlive with other methods", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withKeepAlive(true).withPriority.HIGH().withReferrerPolicy.NO_REFERRER();

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.keepalive, true);
      assert.equal((options as RequestInit).priority, RequestPriority.HIGH);
      assert.equal(options.referrerPolicy, ReferrerPolicy.NO_REFERRER);
    });
  });

  describe("withReferrer", () => {
    it("should set referrer URL", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withReferrer("https://example.com/page");

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.referrer, "https://example.com/page");
    });

    it("should override referrer when called multiple times", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withReferrer("https://example.com/page1").withReferrer("https://example.com/page2");

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.referrer, "https://example.com/page2");
    });

    it("should allow chaining withReferrer with other methods", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withReferrer("https://example.com").withReferrerPolicy.UNSAFE_URL().withKeepAlive(true);

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.referrer, "https://example.com");
      assert.equal(options.referrerPolicy, ReferrerPolicy.UNSAFE_URL);
      assert.equal(options.keepalive, true);
    });
  });

  describe("Combined configuration", () => {
    it("should work with all referrer and priority options together", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test")
        .withReferrer("https://example.com")
        .withReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN()
        .withPriority.HIGH()
        .withKeepAlive(true)
        .withHeader("X-Custom", "value");

      await request.getResponse();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.referrer, "https://example.com");
      assert.equal(options.referrerPolicy, ReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN);
      assert.equal((options as RequestInit).priority, RequestPriority.HIGH);
      assert.equal(options.keepalive, true);
      const headers = options.headers as Record<string, string>;
      assert.equal(headers["X-Custom"], "value");
    });
  });
});
