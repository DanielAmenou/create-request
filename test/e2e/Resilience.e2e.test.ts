import assert from "node:assert/strict";
import { describe, it, before, after, beforeEach } from "node:test";
import create, { RequestError } from "../../src/index.js";
import { TestServer } from "./utils/testServer.js";

describe("e2e: retries, timeouts and aborts over real HTTP", { timeout: 30000 }, () => {
  let server: TestServer;

  before(async () => {
    server = await TestServer.start();
  });

  after(async () => {
    await server.close();
  });

  beforeEach(() => {
    server.reset();
    create.config.reset();
  });

  it("retries real 500 responses until the server recovers", async () => {
    const attempts: number[] = [];

    const data = await create
      .get(server.url("/flaky/recovers?fails=2"))
      .withRetries(3)
      .onRetry(({ attempt, error }) => {
        attempts.push(attempt);
        assert.equal(error.status, 500);
      })
      .getJson<{ ok: boolean; hits: number }>();

    assert.deepEqual(data, { ok: true, hits: 3 });
    assert.deepEqual(attempts, [1, 2]);
    assert.equal(server.requests.length, 3);
  });

  it("throws the last error once retries are exhausted", async () => {
    await assert.rejects(create.get(server.url("/flaky/always-fails?fails=99")).withRetries(2).getJson(), (error: unknown) => {
      assert.ok(error instanceof RequestError);
      assert.equal(error.status, 500);
      assert.deepEqual(error.getJson(), { error: "flaky failure", hit: 3 });
      return true;
    });

    assert.equal(server.requests.length, 3); // 1 initial + 2 retries
  });

  it("applies a real delay between retries", async () => {
    const delays: number[] = [];
    const started = Date.now();

    await create
      .get(server.url("/flaky/delayed?fails=2"))
      .withRetries({
        attempts: 2,
        delay: ({ attempt }) => {
          delays.push(attempt);
          return 60;
        },
      })
      .getJson();

    const elapsed = Date.now() - started;
    assert.deepEqual(delays, [1, 2]);
    assert.ok(elapsed >= 100, `expected two ~60ms delays, elapsed only ${elapsed}ms`);
    assert.equal(server.requests.length, 3);
  });

  it("times out a genuinely slow response", async () => {
    const started = Date.now();

    await assert.rejects(create.get(server.url("/slow?ms=2000")).withTimeout(80).getJson(), (error: unknown) => {
      assert.ok(error instanceof RequestError);
      assert.equal(error.isTimeout, true);
      assert.equal(error.isAborted, false);
      assert.equal(error.status, undefined);
      return true;
    });

    assert.ok(Date.now() - started < 1500, "timeout should fire well before the server responds");
  });

  it("retries after real timeouts, hitting the server once per attempt", async () => {
    await assert.rejects(create.get(server.url("/slow?ms=2000")).withTimeout(60).withRetries(2).getJson(), (error: unknown) => {
      assert.ok(error instanceof RequestError);
      assert.equal(error.isTimeout, true);
      return true;
    });

    assert.equal(server.requests.length, 3);
  });

  it("aborts an in-flight request via AbortController", async () => {
    const controller = new AbortController();
    const pending = create.get(server.url("/never")).withAbortController(controller).getJson();

    setTimeout(() => controller.abort(), 50);

    await assert.rejects(pending, (error: unknown) => {
      assert.ok(error instanceof RequestError);
      assert.equal(error.isAborted, true);
      assert.equal(error.isTimeout, false);
      return true;
    });

    assert.equal(server.requests.length, 1, "the request should have reached the server before being aborted");
  });

  it("succeeds when the response is faster than the timeout", async () => {
    const data = await create.get(server.url("/slow?ms=20")).withTimeout(2000).getJson<{ slept: number }>();

    assert.deepEqual(data, { slept: 20 });
  });
});
