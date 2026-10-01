import assert from "node:assert/strict";
import { describe, it } from "node:test";
import create, { type HttpRequest, RequestError, ResponseWrapper, createApi } from "../../src/index.js";
import { asError, hanging, json, status, stub, unexpected } from "../utils/helpers.js";

describe("request interceptors — chaining", () => {
  it("each interceptor sees the previous one's result, whether mutated or returned", async () => {
    const { fetch, calls } = stub();
    await create
      .post("/x")
      .withBody({ v: 1 })
      .withRequestInterceptor(config => {
        config.headers.step = "1";
      })
      .withRequestInterceptor(config => ({ ...config, headers: { ...config.headers, step: `${config.headers.step}-2` } }))
      .withRequestInterceptor(async config => {
        await Promise.resolve();
        config.headers.step = `${config.headers.step}-3`;
        config.body = JSON.stringify({ v: 2 });
        config.method = "PUT";
      })
      .withFetch(fetch)
      .getResponse();
    assert.equal(calls[0]!.headers.get("step"), "1-2-3");
    assert.equal(calls[0]!.init.body, '{"v":2}');
    assert.equal(calls[0]!.init.method, "PUT");
  });

  it("a replaced signal in the config reaches fetch, combined with the timeout", async () => {
    const mine = new AbortController();
    const { fetch, calls } = stub();
    await create
      .get("/x")
      .withTimeout(1000)
      .withRequestInterceptor(config => {
        config.signal = mine.signal;
      })
      .withFetch(fetch)
      .getResponse();
    assert.ok(calls[0]!.init.signal instanceof AbortSignal);
    assert.notEqual(calls[0]!.init.signal, mine.signal);
  });

  it("interceptors run for every retry attempt, with a fresh config each time", async () => {
    const seen: string[] = [];
    const { fetch } = stub((_call, i) => (i < 2 ? status(503) : json({})));
    await create
      .get("/x")
      .withRetries({ attempts: 2, delay: 1 })
      .withRequestInterceptor(config => {
        seen.push(config.headers["x-attempt"] ?? "none");
        config.headers["x-attempt"] = "set";
      })
      .withFetch(fetch)
      .getResponse();
    assert.deepEqual(seen, ["none", "none", "none"]);
  });

  it("a short-circuit Response with a used body still yields an HTTP error without a body", async () => {
    const used = status(500, { reason: "x" });
    await used.text();
    const error = await create
      .get("/x")
      .withRequestInterceptor(() => used)
      .getResponse()
      .then(unexpected, asError);
    assert.equal(error.code, "HTTP");
    assert.equal(error.body, undefined);
  });

  it("a short-circuit Response is not fetched, not retried, and goes through response interceptors", async () => {
    let responses = 0;
    const { fetch, calls } = stub();
    await assert.rejects(
      create
        .get("/x")
        .withRetries({ attempts: 2, delay: 1 })
        .withRequestInterceptor(() => status(503))
        .withResponseInterceptor(() => void responses++)
        .withFetch(fetch)
        .getResponse(),
      { status: 503 }
    );
    assert.equal(calls.length, 0);
    assert.equal(responses, 0);
    const data = await create
      .get("/x")
      .withRequestInterceptor(() => json({ hit: true }))
      .withResponseInterceptor(() => void responses++)
      .withFetch(fetch)
      .getJson();
    assert.deepEqual(data, { hit: true });
    assert.equal(responses, 1);
  });

  it("a non-Error thrown by an interceptor is reported with its string form", async () => {
    const error = await create
      .get("/x")
      .withRequestInterceptor(() => {
        throw { code: 42 };
      })
      .withFetch(stub().fetch)
      .getResponse()
      .then(unexpected, asError);
    assert.equal(error.code, "INTERCEPTOR");
    assert.equal(error.message, "Request interceptor failed: [object Object]");
    assert.deepEqual(error.cause, { code: 42 });
  });
});

describe("response interceptors — chaining", () => {
  it("receive the request and can build a different wrapper from it", async () => {
    const { fetch } = stub(json({ page: 1 }));
    const data = await create
      .get("/x")
      .withResponseInterceptor((response, request) =>
        response.status === 200 && request.method === "GET" ? new ResponseWrapper(json({ page: 2 }), response.url, request.method) : undefined
      )
      .withFetch(fetch)
      .getJson();
    assert.deepEqual(data, { page: 2 });
  });

  it("run after the status check, so they never see an error response", async () => {
    let ran = false;
    await assert.rejects(
      create
        .get("/x")
        .withResponseInterceptor(() => void (ran = true))
        .withFetch(stub(status(404)).fetch)
        .getResponse(),
      { status: 404 }
    );
    assert.equal(ran, false);
  });

  it("run once per successful attempt, not for failed attempts", async () => {
    let ran = 0;
    const { fetch } = stub((_call, i) => (i === 0 ? status(503) : json({})));
    await create
      .get("/x")
      .withRetries({ attempts: 1, delay: 1 })
      .withResponseInterceptor(() => void ran++)
      .withFetch(fetch)
      .getResponse();
    assert.equal(ran, 1);
  });

  it("an async interceptor that reads the body does not prevent the caller from reading it too", async () => {
    let seen: unknown;
    const data = await create
      .get("/x")
      .withResponseInterceptor(async response => void (seen = await response.getJson()))
      .withFetch(stub(json({ shared: true })).fetch)
      .getJson();
    assert.deepEqual(seen, { shared: true });
    assert.deepEqual(data, { shared: true });
  });
});

describe("error interceptors — chaining", () => {
  it("see the final error after retries, with the request, and can recover asynchronously", async () => {
    const seen: [number | undefined, string][] = [];
    const { fetch, calls } = stub(status(503));
    const data = await create
      .get("/x")
      .withRetries({ attempts: 2, delay: 1 })
      .withErrorInterceptor(async (error, request) => {
        seen.push([error.status, request.url]);
        await Promise.resolve();
        return new ResponseWrapper(json({ recovered: true }));
      })
      .withFetch(fetch)
      .getJson();
    assert.equal(calls.length, 3);
    assert.deepEqual(seen, [[503, "/x"]]);
    assert.deepEqual(data, { recovered: true });
  });

  it("a replacement error from one interceptor is what the next one receives", async () => {
    const seen: string[] = [];
    const error = await create
      .get("/x")
      .withErrorInterceptor(e => new RequestError("first", { code: "NETWORK", url: e.url, method: e.method, cause: e }))
      .withErrorInterceptor(e => {
        seen.push(e.message);
        return new RequestError("second", { code: "TIMEOUT", url: e.url, method: e.method, cause: e });
      })
      .withFetch(stub(status(500)).fetch)
      .getResponse()
      .then(unexpected, asError);
    assert.deepEqual(seen, ["first"]);
    assert.equal(error.message, "second");
    assert.equal(error.code, "TIMEOUT");
    assert.equal((error.cause as RequestError).message, "first");
    assert.equal(((error.cause as RequestError).cause as RequestError).message, "HTTP 500");
  });

  it("api-level error interceptors run before request-level ones and can stop the chain by recovering", async () => {
    const order: string[] = [];
    const api = createApi()
      .withFetch(stub(status(500)).fetch)
      .withErrorInterceptor(() => void order.push("api"))
      .withErrorInterceptor(() => {
        order.push("api-recover");
        return new ResponseWrapper(json({ ok: 1 }));
      });
    const data = await api
      .get("/x")
      .withErrorInterceptor(() => void order.push("request"))
      .getJson();
    assert.deepEqual(data, { ok: 1 });
    assert.deepEqual(order, ["api", "api-recover"]);
  });

  it("run for network, timeout and abort failures too", async () => {
    const codes: string[] = [];
    const record = (e: RequestError) => void codes.push(e.code);
    await assert.rejects(
      create
        .get("/x")
        .withErrorInterceptor(record)
        .withFetch(stub(new TypeError("fetch failed")).fetch)
        .getResponse()
    );
    await assert.rejects(create.get("/x").withErrorInterceptor(record).withTimeout(5).withFetch(hanging).getResponse());
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(create.get("/x").withErrorInterceptor(record).withSignal(controller.signal).withFetch(stub().fetch).getResponse());
    assert.deepEqual(codes, ["NETWORK", "TIMEOUT", "ABORTED"]);
  });

  it("the replay recipe: clone() carries body, headers and query of the failed request", async () => {
    const replayed = new WeakSet<HttpRequest>();
    const { fetch, calls } = stub((call, i) => (i === 0 ? status(401) : json({ ok: call.headers.get("x-try") })));
    const data = await create
      .post("/x")
      .withHeader("X-Try", "1")
      .withQueryParam("q", "v")
      .withBody({ n: 1 })
      .withErrorInterceptor((error, request) => {
        if (error.status !== 401 || replayed.has(request)) return;
        const retry = request.clone().withHeader("X-Try", "2");
        replayed.add(retry);
        return retry.getResponse();
      })
      .withFetch(fetch)
      .getJson();
    assert.deepEqual(data, { ok: "2" });
    assert.equal(calls.length, 2);
    assert.equal(calls[1]!.url, "/x?q=v");
    assert.equal(calls[1]!.init.body, '{"n":1}');
    assert.equal(calls[1]!.init.method, "POST");
  });
});
