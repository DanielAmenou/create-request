import assert from "node:assert/strict";
import { describe, it } from "node:test";
import create, { RequestError, ResponseWrapper, type RequestConfig } from "../../src/index.js";
import { asError, fetchFailed, inBrowser, json, status, stub, text, unexpected } from "../utils/helpers.js";

describe("successful responses", () => {
  it("getResponse resolves with a ResponseWrapper for 2xx responses", async () => {
    const response = await create
      .get("/x")
      .withFetch(stub(json({ ok: 1 }, { status: 201, statusText: "Created" })).fetch)
      .getResponse();
    assert.ok(response instanceof ResponseWrapper);
    assert.equal(response.status, 201);
    assert.equal(response.statusText, "Created");
    assert.equal(response.ok, true);
    assert.equal(response.url, "/x");
    assert.equal(response.method, "GET");
    assert.equal(response.headers.get("content-type"), "application/json");
    assert.deepEqual(await response.getJson(), { ok: 1 });
  });

  it("the execution shortcuts read the body in the requested format", async () => {
    const make = () => create.get("/x").withFetch(stub(json({ a: [1] })).fetch);
    assert.deepEqual(await make().getJson(), { a: [1] });
    assert.equal(await make().getText(), '{"a":[1]}');
    assert.equal((await make().getBlob()).type, "application/json");
    assert.equal((await make().getArrayBuffer()).byteLength, 9);
    assert.deepEqual(await make().getData<{ a: number[] }, number[]>(d => d.a), [1]);
    const stream = await make().getBody();
    assert.ok(stream instanceof ReadableStream);
    const form = await create
      .get("/x")
      .withFetch(stub(new Response(new URLSearchParams({ a: "1" }))).fetch)
      .getFormData();
    assert.equal(form.get("a"), "1");
  });

  it("opaque responses (no-cors, manual redirects) are successes even though their status is 0", async () => {
    for (const type of ["opaque", "opaqueredirect"]) {
      const raw = { status: 0, ok: false, type, headers: new Headers(), bodyUsed: false, body: null } as unknown as Response;
      const response = await create.get("/x").withFetch(stub(raw).fetch).getResponse();
      assert.equal(response.raw, raw);
      assert.equal(response.status, 0);
    }
  });
});

describe("HTTP errors", () => {
  it("rejects non-2xx responses with an HTTP error carrying status, response, body and data", async () => {
    const error = await create
      .get("https://e.com/x")
      .withQueryParam("q", 1)
      .withFetch(stub(status(404, { reason: "gone" })).fetch)
      .getJson()
      .catch((e: unknown) => e);
    assert.ok(error instanceof RequestError);
    assert.equal(error.code, "HTTP");
    assert.equal(error.message, "HTTP 404");
    assert.equal(error.status, 404);
    assert.equal(error.url, "https://e.com/x?q=1");
    assert.equal(error.method, "GET");
    assert.ok(error.response instanceof Response);
    assert.equal(error.response.bodyUsed, true);
    assert.equal(error.body, '{"reason":"gone"}');
    assert.deepEqual(error.data, { reason: "gone" });
    assert.equal(error.isTimeout, false);
    assert.equal(error.isAborted, false);
  });

  it("includes the status text in the message when there is one", async () => {
    await assert.rejects(
      create
        .get("/x")
        .withFetch(stub(new Response(null, { status: 500, statusText: "Internal Server Error" })).fetch)
        .getResponse(),
      { message: "HTTP 500 Internal Server Error" }
    );
  });

  it("status 0 without an opaque type is an HTTP error", async () => {
    const raw = { status: 0, ok: false, type: "error", statusText: "", headers: new Headers(), bodyUsed: true } as unknown as Response;
    await assert.rejects(create.get("/x").withFetch(stub(raw).fetch).getResponse(), { code: "HTTP", status: 0, message: "HTTP 0" });
  });

  it("does not buffer error bodies larger than 1 MB and tolerates unreadable ones", async () => {
    const big = new Response("x", { status: 500, headers: { "content-length": String(1e6 + 1) } });
    const error = await create.get("/x").withFetch(stub(big).fetch).getResponse().then(unexpected, asError);
    assert.equal(error.body, undefined);
    assert.equal(error.data, undefined);

    const used = new Response("used", { status: 500 });
    await used.text();
    const error2 = await create.get("/x").withFetch(stub(used).fetch).getResponse().then(unexpected, asError);
    assert.equal(error2.code, "HTTP");
    assert.equal(error2.body, undefined);
  });

  it("getResult resolves with the error instead of throwing", async () => {
    const failure = await create
      .get("/x")
      .withFetch(stub(status(503)).fetch)
      .getResult<{ n: number }>();
    assert.equal(failure.data, null);
    assert.equal(failure.error?.code, "HTTP");
    const success = await create
      .get("/x")
      .withFetch(stub(json({ n: 1 })).fetch)
      .getResult<{ n: number }>();
    assert.deepEqual(success, { data: { n: 1 }, error: null });
  });
});

describe("network errors", () => {
  it("wraps fetch rejections as NETWORK errors with the cause and its details", async () => {
    const cases: [unknown, string][] = [
      [fetchFailed(Object.assign(new Error("getaddrinfo ENOTFOUND api.example"), { code: "ENOTFOUND" })), "Network error: fetch failed (getaddrinfo ENOTFOUND api.example)"],
      [fetchFailed(Object.assign(new Error(""), { code: "ECONNREFUSED" })), "Network error: fetch failed (ECONNREFUSED)"],
      [fetchFailed(Object.assign(new Error(""), {})), "Network error: fetch failed"],
      [fetchFailed(), "Network error: fetch failed"],
      [new TypeError("Failed to fetch"), "Network error: Failed to fetch"],
      ["a string", "Network error: a string"],
      [null, "Network error: null"],
    ];
    for (const [thrown, message] of cases) {
      const error = await create
        .get("/x")
        .withFetch(stub(async () => Promise.reject(thrown)).fetch)
        .getResponse()
        .then(unexpected, asError);
      assert.ok(error instanceof RequestError);
      assert.equal(error.code, "NETWORK");
      assert.equal(error.message, message);
      assert.equal(error.cause, thrown);
      assert.equal(error.status, undefined);
    }
  });
});

describe("URL validation", () => {
  it("rejects empty and malformed absolute URLs with a VALIDATION error before calling fetch", async () => {
    for (const url of ["", "   ", "http://", "https://exa mple.com/x", "http://["]) {
      const { fetch, calls } = stub();
      await assert.rejects(create.get(url).withFetch(fetch).getResponse(), { code: "VALIDATION", message: `Invalid URL: "${url}"` });
      assert.equal(calls.length, 0);
    }
  });

  it("accepts relative URLs, scheme-relative URLs and custom schemes", async () => {
    for (const url of ["/x", "x?a=1", "//host/x", "custom://x"]) {
      const { fetch, calls } = stub();
      await create.get(url).withFetch(fetch).getResponse();
      assert.equal(calls[0]!.url, url);
    }
  });

  it("validates the URL an interceptor produced", async () => {
    await assert.rejects(
      create
        .get("/x")
        .withRequestInterceptor(config => {
          config.url = "";
        })
        .withFetch(stub().fetch)
        .getResponse(),
      { code: "VALIDATION" }
    );
  });
});

describe("request interceptors", () => {
  it("receive the final config with lower-case header keys, the serialised body and no library options", async () => {
    let seen: RequestConfig | undefined;
    const { fetch, calls } = stub();
    await create
      .post("https://e.com/x")
      .withQueryParam("q", 1)
      .withHeader("X-A", "1")
      .withBody({ a: 1 })
      .withTimeout(1000)
      .withRetries(2)
      .withMode("cors")
      .withRequestInterceptor(config => {
        seen = { ...config, headers: { ...config.headers } };
      })
      .withFetch(fetch)
      .getResponse();
    assert.deepEqual(seen, {
      url: "https://e.com/x?q=1",
      method: "POST",
      headers: { "x-a": "1", "content-type": "application/json" },
      body: '{"a":1}',
      mode: "cors",
      signal: undefined,
    });
    assert.equal(calls[0]!.url, "https://e.com/x?q=1");
  });

  it("in-place mutations are kept when the interceptor returns nothing, and do not leak into the request", async () => {
    const { fetch, calls } = stub();
    const request = create
      .get("/x")
      .withHeader("a", "1")
      .withRequestInterceptor(config => {
        config.headers.b = "2";
        config.url = "/y";
      })
      .withFetch(fetch);
    await request.getResponse();
    await request.getResponse();
    assert.deepEqual(calls[0]!.init.headers, { a: "1", b: "2" });
    assert.deepEqual(calls[1]!.init.headers, { a: "1", b: "2" });
    assert.equal(calls[1]!.url, "/y");
    assert.equal(request.url, "/x");
  });

  it("a returned config replaces the current one and is passed to the next interceptor", async () => {
    const { fetch, calls } = stub();
    const order: string[] = [];
    await create
      .get("/x")
      .withRequestInterceptor(config => {
        order.push(`1:${config.url}`);
        return { ...config, url: "/one", headers: { ...config.headers, one: "1" } };
      })
      .withRequestInterceptor(config => {
        order.push(`2:${config.url}`);
        config.headers.two = "2";
      })
      .withFetch(fetch)
      .getResponse();
    assert.deepEqual(order, ["1:/x", "2:/one"]);
    assert.equal(calls[0]!.url, "/one");
    assert.deepEqual(calls[0]!.init.headers, { one: "1", two: "2" });
  });

  it("a returned Response short-circuits fetch but still goes through the status check and response interceptors", async () => {
    const { fetch, calls } = stub();
    let intercepted: ResponseWrapper | undefined;
    const data = await create
      .get("/x")
      .withRequestInterceptor(() => json({ cached: true }))
      .withRequestInterceptor(() => {
        throw new Error("never runs");
      })
      .withResponseInterceptor(response => {
        intercepted = response;
      })
      .withFetch(fetch)
      .getJson();
    assert.deepEqual(data, { cached: true });
    assert.equal(calls.length, 0);
    assert.equal(intercepted?.url, "/x");

    await assert.rejects(
      create
        .get("/x")
        .withRequestInterceptor(() => status(500))
        .withFetch(fetch)
        .getResponse(),
      { code: "HTTP", status: 500 }
    );
  });

  it("an interceptor that throws produces an INTERCEPTOR error with the cause", async () => {
    const boom = new Error("boom");
    const error = await create
      .get("/x")
      .withRequestInterceptor(async () => {
        throw boom;
      })
      .withFetch(stub().fetch)
      .getResponse()
      .then(unexpected, asError);
    assert.equal(error.code, "INTERCEPTOR");
    assert.equal(error.message, "Request interceptor failed: boom");
    assert.equal(error.cause, boom);
    assert.equal(error.url, "/x");
  });
});

describe("response interceptors", () => {
  it("run in order after a successful response; nothing keeps it, a wrapper replaces it", async () => {
    const order: number[] = [];
    const replacement = new ResponseWrapper(json({ replaced: true }), "/r", "GET");
    const data = await create
      .get("/x")
      .withResponseInterceptor(response => {
        order.push(response.status);
      })
      .withResponseInterceptor(() => replacement)
      .withResponseInterceptor(response => {
        order.push(response === replacement ? -1 : 0);
      })
      .withFetch(stub(json({})).fetch)
      .getJson();
    assert.deepEqual(data, { replaced: true });
    assert.deepEqual(order, [200, -1]);
  });

  it("an interceptor that throws produces an INTERCEPTOR error that keeps the response context", async () => {
    const error = await create
      .get("/x")
      .withResponseInterceptor(() => {
        throw new Error("nope");
      })
      .withFetch(stub(json({}, { status: 202 })).fetch)
      .getResponse()
      .then(unexpected, asError);
    assert.equal(error.code, "INTERCEPTOR");
    assert.equal(error.message, "Response interceptor failed: nope");
    assert.equal(error.status, 202);
    assert.ok(error.response instanceof Response);
    assert.equal((error.cause as Error).message, "nope");
  });
});

describe("error interceptors", () => {
  it("run once after the request failed, in order; nothing keeps the error, a RequestError replaces it", async () => {
    const seen: string[] = [];
    const error = await create
      .get("/x")
      .withErrorInterceptor(e => {
        seen.push(e.message);
      })
      .withErrorInterceptor(e => new RequestError("replaced", { code: "NETWORK", url: e.url, method: e.method }))
      .withErrorInterceptor(e => {
        seen.push(e.message);
      })
      .withFetch(stub(status(500)).fetch)
      .getResponse()
      .then(unexpected, asError);
    assert.deepEqual(seen, ["HTTP 500", "replaced"]);
    assert.equal(error.message, "replaced");
    assert.equal(error.code, "NETWORK");
  });

  it("recover by returning a ResponseWrapper, skipping the remaining interceptors", async () => {
    let calls = 0;
    const data = await create
      .get("/x")
      .withErrorInterceptor(() => new ResponseWrapper(json({ fallback: true })))
      .withErrorInterceptor(() => {
        calls++;
      })
      .withFetch(stub(status(404)).fetch)
      .getJson();
    assert.deepEqual(data, { fallback: true });
    assert.equal(calls, 0);
  });

  it("a thrown RequestError becomes the error; anything else is wrapped with the previous context", async () => {
    const custom = new RequestError("custom", { code: "VALIDATION", url: "/c", method: "PUT" });
    const error1 = await create
      .get("/x")
      .withErrorInterceptor(() => {
        throw custom;
      })
      .withFetch(stub(status(500)).fetch)
      .getResponse()
      .then(unexpected, asError);
    assert.equal(error1, custom);

    const error2 = await create
      .get("/x")
      .withErrorInterceptor(() => {
        throw new Error("bad");
      })
      .withFetch(stub(status(500, { d: 1 })).fetch)
      .getResponse()
      .then(unexpected, asError);
    assert.equal(error2.code, "INTERCEPTOR");
    assert.equal(error2.message, "Error interceptor failed: bad");
    assert.equal(error2.status, 500);
    assert.deepEqual(error2.data, { d: 1 });
    assert.equal((error2.cause as Error).message, "bad");
  });
});

describe("withCsrf", () => {
  const page = { href: "https://app.example/page", origin: "https://app.example" };

  it("does nothing unless enabled", async () => {
    await inBrowser(
      page,
      async () => {
        const { fetch, calls } = stub();
        await create.get("/x").withFetch(fetch).getResponse();
        assert.equal(calls[0]!.headers.has("x-xsrf-token"), false);
      },
      "XSRF-TOKEN=abc"
    );
  });

  it("copies the XSRF-TOKEN cookie into X-XSRF-TOKEN for same-origin URLs only", async () => {
    await inBrowser(
      page,
      async () => {
        const { fetch, calls } = stub();
        await create.get("/x").withCsrf().withFetch(fetch).getResponse();
        await create.get("https://app.example/y").withCsrf().withFetch(fetch).getResponse();
        await create.get("https://third.party/y").withCsrf().withFetch(fetch).getResponse();
        await create.get("https://third.party/y").withCsrf({ crossOrigin: true }).withFetch(fetch).getResponse();
        assert.equal(calls[0]!.headers.get("x-xsrf-token"), "abc");
        assert.equal(calls[1]!.headers.get("x-xsrf-token"), "abc");
        assert.equal(calls[2]!.headers.has("x-xsrf-token"), false);
        assert.equal(calls[3]!.headers.get("x-xsrf-token"), "abc");
      },
      "other=1; XSRF-TOKEN=abc; last=2"
    );
  });

  it("supports custom cookie and header names, decoded cookie values and the first '=' only", async () => {
    await inBrowser(
      page,
      async () => {
        const { fetch, calls } = stub();
        await create.get("/x").withCsrf({ cookie: "csrftoken", header: "X-CSRFToken" }).withFetch(fetch).getResponse();
        await create.get("/x").withCsrf({ cookie: "raw" }).withFetch(fetch).getResponse();
        await create.get("/x").withCsrf({ cookie: "missing" }).withFetch(fetch).getResponse();
        assert.equal(calls[0]!.headers.get("x-csrftoken"), "a=b c");
        assert.equal(calls[1]!.headers.get("x-xsrf-token"), "%E0%A4%A");
        assert.equal(calls[2]!.headers.has("x-xsrf-token"), false);
      },
      "csrftoken=a%3Db%20c; raw=%E0%A4%A; noequals"
    );
  });

  it("uses a static or lazily computed token in X-CSRF-Token (or a custom header) and never overrides a user header", async () => {
    await inBrowser(page, async () => {
      const { fetch, calls } = stub();
      let n = 0;
      await create.get("/x").withCsrf({ token: "static" }).withFetch(fetch).getResponse();
      await create
        .get("/x")
        .withCsrf({ token: () => `dyn-${++n}`, header: "X-Token" })
        .withFetch(fetch)
        .getResponse();
      await create
        .get("/x")
        .withCsrf({ token: () => null })
        .withFetch(fetch)
        .getResponse();
      await create.get("/x").withHeader("X-CSRF-Token", "mine").withCsrf({ token: "static" }).withFetch(fetch).getResponse();
      assert.equal(calls[0]!.headers.get("x-csrf-token"), "static");
      assert.equal(calls[1]!.headers.get("x-token"), "dyn-1");
      assert.equal(calls[2]!.headers.has("x-csrf-token"), false);
      assert.equal(calls[3]!.headers.get("x-csrf-token"), "mine");
    });
  });

  it("treats every URL as same-origin outside a browser, where only explicit tokens are available", async () => {
    const { fetch, calls } = stub();
    await create.get("https://third.party/y").withCsrf({ token: "t" }).withFetch(fetch).getResponse();
    await create.get("https://third.party/y").withCsrf().withFetch(fetch).getResponse();
    assert.equal(calls[0]!.headers.get("x-csrf-token"), "t");
    assert.equal(calls[1]!.headers.has("x-xsrf-token"), false);
  });

  it("treats an unresolvable page origin as cross-origin, and wraps a throwing token callback", async () => {
    await inBrowser({ href: "about:blank", origin: "null" }, async () => {
      const { fetch, calls } = stub();
      await create.get("/x").withCsrf({ token: "t" }).withFetch(fetch).getResponse();
      assert.equal(calls[0]!.headers.has("x-csrf-token"), false);
    });
    const error = await create
      .get("/x")
      .withCsrf({
        token: () => {
          throw new Error("no token");
        },
      })
      .withFetch(stub().fetch)
      .getResponse()
      .then(unexpected, asError);
    assert.equal(error.code, "INTERCEPTOR");
    assert.equal(error.message, "CSRF token callback failed: no token");
  });

  it("is evaluated against the final URL, after interceptors", async () => {
    await inBrowser(
      page,
      async () => {
        const { fetch, calls } = stub();
        await create
          .get("/x")
          .withCsrf()
          .withRequestInterceptor(config => {
            config.url = "https://third.party" + config.url;
          })
          .withFetch(fetch)
          .getResponse();
        assert.equal(calls[0]!.headers.has("x-xsrf-token"), false);
      },
      "XSRF-TOKEN=abc"
    );
  });
});

describe("getResponse never rejects with anything but a RequestError", () => {
  it("wraps unexpected throws from fetch stubs returning garbage", async () => {
    const error = await create
      .get("/x")
      .withFetch(stub(text("ok", { status: 200 })).fetch)
      .withResponseInterceptor(() => {
        throw "string thrown";
      })
      .getResponse()
      .then(unexpected, asError);
    assert.ok(error instanceof RequestError);
    assert.equal(error.message, "Response interceptor failed: string thrown");
  });
});
