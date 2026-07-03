import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import create, { createApi, RequestError, type FetchFunction } from "../src/index.js";
import { FetchMock, createMockResponse } from "./utils/fetchMock.js";

type FetchCall = { input: string | URL | globalThis.Request; init?: RequestInit };

/** Creates a fetch stub that records calls and returns queued responses (last one repeats) */
function createFetchStub(...responses: Array<() => Response | Promise<Response>>) {
  const calls: FetchCall[] = [];
  const stub: FetchFunction = (input, init) => {
    calls.push({ input, init });
    const factory = responses.length > 1 ? responses.shift() : responses[0];
    return Promise.resolve(factory ? factory() : createMockResponse({ body: { ok: true } }));
  };
  return { stub, calls };
}

/**
 * A fetch stub that would respond after 5 seconds but honors `init.signal`,
 * like a real fetch would. The pending timer keeps the event loop alive so
 * abort/timeout signals get a chance to fire.
 */
function slowFetchRespectingSignal(init?: RequestInit): Promise<Response> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(createMockResponse({ body: { late: true } })), 5000);
    init?.signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });
}

describe("withFetch", { timeout: 10000 }, () => {
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

  describe("Basic behavior", () => {
    it("should use the custom fetch instead of the global fetch", async () => {
      const { stub, calls } = createFetchStub(() => createMockResponse({ body: { source: "custom" } }));

      const data = await create.get("https://api.example.com/users").withFetch(stub).getJson();

      assert.deepEqual(data, { source: "custom" });
      assert.equal(calls.length, 1);
      assert.equal(FetchMock.mock.calls.length, 0, "global fetch must not be called");
    });

    it("should pass the final URL (with query params) and RequestInit to the custom fetch", async () => {
      const { stub, calls } = createFetchStub();

      await create.get("https://api.example.com/users").withQueryParams({ page: 2 }).withHeader("X-Test", "1").withFetch(stub).getJson();

      assert.equal(calls[0].input, "https://api.example.com/users?page=2");
      assert.equal(calls[0].init?.method, "GET");
      const headers = calls[0].init?.headers as Record<string, string>;
      assert.equal(headers["X-Test"], "1");
    });

    it("should work for requests with a body", async () => {
      const { stub, calls } = createFetchStub();

      await create.post("https://api.example.com/users").withBody({ name: "Ada" }).withFetch(stub).getJson();

      assert.equal(calls[0].init?.method, "POST");
      assert.equal(calls[0].init?.body, '{"name":"Ada"}');
      const headers = calls[0].init?.headers as Record<string, string>;
      assert.equal(headers["Content-Type"], "application/json");
    });

    it("should throw a RequestError when given a non-function", () => {
      assert.throws(
        () => create.get("https://api.example.com").withFetch("not a function" as unknown as FetchFunction),
        (error: unknown) => error instanceof RequestError
      );
    });

    it("should convert a rejection from the custom fetch into a network RequestError", async () => {
      const failingFetch: FetchFunction = () => Promise.reject(new TypeError("socket hang up"));

      await assert.rejects(create.get("https://api.example.com").withFetch(failingFetch).getJson(), (error: unknown) => {
        assert.ok(error instanceof RequestError);
        assert.equal(error.status, undefined);
        assert.equal(error.isTimeout, false);
        return true;
      });
    });

    it("should throw a RequestError with status and body for non-ok responses from the custom fetch", async () => {
      const { stub } = createFetchStub(() => createMockResponse({ status: 404, body: { error: "missing" } }));

      await assert.rejects(create.get("https://api.example.com/nope").withFetch(stub).getJson(), (error: unknown) => {
        assert.ok(error instanceof RequestError);
        assert.equal(error.status, 404);
        assert.deepEqual(error.getJson(), { error: "missing" });
        return true;
      });
    });
  });

  describe("Interaction with other features", () => {
    it("should call the custom fetch once per retry attempt", async () => {
      const { stub, calls } = createFetchStub(
        () => createMockResponse({ status: 500, body: { error: "boom" } }),
        () => createMockResponse({ status: 500, body: { error: "boom" } }),
        () => createMockResponse({ body: { ok: true } })
      );
      const attempts: number[] = [];

      const data = await create
        .get("https://api.example.com/flaky")
        .withFetch(stub)
        .withRetries(3)
        .onRetry(({ attempt }) => {
          attempts.push(attempt);
        })
        .getJson();

      assert.deepEqual(data, { ok: true });
      assert.equal(calls.length, 3);
      assert.deepEqual(attempts, [1, 2]);
    });

    it("should pass an abort signal that fires on timeout", async () => {
      const abortedFetch: FetchFunction = (_input, init) => slowFetchRespectingSignal(init);

      await assert.rejects(create.get("https://api.example.com/slow").withFetch(abortedFetch).withTimeout(30).getJson(), (error: unknown) => {
        assert.ok(error instanceof RequestError);
        assert.equal(error.isTimeout, true);
        return true;
      });
    });

    it("should support manual aborts through the custom fetch's signal", async () => {
      const abortedFetch: FetchFunction = (_input, init) => slowFetchRespectingSignal(init);

      const controller = new AbortController();
      const pending = create.get("https://api.example.com/slow").withFetch(abortedFetch).withAbortController(controller).getJson();
      setTimeout(() => controller.abort(), 10);

      await assert.rejects(pending, (error: unknown) => {
        assert.ok(error instanceof RequestError);
        assert.equal(error.isAborted, true);
        return true;
      });
    });

    it("should apply request interceptor changes before calling the custom fetch", async () => {
      const { stub, calls } = createFetchStub();

      await create
        .get("https://api.example.com/users")
        .withFetch(stub)
        .withRequestInterceptor(config => {
          config.headers["X-From-Interceptor"] = "yes";
          return config;
        })
        .getJson();

      const headers = calls[0].init?.headers as Record<string, string>;
      assert.equal(headers["X-From-Interceptor"], "yes");
    });

    it("should not call the custom fetch when a request interceptor short-circuits", async () => {
      const { stub, calls } = createFetchStub();

      const data = await create
        .get("https://api.example.com/users")
        .withFetch(stub)
        .withRequestInterceptor(() => createMockResponse({ body: { shortCircuited: true } }))
        .getJson();

      assert.deepEqual(data, { shortCircuited: true });
      assert.equal(calls.length, 0);
    });
  });

  describe("Api builder", () => {
    it("should apply a builder-level custom fetch to all requests", async () => {
      const { stub, calls } = createFetchStub(() => createMockResponse({ body: { via: "builder" } }));
      const api = createApi().withBaseURL("https://api.example.com").withFetch(stub);

      const first = await api.get("/one").getJson();
      const second = await api.post("/two").withBody({ n: 2 }).getJson();

      assert.deepEqual(first, { via: "builder" });
      assert.deepEqual(second, { via: "builder" });
      assert.equal(calls.length, 2);
      assert.equal(calls[0].input, "https://api.example.com/one");
      assert.equal(calls[1].input, "https://api.example.com/two");
      assert.equal(FetchMock.mock.calls.length, 0);
    });

    it("should let a per-request withFetch override the builder-level one", async () => {
      const builderStub = createFetchStub(() => createMockResponse({ body: { via: "builder" } }));
      const requestStub = createFetchStub(() => createMockResponse({ body: { via: "request" } }));
      const api = createApi().withBaseURL("https://api.example.com").withFetch(builderStub.stub);

      const data = await api.get("/x").withFetch(requestStub.stub).getJson();

      assert.deepEqual(data, { via: "request" });
      assert.equal(builderStub.calls.length, 0);
      assert.equal(requestStub.calls.length, 1);
    });
  });
});
