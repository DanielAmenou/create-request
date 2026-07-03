import assert from "node:assert/strict";
import { describe, it, before, after, beforeEach } from "node:test";
import create, { createApi } from "../../src/index.js";
import { TestServer, deterministicBytes } from "./utils/testServer.js";

describe("e2e: streaming, compression, concurrency and api builder over real HTTP", { timeout: 30000 }, () => {
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

  it("reads a real chunked response as a stream", async () => {
    const stream = await create.get(server.url("/stream?chunks=5&delay=10")).getBody();
    assert.ok(stream instanceof ReadableStream);

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let received = "";
    let reads = 0;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += decoder.decode(value, { stream: true });
      reads += 1;
    }

    assert.equal(received, "chunk-1;chunk-2;chunk-3;chunk-4;chunk-5;");
    assert.ok(reads > 1, `expected multiple chunk reads over real HTTP, got ${reads}`);
  });

  it("transparently decompresses a real gzip response", async () => {
    const response = await create.get(server.url("/gzip")).getResponse();

    assert.equal(response.headers.get("content-encoding"), "gzip");
    assert.deepEqual(await response.getJson(), { compressed: true, message: "gzipped hello" });
  });

  it("preserves binary integrity for larger payloads", async () => {
    const buffer = await create.get(server.url("/binary?size=4096")).getArrayBuffer();

    assert.equal(buffer.byteLength, 4096);
    assert.deepEqual(Buffer.from(buffer), deterministicBytes(4096));
  });

  it("handles many concurrent requests over real sockets", async () => {
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => create.get(server.url("/echo")).withQueryParam("i", i).getJson<{ query: { i: string } }>()));

    assert.equal(results.length, 20);
    assert.equal(server.requests.length, 20);
    const received = results.map(result => Number(result?.query.i)).sort((a, b) => a - b);
    assert.deepEqual(
      received,
      Array.from({ length: 20 }, (_, i) => i)
    );
  });

  it("supports the api builder with a base URL and shared defaults", async () => {
    const api = createApi().withBaseURL(server.origin).withHeader("X-Api-Version", "7").withBearerToken("shared-token");

    const first = await api.get("/json").getJson();
    assert.deepEqual(first, { message: "hello", source: "e2e" });

    await api.post("/echo").withBody({ via: "builder" }).getJson();
    assert.equal(server.lastRequest.path, "/echo");
    assert.equal(server.lastRequest.headers["x-api-version"], "7");
    assert.equal(server.lastRequest.headers["authorization"], "Bearer shared-token");
    assert.deepEqual(JSON.parse(server.lastRequest.text), { via: "builder" });
  });
});
