import assert from "node:assert/strict";
import { describe, it } from "node:test";
import create, { RequestError } from "../../src/index.js";
import { asError, hanging, stub, unexpected } from "../utils/helpers.js";

describe("withTimeout", () => {
  it("aborts the attempt after the deadline with a TIMEOUT error", async () => {
    const started = Date.now();
    const error = await create.get("/x").withTimeout(30).withFetch(hanging).getResponse().then(unexpected, asError);
    assert.ok(error instanceof RequestError);
    assert.equal(error.code, "TIMEOUT");
    assert.equal(error.message, "Request timed out after 30ms");
    assert.equal(error.isTimeout, true);
    assert.ok(error.cause instanceof DOMException && error.cause.name === "AbortError");
    assert.ok(Date.now() - started >= 25);
  });

  it("passes a signal to fetch only when there is something to abort, and clears the timer on completion", async () => {
    const { fetch, calls } = stub();
    await create.get("/x").withFetch(fetch).getResponse();
    assert.equal(calls[0]!.init.signal, undefined);
    await create.get("/x").withTimeout(10_000).withFetch(fetch).getResponse();
    assert.ok(calls[1]!.init.signal instanceof AbortSignal);
    assert.equal(calls[1]!.init.signal.aborted, false);
  });

  it("starts the clock after request interceptors have run", async () => {
    const { fetch, calls } = stub();
    await create
      .get("/x")
      .withTimeout(20)
      .withRequestInterceptor(() => new Promise(resolve => setTimeout(resolve, 40)))
      .withFetch(fetch)
      .getResponse();
    assert.equal(calls.length, 1);
  });
});

describe("withSignal / withAbortController", () => {
  it("rejects with an ABORTED error when the signal aborts, keeping the reason as cause", async () => {
    const controller = new AbortController();
    const promise = create.get("/x").withAbortController(controller).withFetch(hanging).getResponse();
    const reason = new Error("navigated away");
    setTimeout(() => controller.abort(reason), 5);
    const error = await promise.then(unexpected, asError);
    assert.equal(error.code, "ABORTED");
    assert.equal(error.message, "Request aborted");
    assert.equal(error.isAborted, true);
    assert.equal(error.cause, reason);
  });

  it("an already-aborted signal fails immediately, before interceptors and fetch", async () => {
    const controller = new AbortController();
    controller.abort("gone");
    const { fetch, calls } = stub();
    let intercepted = 0;
    const error = await create
      .get("/x")
      .withSignal(controller.signal)
      .withRequestInterceptor(() => void intercepted++)
      .withFetch(fetch)
      .getResponse()
      .then(unexpected, asError);
    assert.equal(error.code, "ABORTED");
    assert.equal(error.cause, "gone");
    assert.equal(calls.length, 0);
    assert.equal(intercepted, 0);
  });

  it("combines several signals and the timeout: whichever fires first wins", async () => {
    const a = new AbortController();
    const b = new AbortController();
    const promise = create.get("/x").withSignal(a.signal).withSignal(b.signal).withTimeout(10_000).withFetch(hanging).getResponse();
    setTimeout(() => b.abort(), 5);
    await assert.rejects(promise, { code: "ABORTED" });

    const c = new AbortController();
    await assert.rejects(create.get("/x").withSignal(c.signal).withTimeout(10).withFetch(hanging).getResponse(), { code: "TIMEOUT" });
    assert.equal(c.signal.aborted, false);
  });

  it("falls back to a manual combiner when AbortSignal.any is unavailable", async () => {
    const original = AbortSignal.any;
    Object.defineProperty(AbortSignal, "any", { value: undefined, configurable: true, writable: true });
    try {
      const a = new AbortController();
      const b = new AbortController();
      const promise = create.get("/x").withSignal(a.signal).withSignal(b.signal).withFetch(hanging).getResponse();
      setTimeout(() => b.abort("custom reason"), 5);
      const error = await promise.then(unexpected, asError);
      assert.equal(error.code, "ABORTED");
      assert.equal(error.cause, "custom reason");

      const done = new AbortController();
      done.abort();
      const { fetch, calls } = stub();
      await assert.rejects(create.get("/x").withSignal(new AbortController().signal).withSignal(done.signal).withSignal(a.signal).withFetch(fetch).getResponse(), {
        code: "ABORTED",
      });
      assert.equal(calls.length, 0);
    } finally {
      Object.defineProperty(AbortSignal, "any", { value: original, configurable: true, writable: true });
    }
  });

  it("a signal replaced by a request interceptor is respected", async () => {
    const mine = new AbortController();
    const promise = create
      .get("/x")
      .withRequestInterceptor(config => {
        config.signal = mine.signal;
      })
      .withFetch(hanging)
      .getResponse();
    setTimeout(() => mine.abort(), 5);
    await assert.rejects(promise, { code: "ABORTED" });
  });

  it("a fetch that rejects with an AbortError while no signal aborted is a NETWORK error", async () => {
    const error = await create
      .get("/x")
      .withFetch(async () => Promise.reject(new DOMException("The operation was aborted", "AbortError")))
      .getResponse()
      .then(unexpected, asError);
    assert.equal(error.code, "NETWORK");
  });
});
