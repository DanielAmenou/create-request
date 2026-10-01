import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as library from "../../src/index.js";
import create, { HttpRequest, RequestError, ResponseWrapper, createApi, isRequestError } from "../../src/index.js";

describe("public surface", () => {
  it("exports exactly the documented runtime members", () => {
    assert.deepEqual(Object.keys(library).sort(), [
      "HttpRequest",
      "RequestError",
      "ResponseWrapper",
      "createApi",
      "createDelete",
      "createGet",
      "createHead",
      "createOptions",
      "createPatch",
      "createPost",
      "createPut",
      "default",
      "isRequestError",
    ]);
  });

  it("the default export has one factory per method, the del alias and api", () => {
    assert.deepEqual(Object.keys(create).sort(), ["api", "del", "delete", "get", "head", "options", "patch", "post", "put"]);
    assert.equal(create.api, createApi);
    assert.equal(create.del, create.delete);
    assert.equal(create.get, library.createGet);
    assert.equal(create.head, library.createHead);
    assert.equal(create.options, library.createOptions);
    assert.equal(create.post, library.createPost);
    assert.equal(create.put, library.createPut);
    assert.equal(create.patch, library.createPatch);
    assert.equal(create.delete, library.createDelete);
  });

  it("requests expose only their public chainable and execution methods", () => {
    const names = Object.getOwnPropertyNames(HttpRequest.prototype).filter(name => !name.startsWith("_") && name !== "constructor");
    assert.deepEqual(names.sort(), [
      "clone",
      "getArrayBuffer",
      "getBlob",
      "getBody",
      "getData",
      "getFormData",
      "getJson",
      "getResponse",
      "getResult",
      "getText",
      "onRetry",
      "url",
      "withAbortController",
      "withAuthorization",
      "withBasicAuth",
      "withBearerToken",
      "withBody",
      "withCache",
      "withContentType",
      "withCookie",
      "withCookies",
      "withCredentials",
      "withCsrf",
      "withCsrfToken",
      "withErrorInterceptor",
      "withFetch",
      "withGraphQL",
      "withHeader",
      "withHeaders",
      "withIntegrity",
      "withKeepAlive",
      "withMode",
      "withPriority",
      "withQueryParam",
      "withQueryParams",
      "withRedirect",
      "withReferrer",
      "withReferrerPolicy",
      "withRequestInterceptor",
      "withResponseInterceptor",
      "withRetries",
      "withSignal",
      "withTimeout",
    ]);
  });

  it("response wrappers expose the status line, headers, raw response and readers", () => {
    const names = Object.getOwnPropertyNames(ResponseWrapper.prototype).filter(name => !name.startsWith("_") && name !== "constructor");
    assert.deepEqual(names.sort(), ["getArrayBuffer", "getBlob", "getBody", "getData", "getFormData", "getJson", "getText", "headers", "ok", "status", "statusText"]);
  });

  it("api instances expose the request factories, withBaseURL and every shared with* method", () => {
    const api = createApi() as unknown as Record<string, unknown>;
    const requestChainables = Object.getOwnPropertyNames(HttpRequest.prototype).filter(name => /^(with|onRetry)/.test(name));
    const shared = requestChainables.filter(name => !["withBody", "withGraphQL", "withSignal", "withAbortController"].includes(name));
    for (const name of [...shared, "withBaseURL", "get", "head", "options", "post", "put", "patch", "delete", "del"]) {
      assert.equal(typeof api[name], "function", name);
    }
    assert.ok(
      Object.keys(api).every(key => key.startsWith("_")),
      "only internal state on the instance"
    );
  });

  it("RequestError is the only error class and isRequestError recognises subclasses", () => {
    class MyError extends RequestError {}
    assert.equal(isRequestError(new MyError("x", { code: "HTTP", url: "/", method: "GET" })), true);
    assert.equal(new RequestError("x", { code: "HTTP", url: "/", method: "GET" }) instanceof Error, true);
  });
});
