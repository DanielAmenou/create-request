import assert from "node:assert/strict";
import { describe, it } from "node:test";
import create, { RequestError } from "../../src/index.js";
import { json, stub } from "../utils/helpers.js";

describe("withBody", () => {
  it("JSON-encodes objects and arrays and sets Content-Type unless present", async () => {
    const { fetch, calls } = stub();
    await create.post("/x").withBody({ a: 1 }).withFetch(fetch).getResponse();
    await create.put("/x").withBody([1, 2]).withFetch(fetch).getResponse();
    await create.patch("/x").withContentType("application/vnd.api+json").withBody({ a: 1 }).withFetch(fetch).getResponse();
    class User {
      name = "Ada";
    }
    await create.delete("/x").withBody(new User()).withFetch(fetch).getResponse();
    assert.equal(calls[0]!.init.body, '{"a":1}');
    assert.equal(calls[0]!.headers.get("content-type"), "application/json");
    assert.equal(calls[1]!.init.body, "[1,2]");
    assert.equal(calls[2]!.headers.get("content-type"), "application/vnd.api+json");
    assert.equal(calls[3]!.init.body, '{"name":"Ada"}');
    assert.equal(calls[3]!.init.method, "DELETE");
  });

  it("sends strings as text/plain unless a Content-Type is set", async () => {
    const { fetch, calls } = stub();
    await create.post("/x").withBody("hello").withFetch(fetch).getResponse();
    await create.post("/x").withContentType("text/csv").withBody("a,b").withFetch(fetch).getResponse();
    assert.equal(calls[0]!.init.body, "hello");
    assert.equal(calls[0]!.headers.get("content-type"), "text/plain");
    assert.equal(calls[1]!.headers.get("content-type"), "text/csv");
  });

  it("passes binary and form bodies through untouched, without a Content-Type", async () => {
    const { fetch, calls } = stub();
    const bodies = [
      new Blob(["b"]),
      new File(["f"], "f.txt"),
      new FormData(),
      new URLSearchParams("a=1"),
      new ArrayBuffer(4),
      new Uint8Array([1, 2]),
      new DataView(new ArrayBuffer(2)),
    ];
    for (const body of bodies) await create.post("/x").withBody(body).withFetch(fetch).getResponse();
    bodies.forEach((body, i) => {
      assert.equal(calls[i]!.init.body, body);
      assert.equal(calls[i]!.headers.get("content-type"), null);
      assert.equal(calls[i]!.init.duplex, undefined);
    });
  });

  it("sends ReadableStream bodies with duplex: 'half'", async () => {
    const { fetch, calls } = stub();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("chunk"));
        controller.close();
      },
    });
    await create.post("/x").withBody(stream).withFetch(fetch).getResponse();
    assert.equal(calls[0]!.init.body, stream);
    assert.equal(calls[0]!.init.duplex, "half");
  });

  it("a later body replaces an earlier one, and a stream body no longer marks the request after replacement", async () => {
    const { fetch, calls } = stub();
    const request = create.post("/x").withBody(new ReadableStream()).withBody({ a: 1 });
    await request.withFetch(fetch).getResponse();
    assert.equal(calls[0]!.init.body, '{"a":1}');
    assert.equal(calls[0]!.init.duplex, undefined);
  });

  it("rejects bodies that cannot be serialised with a VALIDATION error", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    assert.throws(
      () => create.post("/x").withBody(circular),
      (error: unknown) =>
        error instanceof RequestError && error.code === "VALIDATION" && error.message.startsWith("Body is not JSON-serializable: ") && error.cause instanceof TypeError
    );
  });
});

describe("withGraphQL", () => {
  it("sends { query, variables } as JSON", async () => {
    const { fetch, calls } = stub();
    await create.post("/graphql").withGraphQL("query { me { id } }", { id: 1 }).withFetch(fetch).getResponse();
    await create.post("/graphql").withGraphQL("query { me { id } }").withFetch(fetch).getResponse();
    assert.equal(calls[0]!.init.body, '{"query":"query { me { id } }","variables":{"id":1}}');
    assert.equal(calls[0]!.headers.get("content-type"), "application/json");
    assert.equal(calls[1]!.init.body, '{"query":"query { me { id } }"}');
  });

  it("returns the data as-is unless throwOnError is set", async () => {
    const body = { data: null, errors: [{ message: "Not found" }] };
    assert.deepEqual(
      await create
        .post("/graphql")
        .withGraphQL("q")
        .withFetch(stub(json(body)).fetch)
        .getJson(),
      body
    );
    assert.deepEqual(
      await create
        .post("/graphql")
        .withGraphQL("q", {}, { throwOnError: false })
        .withFetch(stub(json(body)).fetch)
        .getJson(),
      body
    );
  });

  it("throws a GRAPHQL error listing the messages when throwOnError is set, whatever shape the errors have", async () => {
    const body: unknown = {
      data: null,
      errors: [{ message: "Not found" }, "plain string", { message: { nested: true } }, { code: 1 }, null, { message: { toString: "hostile" } }],
    };
    await assert.rejects(
      create
        .post("/graphql")
        .withGraphQL("q", {}, { throwOnError: true })
        .withFetch(stub(json(body)).fetch)
        .getJson(),
      (error: unknown) =>
        error instanceof RequestError &&
        error.code === "GRAPHQL" &&
        error.status === 200 &&
        error.message === 'GraphQL error: Not found; plain string; {"nested":true}; {"code":1}; null; {"toString":"hostile"}' &&
        error.body === JSON.stringify(body) &&
        error.data !== undefined
    );
  });

  it("does not throw for an empty errors array, a non-array errors field or a non-object body", async () => {
    for (const body of [{ data: 1, errors: [] }, { data: 1, errors: "nope" }, [1, 2], "str", 42]) {
      assert.deepEqual(
        await create
          .post("/graphql")
          .withGraphQL("q", {}, { throwOnError: true })
          .withFetch(stub(json(body)).fetch)
          .getJson(),
        body
      );
    }
    assert.equal(
      await create
        .post("/graphql")
        .withGraphQL("q", {}, { throwOnError: true })
        .withFetch(stub(json(null)).fetch)
        .getJson(),
      null
    );
  });
});
