import assert from "node:assert/strict";
import { describe, it } from "node:test";
import create, { HttpRequest, createApi, type ApiBuilder } from "../../src/index.js";
import { json, status, stub } from "../utils/helpers.js";

describe("createApi", () => {
  it("create.api() and createApi() build an empty api whose requests carry the method", () => {
    assert.equal(create.api, createApi);
    const api = createApi();
    const methods = ["get", "head", "options", "post", "put", "patch", "delete", "del"] as const;
    for (const method of methods) {
      const request = api[method]("/p");
      assert.ok(request instanceof HttpRequest);
      assert.equal(request.method, method === "del" ? "DELETE" : method.toUpperCase());
      assert.equal(request.url, "/p");
    }
    assert.equal(api.get().url, "");
  });

  it("joins the base URL and the path, keeps absolute URLs, and normalises slashes", () => {
    const cases: [string, string | undefined, string][] = [
      ["https://e.com/v1", "/users", "https://e.com/v1/users"],
      ["https://e.com/v1/", "users", "https://e.com/v1/users"],
      ["https://e.com/v1//", "./users", "https://e.com/v1/users"],
      ["https://e.com/v1", "//cdn.e.com/x", "//cdn.e.com/x"],
      ["https://e.com/v1", "https://other.com/x", "https://other.com/x"],
      ["https://e.com/v1", "mailto:a@b.c", "https://e.com/v1/mailto:a@b.c"],
      ["https://e.com/v1", undefined, "https://e.com/v1"],
      ["https://e.com/v1", "", "https://e.com/v1"],
      ["/api", "users?x=1", "/api/users?x=1"],
      ["", "/users", "/users"],
    ];
    for (const [base, path, expected] of cases) {
      assert.equal(createApi().withBaseURL(base).get(path).url, expected, `${base} + ${path}`);
    }
  });

  it("an absolute path bypasses the base URL but keeps every default — auth and query included, as the README warns", async () => {
    const { fetch, calls } = stub();
    const api = createApi().withBaseURL("https://api.example").withBearerToken("secret").withQueryParam("key", "k").withFetch(fetch);
    await api.get("https://elsewhere.example/x").getResponse();
    await api.get("//cdn.example/y").getResponse();
    assert.deepEqual(
      calls.map(call => [call.url, call.headers.get("authorization")]),
      [
        ["https://elsewhere.example/x?key=k", "Bearer secret"],
        ["//cdn.example/y?key=k", "Bearer secret"],
      ]
    );
  });

  it("applies every default to the requests it creates, in order, and requests can override them", async () => {
    const { fetch, calls } = stub();
    const api = createApi()
      .withBaseURL("https://e.com")
      .withHeader("X-A", "api")
      .withBearerToken("t")
      .withQueryParam("page", 1)
      .withTimeout(1000)
      .withRetries({ attempts: 2, statuses: [503] })
      .withMode("cors")
      .withCredentials("include")
      .withFetch(fetch);
    await api.get("/a").getResponse();
    await api.post("/b").withHeader("X-A", "req").withHeaders({ authorization: null }).withQueryParam("page", 2).withMode("same-origin").withBody({ n: 1 }).getResponse();
    assert.equal(calls[0]!.url, "https://e.com/a?page=1");
    assert.deepEqual(calls[0]!.init.headers, { "x-a": "api", authorization: "Bearer t" });
    assert.equal(calls[0]!.init.mode, "cors");
    assert.equal(calls[0]!.init.credentials, "include");
    assert.ok(calls[0]!.init.signal);
    assert.equal(calls[1]!.url, "https://e.com/b?page=2");
    assert.deepEqual(calls[1]!.init.headers, { "x-a": "req", "content-type": "application/json" });
    assert.equal(calls[1]!.init.mode, "same-origin");
  });

  it("is immutable: every with* returns a new api and leaves the original untouched", async () => {
    const { fetch, calls } = stub();
    const base = createApi().withFetch(fetch).withHeader("X-Role", "user");
    const admin = base.withHeader("X-Role", "admin");
    const rebased = admin.withBaseURL("https://admin.e.com");
    assert.notEqual(base, admin);
    assert.notEqual(admin, rebased);
    await base.get("/x").getResponse();
    await admin.get("/x").getResponse();
    await rebased.get("/x").getResponse();
    assert.equal(calls[0]!.headers.get("x-role"), "user");
    assert.equal(calls[0]!.url, "/x");
    assert.equal(calls[1]!.headers.get("x-role"), "admin");
    assert.equal(calls[1]!.url, "/x");
    assert.equal(calls[2]!.headers.get("x-role"), "admin");
    assert.equal(calls[2]!.url, "https://admin.e.com/x");
  });

  it("forwards every chainable request method except body, signal and clone; unknown names are not functions", () => {
    const api = createApi() as ApiBuilder & Record<string, unknown>;
    const requestKeys = Object.getOwnPropertyNames(HttpRequest.prototype).filter(key => /^(with|onRetry)/.test(key));
    for (const key of requestKeys) {
      const excluded = ["withBody", "withGraphQL", "withSignal", "withAbortController"].includes(key);
      assert.equal(typeof api[key], excluded ? "undefined" : "function", key);
    }
    assert.equal(typeof api.clone, "undefined");
    assert.equal(typeof api.withTypo, "undefined");
    assert.throws(() => (api.withTypo as () => void)(), TypeError);
  });

  it("api-level interceptors run before request-level ones, in registration order; errors run once", async () => {
    const order: string[] = [];
    const api = createApi()
      .withRequestInterceptor(() => void order.push("api-req-1"))
      .withRequestInterceptor(() => void order.push("api-req-2"))
      .withResponseInterceptor(() => void order.push("api-res"))
      .withErrorInterceptor(() => void order.push("api-err"));
    await api
      .get("/x")
      .withRequestInterceptor(() => void order.push("req-req"))
      .withResponseInterceptor(() => void order.push("req-res"))
      .withFetch(stub(json({})).fetch)
      .getResponse();
    assert.deepEqual(order, ["api-req-1", "api-req-2", "req-req", "api-res", "req-res"]);
    order.length = 0;
    await assert.rejects(
      api
        .get("/x")
        .withErrorInterceptor(() => void order.push("req-err"))
        .withFetch(stub(status(500)).fetch)
        .getResponse()
    );
    assert.deepEqual(order, ["api-req-1", "api-req-2", "api-err", "req-err"]);
  });

  it("requests created from an api do not share state with each other", async () => {
    const { fetch, calls } = stub();
    const api = createApi().withFetch(fetch).withHeader("a", "1").withQueryParam("q", 1);
    const first = api.get("/x").withHeader("b", "2").withQueryParam("q", 2);
    const second = api.get("/x");
    await first.getResponse();
    await second.getResponse();
    assert.deepEqual(calls[0]!.init.headers, { a: "1", b: "2" });
    assert.equal(calls[0]!.url, "/x?q=2");
    assert.deepEqual(calls[1]!.init.headers, { a: "1" });
    assert.equal(calls[1]!.url, "/x?q=1");
  });
});
