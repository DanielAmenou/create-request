import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { GetRequest } from "../src/requestMethods.js";
import { FetchMock } from "./utils/fetchMock.js";
import { RequestMode, RedirectMode, RequestPriority, CredentialsPolicy, ReferrerPolicy } from "../src/enums.js";
import create from "../src/index.js";

describe("Dual API Pattern - Direct Call and Fluent API", () => {
  beforeEach(() => {
    FetchMock.install();
    create.config.setEnableAntiCsrf(false);
  });

  afterEach(() => {
    FetchMock.reset();
    FetchMock.restore();
    create.config.reset();
  });

  describe("withPriority", () => {
    it("should work with string parameter", async () => {
      FetchMock.mockResponseOnce();
      const request = new GetRequest("https://api.example.com/test").withPriority("high");

      await request.get();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.priority, "high");
    });

    it("should work with enum parameter", async () => {
      FetchMock.mockResponseOnce();
      const request = new GetRequest("https://api.example.com/test").withPriority(RequestPriority.HIGH);

      await request.get();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.priority, RequestPriority.HIGH);
    });

    it("should work with fluent API", async () => {
      FetchMock.mockResponseOnce();
      const request = new GetRequest("https://api.example.com/test").withPriority.HIGH();

      await request.get();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.priority, RequestPriority.HIGH);
    });
  });

  describe("withMode", () => {
    it("should work with string parameter", async () => {
      FetchMock.mockResponseOnce();
      const request = new GetRequest("https://api.example.com/test").withMode("cors");

      await request.get();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.mode, "cors");
    });

    it("should work with enum parameter", async () => {
      FetchMock.mockResponseOnce();
      const request = new GetRequest("https://api.example.com/test").withMode(RequestMode.CORS);

      await request.get();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.mode, RequestMode.CORS);
    });

    it("should work with fluent API", async () => {
      FetchMock.mockResponseOnce();
      const request = new GetRequest("https://api.example.com/test").withMode.CORS();

      await request.get();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.mode, RequestMode.CORS);
    });
  });

  describe("withRedirect", () => {
    it("should work with string parameter", async () => {
      FetchMock.mockResponseOnce();
      const request = new GetRequest("https://api.example.com/test").withRedirect("follow");

      await request.get();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.redirect, "follow");
    });

    it("should work with enum parameter", async () => {
      FetchMock.mockResponseOnce();
      const request = new GetRequest("https://api.example.com/test").withRedirect(RedirectMode.FOLLOW);

      await request.get();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.redirect, RedirectMode.FOLLOW);
    });

    it("should work with fluent API", async () => {
      FetchMock.mockResponseOnce();
      const request = new GetRequest("https://api.example.com/test").withRedirect.FOLLOW();

      await request.get();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.redirect, RedirectMode.FOLLOW);
    });
  });

  describe("withCredentials", () => {
    it("should work with string parameter", async () => {
      FetchMock.mockResponseOnce();
      const request = new GetRequest("https://api.example.com/test").withCredentials("include");

      await request.get();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.credentials, "include");
    });

    it("should work with enum parameter", async () => {
      FetchMock.mockResponseOnce();
      const request = new GetRequest("https://api.example.com/test").withCredentials(CredentialsPolicy.INCLUDE);

      await request.get();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.credentials, CredentialsPolicy.INCLUDE);
    });

    it("should work with fluent API", async () => {
      FetchMock.mockResponseOnce();
      const request = new GetRequest("https://api.example.com/test").withCredentials.INCLUDE();

      await request.get();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.credentials, CredentialsPolicy.INCLUDE);
    });
  });

  describe("withReferrerPolicy", () => {
    it("should work with string parameter", async () => {
      FetchMock.mockResponseOnce();
      const request = new GetRequest("https://api.example.com/test").withReferrerPolicy("no-referrer");

      await request.get();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.referrerPolicy, "no-referrer");
    });

    it("should work with enum parameter", async () => {
      FetchMock.mockResponseOnce();
      const request = new GetRequest("https://api.example.com/test").withReferrerPolicy(ReferrerPolicy.NO_REFERRER);

      await request.get();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.referrerPolicy, ReferrerPolicy.NO_REFERRER);
    });

    it("should work with fluent API", async () => {
      FetchMock.mockResponseOnce();
      const request = new GetRequest("https://api.example.com/test").withReferrerPolicy.NO_REFERRER();

      await request.get();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.referrerPolicy, ReferrerPolicy.NO_REFERRER);
    });
  });

  describe("Mixed usage", () => {
    it("should allow mixing direct calls and fluent API", async () => {
      FetchMock.mockResponseOnce();
      const request = new GetRequest("https://api.example.com/test").withPriority("high").withMode.CORS().withRedirect(RedirectMode.FOLLOW).withCredentials.INCLUDE();

      await request.get();

      const [, options] = FetchMock.mock.calls[0];
      assert.equal(options.priority, "high");
      assert.equal(options.mode, RequestMode.CORS);
      assert.equal(options.redirect, RedirectMode.FOLLOW);
      assert.equal(options.credentials, CredentialsPolicy.INCLUDE);
    });
  });
});
