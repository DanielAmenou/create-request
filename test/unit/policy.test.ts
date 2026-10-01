import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import create, { createApi } from "../../src/index.js";
import { asError, fetchFailed, flush, hanging, inBrowser, json, status, stub, unexpected } from "../utils/helpers.js";

async function settle<T>(promise: Promise<T>): Promise<T> {
  let done = false;
  const guarded = promise.then(
    value => ((done = true), value),
    (error: unknown) => ((done = true), Promise.reject(error))
  );
  guarded.catch(() => undefined);
  while (!done) {
    await flush();
    mock.timers.runAll();
  }
  return guarded;
}

describe("retry policy details", () => {
  beforeEach(() => mock.timers.enable({ apis: ["setTimeout"] }));
  afterEach(() => mock.timers.reset());

  it("retries exactly the default status list and nothing else", async () => {
    const retried: number[] = [];
    const skipped: number[] = [];
    for (const code of [400, 401, 403, 404, 408, 409, 410, 418, 422, 425, 429, 500, 501, 502, 503, 504, 505]) {
      const { fetch, calls } = stub(status(code));
      await assert.rejects(settle(create.get("/x").withRetries({ attempts: 1, delay: 1 }).withFetch(fetch).getResponse()), { status: code });
      (calls.length === 2 ? retried : skipped).push(code);
    }
    assert.deepEqual(retried, [408, 425, 429, 500, 502, 503, 504]);
    assert.deepEqual(skipped, [400, 401, 403, 404, 409, 410, 418, 422, 501, 505]);
  });

  it("retries every method by default, including POST", async () => {
    for (const method of ["get", "post", "put", "patch", "delete", "head", "options"] as const) {
      const { fetch, calls } = stub((_call, i) => (i === 0 ? fetchFailed() : json({})));
      await settle(create[method]("/x").withRetries({ attempts: 1, delay: 1 }).withFetch(fetch).getResponse());
      assert.equal(calls.length, 2, method);
    }
  });

  it("`attempts: 0`, `statuses: []` and `methods: []` all mean no retries", async () => {
    for (const config of [{ attempts: 0 }, { attempts: 3, statuses: [] }, { attempts: 3, methods: [] }]) {
      const { fetch, calls } = stub(status(503));
      await assert.rejects(settle(create.get("/x").withRetries(config).withFetch(fetch).getResponse()));
      assert.equal(calls.length, 1, JSON.stringify(config));
    }
    const { fetch, calls } = stub(fetchFailed());
    await assert.rejects(settle(create.get("/x").withRetries({ attempts: 3, statuses: [] }).withFetch(fetch).getResponse()));
    assert.equal(calls.length, 4, "an empty status list still retries network errors");
  });

  it("`delay: 0` retries on the next tick and `maxDelay` caps the default backoff exactly", async () => {
    const delays: number[] = [];
    const onRetry = ({ delay }: { delay: number }) => void delays.push(delay);
    const { fetch } = stub(status(503));
    await assert.rejects(settle(create.get("/x").withRetries({ attempts: 2, delay: 0, onRetry }).withFetch(fetch).getResponse()));
    await assert.rejects(settle(create.get("/x").withRetries({ attempts: 3, maxDelay: 250, onRetry }).withFetch(fetch).getResponse()));
    assert.deepEqual(delays, [0, 0, 250, 250, 250]);
  });

  it("api-level retries apply to every request and a request can override or disable them", async () => {
    const api = createApi().withRetries({ attempts: 2, delay: 1 });
    const { fetch, calls } = stub(status(503));
    await assert.rejects(settle(api.get("/a").withFetch(fetch).getResponse()));
    assert.equal(calls.length, 3);
    await assert.rejects(settle(api.get("/b").withRetries(0).withFetch(fetch).getResponse()));
    assert.equal(calls.length, 4);
    await assert.rejects(settle(api.get("/c").withRetries({ attempts: 4 }).withFetch(fetch).getResponse()));
    assert.equal(calls.length, 9, "attempts replaced, delay kept");
  });

  it("the delay function receives the failed attempt's error and can vary by status", async () => {
    const seen: [number, number | undefined][] = [];
    const { fetch } = stub((_call, i) => status(i === 0 ? 429 : 503));
    await assert.rejects(
      settle(
        create
          .get("/x")
          .withRetries({
            attempts: 2,
            delay: ({ attempt, error }) => {
              seen.push([attempt, error.status]);
              return error.status === 429 ? 5 : 1;
            },
          })
          .withFetch(fetch)
          .getResponse()
      )
    );
    assert.deepEqual(seen, [
      [1, 429],
      [2, 503],
    ]);
  });

  it("Retry-After as an HTTP date is honoured to the second", async () => {
    const delays: number[] = [];
    const when = new Date(Date.now() + 5000).toUTCString();
    const { fetch } = stub((_call, i) => (i === 0 ? status(503, {}, { "retry-after": when }) : json({})));
    await settle(
      create
        .get("/x")
        .withRetries({ attempts: 1, onRetry: ({ delay }) => void delays.push(delay) })
        .withFetch(fetch)
        .getResponse()
    );
    assert.equal(delays.length, 1);
    assert.ok(delays[0]! > 3900 && delays[0]! <= 5000, `delay ${delays[0]}`);
  });

  it("getResult() and getData() go through the same retry loop", async () => {
    const { fetch, calls } = stub((_call, i) => (i === 0 ? status(503) : json({ items: [1, 2] })));
    const result = await settle(create.get("/x").withRetries({ attempts: 1, delay: 1 }).withFetch(fetch).getResult<{ items: number[] }>());
    assert.deepEqual(result, { data: { items: [1, 2] }, error: null });
    const { fetch: f2 } = stub((_call, i) => (i === 0 ? fetchFailed() : json({ items: [3] })));
    assert.deepEqual(
      await settle(
        create
          .get<{ items: number[] }>("/x")
          .withRetries({ attempts: 1, delay: 1 })
          .withFetch(f2)
          .getData(d => d.items)
      ),
      [3]
    );
    assert.equal(calls.length, 2);
  });

  it("a timeout on the last allowed attempt is the error the caller sees", async () => {
    const { fetch, calls } = stub(call => hanging(call.url, call.init));
    const error = await settle(create.get("/x").withTimeout(10).withRetries({ attempts: 2, delay: 1 }).withFetch(fetch).getResponse()).then(unexpected, asError);
    assert.equal(error.code, "TIMEOUT");
    assert.equal(calls.length, 3);
  });
});

describe("CSRF policy details", () => {
  const page = { href: "https://app.example:8443/dashboard", origin: "https://app.example:8443" };

  it("origin means scheme + host + port: other ports and schemes are cross-origin", async () => {
    await inBrowser(
      page,
      async () => {
        const { fetch, calls } = stub();
        for (const url of ["/api", "https://app.example:8443/api", "https://app.example/api", "http://app.example:8443/api", "https://api.app.example:8443/x"]) {
          await create.get(url).withCsrf().withFetch(fetch).getResponse();
        }
        assert.deepEqual(
          calls.map(call => call.headers.has("x-xsrf-token")),
          [true, true, false, false, false]
        );
      },
      "XSRF-TOKEN=t"
    );
  });

  it("api-level withCsrf is inherited and a request can reconfigure it", async () => {
    await inBrowser(
      page,
      async () => {
        const { fetch, calls } = stub();
        const api = createApi().withBaseURL("https://app.example:8443").withCsrf().withFetch(fetch);
        await api.get("/a").getResponse();
        await api.get("/b").withCsrf({ token: "explicit" }).getResponse();
        await api.get("/c").withCsrf({ cookie: "missing" }).getResponse();
        assert.equal(calls[0]!.headers.get("x-xsrf-token"), "t");
        assert.equal(calls[1]!.headers.get("x-csrf-token"), "explicit");
        assert.equal(calls[1]!.headers.has("x-xsrf-token"), false);
        assert.equal(calls[2]!.headers.has("x-xsrf-token"), false);
      },
      "XSRF-TOKEN=t"
    );
  });

  it("a user header wins over the token whatever the casing, and a custom header is lower-cased", async () => {
    await inBrowser(
      page,
      async () => {
        const { fetch, calls } = stub();
        await create.get("/x").withHeader("x-xsrf-token", "mine").withCsrf().withFetch(fetch).getResponse();
        await create.get("/x").withCsrf({ header: "X-Custom-Token" }).withFetch(fetch).getResponse();
        assert.equal(calls[0]!.headers.get("x-xsrf-token"), "mine");
        assert.deepEqual(calls[1]!.init.headers, { "x-custom-token": "t" });
      },
      "XSRF-TOKEN=t"
    );
  });

  it("a token callback returning undefined sends nothing", async () => {
    const { fetch, calls } = stub();
    await create
      .get("/x")
      .withCsrf({ token: () => undefined })
      .withFetch(fetch)
      .getResponse();
    assert.deepEqual(calls[0]!.init.headers, {});
  });

  it("the cookie is read on every attempt, so a rotated token is picked up by a retry", async () => {
    const g = globalThis as { document?: { cookie: string } };
    await inBrowser(
      page,
      async () => {
        const { fetch, calls } = stub((_call, i) => {
          g.document!.cookie = "XSRF-TOKEN=second";
          return i === 0 ? status(503) : json({});
        });
        await create.get("/x").withCsrf().withRetries({ attempts: 1, delay: 1 }).withFetch(fetch).getResponse();
        assert.equal(calls[0]!.headers.get("x-xsrf-token"), "first");
        assert.equal(calls[1]!.headers.get("x-xsrf-token"), "second");
      },
      "XSRF-TOKEN=first"
    );
  });
});
