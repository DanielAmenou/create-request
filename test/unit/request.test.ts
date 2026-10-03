import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Headers as UndiciHeaders } from "undici";
import create, { HttpRequest, RequestError, createDelete, createGet, createHead, createOptions, createPatch, createPost, createPut } from "../../src/index.js";
import { asError, hanging, json, status, stub, unexpected } from "../utils/helpers.js";

describe("request factories", () => {
  it("create.* and create* build a request with the right method and URL", () => {
    const pairs = [
      [create.get, createGet, "GET"],
      [create.head, createHead, "HEAD"],
      [create.options, createOptions, "OPTIONS"],
      [create.post, createPost, "POST"],
      [create.put, createPut, "PUT"],
      [create.patch, createPatch, "PATCH"],
      [create.delete, createDelete, "DELETE"],
      [create.del, createDelete, "DELETE"],
    ] as const;
    for (const [viaDefault, named, method] of pairs) {
      assert.equal(viaDefault, named);
      const request = named("/x");
      assert.ok(request instanceof HttpRequest);
      assert.equal(request.method, method);
      assert.equal(request.url, "/x");
    }
  });

  it("every with* method returns the same request so calls chain", () => {
    const request = create.post("/x");
    assert.equal(request.withHeader("a", "1").withTimeout(1).withRetries(1).withBody({}).withQueryParam("q", 1), request);
  });
});

describe("headers", () => {
  it("stores names lower-case, keeps the last value and stringifies numbers", async () => {
    const { fetch, calls } = stub();
    await create.get("/x").withHeaders({ "Content-Type": "a", "content-type": "b", "X-Num": 5 }).withHeader("Accept", "json").withFetch(fetch).getResponse();
    assert.deepEqual(calls[0]!.init.headers, { "content-type": "b", "x-num": "5", accept: "json" });
  });

  it("takes a Headers object or [name, value] pairs, including a Headers object from another realm", async () => {
    const { fetch, calls } = stub();
    await create
      .get("/x")
      .withHeader("Accept", "json")
      .withHeaders(new Headers({ "X-A": "1", Accept: "text" }))
      .withHeaders([
        ["X-B", "2"],
        ["x-b", "3"],
      ])
      .withHeaders(new UndiciHeaders({ "X-C": "4" }) as unknown as Headers)
      .withFetch(fetch)
      .getResponse();
    assert.deepEqual(calls[0]!.init.headers, { accept: "text", "x-a": "1", "x-b": "3", "x-c": "4" });
  });

  it("null and undefined unset a header", async () => {
    const { fetch, calls } = stub();
    await create.get("/x").withHeader("A", "1").withHeader("B", "2").withHeaders({ a: null, b: undefined }).withFetch(fetch).getResponse();
    assert.deepEqual(calls[0]!.init.headers, {});
  });

  it("withContentType / withAuthorization / withBearerToken / withBasicAuth set the usual headers", async () => {
    const { fetch, calls } = stub();
    await create.get("/x").withContentType("text/csv").withAuthorization("Custom x").withFetch(fetch).getResponse();
    assert.equal(calls[0]!.headers.get("content-type"), "text/csv");
    assert.equal(calls[0]!.headers.get("authorization"), "Custom x");
    await create.get("/x").withBearerToken("tok").withFetch(fetch).getResponse();
    assert.equal(calls[1]!.headers.get("authorization"), "Bearer tok");
    await create.get("/x").withBasicAuth("user", "pässwörd").withFetch(fetch).getResponse();
    assert.equal(calls[2]!.headers.get("authorization"), `Basic ${Buffer.from("user:pässwörd").toString("base64")}`);
  });

  it("withCookie / withCookies build a Cookie header verbatim, merging with an existing one", async () => {
    const { fetch, calls } = stub();
    await create.get("/x").withCookie("a", "1").withCookies({ b: "x=y", c: "3" }).withFetch(fetch).getResponse();
    assert.equal(calls[0]!.headers.get("cookie"), "a=1; b=x=y; c=3");
    await create.get("/x").withCookies({}).withFetch(fetch).getResponse();
    assert.equal(calls[1]!.headers.get("cookie"), null);
  });

  it("withCsrfToken sends the token in X-CSRF-Token or a custom header, on every request", async () => {
    const { fetch, calls } = stub();
    await create.get("https://third.party/x").withCsrfToken("t1").withFetch(fetch).getResponse();
    await create.get("/x").withCsrfToken("t2", "X-My-Csrf").withFetch(fetch).getResponse();
    assert.equal(calls[0]!.headers.get("x-csrf-token"), "t1");
    assert.equal(calls[1]!.headers.get("x-my-csrf"), "t2");
  });
});

describe("query parameters and url", () => {
  it("appends parameters, repeats arrays, encodes dates and skips null/undefined", () => {
    const request = create.get("/x").withQueryParams({ page: 1, ok: true, tags: ["a", 2], none: null, gone: undefined, at: new Date("2026-01-02T03:04:05.000Z") });
    assert.equal(request.url, "/x?page=1&ok=true&tags=a&tags=2&at=2026-01-02T03%3A04%3A05.000Z");
  });

  it("replaces a key that is already present (arrays included) and null removes it", () => {
    const request = create
      .get("/x")
      .withQueryParam("page", 1)
      .withQueryParams({ tags: ["a", "b"] });
    request.withQueryParam("page", 2).withQueryParam("tags", ["c"]);
    assert.equal(request.url, "/x?page=2&tags=c");
    request.withQueryParam("page", null);
    assert.equal(request.url, "/x?tags=c");
  });

  it("sends 0, false and '' instead of dropping them, while an empty array removes the key", () => {
    assert.equal(create.get("/x").withQueryParams({ zero: 0, no: false, empty: "" }).url, "/x?zero=0&no=false&empty=");
    assert.equal(
      create
        .get("/x")
        .withQueryParams({ tags: ["a", "b"], page: 1 })
        .withQueryParam("tags", []).url,
      "/x?page=1"
    );
  });

  it("accepts URLSearchParams, keeping repeated keys of the input", () => {
    const request = create.get("/x").withQueryParam("a", "old").withQueryParams(new URLSearchParams("a=1&a=2&b=3"));
    assert.equal(request.url, "/x?a=1&a=2&b=3");
  });

  it("merges with an existing query string and keeps the fragment last", () => {
    assert.equal(create.get("/x?a=1").withQueryParam("b", 2).url, "/x?a=1&b=2");
    assert.equal(create.get("/x#frag").withQueryParam("b", 2).url, "/x?b=2#frag");
    assert.equal(create.get("/x?a=1#f#g").withQueryParam("b", 2).url, "/x?a=1&b=2#f#g");
    assert.equal(create.get("https://e.com/x").withQueryParam("q", "a b&c").url, "https://e.com/x?q=a+b%26c");
  });

  it("the url is what fetch receives", async () => {
    const { fetch, calls } = stub();
    await create.get("https://e.com/x").withQueryParam("q", 1).withFetch(fetch).getResponse();
    assert.equal(calls[0]!.url, "https://e.com/x?q=1");
  });
});

describe("fetch options", () => {
  it("passes every RequestInit option through to fetch", async () => {
    const { fetch, calls } = stub();
    await create
      .get("/x")
      .withCredentials("include")
      .withMode("cors")
      .withRedirect("manual")
      .withReferrer("https://ref.example")
      .withReferrerPolicy("no-referrer")
      .withPriority("high")
      .withKeepAlive()
      .withIntegrity("sha256-abc")
      .withCache("no-store")
      .withFetch(fetch)
      .getResponse();
    const init = calls[0]!.init;
    assert.equal(init.method, "GET");
    assert.equal(init.credentials, "include");
    assert.equal(init.mode, "cors");
    assert.equal(init.redirect, "manual");
    assert.equal(init.referrer, "https://ref.example");
    assert.equal(init.referrerPolicy, "no-referrer");
    assert.equal(init.priority, "high");
    assert.equal(init.keepalive, true);
    assert.equal(init.integrity, "sha256-abc");
    assert.equal(init.cache, "no-store");
    assert.equal(init.signal, undefined);
    assert.equal("url" in init, false);
    assert.equal("timeout" in init, false);
    assert.equal("retries" in init, false);
  });

  it("withKeepAlive(false) turns keepalive off", async () => {
    const { fetch, calls } = stub();
    await create.get("/x").withKeepAlive(false).withFetch(fetch).getResponse();
    assert.equal(calls[0]!.init.keepalive, false);
  });

  it("uses the global fetch when none is injected", async () => {
    const original = globalThis.fetch;
    const seen: string[] = [];
    globalThis.fetch = async (url: string | URL | Request) => {
      seen.push(url instanceof URL ? url.href : typeof url === "string" ? url : url.url);
      return json({ global: true });
    };
    try {
      assert.deepEqual(await create.get("https://e.com/g").getJson(), { global: true });
      assert.deepEqual(seen, ["https://e.com/g"]);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("validation of arguments", () => {
  it("withTimeout rejects negative and NaN values with a VALIDATION error; 0 and Infinity disable the timeout", async () => {
    for (const value of [-1, -Infinity, NaN]) {
      assert.throws(
        () => create.get("/x").withTimeout(value),
        (error: unknown) =>
          error instanceof RequestError && error.code === "VALIDATION" && error.message === `Invalid timeout: ${value}` && error.url === "/x" && error.method === "GET"
      );
    }
    const { fetch, calls } = stub();
    await create.get("/x").withTimeout(5000).withTimeout(0).withFetch(fetch).getResponse();
    await create.get("/x").withTimeout(5000).withTimeout(Infinity).withFetch(fetch).getResponse();
    assert.equal(calls[0]!.init.signal, undefined);
    assert.equal(calls[1]!.init.signal, undefined);
  });

  it("withRetries rejects negative and non-integer attempts", () => {
    for (const value of [-1, 1.5, NaN, Infinity]) {
      assert.throws(
        () => create.get("/x").withRetries(value),
        (error: unknown) => error instanceof RequestError && error.code === "VALIDATION" && error.message === `Invalid retry attempts: ${value}`
      );
      assert.throws(
        () => create.get("/x").withRetries({ attempts: value }),
        (error: unknown) => error instanceof RequestError && error.code === "VALIDATION"
      );
    }
    assert.doesNotThrow(() => create.get("/x").withRetries(0));
  });
});

describe("clone", () => {
  it("copies headers, query, options, interceptors and signals independently", async () => {
    const controller = new AbortController();
    const base = create
      .post("/x")
      .withHeader("a", "1")
      .withQueryParam("q", 1)
      .withTimeout(50)
      .withMode("cors")
      .withAbortController(controller)
      .withBody({ n: 1 })
      .withRequestInterceptor(() => undefined);
    const copy = base.clone();
    assert.notEqual(copy, base);
    assert.equal(copy.method, "POST");
    copy
      .withHeader("b", "2")
      .withQueryParam("q", 2)
      .withMode("same-origin")
      .withRequestInterceptor(() => undefined)
      .withSignal(new AbortController().signal);
    assert.equal(base.url, "/x?q=1");
    assert.equal(copy.url, "/x?q=2");

    const { fetch, calls } = stub();
    await base.withFetch(fetch).getResponse();
    await copy.withFetch(fetch).getResponse();
    assert.deepEqual(calls[0]!.init.headers, { a: "1", "content-type": "application/json" });
    assert.deepEqual(calls[1]!.init.headers, { a: "1", "content-type": "application/json", b: "2" });
    assert.equal(calls[0]!.init.mode, "cors");
    assert.equal(calls[1]!.init.mode, "same-origin");
    assert.equal(calls[0]!.init.body, '{"n":1}');
    assert.equal(calls[1]!.init.body, '{"n":1}');
    assert.ok(calls[0]!.init.signal);
    assert.ok(calls[1]!.init.signal);
  });

  it("timeout, retries, onRetry, CSRF, fetch and body changed on a clone leave the original as it was", async () => {
    const original = stub((_call, i) => (i === 0 ? status(503) : json({})));
    const copied = stub(status(503));
    let copyRetries = 0;
    const base = create.post("/x").withTimeout(10_000).withRetries({ attempts: 1, delay: 1 }).withCsrf({ token: "base" }).withBody({ v: 1 }).withFetch(original.fetch);
    const copy = base
      .clone()
      .withTimeout(0)
      .withRetries(0)
      .onRetry(() => void copyRetries++)
      .withCsrf({ token: "copy" })
      .withBody({ v: 2 })
      .withFetch(copied.fetch);
    await base.getJson();
    await assert.rejects(copy.getJson(), { code: "HTTP", status: 503 });
    assert.equal(original.calls.length, 2, "the original still retries");
    assert.equal(copyRetries, 0, "and does not call the clone's onRetry");
    assert.ok(original.calls.every(call => call.init.signal instanceof AbortSignal && call.headers.get("x-csrf-token") === "base" && call.init.body === '{"v":1}'));
    assert.equal(copied.calls.length, 1, "the clone does not retry");
    assert.equal(copied.calls[0]!.init.signal, undefined, "nor has a timeout");
    assert.equal(copied.calls[0]!.headers.get("x-csrf-token"), "copy");
    assert.equal(copied.calls[0]!.init.body, '{"v":2}');
  });

  it("signals are shared with clones, so one abort cancels every copy in flight", async () => {
    const controller = new AbortController();
    const template = create.get("/x").withAbortController(controller).withTimeout(2000).withFetch(hanging); // the timeout only bounds a regression
    const pending = [template.clone().withQueryParam("page", 1).getResponse(), template.clone().withQueryParam("page", 2).getResponse()];
    controller.abort();
    const errors = await Promise.all(pending.map(promise => promise.then(unexpected, asError)));
    assert.deepEqual(
      errors.map(error => [error.code, error.url]),
      [
        ["ABORTED", "/x?page=1"],
        ["ABORTED", "/x?page=2"],
      ]
    );
  });
});
