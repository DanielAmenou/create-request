import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import create, { RequestError, createApi } from "../../src/index.js";
import { asError, readAll, unexpected } from "../utils/helpers.js";
import { TestServer } from "../utils/server.js";

describe("e2e: deadlines, cancellation and policies over real HTTP", { timeout: 30_000 }, () => {
  let server: TestServer;
  before(async () => {
    server = await TestServer.start();
  });
  after(async () => {
    await server.close();
  });
  beforeEach(() => server.reset());

  it("the timeout covers a body that streams too slowly, not just the headers", async () => {
    const started = Date.now();
    const error = await create.get(server.url("/stream?chunks=50&delay=20")).withTimeout(120).getText().then(unexpected, asError);
    assert.equal(error.code, "TIMEOUT");
    assert.equal(error.message, "Request timed out after 120ms");
    assert.equal(error.status, 200);
    assert.ok(Date.now() - started < 900, "must not wait for the whole stream");
  });

  it("getBody() hands the deadline over, so a slow stream can be consumed in full", async () => {
    const stream = await create.get(server.url("/stream?chunks=8&delay=20")).withTimeout(50).getBody();
    const { text } = await readAll(stream!);
    assert.equal(text, "chunk-1;chunk-2;chunk-3;chunk-4;chunk-5;chunk-6;chunk-7;chunk-8;");
  });

  it("aborting while the body streams is reported as ABORTED, with the reason as cause", async () => {
    const controller = new AbortController();
    const pending = create.get(server.url("/stream?chunks=50&delay=20")).withAbortController(controller).getText();
    setTimeout(() => controller.abort(new Error("user left")), 60);
    const error = await pending.then(unexpected, asError);
    assert.equal(error.code, "ABORTED");
    assert.equal((error.cause as Error).message, "user left");
  });

  it("a response wrapper read after its deadline passed fails with TIMEOUT immediately", async () => {
    const response = await create.get(server.url("/stream?chunks=50&delay=20")).withTimeout(40).getResponse();
    await new Promise(resolve => setTimeout(resolve, 80));
    const started = Date.now();
    await assert.rejects(response.getText(), { code: "TIMEOUT" });
    assert.ok(Date.now() - started < 500);
  });

  it("an HTTP-date Retry-After from the server is honoured", async () => {
    const when = encodeURIComponent(new Date(Date.now() + 1000).toUTCString());
    const delays: number[] = [];
    const started = Date.now();
    await create
      .get(server.url(`/flaky/dated?fails=1&status=503&retryAfter=${when}`))
      .withRetries({ attempts: 1, onRetry: ({ delay }) => void delays.push(delay) })
      .getJson();
    assert.equal(delays.length, 1);
    assert.ok(delays[0]! > 0 && delays[0]! <= 1000, `delay ${delays[0]}`);
    assert.ok(Date.now() - started >= delays[0]! - 20);
    assert.equal(server.requests.length, 2);
  });

  it("a Retry-After longer than maxDelay gives up without waiting", async () => {
    const started = Date.now();
    const error = await create.get(server.url("/flaky/long?fails=5&status=429&retryAfter=120")).withRetries({ attempts: 3, maxDelay: 1000 }).getJson().then(unexpected, asError);
    assert.equal(error.status, 429);
    assert.equal(error.response?.headers.get("retry-after"), "120");
    assert.equal(server.requests.length, 1);
    assert.ok(Date.now() - started < 500);
  });

  it("sends explicit CSRF tokens and cookies on the wire, and nothing automatic", async () => {
    await create.post(server.url("/echo")).withCsrfToken("tok-1").withCookie("sid", "abc").withBody({ ok: true }).getJson();
    const headers = server.lastRequest.headers;
    assert.equal(headers["x-csrf-token"], "tok-1");
    assert.equal(headers.cookie, "sid=abc");
    assert.equal(headers["x-xsrf-token"], undefined);
    assert.equal(headers["x-requested-with"], undefined);
    // withCsrf() is a no-op outside a browser unless a token is provided
    await create.post(server.url("/echo")).withCsrf().getJson();
    assert.equal(server.lastRequest.headers["x-xsrf-token"], undefined);
    await create
      .post(server.url("/echo"))
      .withCsrf({ token: () => "lazy", header: "X-My-Token" })
      .getJson();
    assert.equal(server.lastRequest.headers["x-my-token"], "lazy");
  });

  it("large JSON round-trips intact through JSON encoding and a real socket", async () => {
    const payload = { items: Array.from({ length: 2000 }, (_, i) => ({ id: i, name: `item-${i}`, tags: ["a", "b", "ü"] })) };
    const echo = await create.post<{ body: string }>(server.url("/echo")).withBody(payload).getJson();
    assert.deepEqual(JSON.parse(echo.body), payload);
  });

  it("HEAD responses have no body: getJson() resolves with null and getText() with an empty string", async () => {
    assert.equal(await create.head(server.url("/json")).getJson(), null);
    assert.equal(await create.head(server.url("/json")).getText(), "");
  });

  it("concurrent requests through one api with retries do not interfere", async () => {
    const api = createApi().withBaseURL(server.origin).withRetries({ attempts: 2, delay: 5 });
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => api.get(`/flaky/c${i}?fails=1`).getJson<{ ok: boolean; hits: number }>()));
    assert.ok(results.every(r => r.ok && r.hits === 2));
    assert.equal(server.requests.length, 12);
  });

  it("a request-level error interceptor can turn a real 404 into a typed default", async () => {
    const value = await createApi()
      .withBaseURL(server.origin)
      .get<{ missing: boolean }>("/status/404")
      .withErrorInterceptor(error => (error.status === 404 ? create.get(server.url("/json")).getResponse() : undefined))
      .getJson();
    assert.deepEqual(value, { message: "hello", source: "e2e" });
    assert.ok(server.requests.length === 2);
  });

  it("getResult() over the network resolves with either the data or the RequestError", async () => {
    const ok = await create.get(server.url("/json")).getResult<{ message: string }>();
    assert.equal(ok.data?.message, "hello");
    const failed = await create.get(server.url("/status/418")).getResult();
    assert.ok(failed.error instanceof RequestError);
    assert.equal(failed.error.status, 418);
    assert.deepEqual(failed.error.data, { error: "status 418", code: 418 });
  });
});
