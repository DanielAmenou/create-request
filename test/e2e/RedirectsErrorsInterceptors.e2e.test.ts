import assert from "node:assert/strict";
import { describe, it, before, after, beforeEach } from "node:test";
import create, { RequestError, ResponseWrapper } from "../../src/index.js";
import { TestServer } from "./utils/testServer.js";

describe("e2e: redirects, HTTP errors and interceptors over real HTTP", { timeout: 30000 }, () => {
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

  it("follows a real redirect chain by default", async () => {
    const data = await create.get(server.url("/redirect?n=2")).getJson();

    assert.deepEqual(data, { message: "hello", source: "e2e" });
    assert.deepEqual(
      server.requests.map(request => request.path),
      ["/redirect", "/redirect", "/json"]
    );
  });

  it("fails when redirects are forbidden via withRedirect.ERROR", async () => {
    await assert.rejects(create.get(server.url("/redirect?n=1")).withRedirect.ERROR().getJson(), (error: unknown) => {
      assert.ok(error instanceof RequestError);
      assert.equal(error.isTimeout, false);
      assert.equal(error.isAborted, false);
      return true;
    });
  });

  it("throws a RequestError carrying status and parsed body for a real 404", async () => {
    await assert.rejects(create.get(server.url("/status/404")).getJson(), (error: unknown) => {
      assert.ok(error instanceof RequestError);
      assert.equal(error.status, 404);
      assert.equal(error.method, "GET");
      assert.equal(error.url, server.url("/status/404"));
      assert.deepEqual(error.getJson(), { error: "status 404", code: 404 });
      assert.ok(error.body?.includes("status 404"));
      return true;
    });
  });

  it("keeps error.response readable after the body was captured", async () => {
    await assert.rejects(create.get(server.url("/status/500")).getJson(), (error: unknown) => {
      assert.ok(error instanceof RequestError);
      assert.equal(error.response?.status, 500);
      return true;
    });
  });

  it("lets a request interceptor modify headers before they hit the wire", async () => {
    await create
      .get(server.url("/echo"))
      .withRequestInterceptor(config => {
        config.headers["X-Intercepted"] = "yes";
        return config;
      })
      .getJson();

    assert.equal(server.lastRequest.headers["x-intercepted"], "yes");
  });

  it("lets a request interceptor short-circuit without any network traffic", async () => {
    const data = await create
      .get(server.url("/json"))
      .withRequestInterceptor(() => new Response(JSON.stringify({ shortCircuited: true }), { status: 200, headers: { "content-type": "application/json" } }))
      .getJson();

    assert.deepEqual(data, { shortCircuited: true });
    assert.equal(server.requests.length, 0, "no request should reach the server");
  });

  it("runs response interceptors against real responses", async () => {
    let interceptedStatus = 0;

    await create
      .get(server.url("/json"))
      .withResponseInterceptor(response => {
        interceptedStatus = response.status;
        return response;
      })
      .getJson();

    assert.equal(interceptedStatus, 200);
  });

  it("recovers from a real 500 via an error interceptor", async () => {
    const data = await create
      .get(server.url("/status/500"))
      .withErrorInterceptor(error => {
        assert.equal(error.status, 500);
        return new ResponseWrapper(new Response(JSON.stringify({ recovered: true }), { status: 200, headers: { "content-type": "application/json" } }));
      })
      .getJson();

    assert.deepEqual(data, { recovered: true });
    assert.equal(server.requests.length, 1);
  });
});
