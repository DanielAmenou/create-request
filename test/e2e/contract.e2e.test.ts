import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";
import { FormData as UndiciFormData } from "undici";
import * as v from "valibot";
import { z } from "zod";
import create, { type FetchFunction, type HttpRequest, RequestError, ResponseWrapper, createApi, isRequestError } from "../../src/index.js";
import { asError, inBrowser, readAll, schema, unexpected } from "../utils/helpers.js";
import { TestServer } from "../utils/server.js";

interface Echo {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: string;
  bodyBase64: string;
}

/**
 * The public contract, exercised over real sockets: every documented error code, option and edge case
 * that the other e2e suites do not reach. Where a behaviour depends on the runtime's fetch (undici),
 * the assertions stick to what the Fetch standard mandates.
 */
describe("e2e: the public contract over real HTTP", { timeout: 30_000 }, () => {
  let server: TestServer;
  let other: TestServer;
  before(async () => {
    server = await TestServer.start();
    other = await TestServer.start();
  });
  after(async () => {
    await server.close();
    await other.close();
  });
  beforeEach(() => {
    server.reset();
    other.reset();
  });

  const abortAfter = (ms: number, reason?: unknown): AbortController => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(reason), ms);
    return controller;
  };

  describe("errors", () => {
    it("isTimeout, isAborted and isRequestError describe what happened on the wire", async () => {
      const timeout = await create.get(server.url("/slow?ms=2000")).withTimeout(40).getJson().then(unexpected, asError);
      assert.ok(isRequestError(timeout));
      assert.equal(timeout.isTimeout, true);
      assert.equal(timeout.isAborted, false);

      const aborted = await create.get(server.url("/never")).withTimeout(5000).withAbortController(abortAfter(20)).getJson().then(unexpected, asError);
      assert.equal(aborted.isAborted, true, "the abort wins over a longer deadline");
      assert.equal(aborted.isTimeout, false);

      const http = await create.get(server.url("/status/503")).withTimeout(5000).getJson().then(unexpected, asError);
      assert.equal(http.isTimeout, false);
      assert.equal(http.isAborted, false);
      assert.equal(http.status, 503);
      assert.equal(isRequestError(new Error("plain")), false);
    });

    it("error.data is the parsed JSON body, and undefined for empty or non-JSON error bodies", async () => {
      const json = await create.get(server.url("/status/422")).getJson().then(unexpected, asError);
      assert.deepEqual(json.data, { error: "status 422", code: 422 });
      assert.equal(json.data, json.data, "parsed once and cached");

      const empty = await create.get(server.url("/status/500?empty=1")).getJson().then(unexpected, asError);
      assert.equal(empty.message, "HTTP 500 Internal Server Error");
      assert.equal(empty.body, "");
      assert.equal(empty.data, undefined);

      const text = await create.get(server.url("/status/502?text=1")).getJson().then(unexpected, asError);
      assert.equal(text.body, "status 502 as text");
      assert.equal(text.data, undefined);
      assert.equal(text.response?.headers.get("content-type"), "text/plain");
    });

    it("the response wrapper exposes the real status line", async () => {
      const created = await create.post(server.url("/status/201")).getResponse();
      assert.equal(created.ok, true);
      assert.equal(created.status, 201);
      assert.equal(created.statusText, "Created");
      const redirect = await create.get(server.url("/redirect?n=1")).withRedirect("manual").getResponse();
      assert.equal(redirect.ok, false);
      assert.equal(redirect.statusText, "Found");
      assert.equal(redirect.url, server.url("/redirect?n=1"));
      assert.equal(redirect.method, "GET");
    });

    it("connection failures carry the cause and its detail, whether it is a message or only a code", async () => {
      const closed = await TestServer.start();
      const url = closed.url("/json");
      await closed.close();

      const refused = await create.get(url).getJson().then(unexpected, asError);
      assert.equal(refused.code, "NETWORK");
      assert.ok(refused.message.startsWith("Network error: fetch failed (connect ECONNREFUSED "), refused.message);
      assert.equal((refused.cause as { cause: { code: string } }).cause.code, "ECONNREFUSED");

      // A runtime that reports connection errors by code only (no message) is still described.
      const codeOnly: FetchFunction = (target, init) =>
        fetch(target, init).catch((e: { cause: { code: string } }) => {
          throw new TypeError("fetch failed", { cause: Object.assign(new Error(""), { code: e.cause.code }) });
        });
      const byCode = await create.get(url).withFetch(codeOnly).getJson().then(unexpected, asError);
      assert.equal(byCode.message, "Network error: fetch failed (ECONNREFUSED)");

      // A custom fetch that forgets to return the response is reported, not swallowed.
      const forgetful = (async (target: string, init: RequestInit) => {
        await fetch(target, init);
      }) as unknown as FetchFunction;
      const missing = await create.get(server.url("/json")).withFetch(forgetful).getJson().then(unexpected, asError);
      assert.equal(missing.code, "NETWORK");
      assert.ok(missing.message.startsWith("Unexpected error: "), missing.message);
      assert.ok(missing.cause instanceof TypeError);
      assert.equal(server.requests.length, 1);
    });
  });

  describe("fetch options", () => {
    it("withIntegrity: a matching hash passes and a mismatch is a NETWORK error", async () => {
      const body = JSON.stringify({ message: "hello", source: "e2e" });
      const hash = `sha256-${createHash("sha256").update(body).digest("base64")}`;
      assert.deepEqual(await create.get(server.url("/json")).withIntegrity(hash).getJson(), { message: "hello", source: "e2e" });
      const error = await create.get(server.url("/json")).withIntegrity("sha256-AAAA").getJson().then(unexpected, asError);
      assert.equal(error.code, "NETWORK");
      assert.ok(error.message.includes("integrity"), error.message);
      assert.equal(server.requests.length, 2, "the integrity check happens after the response arrived");
    });

    it("withReferrer and withReferrerPolicy shape the Referer header", async () => {
      const referer = async (request: ReturnType<typeof create.get>) => (await request.getJson<Echo>()).headers.referer;
      assert.equal(await referer(create.get(server.url("/echo")).withReferrer(server.url("/page?x=1"))), server.url("/page?x=1"));
      assert.equal(await referer(create.get(server.url("/echo")).withReferrer(server.url("/page?x=1")).withReferrerPolicy("origin")), `${server.origin}/`);
      assert.equal(await referer(create.get(server.url("/echo")).withReferrer("https://elsewhere.example/p")), "https://elsewhere.example/", "cross-origin: origin only");
      assert.equal(await referer(create.get(server.url("/echo")).withReferrer("")), undefined);
      assert.equal(await referer(create.get(server.url("/echo")).withReferrer("about:client")), undefined, "no client referrer outside a page");
    });

    it("withCache, withMode, withCredentials, withPriority and withKeepAlive reach fetch", async () => {
      const cached = await create.get(server.url("/json")).withCache("only-if-cached").getJson().then(unexpected, asError);
      assert.equal(cached.code, "NETWORK");
      assert.equal(cached.message, "Network error: 'only-if-cached' can be set only with 'same-origin' mode");
      assert.ok(cached.cause instanceof TypeError);
      assert.equal(server.requests.length, 0);

      const noStore = await create.get(server.url("/echo")).withCache("no-store").getJson<Echo>();
      assert.equal(noStore.headers["cache-control"], "no-cache");
      assert.equal(noStore.headers.pragma, "no-cache");

      const noCors = await create.get(server.url("/json")).withMode("no-cors").getResponse();
      assert.equal(noCors.status, 200);
      const response = await create.get(server.url("/json")).withMode("same-origin").withCredentials("include").withPriority("high").withKeepAlive().getResponse();
      assert.equal(response.status, 200);
      assert.equal(response.raw.type, "basic");
      const sent = await create.get(server.url("/echo")).withCredentials("omit").withKeepAlive(false).withPriority("low").getJson<Echo>();
      assert.equal(sent.path, "/echo");
    });
  });

  describe("building requests", () => {
    it("query parameters go before the fragment, dates become ISO strings, nulls are skipped, URLSearchParams accepted", async () => {
      const request = create
        .get(server.url("/echo#section"))
        .withQueryParams({ when: new Date(0), skip: null, gone: undefined, list: [1, "b", true] })
        .withQueryParams(new URLSearchParams("dup=1&dup=2"))
        .withQueryParam("list", "replaced");
      assert.equal(request.url, `${server.url("/echo")}?when=1970-01-01T00%3A00%3A00.000Z&dup=1&dup=2&list=replaced#section`);
      const echo = await request.getJson<Echo>();
      assert.equal(echo.path, "/echo");
      assert.equal(server.lastRequest.query.get("when"), "1970-01-01T00:00:00.000Z");
      assert.deepEqual(server.lastRequest.query.getAll("dup"), ["1", "2"]);
      assert.deepEqual(server.lastRequest.query.getAll("list"), ["replaced"]);
      assert.equal(server.lastRequest.query.has("skip"), false);
      assert.equal(server.lastRequest.query.has("gone"), false);
    });

    it("api-level headers are inherited, stringified, and can be unset per request", async () => {
      const api = createApi().withBaseURL(server.origin).withHeaders({ "X-Default": "yes", "X-Count": 3, "X-Gone": "for now" }).withCookie("a", "1");
      const inherited = await api.get("/echo").getJson<Echo>();
      assert.equal(inherited.headers["x-default"], "yes");
      assert.equal(inherited.headers["x-count"], "3");
      assert.equal(inherited.headers.cookie, "a=1");
      const overridden = await api.get("/echo").withHeader("x-default", null).withHeaders({ "X-Gone": undefined, "X-Count": 4 }).withCookie("b", "2").getJson<Echo>();
      assert.equal("x-default" in overridden.headers, false);
      assert.equal("x-gone" in overridden.headers, false);
      assert.equal(overridden.headers["x-count"], "4");
      assert.equal(overridden.headers.cookie, "a=1; b=2");
    });

    it("api base URLs join paths and leave absolute URLs alone", async () => {
      assert.deepEqual(await createApi().withBaseURL(server.url("/json")).get().getJson(), { message: "hello", source: "e2e" });
      assert.deepEqual(await createApi().withBaseURL(`${server.origin}/`).get("./json").getJson(), { message: "hello", source: "e2e" });
      assert.equal((await createApi().withBaseURL(server.origin).get(other.url("/echo")).getJson<Echo>()).path, "/echo");
      assert.equal(await createApi().get(server.url("/text")).getText(), "plain text response");
      assert.equal(server.requests.length, 3);
      assert.equal(other.requests.length, 1);
    });

    it("sends ArrayBuffer bodies, keeps a custom Content-Type for JSON and drops it for FormData", async () => {
      const bytes = new Uint8Array([1, 2, 3, 250]);
      await create.post(server.url("/echo")).withBody(bytes.buffer).getJson();
      assert.deepEqual(server.lastRequest.body, Buffer.from(bytes));
      assert.equal(server.lastRequest.headers["content-type"], undefined);

      await create.patch(server.url("/echo")).withContentType("application/merge-patch+json").withBody({ name: "Ada" }).getJson();
      assert.equal(server.lastRequest.headers["content-type"], "application/merge-patch+json");
      assert.equal(server.lastRequest.text, '{"name":"Ada"}');

      const form = new FormData();
      form.append("field", "value");
      await createApi().withContentType("application/json").withBaseURL(server.origin).post("/echo").withBody(form).getJson();
      assert.ok(String(server.lastRequest.headers["content-type"]).startsWith("multipart/form-data; boundary="));
      assert.ok(server.lastRequest.text.includes('name="field"'));
    });
  });

  describe("validation before the network", () => {
    it("invalid timeouts, retries and bodies are rejected synchronously with the request's URL", () => {
      const api = createApi().withBaseURL(server.origin);
      const validation = (message: string) => (error: unknown) =>
        error instanceof RequestError && error.code === "VALIDATION" && error.message === message && error.url === server.url("/json") && error.method === "POST";
      assert.throws(() => api.post("/json").withTimeout(-1), validation("Invalid timeout: -1"));
      assert.throws(() => api.post("/json").withTimeout(NaN), validation("Invalid timeout: NaN"));
      assert.throws(() => api.post("/json").withRetries(1.5), validation("Invalid retry attempts: 1.5"));
      assert.throws(() => api.post("/json").withRetries({ attempts: -1 }), validation("Invalid retry attempts: -1"));
      const circular: { self?: unknown } = {};
      circular.self = circular;
      assert.throws(
        () => api.post("/json").withBody(circular),
        (error: unknown) =>
          error instanceof RequestError && error.code === "VALIDATION" && error.message.startsWith("Body is not JSON-serializable: ") && error.cause instanceof TypeError
      );
      assert.throws(() => api.post("/json").withBody({ big: 10n }), { code: "VALIDATION" });
      assert.throws(() => createApi().withTimeout(-1), { code: "VALIDATION", url: "" });
      assert.equal(server.requests.length, 0);
    });

    it("withTimeout(0) and withTimeout(Infinity) remove an api-level timeout", async () => {
      const api = createApi().withBaseURL(server.origin).withTimeout(30);
      await assert.rejects(api.get("/slow?ms=150").getJson(), { code: "TIMEOUT" });
      assert.deepEqual(await api.get("/slow?ms=60").withTimeout(0).getJson(), { slept: 60 });
      assert.deepEqual(await api.get("/slow?ms=60").withTimeout(Infinity).getJson(), { slept: 60 });
    });

    it("an interceptor that produces an empty or malformed URL fails with VALIDATION before fetch", async () => {
      for (const url of ["", "   ", "http://["]) {
        const error = await create
          .get(server.url("/json"))
          .withRequestInterceptor(config => {
            config.url = url;
          })
          .getJson()
          .then(unexpected, asError);
        assert.equal(error.code, "VALIDATION");
        assert.equal(error.message, `Invalid URL: "${url}"`);
        assert.equal(error.url, url);
      }
      assert.equal(server.requests.length, 0);
    });
  });

  describe("GraphQL", () => {
    it("withGraphQL posts { query, variables } as JSON and parses the envelope", async () => {
      const data = await create.post(server.url("/graphql")).withGraphQL("query Q($id: ID!) { node(id: $id) { id } }", { id: "1" }).getJson<{ data: unknown }>();
      assert.deepEqual(data, { data: { ok: true, query: "query Q($id: ID!) { node(id: $id) { id } }", variables: { id: "1" } } });
      assert.equal(server.lastRequest.headers["content-type"], "application/json");
      assert.equal(server.lastRequest.text, '{"query":"query Q($id: ID!) { node(id: $id) { id } }","variables":{"id":"1"}}');
      const noVariables = await create
        .post<{ data: { variables: unknown } }>(server.url("/graphql"))
        .withGraphQL("{ me }")
        .getData(r => r.data.variables);
      assert.equal(noVariables, null);
      assert.equal(server.lastRequest.text, '{"query":"{ me }"}');
    });

    it("throwOnError turns a GraphQL errors array into a GRAPHQL error; without it the envelope is returned", async () => {
      const error = await create.post(server.url("/graphql")).withGraphQL("query fail", {}, { throwOnError: true }).getJson().then(unexpected, asError);
      assert.equal(error.code, "GRAPHQL");
      assert.equal(error.message, "GraphQL error: Not found; Forbidden");
      assert.equal(error.status, 200);
      assert.deepEqual(error.data, { data: null, errors: [{ message: "Not found" }, { message: "Forbidden", path: ["me"] }] });

      const raw = await create.post(server.url("/graphql")).withGraphQL("query fail-raw", undefined, { throwOnError: true }).getResult();
      assert.equal(raw.error?.message, 'GraphQL error: Raw failure; {"code":"E2"}');

      const lenient = await create.post(server.url("/graphql")).withGraphQL("query fail", undefined, { throwOnError: false }).getJson<{ errors: unknown[] }>();
      assert.equal(lenient.errors.length, 2);
      const api = createApi().withBaseURL(server.origin);
      assert.deepEqual(
        await api
          .post("/graphql")
          .withGraphQL("{ me }")
          .getData<{ data: { ok: boolean } }, boolean>(r => r.data.ok),
        true
      );
    });
  });

  describe("retry policy over real failures", () => {
    it("a delay function, shouldRetry and methods drive the policy", async () => {
      const delays: number[] = [];
      const data = await create
        .get(server.url("/flaky/fn?fails=2"))
        .withRetries({ attempts: 2, delay: ({ attempt }) => attempt * 10, onRetry: ({ delay }) => void delays.push(delay) })
        .getJson<{ hits: number }>();
      assert.equal(data.hits, 3);
      assert.deepEqual(delays, [10, 20]);

      const notFound = await create
        .get(server.url("/flaky/custom?fails=1&status=404"))
        .withRetries({ attempts: 1, delay: 1, shouldRetry: ({ error }) => error.status === 404 })
        .getJson<{ hits: number }>();
      assert.equal(notFound.hits, 2);

      await assert.rejects(
        create
          .post(server.url("/flaky/post?fails=9"))
          .withRetries({ attempts: 2, delay: 1, methods: ["GET"] })
          .getJson(),
        { status: 500 }
      );
      assert.equal(server.requests.filter(r => r.path === "/flaky/post").length, 1, "POST is not in the retried methods");
      const put = await create
        .put(server.url("/flaky/put?fails=1"))
        .withRetries({ attempts: 2, delay: 1, methods: ["GET", "PUT"] })
        .getJson<{ hits: number }>();
      assert.equal(put.hits, 2);
    });

    it("stream bodies and aborted requests are never retried", async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("once"));
          controller.close();
        },
      });
      await assert.rejects(create.post(server.url("/flaky/stream?fails=9")).withBody(stream).withRetries({ attempts: 3, delay: 1 }).getJson(), { status: 500 });
      assert.equal(server.requests.length, 1);
      assert.equal(server.lastRequest.text, "once");

      server.reset();
      const aborted = await create.get(server.url("/never")).withRetries({ attempts: 3, delay: 1 }).withAbortController(abortAfter(20)).getJson().then(unexpected, asError);
      assert.equal(aborted.code, "ABORTED");
      assert.equal(server.requests.length, 1);
    });

    it("aborting during the back-off delay or inside onRetry stops retrying at once", async () => {
      const started = Date.now();
      const controller = abortAfter(30, new Error("user left"));
      const error = await create
        .get(server.url("/flaky/backoff?fails=9"))
        .withRetries({ attempts: 3, delay: 2000 })
        .withAbortController(controller)
        .getJson()
        .then(unexpected, asError);
      assert.equal(error.code, "ABORTED");
      assert.equal(error.message, "Request aborted");
      assert.equal((error.cause as Error).message, "user left");
      assert.ok(Date.now() - started < 1000, "must not wait out the delay");
      assert.equal(server.requests.length, 1);

      const inCallback = new AbortController();
      const fromCallback = await create
        .get(server.url("/flaky/cb?fails=9"))
        .withRetries({ attempts: 3, delay: 2000, onRetry: () => inCallback.abort() })
        .withSignal(inCallback.signal)
        .getJson()
        .then(unexpected, asError);
      assert.equal(fromCallback.code, "ABORTED");
      assert.equal(server.requests.length, 2);
      assert.ok(Date.now() - started < 1500);
    });

    it("a retry callback that throws ends the loop with an INTERCEPTOR error that keeps the failed response", async () => {
      const error = await create
        .get(server.url("/flaky/throws?fails=9"))
        .withRetries({
          attempts: 3,
          delay: 1,
          onRetry: () => {
            throw new Error("stop right there");
          },
        })
        .getJson()
        .then(unexpected, asError);
      assert.equal(error.code, "INTERCEPTOR");
      assert.equal(error.message, "Retry callback failed: stop right there");
      assert.equal(error.status, 500);
      assert.deepEqual(error.data, { error: "flaky failure", hit: 1 });
      assert.equal((error.cause as Error).message, "stop right there");
      assert.equal(server.requests.length, 1);

      const decided = await create
        .get(server.url("/flaky/decide?fails=9"))
        .withRetries({ attempts: 3, shouldRetry: async () => Promise.reject(new Error("cannot decide")) })
        .getJson()
        .then(unexpected, asError);
      assert.equal(decided.message, "Retry callback failed: cannot decide");
    });

    it("Retry-After: a past date retries at once, garbage falls back to the capped backoff, decimals are honoured", async () => {
      const delays: number[] = [];
      const onRetry = ({ delay }: { delay: number }) => void delays.push(delay);
      const past = encodeURIComponent(new Date(Date.now() - 60_000).toUTCString());
      await create
        .get(server.url(`/flaky/past?fails=1&retryAfter=${past}`))
        .withRetries({ attempts: 1, onRetry })
        .getJson();
      await create.get(server.url("/flaky/garbage?fails=1&retryAfter=soon")).withRetries({ attempts: 1, maxDelay: 5, onRetry }).getJson();
      await create.get(server.url("/flaky/decimal?fails=1&retryAfter=0.05")).withRetries({ attempts: 1, onRetry }).getJson();
      assert.deepEqual(delays, [0, 5, 50]);
      assert.equal(server.requests.length, 6);

      // Without the header — or without any response at all — the default backoff applies, capped by maxDelay.
      await create.get(server.url("/flaky/plain?fails=1")).withRetries({ attempts: 1, maxDelay: 5, onRetry }).getJson();
      await assert.rejects(create.get(server.url("/slow?ms=2000")).withTimeout(30).withRetries({ attempts: 1, maxDelay: 5, onRetry }).getJson(), { code: "TIMEOUT" });
      assert.deepEqual(delays, [0, 5, 50, 5, 5]);
      assert.equal(server.requests.length, 10);
    });

    it("error interceptors run in order and can replace, throw or recover", async () => {
      const seen: string[] = [];
      const error = await createApi()
        .withBaseURL(server.origin)
        .withErrorInterceptor((e, request) => {
          seen.push(`api:${e.status}:${request.method}`);
          return new RequestError("replaced", { code: "HTTP", url: e.url, method: e.method, status: e.status, response: e.response, body: e.body });
        })
        .get("/status/500")
        .withErrorInterceptor(e => {
          seen.push(e.message);
          throw new Error("boom");
        })
        .withErrorInterceptor(e => {
          seen.push(`${e.code}:${e.message}`);
        })
        .getJson()
        .then(unexpected, asError);
      assert.deepEqual(seen, ["api:500:GET", "replaced", "INTERCEPTOR:Error interceptor failed: boom"]);
      assert.equal(error.code, "INTERCEPTOR");
      assert.equal(error.status, 500, "context fields are kept");
      assert.equal(error.url, server.url("/status/500"));
      assert.equal(error.body, '{"error":"status 500","code":500}');
      assert.equal((error.cause as Error).message, "boom");

      // A thrown RequestError replaces the error as-is, and a replayed clone that fails again is what the caller sees.
      const replayed = new WeakSet<HttpRequest>();
      const own = await create
        .get(server.url("/status/500"))
        .withErrorInterceptor(() => {
          throw new RequestError("mine", { code: "PARSE", url: "/custom", method: "GET" });
        })
        .withErrorInterceptor((e, request) => {
          if (e.message !== "mine" || replayed.has(request)) return;
          const retry = request.clone();
          replayed.add(retry);
          return retry.getResponse();
        })
        .getJson()
        .then(unexpected, asError);
      assert.equal(own.message, "mine");
      assert.equal(own.code, "PARSE");
      assert.equal(own.url, "/custom");
      assert.equal(server.requests.length, 3, "one replay, no loop");
    });
  });

  describe("interceptors", () => {
    it("a request interceptor can return a new config; a thrown value (even a string) is wrapped", async () => {
      const echo = await create
        .get(server.url("/json"))
        .withHeader("x-keep", "1")
        .withRequestInterceptor(config => ({ ...config, url: server.url("/echo"), headers: { ...config.headers, "x-new": "2" } }))
        .withRequestInterceptor(config => {
          assert.equal(config.url, server.url("/echo"));
        })
        .getJson<Echo>();
      assert.equal(echo.path, "/echo");
      assert.equal(echo.headers["x-keep"], "1");
      assert.equal(echo.headers["x-new"], "2");

      const error = await create
        .get(server.url("/json"))
        .withRequestInterceptor(() => {
          throw "not an Error";
        })
        .getJson()
        .then(unexpected, asError);
      assert.equal(error.code, "INTERCEPTOR");
      assert.equal(error.message, "Request interceptor failed: not an Error");
      assert.equal(error.cause, "not an Error");
      assert.equal(server.requests.length, 1);
    });

    it("a CSRF token callback that throws is reported as an INTERCEPTOR error", async () => {
      const error = await create
        .post(server.url("/echo"))
        .withCsrf({
          token: () => {
            throw new Error("no token yet");
          },
        })
        .getJson()
        .then(unexpected, asError);
      assert.equal(error.code, "INTERCEPTOR");
      assert.equal(error.message, "CSRF token callback failed: no token yet");
      assert.equal(server.requests.length, 0);
    });

    it("a response interceptor can replace the response, and its failure keeps the status — with or without a deadline", async () => {
      const replaced = await create
        .get(server.url("/json"))
        .withResponseInterceptor((response, request) => {
          assert.equal(request.url, server.url("/json"));
          return new ResponseWrapper(new Response(JSON.stringify({ from: "interceptor", status: response.status }), { headers: { "content-type": "application/json" } }));
        })
        .getJson();
      assert.deepEqual(replaced, { from: "interceptor", status: 200 });

      for (const timeout of [0, 5000]) {
        const error = await create
          .get(server.url("/json"))
          .withTimeout(timeout)
          .withResponseInterceptor(() => {
            throw new Error("rejected by policy");
          })
          .getJson()
          .then(unexpected, asError);
        assert.equal(error.code, "INTERCEPTOR");
        assert.equal(error.message, "Response interceptor failed: rejected by policy");
        assert.equal(error.status, 200);
        assert.equal(error.response?.url, server.url("/json"));
      }
    });

    it("a short-circuit Response is checked like a fetched one, even when its body was already read", async () => {
      const consumed = new Response('{"error":"gone"}', { status: 410 });
      await consumed.text();
      const error = await create
        .get(server.url("/json"))
        .withRequestInterceptor(() => consumed)
        .getJson()
        .then(unexpected, asError);
      assert.equal(error.status, 410);
      assert.equal(error.body, undefined);
      assert.equal(server.requests.length, 0);
    });
  });

  describe("CSRF with a simulated page", () => {
    it("the cookie token is sent to the page's origin only, unless crossOrigin is set", async () => {
      const page = { href: `${server.origin}/app`, origin: server.origin };
      const g = globalThis as { document?: { cookie: string } };
      await inBrowser(
        page,
        async () => {
          const token = async (request: ReturnType<typeof create.post>) => (await request.getJson<Echo>()).headers["x-xsrf-token"];
          assert.equal(await token(create.post(server.url("/echo")).withCsrf()), "a b=c", "decoded, first '=' only");
          assert.equal(await token(create.post(other.url("/echo")).withCsrf()), undefined, "cross-origin");
          assert.equal(await token(create.post(other.url("/echo")).withCsrf({ crossOrigin: true })), "a b=c");
          assert.equal(await token(create.post(server.url("/echo")).withHeader("X-XSRF-TOKEN", "mine").withCsrf()), "mine", "a user header wins");
          assert.equal(await token(create.post(server.url("/echo")).withCsrf({ cookie: "missing" })), undefined);

          g.document!.cookie = "raw=%E0%A4%A; noequals";
          assert.equal(await token(create.post(server.url("/echo")).withCsrf({ cookie: "raw" })), "%E0%A4%A", "undecodable values are sent verbatim");
          g.document!.cookie = "csrftoken=django";
          const django = await create.post(server.url("/echo")).withCsrf({ cookie: "csrftoken", header: "X-CSRFToken" }).getJson<Echo>();
          assert.equal(django.headers["x-csrftoken"], "django");
          assert.equal(django.headers["x-xsrf-token"], undefined);

          const api = createApi().withBaseURL(server.origin).withCsrf();
          const viaApi = await api.post("/echo").getJson<Echo>();
          assert.equal(viaApi.headers["x-xsrf-token"], undefined, "api cookie name is XSRF-TOKEN, which is now missing");
          g.document!.cookie = "XSRF-TOKEN=fresh";
          assert.equal((await api.post("/echo").getJson<Echo>()).headers["x-xsrf-token"], "fresh", "read per request");
        },
        "first=1; XSRF-TOKEN=a%20b%3Dc; last=2"
      );
      assert.equal(server.requests.length, 7);
      assert.equal(other.requests.length, 2);
    });

    it("a page whose origin cannot be resolved never receives a token, and a token option is not origin-bound outside a page", async () => {
      for (const href of ["", "about:blank"]) {
        await inBrowser(
          { href, origin: "null" },
          async () => {
            const echo = await create.post(server.url("/echo")).withCsrf({ token: "explicit" }).getJson<Echo>();
            assert.equal(echo.headers["x-csrf-token"], undefined, `href ${JSON.stringify(href)}`);
          },
          "XSRF-TOKEN=t"
        );
      }
      const outside = await create.post(other.url("/echo")).withCsrf({ token: "explicit" }).getJson<Echo>();
      assert.equal(outside.headers["x-csrf-token"], "explicit", "no page origin: every URL is same-origin");
    });
  });

  describe("reading responses", () => {
    it("validates real bodies with zod and valibot, reporting issues, body and path", async () => {
      const Message = z.object({ message: z.string(), source: z.literal("e2e") });
      const valid = await create.get(server.url("/json")).getJson(Message);
      assert.deepEqual(valid, { message: "hello", source: "e2e" });

      const zodError = await create
        .get(server.url("/json"))
        .getJson(z.object({ message: z.number() }))
        .then(unexpected, asError);
      assert.equal(zodError.code, "VALIDATION");
      assert.ok(zodError.message.startsWith("Response validation failed: "), zodError.message);
      assert.ok(zodError.message.endsWith(" at message"), zodError.message);
      assert.equal(zodError.body, '{"message":"hello","source":"e2e"}');
      assert.equal(zodError.status, 200);
      assert.equal(zodError.issues?.length, 1);

      const valibotError = await create
        .get(server.url("/json"))
        .getJson(v.object({ message: v.string(), source: v.pipe(v.string(), v.minLength(10)) }))
        .then(unexpected, asError);
      assert.ok(valibotError.message.endsWith(" at source"), valibotError.message);

      const crashing = await create
        .get(server.url("/json"))
        .getJson(
          schema(() => {
            throw new Error("validator crashed");
          })
        )
        .then(unexpected, asError);
      assert.equal(crashing.code, "VALIDATION");
      assert.equal(crashing.message, "Schema validation threw: validator crashed");

      const topLevel = await create.get(server.url("/json")).getJson(z.array(z.string())).then(unexpected, asError);
      assert.equal(topLevel.code, "VALIDATION");
      assert.equal(topLevel.message.includes(" at "), false, topLevel.message);

      const result = await create.get(server.url("/json")).getResult(Message);
      assert.equal(result.data?.message, "hello");
      const failed = await create.get(server.url("/json")).getResult(z.object({ message: z.number() }));
      assert.equal(failed.error?.code, "VALIDATION");
      assert.equal(await create.get(server.url("/json")).getData(Message, m => m.message.toUpperCase()), "HELLO");
      assert.deepEqual(await create.get(server.url("/json")).getData(Message), { message: "hello", source: "e2e" });
      assert.equal(await create.get(server.url("/empty")).getJson(z.null()), null);
    });

    it("the body is buffered once for the readers, and handed over once by getBody()", async () => {
      const response = await create.get(server.url("/json")).getResponse();
      const [text, json, blob] = await Promise.all([response.getText(), response.getJson(), response.getBlob()]);
      assert.equal(text, '{"message":"hello","source":"e2e"}');
      assert.deepEqual(json, { message: "hello", source: "e2e" });
      assert.equal(blob.type, "application/json");
      assert.equal(await response.getText(), text);
      assert.throws(() => response.getBody(), { code: "PARSE", message: "Response body already consumed" });

      const streamed = await create.get(server.url("/json")).getResponse();
      const { text: fromStream } = await readAll(streamed.getBody()!);
      assert.equal(fromStream, text);
      await assert.rejects(streamed.getText(), { code: "PARSE", message: "Response body already consumed" });

      const raw = await create.get(server.url("/text")).getResponse();
      await raw.raw.text();
      const error = await raw.getJson().then(unexpected, asError);
      assert.equal(error.code, "PARSE");
      assert.equal(error.url, server.url("/text"));
      assert.equal(error.status, 200);
    });

    it("a connection dropped in the middle of the body is a PARSE error carrying the cause", async () => {
      const error = await create.get(server.url("/broken?bytes=100")).getText().then(unexpected, asError);
      assert.equal(error.code, "PARSE");
      assert.ok(error.message.startsWith("Failed to read response body: "), error.message);
      assert.equal(error.status, 200);
      assert.ok(error.cause instanceof Error);
      const result = await create.get(server.url("/broken?bytes=1")).getResult();
      assert.equal(result.error?.code, "PARSE");
      // For an error response the HTTP error still wins; the half-received body is simply not captured.
      const dropped = await create.get(server.url("/broken?bytes=100&status=500")).getJson().then(unexpected, asError);
      assert.equal(dropped.code, "HTTP");
      assert.equal(dropped.status, 500);
      assert.equal(dropped.body, undefined);
    });

    it("untyped blobs, non-form bodies, invalid JSON and failing selectors", async () => {
      assert.equal((await create.get(server.url("/no-type")).getBlob()).type, "");
      assert.equal(await create.get(server.url("/no-type")).getText(), "untyped");

      const form = await create.get(server.url("/json")).getFormData().then(unexpected, asError);
      assert.equal(form.code, "PARSE");
      assert.ok(form.message.startsWith("Failed to parse form data: "), form.message);

      const invalid = await create.get(server.url("/invalid-json")).getJson().then(unexpected, asError);
      assert.equal(invalid.code, "PARSE");
      assert.ok(invalid.message.startsWith("Invalid JSON response: "), invalid.message);
      assert.equal(invalid.body, "{not json");
      assert.ok(invalid.cause instanceof SyntaxError);
      assert.equal(await create.get(server.url("/invalid-json")).getText(), "{not json", "getText() still works");

      const selector = await create
        .get(server.url("/json"))
        .getData(() => {
          throw new Error("bad select");
        })
        .then(unexpected, asError);
      assert.equal(selector.code, "PARSE");
      assert.equal(selector.message, "Selector failed: bad select");
      assert.equal(selector.status, 200);
      const notCallable = await create
        .get(server.url("/json"))
        .getData({} as never)
        .then(unexpected, asError);
      assert.equal(notCallable.code, "PARSE");
      assert.deepEqual(await create.get(server.url("/json")).getData(null as never), { message: "hello", source: "e2e" });
    });
  });

  describe("signals", () => {
    it("combines signals without AbortSignal.any, over the network", async () => {
      const original = AbortSignal.any;
      Object.defineProperty(AbortSignal, "any", { value: undefined, configurable: true, writable: true });
      try {
        const a = new AbortController();
        const error = await create.get(server.url("/never")).withSignal(a.signal).withAbortController(abortAfter(20, "custom reason")).getJson().then(unexpected, asError);
        assert.equal(error.code, "ABORTED");
        assert.equal(error.cause, "custom reason");
        assert.equal(a.signal.aborted, false);
        assert.equal(server.requests.length, 1);

        const timeout = await create.get(server.url("/slow?ms=2000")).withSignal(a.signal).withTimeout(30).getJson().then(unexpected, asError);
        assert.equal(timeout.code, "TIMEOUT");
        assert.equal(timeout.message, "Request timed out after 30ms");

        const done = new AbortController();
        done.abort(new Error("already"));
        const early = await create
          .get(server.url("/json"))
          .withSignal(a.signal)
          .withSignal(done.signal)
          .withSignal(new AbortController().signal)
          .getJson()
          .then(unexpected, asError);
        assert.equal(early.code, "ABORTED");
        assert.equal((early.cause as Error).message, "already");
        assert.equal(server.requests.length, 2, "nothing was sent");
      } finally {
        Object.defineProperty(AbortSignal, "any", { value: original, configurable: true, writable: true });
      }
    });

    it("a signal aborted before the request is sent short-circuits the request, and getResult reports it", async () => {
      const done = new AbortController();
      done.abort();
      const result = await create.get(server.url("/json")).withSignal(done.signal).getResult();
      assert.equal(result.data, null);
      assert.equal(result.error?.code, "ABORTED");
      assert.equal(result.error?.message, "Request aborted");
      assert.equal(server.requests.length, 0);
    });
  });

  describe("review findings over the wire (plans/10-v2-code-review.md)", () => {
    const activeTimers = (): number => process.getActiveResourcesInfo().filter(resource => resource === "Timeout").length;

    it("R2 — AbortSignal.timeout() with retries is TIMEOUT, sent once", async () => {
      const retries: number[] = [];
      const error = await create
        .get(server.url("/slow?ms=2000"))
        .withSignal(AbortSignal.timeout(40))
        .withRetries({ attempts: 3, delay: 1, onRetry: ({ attempt }) => void retries.push(attempt) })
        .getJson()
        .then(unexpected, asError);
      assert.equal(error.code, "TIMEOUT");
      assert.deepEqual(retries, []);
      assert.equal(server.requests.length, 1);
    });

    it("R3 — a FormData from undici's own copy (a different realm) is sent as multipart, not as JSON", async () => {
      const form = new UndiciFormData();
      form.append("field", "from-undici");
      await create
        .post(server.url("/echo"))
        .withBody(form as unknown as FormData)
        .getJson();
      assert.ok(String(server.lastRequest.headers["content-type"]).startsWith("multipart/form-data; boundary="));
      assert.ok(server.lastRequest.text.includes("from-undici"));
    });

    it("R4 — HEAD and 204 responses with a timeout leave no timer behind", async () => {
      const before = activeTimers();
      await create.head(server.url("/json")).withTimeout(60_000).getResponse();
      await create.get(server.url("/empty")).withTimeout(60_000).getResponse();
      assert.equal(activeTimers(), before);
    });

    it("R6 — error bodies are capped at 1 MB whether they are compressed, chunked or declared", async () => {
      for (const query of ["size=3000000&gzip=1", "size=3000000&chunked=1", "size=3000000"]) {
        const error = await create
          .get(server.url(`/big-error?${query}`))
          .getJson()
          .then(unexpected, asError);
        assert.equal(error.status, 500, query);
        assert.equal(error.body, undefined, query);
      }
      const small = await create.get(server.url("/big-error?size=1000&gzip=1")).getJson().then(unexpected, asError);
      assert.equal(small.body, "x".repeat(1000));
      assert.equal((await create.get(server.url("/big-error?size=999999&chunked=1")).getJson().then(unexpected, asError)).body?.length, 999_999);
    });

    it("R8 — a chunked body that finished streaming but was read after the deadline is reported as TIMEOUT", async () => {
      const response = await create.get(server.url("/stream?chunks=3&delay=10")).withTimeout(100).getResponse();
      await new Promise(resolve => setTimeout(resolve, 200));
      const error = await response.getText().then(unexpected, asError);
      assert.equal(error.code, "TIMEOUT");
      assert.equal(error.message, "Request timed out after 100ms");
    });

    it("R10 — a wrapper produced by another request keeps that request's deadline when returned from a response interceptor", async () => {
      const before = activeTimers();
      const wrapper = await create
        .get(server.url("/json"))
        .withTimeout(60_000)
        .withResponseInterceptor(() => create.get(server.url("/stream?chunks=50&delay=20")).withTimeout(60).getResponse())
        .getResponse();
      const error = await wrapper.getText().then(unexpected, asError);
      assert.equal(error.code, "TIMEOUT");
      assert.equal(error.message, "Request timed out after 60ms");
      await new Promise(resolve => setTimeout(resolve, 50)); // lets the server notice the abort and clear its own interval
      assert.equal(activeTimers(), before, "the replaced response's 60s deadline was cleared");
    });

    it("R12 — an invalid header value fails with VALIDATION before anything is sent", async () => {
      const error = await create.get(server.url("/json")).withHeader("x-bad", "a\r\nb").withRetries(2).getJson().then(unexpected, asError);
      assert.equal(error.code, "VALIDATION");
      assert.equal(server.requests.length, 0);
    });
  });
});
