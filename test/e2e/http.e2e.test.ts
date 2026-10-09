import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import create, { RequestError, ResponseWrapper, createApi } from "../../src/index.js";
import { asError, unexpected } from "../utils/helpers.js";
import { TestServer, deterministicBytes } from "../utils/server.js";

interface Echo {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: string;
}

describe("e2e: methods, bodies, options and interceptors over real HTTP", { timeout: 30_000 }, () => {
  let server: TestServer;
  before(async () => {
    server = await TestServer.start();
  });
  after(async () => {
    await server.close();
  });
  beforeEach(() => server.reset());

  it("performs every method and parses JSON", async () => {
    assert.deepEqual(await create.get(server.url("/json")).getJson(), { message: "hello", source: "e2e" });
    for (const method of ["post", "put", "patch", "delete", "del", "query"] as const) {
      const echo = await create[method](server.url("/echo")).withBody({ via: method }).getJson<Echo>();
      assert.equal(echo.method, method === "del" ? "DELETE" : method.toUpperCase());
      assert.deepEqual(JSON.parse(echo.body), { via: method });
      assert.equal(echo.headers["content-type"], "application/json");
    }
    const head = await create.head(server.url("/json")).getResponse();
    assert.equal(head.status, 200);
    assert.equal(await head.getText(), "");
    assert.equal(server.lastRequest.method, "HEAD");
    assert.equal((await create.options(server.url("/echo")).getResponse()).status, 200);
  });

  it("sends string, form, multipart, blob, binary and streaming bodies byte-for-byte", async () => {
    await create.post(server.url("/echo")).withBody("raw string body").getJson();
    assert.equal(server.lastRequest.headers["content-type"], "text/plain");
    assert.equal(server.lastRequest.text, "raw string body");

    await create.post(server.url("/echo")).withContentType("application/xml").withBody("<root/>").getJson();
    assert.equal(server.lastRequest.headers["content-type"], "application/xml");

    await create
      .post(server.url("/echo"))
      .withBody(new URLSearchParams({ user: "ada lovelace" }))
      .getJson();
    assert.ok(String(server.lastRequest.headers["content-type"]).startsWith("application/x-www-form-urlencoded"));
    assert.equal(new URLSearchParams(server.lastRequest.text).get("user"), "ada lovelace");

    const form = new FormData();
    form.append("field", "value-1");
    form.append("file", new Blob(["file-contents"], { type: "text/plain" }), "notes.txt");
    await create.post(server.url("/echo")).withBody(form).getJson();
    const contentType = server.lastRequest.headers["content-type"] as string;
    assert.ok(contentType.startsWith("multipart/form-data; boundary="));
    assert.ok(server.lastRequest.text.includes('name="file"; filename="notes.txt"'));
    assert.ok(server.lastRequest.text.includes("file-contents"));

    await create
      .post(server.url("/echo"))
      .withBody(new Blob(['{"from":"blob"}'], { type: "application/json" }))
      .getJson();
    assert.equal(server.lastRequest.headers["content-type"], "application/json");
    assert.equal(server.lastRequest.text, '{"from":"blob"}');

    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255]);
    await create.post(server.url("/echo")).withBody(bytes).getJson();
    assert.deepEqual(server.lastRequest.body, Buffer.from(bytes));

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("streamed-"));
        controller.enqueue(new TextEncoder().encode("body"));
        controller.close();
      },
    });
    await create.post(server.url("/echo")).withBody(stream).getJson();
    assert.equal(server.lastRequest.text, "streamed-body");
  });

  it("sends headers, query params, auth and cookies that arrive on the wire", async () => {
    await create
      .get(server.url("/echo?existing=1"))
      .withHeaders({ "X-Custom": "value-1", Accept: "application/json" })
      .withHeader("X-Single", "value-2")
      .withQueryParams({ page: 2, active: true, tags: ["a", "b"] })
      .withQueryParam("q", "hello world & more=stuff")
      .withBasicAuth("ada", "s3cret:pass")
      .withCookies({ sessionId: "abc123", userId: "42" })
      .withCookie("theme", "dark")
      .getJson();
    const request = server.lastRequest;
    assert.equal(request.headers["x-custom"], "value-1");
    assert.equal(request.headers["x-single"], "value-2");
    assert.equal(request.headers.accept, "application/json");
    assert.equal(request.query.get("existing"), "1");
    assert.equal(request.query.get("page"), "2");
    assert.deepEqual(request.query.getAll("tags"), ["a", "b"]);
    assert.equal(request.query.get("q"), "hello world & more=stuff");
    assert.equal(Buffer.from((request.headers.authorization as string).slice(6), "base64").toString(), "ada:s3cret:pass");
    assert.equal(request.headers.cookie, "sessionId=abc123; userId=42; theme=dark");
    assert.equal(request.headers["x-requested-with"], undefined);
  });

  it("reads text, blobs, buffers, form data and 204s", async () => {
    assert.equal(await create.get(server.url("/text")).getText(), "plain text response");
    const blob = await create.get(server.url("/binary?size=64")).getBlob();
    assert.equal(blob.size, 64);
    assert.equal(blob.type, "application/octet-stream");
    assert.deepEqual(Buffer.from(await create.get(server.url("/binary?size=4096")).getArrayBuffer()), deterministicBytes(4096));
    const form = await create.get(server.url("/form")).getFormData();
    assert.equal(form.get("a"), "1");
    assert.equal(form.get("b"), "two");
    const empty = await create.get(server.url("/empty")).getResponse();
    assert.equal(empty.status, 204);
    assert.equal(await empty.getJson(), null);
    assert.equal(await create.get<{ message: string }>(server.url("/json")).getData(d => d.message), "hello");
  });

  it("follows redirects by default and reports forbidden ones as network errors", async () => {
    assert.deepEqual(await create.get(server.url("/redirect?n=2")).getJson(), { message: "hello", source: "e2e" });
    assert.deepEqual(
      server.requests.map(r => r.path),
      ["/redirect", "/redirect", "/json"]
    );
    await assert.rejects(create.get(server.url("/redirect?n=1")).withRedirect("error").getJson(), { code: "NETWORK" });
    const manual = await create.get(server.url("/redirect?n=1")).withRedirect("manual").getResponse();
    assert.equal(manual.status, 302);
    assert.equal(manual.headers.get("location"), server.url("/json"));
  });

  it("sends QUERY (RFC 10008) with its body, retries it, and repeats it on redirects except 303", async () => {
    const api = createApi().withBaseURL(server.origin);
    const echo = await api.query<Echo>("/echo").withContentType("application/sql").withBody("SELECT name FROM users").getJson();
    assert.equal(echo.method, "QUERY");
    assert.equal(echo.headers["content-type"], "application/sql");
    assert.equal(echo.body, "SELECT name FROM users");

    // Safe and idempotent: it belongs in an idempotent-only retry policy, and every attempt resends the body.
    const retried = await api
      .query<{ hits: number }>("/flaky/query?fails=1")
      .withBody({ name: "Ada" })
      .withRetries({ attempts: 1, delay: 1, methods: ["GET", "HEAD", "OPTIONS", "QUERY", "PUT", "DELETE"] })
      .getJson();
    assert.equal(retried.hits, 2);
    assert.deepEqual(
      server.requests.filter(r => r.path === "/flaky/query").map(r => [r.method, r.text]),
      [
        ["QUERY", '{"name":"Ada"}'],
        ["QUERY", '{"name":"Ada"}'],
      ]
    );

    // fetch repeats the QUERY and its body after a 301, 302, 307 or 308, and follows a 303 with a GET without one.
    for (const status of [301, 302, 303, 307, 308]) {
      server.reset();
      assert.deepEqual(await api.query(`/redirect?status=${status}`).withBody({ status }).getJson(), { message: "hello", source: "e2e" });
      const followed = server.requests[1]!;
      assert.equal(followed.path, "/json");
      assert.deepEqual([followed.method, followed.text], status === 303 ? ["GET", ""] : ["QUERY", JSON.stringify({ status })], `after a ${status}`);
    }
  });

  it("throws a RequestError with status, body and data for a real 404, and getResult returns it", async () => {
    const error = await create.get(server.url("/status/404")).getJson().then(unexpected, asError);
    assert.ok(error instanceof RequestError);
    assert.equal(error.code, "HTTP");
    assert.equal(error.message, "HTTP 404 Not Found");
    assert.equal(error.status, 404);
    assert.equal(error.url, server.url("/status/404"));
    assert.deepEqual(error.data, { error: "status 404", code: 404 });
    assert.equal(error.response?.status, 404);
    const result = await create.get(server.url("/status/500")).getResult();
    assert.equal(result.data, null);
    assert.equal(result.error?.status, 500);
  });

  it("does not buffer large error bodies", async () => {
    const error = await create.get(server.url("/big-error?size=2000000")).getResponse().then(unexpected, asError);
    assert.equal(error.status, 500);
    assert.equal(error.body, undefined);
    assert.equal(error.response?.bodyUsed, false);
    assert.equal((await error.response.arrayBuffer()).byteLength, 2_000_000);
  });

  it("runs request, response and error interceptors against real traffic", async () => {
    await create
      .get(server.url("/echo"))
      .withRequestInterceptor(config => {
        config.headers["x-intercepted"] = "yes";
      })
      .getJson();
    assert.equal(server.lastRequest.headers["x-intercepted"], "yes");

    const short = await create
      .get(server.url("/json"))
      .withRequestInterceptor(() => new Response('{"shortCircuited":true}', { headers: { "content-type": "application/json" } }))
      .getJson();
    assert.deepEqual(short, { shortCircuited: true });
    assert.equal(server.requests.length, 1);

    let status = 0;
    await create
      .get(server.url("/json"))
      .withResponseInterceptor(response => void (status = response.status))
      .getJson();
    assert.equal(status, 200);

    const recovered = await create
      .get(server.url("/status/500"))
      .withErrorInterceptor(error => (error.status === 500 ? new ResponseWrapper(new Response('{"recovered":true}')) : undefined))
      .getJson();
    assert.deepEqual(recovered, { recovered: true });
  });

  it("refreshes a token on 401 from an error interceptor and replays the request", async () => {
    let token = "expired";
    const api = createApi()
      .withBaseURL(server.origin)
      .withRequestInterceptor(config => {
        config.headers.authorization = `Bearer ${token}`;
      })
      .withErrorInterceptor(async error => {
        if (error.status !== 401) return;
        token = "fresh";
        return create.get(server.url("/echo")).withBearerToken(token).getResponse();
      });
    const echo = await api.get("/status/401").getJson<{ path: string }>();
    assert.equal(echo.path, "/echo");
    assert.deepEqual(
      server.requests.map(r => r.headers.authorization),
      ["Bearer expired", "Bearer fresh"]
    );
  });

  it("supports api instances with a base URL and shared defaults", async () => {
    const api = createApi().withBaseURL(server.origin).withHeader("X-Api-Version", "7").withBearerToken("shared-token");
    assert.deepEqual(await api.get("/json").getJson(), { message: "hello", source: "e2e" });
    await api.post("/echo").withBody({ via: "builder" }).getJson();
    assert.equal(server.lastRequest.path, "/echo");
    assert.equal(server.lastRequest.headers["x-api-version"], "7");
    assert.equal(server.lastRequest.headers.authorization, "Bearer shared-token");
    assert.deepEqual(JSON.parse(server.lastRequest.text), { via: "builder" });
  });
});
