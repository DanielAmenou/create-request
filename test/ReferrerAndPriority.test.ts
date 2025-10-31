import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { ReferrerPolicy, RequestPriority } from "../src/enums.js";
import { GetRequest } from "../src/requestMethods.js";
import { FetchMock } from "./utils/fetchMock.js";
import create from "../src/index.js";

describe("Referrer Policy and Priority", () => {
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
      const policies = [
        ReferrerPolicy.ORIGIN,
        ReferrerPolicy.UNSAFE_URL,
        ReferrerPolicy.SAME_ORIGIN,
        ReferrerPolicy.NO_REFERRER,
        ReferrerPolicy.STRICT_ORIGIN,
        ReferrerPolicy.ORIGIN_WHEN_CROSS_ORIGIN,
        ReferrerPolicy.NO_REFERRER_WHEN_DOWNGRADE,
        ReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
      ];

      for (const policy of policies) {
        FetchMock.reset();
        FetchMock.mockResponseOnce({ body: { success: true } });
        const request = new GetRequest("https://api.example.com/test").withReferrerPolicy(policy);

        await request.get();

        const [, options] = FetchMock.mock.calls[0];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
        assert.equal((options as RequestInit).referrerPolicy, policy);
      }
    });

    it("should allow chaining withReferrerPolicy with other methods", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withReferrerPolicy(ReferrerPolicy.STRICT_ORIGIN).withHeader("X-Custom", "value").withTimeout(5000);

      await request.get();

      const [, options] = FetchMock.mock.calls[0];
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      assert.equal((options as RequestInit).referrerPolicy, ReferrerPolicy.STRICT_ORIGIN);
      const headers = options.headers as Record<string, string>;
      assert.equal(headers["X-Custom"], "value");
      // Note: withTimeout creates a signal, so we don't check it here
    });

    it("should override referrer policy when called multiple times", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withReferrerPolicy(ReferrerPolicy.NO_REFERRER).withReferrerPolicy(ReferrerPolicy.ORIGIN);

      await request.get();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.referrerPolicy, ReferrerPolicy.ORIGIN);
    });
  });

  describe("withPriority", () => {
    it("should set priority for all enum values", async () => {
      const priorities = [RequestPriority.LOW, RequestPriority.HIGH, RequestPriority.AUTO];

      for (const priority of priorities) {
        FetchMock.reset();
        FetchMock.mockResponseOnce({ body: { success: true } });
        const request = new GetRequest("https://api.example.com/test").withPriority(priority);

        await request.get();

        const [, options] = FetchMock.mock.calls[0];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
        assert.equal((options as RequestInit).priority, priority);
      }
    });

    it("should allow chaining withPriority with other methods", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withPriority(RequestPriority.HIGH).withHeader("X-Custom", "value").withReferrer("https://example.com");

      await request.get();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal((options as RequestInit).priority, RequestPriority.HIGH);
      const headers = options.headers as Record<string, string>;
      assert.equal(headers["X-Custom"], "value");
      assert.equal(options.referrer, "https://example.com");
    });

    it("should override priority when called multiple times", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withPriority(RequestPriority.LOW).withPriority(RequestPriority.HIGH);

      await request.get();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal((options as RequestInit).priority, RequestPriority.HIGH);
    });
  });

  describe("withKeepAlive", () => {
    it("should set keepalive to true", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withKeepAlive(true);

      await request.get();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.keepalive, true);
    });

    it("should set keepalive to false", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withKeepAlive(false);

      await request.get();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.keepalive, false);
    });

    it("should override keepalive when called multiple times", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withKeepAlive(true).withKeepAlive(false);

      await request.get();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.keepalive, false);
    });

    it("should allow chaining withKeepAlive with other methods", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withKeepAlive(true).withPriority(RequestPriority.HIGH).withReferrerPolicy(ReferrerPolicy.NO_REFERRER);

      await request.get();

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

      await request.get();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.referrer, "https://example.com/page");
    });

    it("should override referrer when called multiple times", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withReferrer("https://example.com/page1").withReferrer("https://example.com/page2");

      await request.get();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.referrer, "https://example.com/page2");
    });

    it("should allow chaining withReferrer with other methods", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });
      const request = new GetRequest("https://api.example.com/test").withReferrer("https://example.com").withReferrerPolicy(ReferrerPolicy.UNSAFE_URL).withKeepAlive(true);

      await request.get();

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
        .withReferrerPolicy(ReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN)
        .withPriority(RequestPriority.HIGH)
        .withKeepAlive(true)
        .withHeader("X-Custom", "value");

      await request.get();

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
