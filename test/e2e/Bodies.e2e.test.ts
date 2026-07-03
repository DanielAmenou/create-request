import assert from "node:assert/strict";
import { describe, it, before, after, beforeEach } from "node:test";
import create from "../../src/index.js";
import { TestServer } from "./utils/testServer.js";

describe("e2e: request body types over real HTTP", { timeout: 30000 }, () => {
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

  it("sends a string body as text/plain", async () => {
    await create.post(server.url("/echo")).withBody("raw string body").getJson();

    assert.equal(server.lastRequest.headers["content-type"], "text/plain");
    assert.equal(server.lastRequest.text, "raw string body");
  });

  it("respects an explicit Content-Type over the inferred one", async () => {
    await create.post(server.url("/echo")).withContentType("application/xml").withBody("<root/>").getJson();

    assert.equal(server.lastRequest.headers["content-type"], "application/xml");
    assert.equal(server.lastRequest.text, "<root/>");
  });

  it("sends URLSearchParams as form-urlencoded", async () => {
    const params = new URLSearchParams({ user: "ada lovelace", role: "admin" });
    await create.post(server.url("/echo")).withBody(params).getJson();

    const contentType = server.lastRequest.headers["content-type"];
    assert.ok(typeof contentType === "string" && contentType.startsWith("application/x-www-form-urlencoded"));
    const received = new URLSearchParams(server.lastRequest.text);
    assert.equal(received.get("user"), "ada lovelace");
    assert.equal(received.get("role"), "admin");
  });

  it("sends FormData as real multipart/form-data with fields and a file", async () => {
    const formData = new FormData();
    formData.append("field", "value-1");
    formData.append("file", new Blob(["file-contents"], { type: "text/plain" }), "notes.txt");

    await create.post(server.url("/echo")).withBody(formData).getJson();

    const contentType = server.lastRequest.headers["content-type"];
    assert.ok(typeof contentType === "string" && contentType.startsWith("multipart/form-data; boundary="));

    const boundary = contentType.split("boundary=")[1];
    const raw = server.lastRequest.text;
    assert.ok(raw.includes(`--${boundary}`));
    assert.ok(raw.includes('name="field"'));
    assert.ok(raw.includes("value-1"));
    assert.ok(raw.includes('name="file"; filename="notes.txt"'));
    assert.ok(raw.includes("file-contents"));
  });

  it("sends a Blob body with its own content type", async () => {
    await create
      .post(server.url("/echo"))
      .withBody(new Blob(['{"from":"blob"}'], { type: "application/json" }))
      .getJson();

    assert.equal(server.lastRequest.headers["content-type"], "application/json");
    assert.equal(server.lastRequest.text, '{"from":"blob"}');
  });

  it("sends binary bodies byte-for-byte", async () => {
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255]);
    await create.post(server.url("/echo")).withBody(bytes).getJson();

    assert.deepEqual(server.lastRequest.body, Buffer.from(bytes));
  });

  it("sends a GraphQL query with variables as JSON", async () => {
    const query = "query User($id: ID!) { user(id: $id) { name } }";
    await create.post(server.url("/echo")).withGraphQL(query, { id: "123" }).getJson();

    assert.equal(server.lastRequest.headers["content-type"], "application/json");
    assert.deepEqual(JSON.parse(server.lastRequest.text), { query, variables: { id: "123" } });
  });
});
