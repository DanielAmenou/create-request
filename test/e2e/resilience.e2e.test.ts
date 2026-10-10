import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { Agent, fetch as undiciFetch } from "undici";
import create, { createApi, type FetchFunction, type RequestError } from "../../src/index.js";
import { asError, readAll, unexpected } from "../utils/helpers.js";
import { TestServer, deterministicBytes } from "../utils/server.js";

describe("e2e: retries, timeouts, aborts, streaming and custom fetch over real HTTP", { timeout: 30_000 }, () => {
  let server: TestServer;
  before(async () => {
    server = await TestServer.start();
  });
  after(async () => {
    await server.close();
  });
  beforeEach(() => server.reset());

  it("retries real 500 responses until the server recovers, with a real delay", async () => {
    const attempts: number[] = [];
    const started = Date.now();
    const data = await create
      .get(server.url("/flaky/recovers?fails=2"))
      .withRetries({ attempts: 3, delay: 30 })
      .onRetry(({ attempt, error }) => {
        attempts.push(attempt);
        assert.equal(error.status, 500);
      })
      .getJson<{ ok: boolean; hits: number }>();
    assert.deepEqual(data, { ok: true, hits: 3 });
    assert.deepEqual(attempts, [1, 2]);
    assert.equal(server.requests.length, 3);
    assert.ok(Date.now() - started >= 55);
  });

  it("throws the last error once retries are exhausted", async () => {
    const error = await create.get(server.url("/flaky/always?fails=99")).withRetries({ attempts: 2, delay: 1 }).getJson().then(unexpected, asError);
    assert.equal(error.status, 500);
    assert.deepEqual(error.data, { error: "flaky failure", hit: 3 });
    assert.equal(server.requests.length, 3);
  });

  it("honours a real Retry-After header and does not retry 4xx", async () => {
    const delays: number[] = [];
    const started = Date.now();
    await create
      .get(server.url("/flaky/after?fails=1&status=429&retryAfter=1"))
      .withRetries({ attempts: 1, onRetry: ({ delay }) => void delays.push(delay) })
      .getJson();
    assert.deepEqual(delays, [1000]);
    assert.ok(Date.now() - started >= 950);
    await assert.rejects(create.get(server.url("/flaky/nope?fails=9&status=404")).withRetries(2).getJson(), { status: 404 });
    assert.equal(server.requests.length, 3);
  });

  it("times out a genuinely slow response and retries after real timeouts", async () => {
    const started = Date.now();
    const timeout = await create.get(server.url("/slow?ms=2000")).withTimeout(80).getJson().then(unexpected, asError);
    assert.equal(timeout.code, "TIMEOUT");
    assert.equal(timeout.status, undefined);
    assert.ok(Date.now() - started < 1500);
    server.reset();
    await assert.rejects(create.get(server.url("/slow?ms=2000")).withTimeout(60).withRetries({ attempts: 2, delay: 1 }).getJson(), { code: "TIMEOUT" });
    assert.equal(server.requests.length, 3);
    assert.deepEqual(await create.get(server.url("/slow?ms=20")).withTimeout(2000).getJson(), { slept: 20 });
  });

  it("retries a body that stalls past the timeout, and error interceptors see failures while the body is read", async () => {
    const seen: string[] = [];
    const record = (e: RequestError): void => void seen.push(`${e.code} ${e.status}`);
    // The headers and the first chunk arrive at once; the whole body would take 2 s.
    const error = await create
      .get(server.url("/stream?chunks=40&delay=50"))
      .withTimeout(300)
      .withRetries({ attempts: 1, delay: 1 })
      .withErrorInterceptor(record)
      .getText()
      .then(unexpected, asError);
    assert.equal(error.code, "TIMEOUT");
    assert.equal(server.requests.length, 2);
    server.reset();
    await assert.rejects(create.get(server.url("/invalid-json")).withRetries({ attempts: 2, delay: 1 }).withErrorInterceptor(record).getJson(), { code: "PARSE" });
    assert.equal(server.requests.length, 1);
    assert.deepEqual(seen, ["TIMEOUT 200", "PARSE 200"]);
    assert.equal(await create.get(server.url("/stream?chunks=3&delay=5")).withTimeout(2000).withRetries(1).getText(), "chunk-1;chunk-2;chunk-3;");
  });

  it("aborts an in-flight request via AbortController or AbortSignal", async () => {
    const controller = new AbortController();
    const pending = create.get(server.url("/never")).withAbortController(controller).getJson();
    setTimeout(() => controller.abort(), 50);
    await assert.rejects(pending, { code: "ABORTED" });
    assert.equal(server.requests.length, 1);
    await assert.rejects(create.get(server.url("/never")).withSignal(AbortSignal.timeout(30)).getJson(), { code: "TIMEOUT", message: "Request timed out" });
  });

  it("reports connection failures as NETWORK errors with the cause", async () => {
    const closed = await TestServer.start();
    const url = closed.url("/json");
    await closed.close();
    const error = await create.get(url).getJson().then(unexpected, asError);
    assert.equal(error.code, "NETWORK");
    assert.ok(error.message.startsWith("Network error: fetch failed"), error.message);
    assert.ok(error.cause instanceof TypeError);
  });

  it("reads a real chunked response as a stream and decompresses gzip", async () => {
    const stream = await create.get(server.url("/stream?chunks=5&delay=10")).getBody();
    const { text, chunks } = await readAll(stream!);
    assert.equal(text, "chunk-1;chunk-2;chunk-3;chunk-4;chunk-5;");
    assert.ok(chunks > 1);
    const gzip = await create.get(server.url("/gzip")).getResponse();
    assert.equal(gzip.headers.get("content-encoding"), "gzip");
    assert.deepEqual(await gzip.getJson(), { compressed: true, message: "gzipped hello" });
  });

  it("handles many concurrent requests and cloned requests", async () => {
    const base = create.get(server.url("/echo")).withHeader("x-base", "1");
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => base.clone().withQueryParam("i", i).getJson<{ query: { i: string }; headers: Record<string, string> }>())
    );
    assert.deepEqual(
      results.map(r => Number(r.query.i)).sort((a, b) => a - b),
      Array.from({ length: 20 }, (_, i) => i)
    );
    assert.ok(results.every(r => r.headers["x-base"] === "1"));
    assert.equal(server.requests.length, 20);
    assert.deepEqual(Buffer.from(await create.get(server.url("/binary?size=64")).getArrayBuffer()), deterministicBytes(64));
  });

  it("routes requests through an undici Agent and other custom fetch functions", async () => {
    class CountingAgent extends Agent {
      dispatches = 0;
      override dispatch(options: Parameters<Agent["dispatch"]>[0], handler: Parameters<Agent["dispatch"]>[1]): boolean {
        this.dispatches++;
        return super.dispatch(options, handler);
      }
    }
    const agent = new CountingAgent({ keepAliveTimeout: 1000 });
    const agentFetch: FetchFunction = (url, init) => undiciFetch(url, { ...(init as Parameters<typeof undiciFetch>[1]), dispatcher: agent }) as unknown as Promise<Response>;
    try {
      assert.deepEqual(await create.get(server.url("/json")).withFetch(agentFetch).getJson(), { message: "hello", source: "e2e" });
      assert.equal(agent.dispatches, 1);
    } finally {
      await agent.close();
    }

    let wrapperCalls = 0;
    const counting: FetchFunction = (url, init) => (wrapperCalls++, fetch(url, init));
    const api = createApi().withBaseURL(server.origin).withFetch(counting);
    assert.deepEqual(await api.get("/flaky/custom?fails=1").withRetries({ attempts: 2, delay: 1 }).getJson(), { ok: true, hits: 2 });
    await api.post("/echo").withBody({ n: 1 }).getJson();
    assert.equal(wrapperCalls, 3);
  });
});
