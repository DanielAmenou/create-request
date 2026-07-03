import assert from "node:assert/strict";
import { describe, it, before, after, beforeEach } from "node:test";
import create from "../../src/index.js";
import { TestServer } from "./utils/testServer.js";

describe("e2e: headers, query params, auth and cookies over real HTTP", { timeout: 30000 }, () => {
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

  it("sends custom headers that arrive on the wire", async () => {
    await create.get(server.url("/echo")).withHeaders({ "X-Custom": "value-1", Accept: "application/json" }).withHeader("X-Single", "value-2").getJson();

    const headers = server.lastRequest.headers;
    assert.equal(headers["x-custom"], "value-1");
    assert.equal(headers["x-single"], "value-2");
    assert.equal(headers["accept"], "application/json");
  });

  it("sends the anti-CSRF header by default and omits it when disabled", async () => {
    await create.get(server.url("/echo")).getJson();
    assert.equal(server.lastRequest.headers["x-requested-with"], "XMLHttpRequest");

    await create.get(server.url("/echo")).withoutCsrfProtection().getJson();
    assert.equal(server.lastRequest.headers["x-requested-with"], undefined);

    create.config.setEnableAntiCsrf(false);
    await create.get(server.url("/echo")).getJson();
    assert.equal(server.lastRequest.headers["x-requested-with"], undefined);
  });

  it("serializes query params, including arrays and special characters", async () => {
    await create
      .get(server.url("/echo"))
      .withQueryParams({ page: 2, limit: 25, active: true, tags: ["a", "b"] })
      .withQueryParam("q", "hello world & more=stuff")
      .getJson();

    const query = server.lastRequest.query;
    assert.equal(query.get("page"), "2");
    assert.equal(query.get("limit"), "25");
    assert.equal(query.get("active"), "true");
    assert.deepEqual(query.getAll("tags"), ["a", "b"]);
    assert.equal(query.get("q"), "hello world & more=stuff");
  });

  it("appends query params to a URL that already has some", async () => {
    await create.get(server.url("/echo?existing=1")).withQueryParam("added", "2").getJson();

    assert.equal(server.lastRequest.query.get("existing"), "1");
    assert.equal(server.lastRequest.query.get("added"), "2");
  });

  it("sends real Basic auth credentials", async () => {
    await create.get(server.url("/echo")).withBasicAuth("ada", "s3cret:pass").getJson();

    const authorization = server.lastRequest.headers["authorization"];
    assert.ok(typeof authorization === "string" && authorization.startsWith("Basic "));
    const decoded = Buffer.from(authorization.slice("Basic ".length), "base64").toString("utf8");
    assert.equal(decoded, "ada:s3cret:pass");
  });

  it("sends a Bearer token", async () => {
    await create.get(server.url("/echo")).withBearerToken("token-123").getJson();

    assert.equal(server.lastRequest.headers["authorization"], "Bearer token-123");
  });

  it("sends cookies in a single Cookie header", async () => {
    await create.get(server.url("/echo")).withCookies({ sessionId: "abc123", userId: "42" }).withCookie("theme", "dark").getJson();

    assert.equal(server.lastRequest.headers["cookie"], "sessionId=abc123; userId=42; theme=dark");
  });

  it("sends a CSRF token under a custom header name", async () => {
    await create.post(server.url("/echo")).withCsrfToken("csrf-42", "X-My-Csrf").withBody({ ok: true }).getJson();

    assert.equal(server.lastRequest.headers["x-my-csrf"], "csrf-42");
  });

  it("exposes real Set-Cookie response headers", async () => {
    const response = await create.get(server.url("/set-cookie")).getResponse();

    const setCookies = response.headers.getSetCookie();
    assert.equal(setCookies.length, 2);
    assert.ok(setCookies[0].startsWith("sessionId=abc123"));
    assert.ok(setCookies[1].startsWith("theme=dark"));
  });
});
