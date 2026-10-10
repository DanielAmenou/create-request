import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import create, { type RetryContext } from "../../src/index.js";
import { asError, fetchFailed, flush, hanging, json, schema, stalled, status, stub, unexpected } from "../utils/helpers.js";

/** Drives a request to completion under fake timers, running every pending timer as it appears. */
async function settle<T>(promise: Promise<T>): Promise<T> {
  let done = false;
  const guarded = promise.then(
    value => ((done = true), value),
    (error: unknown) => ((done = true), Promise.reject(error))
  );
  guarded.catch(() => undefined); // observed here; callers still see the rejection
  while (!done) {
    await flush();
    mock.timers.runAll();
  }
  return guarded;
}

describe("retries", () => {
  beforeEach(() => mock.timers.enable({ apis: ["setTimeout"] }));
  afterEach(() => mock.timers.reset());

  it("retries retriable statuses, network errors and timeouts up to `attempts` times", async () => {
    const { fetch, calls } = stub((_call, i) => (i === 0 ? status(503) : i === 1 ? fetchFailed() : json({ ok: true })));
    const data = await settle(create.get("/x").withRetries(2).withFetch(fetch).getJson());
    assert.deepEqual(data, { ok: true });
    assert.equal(calls.length, 3);

    const { fetch: timingOut, calls: timeoutCalls } = stub((_call, i) => (i === 0 ? hanging(_call.url, _call.init) : json({ ok: true })));
    assert.deepEqual(await settle(create.get("/x").withTimeout(10).withRetries(1).withFetch(timingOut).getJson()), { ok: true });
    assert.equal(timeoutCalls.length, 2);
  });

  it("throws the last error once attempts are exhausted, and every attempt uses the same URL and body", async () => {
    const { fetch, calls } = stub(status(500));
    const error = await settle(create.post("/x").withBody({ a: 1 }).withRetries(2).withFetch(fetch).getResponse()).then(unexpected, asError);
    assert.equal(error.code, "HTTP");
    assert.equal(error.status, 500);
    assert.equal(calls.length, 3);
    assert.ok(calls.every(call => call.url === "/x" && call.init.body === '{"a":1}'));
  });

  it("does not retry 4xx (by default), aborts, validation errors or interceptor errors", async () => {
    const { fetch, calls } = stub(status(404));
    await assert.rejects(settle(create.get("/x").withRetries(3).withFetch(fetch).getResponse()), { status: 404 });
    assert.equal(calls.length, 1);

    const controller = new AbortController();
    controller.abort();
    const { fetch: aborted, calls: abortCalls } = stub(() => new DOMException("aborted", "AbortError"));
    await assert.rejects(settle(create.get("/x").withRetries(3).withAbortController(controller).withFetch(aborted).getResponse()), { code: "ABORTED" });
    assert.equal(abortCalls.length, 0);

    const { fetch: bad, calls: badCalls } = stub();
    await assert.rejects(settle(create.get("").withRetries(3).withFetch(bad).getResponse()), { code: "VALIDATION" });
    assert.equal(badCalls.length, 0);

    let interceptorCalls = 0;
    await assert.rejects(
      settle(
        create
          .get("/x")
          .withRetries(3)
          .withRequestInterceptor(() => {
            interceptorCalls++;
            throw new Error("nope");
          })
          .withFetch(bad)
          .getResponse()
      ),
      { code: "INTERCEPTOR" }
    );
    assert.equal(interceptorCalls, 1);
  });

  it("`statuses` replaces the retried status list", async () => {
    const { fetch, calls } = stub((_call, i) => (i === 0 ? status(404) : json({})));
    await settle(
      create
        .get("/x")
        .withRetries({ attempts: 1, statuses: [404] })
        .withFetch(fetch)
        .getResponse()
    );
    assert.equal(calls.length, 2);
    const { fetch: f503, calls: c503 } = stub(status(503));
    await assert.rejects(
      settle(
        create
          .get("/x")
          .withRetries({ attempts: 1, statuses: [404] })
          .withFetch(f503)
          .getResponse()
      )
    );
    assert.equal(c503.length, 1);
  });

  it("`methods` restricts retries to the listed methods", async () => {
    const { fetch, calls } = stub(status(503));
    await assert.rejects(
      settle(
        create
          .post("/x")
          .withRetries({ attempts: 2, methods: ["GET", "PUT"] })
          .withFetch(fetch)
          .getResponse()
      )
    );
    assert.equal(calls.length, 1);
    await assert.rejects(
      settle(
        create
          .put("/x")
          .withRetries({ attempts: 2, methods: ["GET", "PUT"] })
          .withFetch(fetch)
          .getResponse()
      )
    );
    assert.equal(calls.length, 4);
  });

  it("`shouldRetry` overrides the decision entirely (except for aborts), sync or async", async () => {
    const seen: RetryContext[] = [];
    const { fetch, calls } = stub((_call, i) => (i < 2 ? status(404) : json({})));
    await settle(
      create
        .get("/x")
        .withRetries({
          attempts: 5,
          shouldRetry: context => {
            seen.push(context);
            return context.error.status === 404;
          },
        })
        .withFetch(fetch)
        .getResponse()
    );
    assert.equal(calls.length, 3);
    assert.deepEqual(
      seen.map(c => [c.attempt, c.error.status]),
      [
        [1, 404],
        [2, 404],
      ]
    );

    const { fetch: f503, calls: c503 } = stub(status(503));
    await assert.rejects(
      settle(
        create
          .get("/x")
          .withRetries({ attempts: 5, shouldRetry: async () => false })
          .withFetch(f503)
          .getResponse()
      )
    );
    assert.equal(c503.length, 1);

    const late = new AbortController();
    const { fetch: aborted, calls: abortCalls } = stub(() => {
      late.abort(); // aborted while in flight: fetch rejects, and shouldRetry cannot bring it back
      return new DOMException("aborted", "AbortError");
    });
    await assert.rejects(
      settle(
        create
          .get("/x")
          .withRetries({ attempts: 3, shouldRetry: () => true })
          .withAbortController(late)
          .withFetch(aborted)
          .getResponse()
      ),
      { code: "ABORTED" }
    );
    assert.equal(abortCalls.length, 1);
  });

  it("never retries a request whose body is a stream", async () => {
    const { fetch, calls } = stub(status(503));
    await assert.rejects(
      settle(
        create
          .post("/x")
          .withBody(new ReadableStream())
          .withRetries({ attempts: 3, shouldRetry: () => true })
          .withFetch(fetch)
          .getResponse()
      )
    );
    assert.equal(calls.length, 1);
  });

  it("uses exponential backoff with jitter by default, capped at maxDelay", async () => {
    const delays: number[] = [];
    const { fetch } = stub(status(503));
    await assert.rejects(
      settle(
        create
          .get("/x")
          .withRetries({ attempts: 4, maxDelay: 1000, onRetry: ({ delay }) => void delays.push(delay) })
          .withFetch(fetch)
          .getResponse()
      )
    );
    assert.equal(delays.length, 4);
    assert.ok(delays[0]! >= 300 && delays[0]! < 400, `first delay ${delays[0]}`);
    assert.ok(delays[1]! >= 600 && delays[1]! < 700, `second delay ${delays[1]}`);
    assert.equal(delays[2], 1000);
    assert.equal(delays[3], 1000);
  });

  it("uses a fixed delay or a delay function when given", async () => {
    const delays: number[] = [];
    const { fetch } = stub(status(503));
    const onRetry = ({ delay }: { delay: number }) => void delays.push(delay);
    await assert.rejects(settle(create.get("/x").withRetries({ attempts: 2, delay: 50, onRetry }).withFetch(fetch).getResponse()));
    await assert.rejects(
      settle(
        create
          .get("/x")
          .withRetries({ attempts: 2, delay: ({ attempt, error }) => attempt * 10 + (error.status ?? 0), onRetry })
          .withFetch(fetch)
          .getResponse()
      )
    );
    assert.deepEqual(delays, [50, 50, 513, 523]);
  });

  it("waits for the delay before retrying", async () => {
    const { fetch, calls } = stub((_call, i) => (i === 0 ? status(503) : json({})));
    const promise = create.get("/x").withRetries({ attempts: 1, delay: 1000 }).withFetch(fetch).getJson();
    await flush();
    assert.equal(calls.length, 1);
    mock.timers.tick(999);
    await flush();
    assert.equal(calls.length, 1);
    mock.timers.tick(1);
    await flush();
    assert.equal(calls.length, 2);
    assert.deepEqual(await promise, {});
  });

  it("honours Retry-After in seconds or as an HTTP date, unless an explicit delay is configured", async () => {
    const delays: number[] = [];
    const onRetry = ({ delay }: { delay: number }) => void delays.push(delay);
    const inTwoSeconds = new Date(Date.now() + 2000).toUTCString();
    const responses = [
      status(429, {}, { "retry-after": "3" }),
      status(503, {}, { "retry-after": inTwoSeconds }),
      status(503, {}, { "retry-after": new Date(0).toUTCString() }),
      status(503, {}, { "retry-after": "soon" }),
      status(503),
    ];
    const { fetch } = stub((_call, i) => responses[i]!);
    await assert.rejects(settle(create.get("/x").withRetries({ attempts: 4, maxDelay: 5000, onRetry }).withFetch(fetch).getResponse()));
    assert.equal(delays[0], 3000);
    assert.ok(delays[1]! > 1000 && delays[1]! <= 2000, `date delay ${delays[1]}`);
    assert.equal(delays[2], 0);
    assert.ok(delays[3]! >= 2400 && delays[3]! < 2500, `garbage header falls back to backoff: ${delays[3]}`);

    const { fetch: fixed } = stub(status(429, {}, { "retry-after": "3" }));
    delays.length = 0;
    await assert.rejects(settle(create.get("/x").withRetries({ attempts: 1, delay: 7, onRetry }).withFetch(fixed).getResponse()));
    assert.deepEqual(delays, [7]);
  });

  it("gives up (without waiting) when Retry-After is longer than maxDelay", async () => {
    const { fetch, calls } = stub(status(429, {}, { "retry-after": "31" }));
    const error = await settle(create.get("/x").withRetries(3).withFetch(fetch).getResponse()).then(unexpected, asError);
    assert.equal(error.status, 429);
    assert.equal(calls.length, 1);
    const { fetch: raised, calls: raisedCalls } = stub(status(429, {}, { "retry-after": "31" }));
    await assert.rejects(settle(create.get("/x").withRetries({ attempts: 1, maxDelay: 60_000 }).withFetch(raised).getResponse()));
    assert.equal(raisedCalls.length, 2);
  });

  it("awaits onRetry (which receives attempt, error and delay) and stops with an INTERCEPTOR error if it throws", async () => {
    const seen: string[] = [];
    const { fetch, calls } = stub((_call, i) => (i === 0 ? status(503) : json({})));
    await settle(
      create
        .get("/x")
        .withRetries({ attempts: 1, delay: 5 })
        .onRetry(async ({ attempt, error, delay }) => {
          await Promise.resolve();
          seen.push(`${attempt}:${error.status}:${delay}`);
        })
        .withFetch(fetch)
        .getResponse()
    );
    assert.deepEqual(seen, ["1:503:5"]);
    assert.equal(calls.length, 2);

    const { fetch: failing, calls: failingCalls } = stub(status(503));
    const error = await settle(
      create
        .get("/x")
        .withRetries({
          attempts: 3,
          onRetry: () => {
            throw new Error("log failed");
          },
        })
        .withFetch(failing)
        .getResponse()
    ).then(unexpected, asError);
    assert.equal(error.code, "INTERCEPTOR");
    assert.equal(error.message, "Retry callback failed: log failed");
    assert.equal(error.status, 503);
    assert.equal(failingCalls.length, 1);
  });

  it("wraps errors thrown by shouldRetry and delay functions the same way", async () => {
    const { fetch } = stub(status(503));
    const shouldRetryError = await settle(
      create
        .get("/x")
        .withRetries({
          attempts: 1,
          shouldRetry: () => {
            throw new Error("decide");
          },
        })
        .withFetch(fetch)
        .getResponse()
    ).then(unexpected, asError);
    assert.equal(shouldRetryError.message, "Retry callback failed: decide");
    const delayError = await settle(
      create
        .get("/x")
        .withRetries({
          attempts: 1,
          delay: () => {
            throw new Error("compute");
          },
        })
        .withFetch(fetch)
        .getResponse()
    ).then(unexpected, asError);
    assert.equal(delayError.message, "Retry callback failed: compute");
    assert.equal(delayError.cause instanceof Error && delayError.cause.message, "compute");
  });

  it("onRetry alone configures no retries; withRetries merges with the previous configuration", async () => {
    const { fetch, calls } = stub(status(503));
    let retried = 0;
    await assert.rejects(
      settle(
        create
          .get("/x")
          .onRetry(() => void retried++)
          .withFetch(fetch)
          .getResponse()
      )
    );
    assert.equal(calls.length, 1);
    assert.equal(retried, 0);

    const delays: number[] = [];
    await assert.rejects(
      settle(
        create
          .get("/x")
          .withRetries({ attempts: 1, delay: 3, statuses: [503] })
          .withRetries(2)
          .onRetry(({ delay }) => void delays.push(delay))
          .withFetch(fetch)
          .getResponse()
      )
    );
    assert.equal(calls.length, 4);
    assert.deepEqual(delays, [3, 3]);
  });

  it("stops waiting as soon as a signal aborts during the delay", async () => {
    const controller = new AbortController();
    const { fetch, calls } = stub((call, i) => (i === 0 ? status(503) : call.init.signal?.aborted ? new DOMException("aborted", "AbortError") : json({})));
    const promise = create.get("/x").withRetries({ attempts: 1, delay: 60_000 }).withAbortController(controller).withFetch(fetch).getResponse();
    await flush();
    assert.equal(calls.length, 1);
    controller.abort();
    await assert.rejects(promise, { code: "ABORTED" });
    assert.equal(calls.length, 1); // the retry is not even sent
  });

  it("runs error interceptors once, after the last attempt", async () => {
    const seen: number[] = [];
    const { fetch, calls } = stub(status(503));
    await assert.rejects(
      settle(
        create
          .get("/x")
          .withRetries({ attempts: 2, delay: 1 })
          .withErrorInterceptor(error => void seen.push(error.status!))
          .withFetch(fetch)
          .getResponse()
      )
    );
    assert.equal(calls.length, 3);
    assert.deepEqual(seen, [503]);
  });

  it("retries a timeout that fires while the body is read, and reads the next attempt's body", async () => {
    const stall = stalled();
    const { fetch, calls } = stub((call, i) => (i === 0 ? stall(call.url, call.init) : json({ ok: true })));
    const retried: string[] = [];
    const data = await settle(
      create
        .get("/x")
        .withTimeout(50)
        .withRetries({ attempts: 1, delay: 10 })
        .onRetry(({ error }) => void retried.push(`${error.code} ${error.status}`))
        .withFetch(fetch)
        .getJson()
    );
    assert.deepEqual(data, { ok: true });
    assert.equal(calls.length, 2);
    assert.deepEqual(retried, ["TIMEOUT 200"]);
  });

  it("does not retry parse, validation or GraphQL errors raised while reading the body, unless shouldRetry asks for it", async () => {
    const invalid = stub(() => new Response("{oops"));
    await assert.rejects(settle(create.get("/x").withRetries(3).withFetch(invalid.fetch).getJson()), { code: "PARSE" });
    const mismatch = stub(() => json({ id: "1" }));
    await assert.rejects(
      settle(
        create
          .get("/x")
          .withRetries(3)
          .withFetch(mismatch.fetch)
          .getJson(schema(() => "id must be a number"))
      ),
      { code: "VALIDATION" }
    );
    const selector = stub(() => json({ id: 1 }));
    const failed = await settle(
      create
        .get("/x")
        .withRetries(3)
        .withFetch(selector.fetch)
        .getData(async () => {
          throw new Error("no");
        })
    ).then(unexpected, asError);
    // An async selector that rejects is a PARSE error like one that throws, not an "unexpected" (retried) NETWORK error.
    assert.equal(failed.code, "PARSE");
    assert.equal(failed.message, "Selector failed: no");
    const graphqlErrors = () => stub(() => json({ data: null, errors: [{ message: "boom" }] }));
    const query = () => create.post("/graphql").withGraphQL("{ x }", {}, { throwOnError: true });
    const graphql = graphqlErrors();
    await assert.rejects(settle(query().withRetries(3).withFetch(graphql.fetch).getJson()), { code: "GRAPHQL" });
    assert.deepEqual([invalid.calls.length, mismatch.calls.length, selector.calls.length, graphql.calls.length], [1, 1, 1, 1]);

    const seen: string[] = [];
    const shouldRetry = ({ error }: RetryContext): boolean => (seen.push(`${error.code} ${error.status}`), error.code === "GRAPHQL");
    const asked = graphqlErrors();
    await assert.rejects(settle(query().withRetries({ attempts: 2, delay: 1, shouldRetry }).withFetch(asked.fetch).getJson()), { code: "GRAPHQL" });
    assert.equal(asked.calls.length, 3);
    assert.deepEqual(seen, ["GRAPHQL 200", "GRAPHQL 200"]);
  });

  it("leaves the body of getResponse() to the caller: a failure while reading it afterwards is not retried", async () => {
    const stall = stalled();
    const { fetch, calls } = stub((call, i) => (i === 0 ? stall(call.url, call.init) : json({ ok: true })));
    const response = await settle(create.get("/x").withTimeout(50).withRetries({ attempts: 2, delay: 1 }).withFetch(fetch).getResponse());
    await assert.rejects(settle(response.getJson()), { code: "TIMEOUT" });
    assert.equal(calls.length, 1);
  });
});
