import assert from "node:assert/strict";
import { describe, it } from "node:test";
import create, { RequestError, createApi } from "../../src/index.js";
import { asError, hanging, json, readAll, stalled, stub, unexpected } from "../utils/helpers.js";

describe("the timeout covers the whole exchange", () => {
  it("fails with TIMEOUT when the body stalls after the headers arrived", async () => {
    const started = Date.now();
    const error = await create.get("/x").withTimeout(30).withFetch(stalled()).getJson().then(unexpected, asError);
    assert.equal(error.code, "TIMEOUT");
    assert.equal(error.message, "Request timed out after 30ms");
    assert.equal(error.status, 200);
    assert.ok(Date.now() - started < 1000);
  });

  it("does the same when the wrapper is read later — even after the deadline already passed — and for a stalled error body", async () => {
    const response = await create.get("/x").withTimeout(30).withFetch(stalled()).getResponse();
    await assert.rejects(response.getText(), { code: "TIMEOUT" });
    await assert.rejects(response.getJson(), { code: "TIMEOUT" });
    const late = await create.get("/x").withTimeout(20).withFetch(stalled()).getResponse();
    await new Promise(resolve => setTimeout(resolve, 40));
    await assert.rejects(late.getText(), { code: "TIMEOUT" });
    const error = await create
      .get("/x")
      .withTimeout(30)
      .withFetch(stalled({ status: 500 }))
      .getResponse()
      .then(unexpected, asError);
    assert.equal(error.code, "HTTP");
    assert.equal(error.status, 500);
    assert.equal(error.body, undefined);
  });

  it("classifies an abort during the body read as ABORTED, and a TimeoutError signal as TIMEOUT", async () => {
    const controller = new AbortController();
    const promise = create.get("/x").withAbortController(controller).withFetch(stalled()).getJson();
    setTimeout(() => controller.abort(), 10);
    await assert.rejects(promise, { code: "ABORTED", message: "Request aborted" });
    const keepAlive = setTimeout(() => undefined, 5000); // AbortSignal.timeout timers are unref'd in Node
    try {
      await assert.rejects(create.get("/x").withSignal(AbortSignal.timeout(10)).withFetch(stalled()).getJson(), { code: "TIMEOUT", message: "Request timed out" });
      await assert.rejects(create.get("/x").withSignal(AbortSignal.timeout(10)).withFetch(hanging).getJson(), { code: "TIMEOUT", message: "Request timed out" });
    } finally {
      clearTimeout(keepAlive);
    }
  });

  it("getBody() takes over the deadline: a slow stream is not aborted by the timeout", async () => {
    const slow = new Response(
      new ReadableStream<Uint8Array>({
        async start(controller) {
          for (const chunk of ["a", "b", "c"]) {
            await new Promise(resolve => setTimeout(resolve, 20));
            controller.enqueue(new TextEncoder().encode(chunk));
          }
          controller.close();
        },
      })
    );
    const stream = await create.get("/x").withTimeout(30).withFetch(stub(slow).fetch).getBody();
    assert.equal((await readAll(stream!)).text, "abc");
  });

  it("a response interceptor reading the body still benefits from the deadline, and a throwing one clears it", async () => {
    let seen: unknown;
    await create
      .get("/x")
      .withTimeout(1000)
      .withResponseInterceptor(async response => void (seen = await response.getJson()))
      .withFetch(stub(json({ ok: 1 })).fetch)
      .getResponse();
    assert.deepEqual(seen, { ok: 1 });
    await assert.rejects(
      create
        .get("/x")
        .withTimeout(1000)
        .withResponseInterceptor(() => {
          throw new Error("boom");
        })
        .withFetch(stub(json({})).fetch)
        .getResponse(),
      { code: "INTERCEPTOR" }
    );
    await assert.rejects(
      create
        .get("/x")
        .withTimeout(30)
        .withResponseInterceptor(response => response.getJson())
        .withFetch(stalled())
        .getResponse(),
      { code: "INTERCEPTOR", message: "Response interceptor failed: Request timed out after 30ms" }
    );
  });

  it("a replacement wrapper returned by an interceptor can be read normally within the deadline", async () => {
    const replacement = await create
      .get("/x")
      .withTimeout(1000)
      .withResponseInterceptor(() =>
        create
          .get("/y")
          .withFetch(stub(json({ replaced: true })).fetch)
          .getResponse()
      )
      .withFetch(stub(json({})).fetch)
      .getResponse();
    assert.deepEqual(await replacement.getJson(), { replaced: true });
  });
});

describe("review follow-ups", () => {
  it("a retry delay ends immediately when the signal was aborted inside onRetry", async () => {
    const controller = new AbortController();
    const started = Date.now();
    const { fetch, calls } = stub(new Response(null, { status: 503 }));
    await assert.rejects(
      create
        .get("/x")
        .withRetries({
          attempts: 1,
          delay: 60_000,
          onRetry: async () => {
            await Promise.resolve();
            controller.abort();
          },
        })
        .withAbortController(controller)
        .withFetch(fetch)
        .getResponse(),
      { code: "ABORTED" }
    );
    assert.equal(calls.length, 1);
    assert.ok(Date.now() - started < 1000);
  });

  it("a FormData body drops a Content-Type inherited from an api", async () => {
    const { fetch, calls } = stub();
    await createApi().withContentType("application/json").withFetch(fetch).post("/upload").withBody(new FormData()).getResponse();
    assert.equal(calls[0]!.headers.has("content-type"), false);
  });

  it("a fetch implementation that returns nothing produces a RequestError, not a TypeError", async () => {
    const error = await create
      .get("/x")
      .withFetch(async () => undefined as unknown as Response)
      .getResponse()
      .then(unexpected, asError);
    assert.ok(error instanceof RequestError);
    assert.equal(error.code, "NETWORK");
    assert.ok(error.message.startsWith("Unexpected error: "));
    assert.ok(error.cause instanceof TypeError);
    const result = await create
      .get("/x")
      .withFetch(async () => undefined as unknown as Response)
      .getResult();
    assert.ok(result.error instanceof RequestError);
  });

  it("Retry-After accepts fractional seconds", async () => {
    const delays: number[] = [];
    const { fetch } = stub((_call, i) => (i === 0 ? new Response(null, { status: 503, headers: { "retry-after": "0.05" } }) : json({})));
    await create
      .get("/x")
      .withRetries({ attempts: 1, onRetry: ({ delay }) => void delays.push(delay) })
      .withFetch(fetch)
      .getResponse();
    assert.deepEqual(delays, [50]);
  });

  it("api defaults are validated when they are set, not when a request is created", () => {
    assert.throws(() => createApi().withTimeout(-1), { code: "VALIDATION" });
    assert.throws(() => createApi().withRetries(-1), { code: "VALIDATION" });
  });

  it("response and error interceptors receive the request, so a failed request can be replayed", async () => {
    let token = "expired";
    const replayed = new WeakSet();
    const { fetch, calls } = stub(call => (call.headers.get("authorization") === "Bearer fresh" ? json({ ok: true }) : new Response(null, { status: 401 })));
    const methods: string[] = [];
    const api = createApi()
      .withFetch(fetch)
      .withRequestInterceptor(config => void (config.headers.authorization = `Bearer ${token}`))
      .withResponseInterceptor((_response, request) => void methods.push(request.method))
      .withErrorInterceptor(async (error, request) => {
        if (error.status !== 401 || replayed.has(request)) return;
        token = "fresh";
        const retry = request.clone();
        replayed.add(retry);
        return retry.getResponse();
      });
    assert.deepEqual(await api.post("/x").withBody({ n: 1 }).getJson(), { ok: true });
    assert.equal(calls.length, 2);
    assert.equal(calls[1]!.init.body, '{"n":1}');
    assert.deepEqual(methods, ["POST"]);

    // a persistent 401 is not replayed forever
    token = "expired";
    const { fetch: always401, calls: calls401 } = stub(new Response(null, { status: 401 }));
    await assert.rejects(api.withFetch(always401).get("/x").getResponse(), { status: 401 });
    assert.equal(calls401.length, 2);
  });
});
