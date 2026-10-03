/**
 * Regression tests for the runtime bugs found when v1 was audited: one test per bug, named after its id
 * (A = security, B = behaviour). The type-level bugs (the C ids) are tested in test/types/api.test-d.ts.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import create, { type RequestError, createApi } from "../../src/index.js";
import { asError, fetchFailed, hanging, inBrowser, json, status, stub, unexpected } from "../utils/helpers.js";

const page = { href: "https://app.example/page", origin: "https://app.example" };

describe("security findings", () => {
  it("A1/A2 — no CSRF, XSRF or X-Requested-With header is ever sent unless asked, and never cross-origin", async () => {
    await inBrowser(
      page,
      async () => {
        const { fetch, calls } = stub();
        await create.get("https://third.party/x").withCsrf().withFetch(fetch).getResponse();
        await create.get("https://app.example/x").withFetch(fetch).getResponse();
        for (const call of calls) {
          assert.equal([...call.headers.keys()].length, 0, `unexpected headers: ${[...call.headers.keys()].join()}`);
        }
      },
      "XSRF-TOKEN=secret"
    );
  });

  it("A3 — tokens are never dropped by an entropy heuristic", async () => {
    await inBrowser(
      page,
      async () => {
        const { fetch, calls } = stub();
        await create.get("/x").withCsrf().withFetch(fetch).getResponse();
        assert.equal(calls[0]!.headers.get("x-xsrf-token"), "abcdefghijk");
      },
      "XSRF-TOKEN=abcdefghijk"
    );
  });

  it("A4 — error bodies over 1 MB are not buffered into memory", async () => {
    const error = await create
      .get("/x")
      .withFetch(stub(new Response("x", { status: 500, headers: { "content-length": "1000001" } })).fetch)
      .getResponse()
      .then(unexpected, asError);
    assert.equal(error.body, undefined);
  });
});

describe("behaviour findings", () => {
  it("B1 — getText() then getJson() (and every other order) works on the same response", async () => {
    const response = await create
      .get("/x")
      .withFetch(stub(json({ a: 1 })).fetch)
      .getResponse();
    assert.equal(await response.getText(), '{"a":1}');
    assert.deepEqual(await response.getJson(), { a: 1 });
    assert.equal((await response.getBlob()).size, 7);
  });

  it("B2 — an already-aborted request is never retried and fails immediately, without calling fetch", async () => {
    const controller = new AbortController();
    controller.abort();
    const { fetch, calls } = stub(() => new DOMException("aborted", "AbortError"));
    const started = Date.now();
    let retries = 0;
    await assert.rejects(
      create
        .get("/x")
        .withRetries({ attempts: 3, delay: 30, onRetry: () => void retries++ })
        .withAbortController(controller)
        .withFetch(fetch)
        .getResponse(),
      { code: "ABORTED" }
    );
    assert.equal(calls.length, 0);
    assert.equal(retries, 0);
    assert.ok(Date.now() - started < 25);
  });

  it("B2/B3 — 4xx responses are not retried; 5xx are, with a delay by default", async () => {
    const { fetch, calls } = stub(status(404));
    await assert.rejects(create.get("/x").withRetries(3).withFetch(fetch).getResponse());
    assert.equal(calls.length, 1);
    const delays: number[] = [];
    const { fetch: f503, calls: c503 } = stub((_c, i) => (i ? json({}) : status(503)));
    await create
      .get("/x")
      .withRetries({ attempts: 1, onRetry: ({ delay }) => void delays.push(delay), delay: 1 })
      .withFetch(f503)
      .getResponse();
    assert.equal(c503.length, 2);
    assert.deepEqual(delays, [1]);
  });

  it("B4 — an abort with a custom reason is classified as aborted", async () => {
    const controller = new AbortController();
    const promise = create.get("/x").withAbortController(controller).withFetch(hanging).getResponse();
    controller.abort(new Error("custom"));
    const error = await promise.then(unexpected, asError);
    assert.equal(error.isAborted, true);
    assert.equal(error.code, "ABORTED");
  });

  it("B5/B6 — network errors carry the Node error code from `cause` and keep `cause`", async () => {
    const thrown = fetchFailed(Object.assign(new Error("getaddrinfo ENOTFOUND host"), { code: "ENOTFOUND" }));
    const error = await create.get("/x").withFetch(stub(thrown).fetch).getResponse().then(unexpected, asError);
    assert.ok(error.message.includes("ENOTFOUND"));
    assert.equal(error.cause, thrown);
    assert.equal(error.isTimeout, false);
    const timeoutish = await create
      .get("/x")
      .withFetch(stub(new TypeError("timeout in stack")).fetch)
      .getResponse()
      .then(unexpected, asError);
    assert.equal(timeoutish.code, "NETWORK");
  });

  it("B7 — a request interceptor that mutates the config and returns nothing works", async () => {
    const { fetch, calls } = stub();
    await create
      .get("/x")
      .withRequestInterceptor(config => {
        config.headers["x-a"] = "1";
      })
      .withFetch(fetch)
      .getResponse();
    assert.equal(calls[0]!.headers.get("x-a"), "1");
  });

  it("B8 — interceptor header mutations do not persist on the request", async () => {
    const { fetch, calls } = stub();
    let n = 0;
    const request = create
      .get("/x")
      .withRequestInterceptor(config => {
        config.headers["x-n"] = String(++n);
        config.headers[`x-${n}`] = "1";
      })
      .withFetch(fetch);
    await request.getResponse();
    await request.getResponse();
    assert.deepEqual(calls[1]!.init.headers, { "x-n": "2", "x-2": "1" });
  });

  it("B9 — headers merge case-insensitively", async () => {
    const { fetch, calls } = stub();
    await create.get("/x").withHeader("content-type", "a").withHeader("Content-Type", "b").withFetch(fetch).getResponse();
    assert.deepEqual(calls[0]!.init.headers, { "content-type": "b" });
  });

  it("B10 — library options never reach fetch's RequestInit", async () => {
    const { fetch, calls } = stub();
    await create
      .get("/x")
      .withTimeout(1000)
      .withRetries(2)
      .onRetry(() => undefined)
      .withFetch(fetch)
      .getResponse();
    assert.deepEqual(Object.keys(calls[0]!.init).sort(), ["body", "headers", "method", "signal"]);
    assert.ok(!("timeout" in calls[0]!.init) && !("retries" in calls[0]!.init) && !("onRetry" in calls[0]!.init));
  });

  it("B11 — opaque responses are successes", async () => {
    const raw = { status: 0, ok: false, type: "opaque", headers: new Headers(), bodyUsed: false } as unknown as Response;
    assert.equal((await create.get("/x").withMode("no-cors").withFetch(stub(raw).fetch).getResponse()).status, 0);
  });

  it("B12 — stream bodies are sent with duplex: 'half'", async () => {
    const { fetch, calls } = stub();
    await create.post("/x").withBody(new ReadableStream()).withFetch(fetch).getResponse();
    assert.equal(calls[0]!.init.duplex, "half");
  });

  it("B13 — the query string is inserted before the fragment", () => {
    assert.equal(create.get("/path#section").withQueryParam("a", 1).url, "/path?a=1#section");
  });

  it("B14 — cookie values with '=' are kept whole and malformed encoding cannot throw", async () => {
    await inBrowser(
      page,
      async () => {
        const { fetch, calls } = stub();
        await create.get("/x").withCsrf().withFetch(fetch).getResponse();
        assert.equal(calls[0]!.headers.get("x-xsrf-token"), "abc=def=");
        await create.get("/x").withCsrf({ cookie: "bad" }).withFetch(fetch).getResponse();
        assert.equal(calls[1]!.headers.get("x-xsrf-token"), "%E0%A4%A");
      },
      "XSRF-TOKEN=abc=def=; bad=%E0%A4%A"
    );
  });

  it("B15 — short-circuit responses get the resolved URL and the status check", async () => {
    let url = "";
    await create
      .get("/x")
      .withQueryParam("a", 1)
      .withRequestInterceptor(() => json({}))
      .withResponseInterceptor(r => void (url = r.url))
      .getResponse();
    assert.equal(url, "/x?a=1");
    await assert.rejects(
      create
        .get("/x")
        .withRequestInterceptor(() => status(500))
        .getResponse(),
      { status: 500 }
    );
  });

  it("B16 — api instances are immutable, so forks do not share state", async () => {
    const { fetch, calls } = stub();
    const base = createApi().withFetch(fetch);
    const a = base.withBearerToken("A");
    const b = base.withBearerToken("B");
    await a.get("/x").getResponse();
    await b.get("/x").getResponse();
    await base.get("/x").getResponse();
    assert.deepEqual(
      calls.map(c => c.headers.get("authorization")),
      ["Bearer A", "Bearer B", null]
    );
  });

  it("B17 — a typo in an api method name is a TypeError, not a silent no-op", () => {
    const api = createApi() as unknown as Record<string, () => unknown>;
    assert.throws(() => api.withTypoHeader!(), TypeError);
  });

  it("B18 — './users' joins cleanly", () => {
    assert.equal(createApi().withBaseURL("https://e.com").get("./users").url, "https://e.com/users");
  });

  it("B19 — getResult() is the non-throwing execution path", async () => {
    const result = await create
      .get("/x")
      .withFetch(stub(status(304)).fetch)
      .getResult();
    assert.equal(result.error?.status, 304);
  });

  it("B20 — error interceptors run once per request, not once per attempt", async () => {
    let runs = 0;
    await assert.rejects(
      create
        .get("/x")
        .withRetries({ attempts: 2, delay: 1 })
        .withErrorInterceptor(() => void runs++)
        .withFetch(stub(status(503)).fetch)
        .getResponse()
    );
    assert.equal(runs, 1);
  });

  it("B21 — the timeout clock starts after request interceptors", async () => {
    const { fetch } = stub();
    await create
      .get("/x")
      .withTimeout(15)
      .withRequestInterceptor(() => new Promise(resolve => setTimeout(resolve, 30)))
      .withFetch(fetch)
      .getResponse();
  });

  it("B22 — api-level interceptors run in registration order", async () => {
    const order: number[] = [];
    await createApi()
      .withResponseInterceptor(() => void order.push(1))
      .withResponseInterceptor(() => void order.push(2))
      .withFetch(stub().fetch)
      .get("/x")
      .getResponse();
    assert.deepEqual(order, [1, 2]);
  });

  it("B23 — cookie values are sent verbatim (no encoding, no ignored options)", async () => {
    const { fetch, calls } = stub();
    await create.get("/x").withCookie("t", "a=b==").withFetch(fetch).getResponse();
    assert.equal(calls[0]!.headers.get("cookie"), "t=a=b==");
  });

  it("B24 — withQueryParams replaces a key instead of appending", () => {
    assert.equal(create.get("/x").withQueryParam("page", 1).withQueryParam("page", 2).url, "/x?page=2");
  });

  it("B25 — JSON bodies are serialised once, at withBody time", async () => {
    let calls = 0;
    const body = {
      toJSON() {
        calls++;
        return { n: 1 };
      },
    };
    const request = create.post("/x").withBody(body);
    assert.equal(calls, 1);
    await request.withFetch(stub().fetch).getResponse();
    await request.getResponse();
    assert.equal(calls, 1);
  });

  it("B26 — error messages are readable", async () => {
    const messages = await Promise.all([
      create
        .get("/x")
        .withFetch(stub(status(404)).fetch)
        .getResponse()
        .then(unexpected, (e: RequestError) => e.message),
      create
        .get("/x")
        .withTimeout(5)
        .withFetch(hanging)
        .getResponse()
        .then(unexpected, (e: RequestError) => e.message),
      create
        .get("/x")
        .withFetch(stub(fetchFailed()).fetch)
        .getResponse()
        .then(unexpected, (e: RequestError) => e.message),
      create
        .get("/x")
        .withFetch(stub(new Response("nope")).fetch)
        .getJson()
        .then(unexpected, (e: RequestError) => e.message),
      create
        .get("")
        .withFetch(stub().fetch)
        .getResponse()
        .then(unexpected, (e: RequestError) => e.message),
    ]);
    assert.equal(messages[0], "HTTP 404");
    assert.equal(messages[1], "Request timed out after 5ms");
    assert.equal(messages[2], "Network error: fetch failed");
    assert.ok(messages[3].startsWith("Invalid JSON response: "));
    assert.equal(messages[4], 'Invalid URL: ""');
  });
});
