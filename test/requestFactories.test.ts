import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { get, post, put, del, patch, head, options } from "../src/requestFactories";
import { GetRequest, PostRequest, PutRequest, DeleteRequest, PatchRequest, HeadRequest, OptionsRequest } from "../src/requestMethods";

describe("Request Factories", () => {
  it("should create a GetRequest instance", () => {
    const request = get();
    assert.ok(request instanceof GetRequest);
  });

  it("should create a PostRequest instance", () => {
    const request = post();
    assert.ok(request instanceof PostRequest);
  });

  it("should create a PutRequest instance", () => {
    const request = put();
    assert.ok(request instanceof PutRequest);
  });

  it("should create a DeleteRequest instance", () => {
    const request = del();
    assert.ok(request instanceof DeleteRequest);
  });

  it("should create a PatchRequest instance", () => {
    const request = patch();
    assert.ok(request instanceof PatchRequest);
  });

  it("should create a HeadRequest instance", () => {
    const request = head();
    assert.ok(request instanceof HeadRequest);
  });

  it("should create an OptionsRequest instance", () => {
    const request = options();
    assert.ok(request instanceof OptionsRequest);
  });
});
