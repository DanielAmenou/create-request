import assert from "node:assert/strict";
import { describe, it } from "node:test";
import create, { RequestError, ResponseWrapper } from "../../src/index.js";
import { asError, json, readAll, schema, stub, text, unexpected } from "../utils/helpers.js";

const wrap = (response: Response) => new ResponseWrapper(response, "/x", "GET");

describe("ResponseWrapper", () => {
  it("exposes the status line, headers and the raw response", () => {
    const raw = json({}, { status: 201, statusText: "Created", headers: { "x-id": "7" } });
    const response = wrap(raw);
    assert.equal(response.raw, raw);
    assert.equal(response.status, 201);
    assert.equal(response.statusText, "Created");
    assert.equal(response.ok, true);
    assert.equal(response.headers.get("x-id"), "7");
    assert.equal(response.url, "/x");
    assert.equal(response.method, "GET");
    const bare = new ResponseWrapper(raw);
    assert.equal(bare.url, "");
    assert.equal(bare.method, "GET");
  });

  it("reads the body in every format, in any order, from one buffer", async () => {
    const readers = ["getJson", "getText", "getBlob", "getArrayBuffer"] as const;
    for (const first of readers) {
      for (const second of readers) {
        const response = wrap(json({ a: 1 }));
        const one = await response[first]();
        const two = await response[second]();
        const decode = (value: unknown) =>
          value instanceof Blob ? value.text() : value instanceof ArrayBuffer ? new TextDecoder().decode(value) : typeof value === "string" ? value : JSON.stringify(value);
        assert.equal(await decode(one), '{"a":1}', `${first} then ${second}`);
        assert.equal(await decode(two), '{"a":1}', `${first} then ${second}`);
      }
    }
  });

  it("serves concurrent readers and repeated calls from the same promise", async () => {
    const raw = json({ a: 1 });
    let reads = 0;
    const original = raw.arrayBuffer.bind(raw);
    raw.arrayBuffer = () => (reads++, original());
    const response = wrap(raw);
    const [a, b, c] = await Promise.all([response.getJson(), response.getText(), response.getJson()]);
    assert.deepEqual(a, { a: 1 });
    assert.equal(b, '{"a":1}');
    assert.equal(a, c);
    assert.equal(reads, 1);
  });

  it("types blobs with the response Content-Type", async () => {
    assert.equal((await wrap(text("t")).getBlob()).type, "text/plain");
    assert.equal((await wrap(new Response("t")).getBlob()).type, "text/plain;charset=utf-8");
    assert.equal((await wrap(new Response(new Uint8Array([1, 2, 3]))).getBlob()).type, "");
  });

  it("getFormData parses multipart and urlencoded bodies, and reports unparsable ones", async () => {
    const form = new FormData();
    form.append("name", "Ada");
    form.append("file", new File(["hi"], "hi.txt", { type: "text/plain" }));
    const parsed = await wrap(new Response(form)).getFormData();
    assert.equal(parsed.get("name"), "Ada");
    assert.equal(await (parsed.get("file") as File).text(), "hi");
    assert.equal((await wrap(new Response(new URLSearchParams({ a: "1" }))).getFormData()).get("a"), "1");
    await assert.rejects(
      wrap(json({})).getFormData(),
      (error: unknown) => error instanceof RequestError && error.code === "PARSE" && error.message.startsWith("Failed to parse form data: ")
    );
  });

  it("getBody returns the live stream and excludes the other readers", async () => {
    const response = wrap(text("stream me"));
    const stream = response.getBody();
    assert.ok(stream instanceof ReadableStream);
    assert.equal((await readAll(stream)).text, "stream me");
    await assert.rejects(response.getText(), { code: "PARSE", message: "Response body already consumed" });
  });

  it("getBody after a buffered read, and readers after getBody, fail with PARSE", async () => {
    const response = wrap(text("x"));
    await response.getText();
    assert.throws(() => response.getBody(), { code: "PARSE", message: "Response body already consumed" });
    const drained = new Response("y");
    await drained.text();
    await assert.rejects(wrap(drained).getJson(), { code: "PARSE", message: "Response body already consumed" });
    assert.equal(wrap(new Response(null, { status: 204 })).getBody(), null);
  });

  it("reports body read failures as PARSE errors with the cause", async () => {
    const broken = new ReadableStream({
      pull(controller) {
        controller.error(new Error("connection reset"));
      },
    });
    const error = await wrap(new Response(broken)).getText().then(unexpected, asError);
    assert.equal(error.code, "PARSE");
    assert.equal(error.message, "Failed to read response body: connection reset");
    assert.equal((error.cause as Error).message, "connection reset");
  });

  describe("getJson", () => {
    it("returns null for 204 and empty or blank bodies, and text for empty getText", async () => {
      assert.equal(await wrap(new Response(null, { status: 204 })).getJson(), null);
      assert.equal(await wrap(new Response("")).getJson(), null);
      assert.equal(await wrap(new Response("  \n")).getJson(), null);
      assert.equal(await wrap(new Response(null, { status: 204 })).getText(), "");
    });

    it("rejects invalid JSON with a PARSE error carrying the text and the cause", async () => {
      const error = await wrap(text("{not json")).getJson().then(unexpected, asError);
      assert.equal(error.code, "PARSE");
      assert.ok(error.message.startsWith("Invalid JSON response: "));
      assert.equal(error.body, "{not json");
      assert.ok(error.cause instanceof SyntaxError);
      assert.equal(error.status, 200);
      assert.ok(error.response instanceof Response);
    });

    it("validates with a Standard Schema and returns the schema output", async () => {
      const upper = schema<string>(
        v => (typeof v === "string" ? undefined : "expected string"),
        v => (v as string).toUpperCase()
      );
      assert.equal(await wrap(json("abc")).getJson(upper), "ABC");
      const asyncSchema = schema<number>(v => (typeof v === "number" ? undefined : "expected number"), undefined, { async: true });
      assert.equal(await wrap(json(7)).getJson(asyncSchema), 7);
    });

    it("rejects schema mismatches with a VALIDATION error carrying issues, body and data", async () => {
      const withPath = schema(() => "must be a string", undefined, { path: ["user", { key: "name" }, 0] });
      const error = await wrap(json({ user: { name: 1 } }))
        .getJson(withPath)
        .then(unexpected, asError);
      assert.equal(error.code, "VALIDATION");
      assert.equal(error.message, "Response validation failed: must be a string at user.name.0");
      assert.deepEqual(error.issues, [{ message: "must be a string", path: ["user", { key: "name" }, 0] }]);
      assert.equal(error.body, '{"user":{"name":1}}');
      assert.deepEqual(error.data, { user: { name: 1 } });
      assert.equal(error.status, 200);

      const noPath = await wrap(json(1))
        .getJson(schema(() => "nope"))
        .then(unexpected, asError);
      assert.equal(noPath.message, "Response validation failed: nope");
    });
  });

  describe("getData", () => {
    it("returns the JSON, or the selector's result", async () => {
      assert.deepEqual(await wrap(json({ a: 1 })).getData(), { a: 1 });
      assert.equal(await wrap(json({ a: 1 })).getData<{ a: number }, number>(d => d.a), 1);
      assert.equal(await new ResponseWrapper<{ a: number }>(json({ a: 1 })).getData(d => String(d.a)), "1");
    });

    it("wraps selector errors as PARSE errors", async () => {
      const error = await wrap(json(null))
        .getData<{ a: { b: number } }, number>(d => d.a.b)
        .then(unexpected, asError);
      assert.equal(error.code, "PARSE");
      assert.ok(error.message.startsWith("Selector failed: "));
      assert.ok(error.cause instanceof TypeError);
    });

    it("accepts a schema, with or without a selector", async () => {
      const page = schema<{ items: number[] }>(v => (typeof v === "object" && v !== null && "items" in v ? undefined : "no items"));
      assert.deepEqual(await wrap(json({ items: [1, 2] })).getData(page), { items: [1, 2] });
      assert.equal(await wrap(json({ items: [1, 2] })).getData(page, p => p.items.length), 2);
      await assert.rejects(
        wrap(json({})).getData(page, p => p.items.length),
        { code: "VALIDATION" }
      );
    });
  });

  it("the request shortcuts forward to the wrapper", async () => {
    const make = () => create.get("/x").withFetch(stub(json({ items: [1] })).fetch);
    const page = schema<{ items: number[] }>(() => undefined);
    assert.deepEqual(await make().getJson(page), { items: [1] });
    assert.equal(await make().getData(page, p => p.items[0]), 1);
    assert.deepEqual(await make().getData(page), { items: [1] });
    assert.deepEqual(await make().getResult(page), { data: { items: [1] }, error: null });
    const failure = await create
      .get("/x")
      .withFetch(stub(json({})).fetch)
      .getResult(schema(() => "bad"));
    assert.equal(failure.data, null);
    assert.equal(failure.error?.code, "VALIDATION");
  });
});
