import assert from "node:assert/strict";
import { describe, it, before, after, beforeEach } from "node:test";
import create from "../../src/index.js";
import { TestServer, deterministicBytes } from "./utils/testServer.js";

type EchoPayload = {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: string;
  bodyBase64: string;
};

describe("e2e: HTTP methods over real HTTP", { timeout: 30000 }, () => {
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

  it("performs a real GET request and parses JSON", async () => {
    const data = await create.get(server.url("/json")).getJson();

    assert.deepEqual(data, { message: "hello", source: "e2e" });
    assert.equal(server.lastRequest.method, "GET");
    assert.equal(server.lastRequest.path, "/json");
  });

  it("performs a POST with a JSON body that arrives on the wire", async () => {
    const payload = { name: "Ada", tags: ["math", "computing"], active: true };
    const echo = (await create.post(server.url("/echo")).withBody(payload).getJson()) as EchoPayload;

    assert.equal(echo.method, "POST");
    assert.equal(echo.headers["content-type"], "application/json");
    assert.deepEqual(JSON.parse(server.lastRequest.text), payload);
  });

  it("performs PUT, PATCH and DELETE round-trips", async () => {
    const put = (await create.put(server.url("/echo")).withBody({ id: 1 }).getJson()) as EchoPayload;
    assert.equal(put.method, "PUT");

    const patch = (await create.patch(server.url("/echo")).withBody({ op: "replace" }).getJson()) as EchoPayload;
    assert.equal(patch.method, "PATCH");
    assert.deepEqual(JSON.parse(server.lastRequest.text), { op: "replace" });

    const del = (await create.del(server.url("/echo")).getJson()) as EchoPayload;
    assert.equal(del.method, "DELETE");
    assert.equal(server.lastRequest.text, "");
  });

  it("performs a HEAD request and receives headers but no body", async () => {
    const response = await create.head(server.url("/json")).getResponse();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/json");
    assert.equal(await response.getText(), "");
    assert.equal(server.lastRequest.method, "HEAD");
  });

  it("performs an OPTIONS request", async () => {
    const response = await create.options(server.url("/echo")).getResponse();

    assert.equal(response.status, 200);
    assert.equal(server.lastRequest.method, "OPTIONS");
  });

  it("reads a plain text response with getText", async () => {
    const text = await create.get(server.url("/text")).getText();

    assert.equal(text, "plain text response");
  });

  it("reads binary responses with getBlob and getArrayBuffer", async () => {
    const blob = await create.get(server.url("/binary?size=64")).getBlob();
    assert.equal(blob.size, 64);
    assert.equal(blob.type, "application/octet-stream");

    const buffer = await create.get(server.url("/binary?size=64")).getArrayBuffer();
    assert.deepEqual(Buffer.from(buffer), deterministicBytes(64));
  });

  it("handles a real 204 No Content response", async () => {
    const response = await create.get(server.url("/empty")).getResponse();

    assert.equal(response.status, 204);
    assert.equal(await response.getJson(), null);
  });

  it("applies a getData selector to a real response", async () => {
    const message = await create.get(server.url("/json")).getData<{ message: string }, string>(data => data?.message ?? "");

    assert.equal(message, "hello");
  });

  it("exposes response metadata on the ResponseWrapper", async () => {
    const response = await create.get(server.url("/json")).getResponse();

    assert.equal(response.status, 200);
    assert.equal(response.ok, true);
    assert.equal(response.method, "GET");
    assert.equal(response.url, server.url("/json"));
    assert.deepEqual(await response.getJson(), { message: "hello", source: "e2e" });
  });
});
