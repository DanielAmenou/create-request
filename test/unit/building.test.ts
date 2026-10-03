import assert from "node:assert/strict";
import { describe, it } from "node:test";
import create, { createApi } from "../../src/index.js";
import { asError, json, stub, unexpected } from "../utils/helpers.js";

describe("URLs", () => {
  it("keeps absolute URLs untouched, including credentials, ports and encoded characters", async () => {
    const { fetch, calls } = stub();
    const url = "https://user:pw@api.example:8443/v1/items%20list?x=%2F#frag";
    await create.get(url).withFetch(fetch).getResponse();
    assert.equal(calls[0]!.url, url);
  });

  it("puts new query parameters before the fragment of an absolute URL and encodes them", () => {
    const request = create.get("https://api.example/x?a=1#top").withQueryParams({ "b c": "d&e=f", ü: "ü" });
    assert.equal(request.url, "https://api.example/x?a=1&b+c=d%26e%3Df&%C3%BC=%C3%BC#top");
  });

  it("a '?' that only appears in the fragment (a hash route) is not taken for the start of the query string", () => {
    assert.equal(create.get("/x#section?tab=1").withQueryParam("a", 1).url, "/x?a=1#section?tab=1");
    assert.equal(create.get("https://e.com/app?q=1#/route?tab=2").withQueryParam("a", 1).url, "https://e.com/app?q=1&a=1#/route?tab=2");
  });

  it("an empty query leaves the URL exactly as given", () => {
    assert.equal(create.get("/x?").withQueryParams({}).url, "/x?");
    assert.equal(create.get("/x#").withQueryParams({ a: null }).url, "/x#");
  });

  it("an api base URL with a query string keeps it when a path is joined", () => {
    assert.equal(createApi().withBaseURL("https://e.com/v1?token=1").get("/users").url, "https://e.com/v1?token=1/users");
    assert.equal(createApi().withBaseURL("https://e.com/v1").get("/users?page=2").withQueryParam("size", 10).url, "https://e.com/v1/users?page=2&size=10");
  });

  it("the last withBaseURL wins and an empty base means paths are used as-is", () => {
    const api = createApi().withBaseURL("https://one.example").withBaseURL("https://two.example");
    assert.equal(api.get("/x").url, "https://two.example/x");
    assert.equal(api.withBaseURL("").get("/x").url, "/x");
  });
});

describe("headers", () => {
  it("api-level headers, request headers and interceptor headers layer in that order", async () => {
    const { fetch, calls } = stub();
    await createApi()
      .withHeaders({ A: "api", B: "api", C: "api" })
      .withFetch(fetch)
      .get("/x")
      .withHeader("b", "request")
      .withHeader("C", null)
      .withRequestInterceptor(config => {
        config.headers.a = "interceptor";
      })
      .getResponse();
    assert.deepEqual(calls[0]!.init.headers, { a: "interceptor", b: "request" });
  });

  it("withBearerToken and withBasicAuth replace each other (one Authorization header)", async () => {
    const { fetch, calls } = stub();
    await create.get("/x").withBasicAuth("u", "p").withBearerToken("t").withFetch(fetch).getResponse();
    await create
      .get("/x")
      .withBearerToken("t")
      .withAuthorization(null as unknown as string)
      .withFetch(fetch)
      .getResponse();
    assert.deepEqual(calls[0]!.init.headers, { authorization: "Bearer t" });
    assert.deepEqual(calls[1]!.init.headers, {});
  });

  it("withBasicAuth handles empty and colon-containing credentials", async () => {
    const { fetch, calls } = stub();
    await create.get("/x").withBasicAuth("", "").withFetch(fetch).getResponse();
    await create.get("/x").withBasicAuth("a:b", "c:d").withFetch(fetch).getResponse();
    assert.equal(calls[0]!.headers.get("authorization"), "Basic Og==");
    assert.equal(Buffer.from(calls[1]!.headers.get("authorization")!.slice(6), "base64").toString(), "a:b:c:d");
  });

  it("cookies accumulate across api and request, in order", async () => {
    const { fetch, calls } = stub();
    await createApi().withCookie("session", "s").withFetch(fetch).get("/x").withCookies({ theme: "dark", lang: "en" }).getResponse();
    assert.equal(calls[0]!.headers.get("cookie"), "session=s; theme=dark; lang=en");
  });

  it("a header value of 0 or an empty string is sent, not dropped", async () => {
    const { fetch, calls } = stub();
    await create.get("/x").withHeaders({ "x-zero": 0, "x-empty": "" }).withFetch(fetch).getResponse();
    assert.deepEqual(calls[0]!.init.headers, { "x-zero": "0", "x-empty": "" });
  });

  it("CR/LF smuggled in through any header helper fails with VALIDATION before fetch, and is not retried", async () => {
    const injected = "x\r\nX-Injected: 1";
    const { fetch, calls } = stub();
    const requests = [
      create.get("/x").withBearerToken(injected),
      create.get("/x").withAuthorization(injected),
      create.get("/x").withCookie("session", injected),
      create.get("/x").withCsrfToken(injected),
      create.get("/x").withCsrf({ token: () => injected }),
      create.post("/x").withContentType(injected).withBody("text"),
    ];
    for (const request of requests) {
      const error = await request.withRetries({ attempts: 2, delay: 1 }).withFetch(fetch).getResponse().then(unexpected, asError);
      assert.equal(error.code, "VALIDATION");
      assert.ok(error.message.startsWith("Invalid header: "), error.message);
    }
    assert.equal(calls.length, 0);
  });

  it("objects parsed from untrusted JSON cannot pollute Object.prototype through headers, query parameters or cookies", async () => {
    const { fetch, calls } = stub();
    const prototype = Object.prototype as Record<string, unknown>;
    try {
      await create
        .get("/x")
        .withHeaders(JSON.parse('{"__proto__": {"x-polluted": "1"}, "x-ok": "1"}'))
        .withQueryParams(JSON.parse('{"__proto__": {"polluted": true}, "q": "1"}'))
        .withCookies(JSON.parse('{"__proto__": "c"}'))
        .withFetch(fetch)
        .getResponse();
      assert.equal(prototype["x-polluted"], undefined);
      assert.equal(prototype.polluted, undefined);
    } finally {
      delete prototype["x-polluted"]; // keeps a regression from leaking into every later test
      delete prototype.polluted;
    }
    assert.deepEqual(calls[0]!.init.headers, { "x-ok": "1", cookie: "__proto__=c" });
    assert.equal(calls[0]!.url, "/x?__proto__=%5Bobject+Object%5D&q=1");
  });

  it("withCookie extends a Cookie header set with withHeader whatever its casing, and dropping the header lets a request replace inherited cookies", async () => {
    const { fetch, calls } = stub();
    await create.get("/x").withHeader("COOKIE", "a=1").withCookie("b", "2").withFetch(fetch).getResponse();
    await createApi().withCookie("session", "api").withFetch(fetch).get("/x").withHeader("Cookie", null).withCookie("session", "request").getResponse();
    assert.equal(calls[0]!.headers.get("cookie"), "a=1; b=2");
    assert.equal(calls[1]!.headers.get("cookie"), "session=request");
  });
});

describe("bodies", () => {
  it("nested objects, arrays of objects, dates and unicode survive JSON encoding", async () => {
    const { fetch, calls } = stub();
    const body = { at: new Date("2026-01-01T00:00:00.000Z"), items: [{ id: 1, tags: ["ü", "😀"] }], nested: { deep: { value: null } } };
    await create.post("/x").withBody(body).withFetch(fetch).getResponse();
    assert.deepEqual(JSON.parse(calls[0]!.init.body as string), JSON.parse(JSON.stringify(body)));
  });

  it("an empty object, an empty array and an empty string are valid bodies", async () => {
    const { fetch, calls } = stub();
    await create.post("/x").withBody({}).withFetch(fetch).getResponse();
    await create.post("/x").withBody([]).withFetch(fetch).getResponse();
    await create.post("/x").withBody("").withFetch(fetch).getResponse();
    assert.deepEqual(
      calls.map(c => c.init.body),
      ["{}", "[]", ""]
    );
    assert.equal(calls[2]!.headers.get("content-type"), "text/plain");
  });

  it("a Node Buffer is sent as raw bytes", async () => {
    const { fetch, calls } = stub();
    const buffer = Buffer.from("raw");
    await create.post("/x").withBody(buffer).withFetch(fetch).getResponse();
    assert.equal(calls[0]!.init.body, buffer);
    assert.equal(calls[0]!.headers.has("content-type"), false);
  });

  it("a typed Blob keeps its own type and an explicit Content-Type wins for JSON", async () => {
    const { fetch, calls } = stub();
    await create
      .post("/x")
      .withBody(new Blob(["<x/>"], { type: "application/xml" }))
      .withFetch(fetch)
      .getResponse();
    await create.post("/x").withContentType("application/merge-patch+json").withBody({ a: 1 }).withFetch(fetch).getResponse();
    assert.equal(calls[0]!.headers.has("content-type"), false);
    assert.equal((calls[0]!.init.body as Blob).type, "application/xml");
    assert.equal(calls[1]!.headers.get("content-type"), "application/merge-patch+json");
  });

  it("an explicit Content-Type is kept for binary, form-urlencoded and stream bodies — only FormData drops it", async () => {
    const { fetch, calls } = stub();
    for (const body of [new Uint8Array([1]), new ArrayBuffer(1), new Blob(["b"], { type: "text/plain" }), new URLSearchParams("a=1"), new ReadableStream()]) {
      await create.post("/x").withContentType("application/x-custom").withBody(body).withFetch(fetch).getResponse();
    }
    assert.deepEqual(
      calls.map(call => call.headers.get("content-type")),
      Array(5).fill("application/x-custom")
    );
  });

  it("withGraphQL accepts interface-typed variables and drops undefined ones", async () => {
    interface Vars {
      id: string;
      first?: number;
    }
    const vars: Vars = { id: "1", first: undefined };
    const { fetch, calls } = stub();
    await create.post("/graphql").withGraphQL("query Q($id: ID!) { node(id: $id) { id } }", vars).withFetch(fetch).getResponse();
    assert.equal(calls[0]!.init.body, '{"query":"query Q($id: ID!) { node(id: $id) { id } }","variables":{"id":"1"}}');
  });

  it("api-level defaults never carry a body, so requests from one api do not share bodies", async () => {
    const { fetch, calls } = stub();
    const api = createApi().withFetch(fetch);
    await api.post("/a").withBody({ a: 1 }).getResponse();
    await api.post("/b").getResponse();
    assert.equal(calls[0]!.init.body, '{"a":1}');
    assert.equal(calls[1]!.init.body, undefined);
  });
});

describe("execution shortcuts", () => {
  it("every shortcut rejects with the same RequestError for a failed request", async () => {
    const make = () => create.get("/x").withFetch(stub(new Response("nope", { status: 500 })).fetch);
    const errors = await Promise.all([
      make().getJson().then(unexpected, asError),
      make().getText().then(unexpected, asError),
      make().getBlob().then(unexpected, asError),
      make().getArrayBuffer().then(unexpected, asError),
      make().getFormData().then(unexpected, asError),
      make().getBody().then(unexpected, asError),
      make()
        .getData(() => 1)
        .then(unexpected, asError),
    ]);
    for (const error of errors) {
      assert.equal(error.code, "HTTP");
      assert.equal(error.status, 500);
      assert.equal(error.body, "nope");
    }
    assert.equal((await make().getResult()).error?.body, "nope");
  });

  it("a request can be executed more than once and each execution is independent", async () => {
    let n = 0;
    const request = create.get("/x").withFetch(async () => json({ n: ++n }));
    assert.deepEqual(await request.getJson(), { n: 1 });
    assert.deepEqual(await request.getJson(), { n: 2 });
    const [a, b] = await Promise.all([request.getJson<{ n: number }>(), request.getJson<{ n: number }>()]);
    assert.deepEqual([a.n, b.n].sort(), [3, 4]);
  });

  it("the url getter reflects later query changes but not interceptor rewrites", async () => {
    const request = create.get("/x").withQueryParam("a", 1);
    assert.equal(request.url, "/x?a=1");
    request.withQueryParam("b", 2);
    assert.equal(request.url, "/x?a=1&b=2");
    await request
      .withRequestInterceptor(config => {
        config.url = "/rewritten";
      })
      .withFetch(stub().fetch)
      .getResponse();
    assert.equal(request.url, "/x?a=1&b=2");
  });
});
