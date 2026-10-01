/**
 * One test per finding of the v2 code review (plans/10-v2-code-review.md), named after its id (R1–R16)
 * so the review table can be checked against the suite. The real-network variants live in
 * test/e2e/contract.e2e.test.ts.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { runInNewContext } from "node:vm";
import create, { HttpRequest, RequestError, ResponseWrapper, type StandardSchemaV1, createApi } from "../../src/index.js";
import { asError, flush, hanging, inBrowser, json, stalled, status, stub, unexpected } from "../utils/helpers.js";

const activeTimers = (): number => process.getActiveResourcesInfo().filter(resource => resource === "Timeout").length;

/** A body stream of `size` bytes in `chunk`-byte pieces that records whether it was cancelled. */
function streamOf(size: number, chunk = 65_536): { stream: ReadableStream<Uint8Array>; cancelled: () => boolean } {
  let sent = 0;
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      const n = Math.min(chunk, size - sent);
      controller.enqueue(new Uint8Array(n).fill(120));
      if ((sent += n) >= size) controller.close();
    },
    cancel() {
      cancelled = true;
    },
  });
  return { stream, cancelled: () => cancelled };
}

/** An arktype-shaped Standard Schema: a callable that also carries `~standard`. */
function callableSchema<T>(check: (value: unknown) => value is T): StandardSchemaV1<unknown, T> & ((value: unknown) => T | { errors: true }) {
  const fn = (value: unknown): T | { errors: true } => (check(value) ? value : { errors: true });
  return Object.assign(fn, {
    "~standard": {
      version: 1 as const,
      vendor: "test-callable",
      validate: (value: unknown): StandardSchemaV1.Result<T> => (check(value) ? { value } : { issues: [{ message: "not the expected shape" }] }),
    },
  });
}

describe("v2 review findings", () => {
  it("R1 — a callable Standard Schema (arktype) is a schema for getData(), not a selector", async () => {
    const User = callableSchema((value): value is { id: number } => typeof value === "object" && value !== null && typeof (value as { id?: unknown }).id === "number");
    const make = (body: unknown) => create.get("/x").withFetch(stub(json(body)).fetch);
    assert.deepEqual(await make({ id: 1 }).getData(User), { id: 1 });
    assert.equal(await make({ id: 1 }).getData(User, user => user.id * 2), 2);
    const error = await make({ id: "nope" }).getData(User).then(unexpected, asError);
    assert.equal(error.code, "VALIDATION");
    assert.equal(error.message, "Response validation failed: not the expected shape");
    await assert.rejects(
      make({ id: "nope" }).getData(User, user => user.id),
      { code: "VALIDATION" }
    );
    await assert.rejects(make({ id: "nope" }).getJson(User), { code: "VALIDATION" });
    assert.equal((await make({ id: "nope" }).getResult(User)).error?.code, "VALIDATION");
  });

  it("R2 — an AbortSignal.timeout() that fires is reported as TIMEOUT and ends the retries, without a phantom retry", async () => {
    const keepAlive = setTimeout(() => undefined, 5000); // AbortSignal.timeout timers are unref'd in Node
    try {
      const retries: number[] = [];
      const { fetch, calls } = stub(call => hanging(call.url, call.init));
      const error = await create
        .get("/x")
        .withSignal(AbortSignal.timeout(10))
        .withRetries({ attempts: 3, delay: 1, onRetry: ({ attempt }) => void retries.push(attempt) })
        .withFetch(fetch)
        .getResponse()
        .then(unexpected, asError);
      assert.equal(error.code, "TIMEOUT");
      assert.equal(error.message, "Request timed out");
      assert.equal(error.isTimeout, true);
      assert.deepEqual(retries, []);
      assert.equal(calls.length, 1);
      // A signal aborted before the request starts is reported with the right code as well.
      const timedOut = AbortSignal.timeout(1);
      await new Promise(resolve => setTimeout(resolve, 10));
      await assert.rejects(create.get("/x").withSignal(timedOut).withFetch(fetch).getResponse(), { code: "TIMEOUT" });
      assert.equal(calls.length, 1);
    } finally {
      clearTimeout(keepAlive);
    }
  });

  it("R3 — Blob/File/FormData/URLSearchParams/ArrayBuffer/ReadableStream bodies from another realm are sent as-is", async () => {
    class OtherFormData {
      readonly [Symbol.toStringTag] = "FormData";
    }
    class OtherBlob {
      readonly [Symbol.toStringTag] = "Blob";
    }
    const foreignBuffer = runInNewContext("new ArrayBuffer(4)") as ArrayBuffer;
    assert.equal(foreignBuffer instanceof ArrayBuffer, false, "the vm realm has its own ArrayBuffer");
    const { fetch, calls } = stub();
    const form = new OtherFormData();
    const blob = new OtherBlob();
    await create.post("/x").withContentType("application/json").withBody(form).withFetch(fetch).getResponse();
    await create.post("/x").withBody(blob).withFetch(fetch).getResponse();
    await create.post("/x").withBody(foreignBuffer).withFetch(fetch).getResponse();
    assert.equal(calls[0]!.init.body, form, "FormData is passed through untouched");
    assert.equal(calls[0]!.headers.has("content-type"), false, "even an explicit Content-Type is dropped for FormData");
    assert.equal(calls[1]!.init.body, blob);
    assert.equal(calls[1]!.headers.has("content-type"), false);
    assert.equal(calls[2]!.init.body, foreignBuffer);
    // Plain objects and arrays are still JSON, whatever their prototype.
    await create.post("/x").withBody(Object.create(null)).withFetch(fetch).getResponse();
    assert.equal(calls[3]!.init.body, "{}");
    assert.equal(calls[3]!.headers.get("content-type"), "application/json");
  });

  it("R4 — a response without a body (HEAD, 204, 304) does not leave the deadline timer running", async () => {
    const before = activeTimers();
    await create
      .head("/x")
      .withTimeout(60_000)
      .withFetch(stub(new Response(null, { status: 200 })).fetch)
      .getResponse();
    await create
      .get("/x")
      .withTimeout(60_000)
      .withFetch(stub(status(204)).fetch)
      .getResponse();
    assert.equal(activeTimers(), before, "no timer left behind");
    // A response with an unread body keeps its deadline (the body read is still covered) until it is read.
    const response = await create
      .get("/x")
      .withTimeout(60_000)
      .withFetch(stub(json({})).fetch)
      .getResponse();
    assert.equal(activeTimers(), before + 1);
    await response.getJson();
    assert.equal(activeTimers(), before);
  });

  it("R5 — timeouts and delays beyond what setTimeout can represent do not fire immediately", async () => {
    const slow = stub(() => new Promise(resolve => setTimeout(() => resolve(json({ ok: true })), 5)));
    assert.deepEqual(
      await create
        .get("/x")
        .withTimeout(2 ** 31)
        .withFetch(slow.fetch)
        .getJson(),
      { ok: true }
    );
    assert.deepEqual(await create.get("/x").withTimeout(Number.MAX_SAFE_INTEGER).withFetch(slow.fetch).getJson(), { ok: true });
    assert.deepEqual(
      await create
        .get("/x")
        .withTimeout(2 ** 31 - 1)
        .withTimeout(2 ** 31)
        .withFetch(slow.fetch)
        .getJson(),
      { ok: true },
      "the second call removes the first"
    );

    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      const { fetch, calls } = stub((_call, i) => (i === 0 ? status(503) : json({})));
      const pending = create
        .get("/x")
        .withRetries({ attempts: 1, delay: 2 ** 40 })
        .withFetch(fetch)
        .getResponse();
      await flush();
      mock.timers.tick(2 ** 31 - 2);
      await flush();
      assert.equal(calls.length, 1, "still waiting");
      mock.timers.tick(1);
      await pending;
      assert.equal(calls.length, 2, "the delay is capped at 2^31 - 1 ms rather than rounded down to 1 ms");
    } finally {
      mock.timers.reset();
    }
  });

  it("R6 — error bodies are capped at 1 MB even without a Content-Length, and the rest of the stream is cancelled", async () => {
    const big = streamOf(3_000_000);
    const error = await create
      .get("/x")
      .withFetch(stub(new Response(big.stream, { status: 500 })).fetch)
      .getResponse()
      .then(unexpected, asError);
    assert.equal(error.status, 500);
    assert.equal(error.body, undefined);
    assert.equal(big.cancelled(), true);
    const exact = streamOf(1_000_000, 300_000);
    const kept = await create
      .get("/x")
      .withFetch(stub(new Response(exact.stream, { status: 500 })).fetch)
      .getResponse()
      .then(unexpected, asError);
    assert.equal(kept.body?.length, 1_000_000);
    assert.equal(exact.cancelled(), false);
    // Multi-byte characters split across chunks survive the incremental decoding.
    const text = "ünïcödé ".repeat(1000);
    const bytes = new TextEncoder().encode(text);
    const split = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 3));
        controller.enqueue(bytes.slice(3));
        controller.close();
      },
    });
    const decoded = await create
      .get("/x")
      .withFetch(stub(new Response(split, { status: 400 })).fetch)
      .getResponse()
      .then(unexpected, asError);
    assert.equal(decoded.body, text);
  });

  it("R7 — same-origin is judged against the document base URL, like fetch resolves relative URLs", async () => {
    const page = { href: "https://app.example/page", origin: "https://app.example" };
    const document = globalThis as { document?: { cookie: string; baseURI?: string } };
    await inBrowser(
      page,
      async () => {
        const { fetch, calls } = stub();
        document.document!.baseURI = "https://evil.example/";
        await create.get("/api/x").withCsrf().withFetch(fetch).getResponse();
        await create.get("https://app.example/api/x").withCsrf().withFetch(fetch).getResponse();
        document.document!.baseURI = "https://app.example/nested/";
        await create.get("../api/x").withCsrf().withFetch(fetch).getResponse();
        assert.equal(calls[0]!.headers.has("x-xsrf-token"), false, "a cross-origin <base> makes /api/x cross-origin");
        assert.equal(calls[1]!.headers.get("x-xsrf-token"), "tok", "absolute same-origin URLs are unaffected");
        assert.equal(calls[2]!.headers.get("x-xsrf-token"), "tok");
      },
      "XSRF-TOKEN=tok"
    );
  });

  it("R8 — only own enumerable keys of header and cookie objects are used", async () => {
    const { fetch, calls } = stub();
    const headers = Object.create({ "x-inherited": "yes" }) as Record<string, string>;
    headers["x-own"] = "1";
    const cookies = Object.create({ inherited: "yes" }) as Record<string, string>;
    cookies.own = "1";
    (Object.prototype as Record<string, unknown>)["x-polluted"] = "pwned";
    try {
      await create.get("/x").withHeaders(headers).withCookies(cookies).withFetch(fetch).getResponse();
    } finally {
      delete (Object.prototype as Record<string, unknown>)["x-polluted"];
    }
    assert.deepEqual(calls[0]!.init.headers, { "x-own": "1", cookie: "own=1" });
  });

  it("R9 — a schema whose validate() throws is reported as a VALIDATION RequestError", async () => {
    const throwing: StandardSchemaV1 = {
      "~standard": {
        version: 1,
        vendor: "test",
        validate: () => {
          throw new Error("validator crashed");
        },
      },
    };
    const error = await create
      .get("/x")
      .withFetch(stub(json({})).fetch)
      .getJson(throwing)
      .then(unexpected, asError);
    assert.ok(error instanceof RequestError);
    assert.equal(error.code, "VALIDATION");
    assert.equal(error.message, "Schema validation threw: validator crashed");
    assert.equal((error.cause as Error).message, "validator crashed");
    const result = await create
      .get("/x")
      .withFetch(stub(json({})).fetch)
      .getResult(throwing);
    assert.equal(result.error?.code, "VALIDATION");
  });

  it("R10 — a wrapper returned by a response interceptor keeps its own deadline and inherits throwOnError when rewrapped", async () => {
    const rewrapped = await create
      .post("/graphql")
      .withGraphQL("q", {}, { throwOnError: true })
      .withResponseInterceptor(response => new ResponseWrapper(response.raw, response.url, response.method))
      .withFetch(stub(json({ errors: [{ message: "denied" }] })).fetch)
      .getJson()
      .then(unexpected, asError);
    assert.equal(rewrapped.code, "GRAPHQL");

    const before = activeTimers();
    const replacement = await create
      .get("/outer")
      .withTimeout(60_000)
      .withResponseInterceptor(() => create.get("/inner").withTimeout(20).withFetch(stalled()).getResponse())
      .withFetch(stub(json({ outer: true })).fetch)
      .getResponse();
    assert.equal(replacement.url, "/inner");
    const replaced = await replacement.getJson().then(unexpected, asError);
    assert.equal(replaced.code, "TIMEOUT", "the replacement's own 20ms deadline applies to it");
    assert.equal(replaced.message, "Request timed out after 20ms");
    assert.equal(activeTimers(), before, "the discarded response's 60s deadline was cleared");
  });

  it("R11 — a superseded error response is cancelled before the retry, and a replaced response before the interceptor result is used", async () => {
    const first = streamOf(2_000_000);
    const second = streamOf(2_000_000);
    const responses = [first, second].map(({ stream }) => new Response(stream, { status: 500, headers: { "content-length": "2000000" } }));
    const { fetch, calls } = stub((_call, i) => responses[i]!);
    const error = await create.get("/x").withRetries({ attempts: 1, delay: 1 }).withFetch(fetch).getResponse().then(unexpected, asError);
    assert.equal(calls.length, 2);
    assert.equal(first.cancelled(), true, "the first 2 MB body is released without waiting for GC");
    assert.equal(second.cancelled(), false, "the last one stays readable through error.response");
    assert.equal(error.response?.bodyUsed, false);

    const fetched = streamOf(10);
    await create
      .get("/x")
      .withResponseInterceptor(() => new ResponseWrapper(json({ replaced: true })))
      .withFetch(stub(new Response(fetched.stream)).fetch)
      .getJson();
    assert.equal(fetched.cancelled(), true);
  });

  it("R12 — headers fetch would reject are a VALIDATION error before fetch is called, and are not retried", async () => {
    const { fetch, calls } = stub();
    for (const [name, value] of [
      ["x-crlf", "a\r\nb"],
      ["bad name", "v"],
      ["x-unicode", "😀"],
    ] as const) {
      const error = await create.get("/x").withHeader(name, value).withRetries({ attempts: 2, delay: 1 }).withFetch(fetch).getResponse().then(unexpected, asError);
      assert.equal(error.code, "VALIDATION");
      assert.ok(error.message.startsWith("Invalid header: "), error.message);
      assert.ok(error.cause instanceof TypeError);
    }
    assert.equal(calls.length, 0);
  });

  it("R13 — a cookie without '=' never matches a name it happens to start with", async () => {
    await inBrowser(
      { href: "https://app.example/", origin: "https://app.example" },
      async () => {
        const { fetch, calls } = stub();
        await create.get("/x").withCsrf().withFetch(fetch).getResponse();
        assert.equal(calls[0]!.headers.has("x-xsrf-token"), false);
      },
      "XSRF-TOKENZ; other=1"
    );
  });

  it("R14 — `cause` is an own property of a RequestError only when one was given", () => {
    const plain = new RequestError("x", { code: "HTTP", url: "/", method: "GET" });
    assert.equal("cause" in plain, false);
    const caused = new RequestError("x", { code: "NETWORK", url: "/", method: "GET", cause: "why" });
    assert.equal(caused.cause, "why");
    assert.equal(Object.getOwnPropertyDescriptor(caused, "cause")?.enumerable, false);
    assert.equal("cause" in new HttpRequest("GET", "/x").withFetch(stub().fetch), false);
  });

  it("R15 — fetch-option setters accept the documented values through an api instance too", async () => {
    const { fetch, calls } = stub();
    await createApi()
      .withCredentials("include")
      .withMode("cors")
      .withRedirect("manual")
      .withReferrerPolicy("no-referrer")
      .withPriority("low")
      .withCache("no-store")
      .withKeepAlive()
      .withIntegrity("sha256-x")
      .withFetch(fetch)
      .get("/x")
      .getResponse();
    const { headers: _headers, method: _method, signal: _signal, ...init } = calls[0]!.init;
    assert.deepEqual(init, {
      credentials: "include",
      mode: "cors",
      redirect: "manual",
      referrerPolicy: "no-referrer",
      priority: "low",
      cache: "no-store",
      keepalive: true,
      integrity: "sha256-x",
      body: undefined,
    });
  });

  it("R16 — the timeout does not apply to a Response returned by a request interceptor (nothing was fetched)", async () => {
    const before = activeTimers();
    const short = await create
      .get("/x")
      .withTimeout(60_000)
      .withRequestInterceptor(() => json({ shortCircuited: true }))
      .withFetch(stub().fetch)
      .getResponse();
    assert.equal(activeTimers(), before, "no deadline is armed for a short-circuit response");
    assert.deepEqual(await short.getJson(), { shortCircuited: true });
  });

  describe("with fake timers", () => {
    beforeEach(() => mock.timers.enable({ apis: ["setTimeout"] }));
    afterEach(() => mock.timers.reset());

    it("R2b — a user signal aborted during the retry delay ends the retries with that signal's own classification", async () => {
      const controller = new AbortController();
      const { fetch, calls } = stub(status(503));
      const pending = create.get("/x").withSignal(controller.signal).withRetries({ attempts: 3, delay: 1000 }).withFetch(fetch).getResponse();
      pending.catch(() => undefined);
      await flush();
      controller.abort(new DOMException("took too long", "TimeoutError"));
      await flush();
      mock.timers.runAll();
      const error = await pending.then(unexpected, asError);
      assert.equal(error.code, "TIMEOUT");
      assert.equal(calls.length, 1);
    });
  });
});
