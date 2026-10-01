import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RequestError, isRequestError } from "../../src/index.js";

describe("RequestError", () => {
  it("is an Error with a stable name, code, url, method and optional context", () => {
    const cause = new Error("root");
    const response = new Response("{}", { status: 418 });
    const error = new RequestError("teapot", { code: "HTTP", url: "/tea", method: "POST", status: 418, response, body: '{"hot":true}', cause });
    assert.ok(error instanceof Error);
    assert.ok(error instanceof RequestError);
    assert.equal(error.name, "RequestError");
    assert.equal(error.message, "teapot");
    assert.equal(String(error), "RequestError: teapot");
    assert.equal(error.code, "HTTP");
    assert.equal(error.url, "/tea");
    assert.equal(error.method, "POST");
    assert.equal(error.status, 418);
    assert.equal(error.response, response);
    assert.equal(error.body, '{"hot":true}');
    assert.equal(error.cause, cause);
    assert.equal(error.issues, undefined);
    assert.ok(error.stack?.includes("RequestError: teapot"));
  });

  it("data parses the body lazily, once, and never throws", () => {
    const error = new RequestError("x", { code: "HTTP", url: "/", method: "GET", body: '{"a":1}' });
    const first = error.data;
    assert.deepEqual(first, { a: 1 });
    assert.equal(error.data, first);
    assert.equal(new RequestError("x", { code: "HTTP", url: "/", method: "GET", body: "not json" }).data, undefined);
    assert.equal(new RequestError("x", { code: "HTTP", url: "/", method: "GET", body: "" }).data, undefined);
    assert.equal(new RequestError("x", { code: "NETWORK", url: "/", method: "GET" }).data, undefined);
    assert.equal(new RequestError<{ a: number }>("x", { code: "HTTP", url: "/", method: "GET", body: "null" }).data, null);
  });

  it("isTimeout and isAborted derive from the code", () => {
    assert.equal(new RequestError("x", { code: "TIMEOUT", url: "/", method: "GET" }).isTimeout, true);
    assert.equal(new RequestError("x", { code: "TIMEOUT", url: "/", method: "GET" }).isAborted, false);
    assert.equal(new RequestError("x", { code: "ABORTED", url: "/", method: "GET" }).isAborted, true);
    assert.equal(new RequestError("x", { code: "ABORTED", url: "/", method: "GET" }).isTimeout, false);
  });

  it("isRequestError narrows unknown values", () => {
    assert.equal(isRequestError(new RequestError("x", { code: "HTTP", url: "/", method: "GET" })), true);
    assert.equal(isRequestError(new Error("x")), false);
    assert.equal(isRequestError(null), false);
    assert.equal(isRequestError({ name: "RequestError", code: "HTTP" }), false);
  });
});
