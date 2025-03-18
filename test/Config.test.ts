import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { GetRequest } from "../src/requestMethods";
import { Config } from "../src/utils/Config";
import { FetchMock } from "./utils/fetchMock";

describe("Config", () => {
  let config: any;

  beforeEach(() => {
    config = Config.getInstance();
    config.reset();
  });

  it("should be a singleton", () => {
    const instance1 = Config.getInstance();
    const instance2 = Config.getInstance();
    assert.strictEqual(instance1, instance2);
  });

  it("should set and get CSRF token", () => {
    config.setCsrfToken("test-csrf-token");
    assert.equal(config.getCsrfToken(), "test-csrf-token");
  });

  it("should set and get CSRF header name", () => {
    config.setCsrfHeaderName("X-Custom-CSRF");
    assert.equal(config.getCsrfHeaderName(), "X-Custom-CSRF");
  });

  it("should set and get XSRF cookie name", () => {
    config.setXsrfCookieName("CUSTOM-XSRF");
    assert.equal(config.getXsrfCookieName(), "CUSTOM-XSRF");
  });

  it("should set and get XSRF header name", () => {
    config.setXsrfHeaderName("X-Custom-XSRF");
    assert.equal(config.getXsrfHeaderName(), "X-Custom-XSRF");
  });

  it("should enable and disable auto XSRF", () => {
    assert.equal(config.isAutoXsrfEnabled(), true); // Default is true
    config.setEnableAutoXsrf(false);
    assert.equal(config.isAutoXsrfEnabled(), false);
  });

  it("should enable and disable anti-CSRF headers", () => {
    assert.equal(config.isAntiCsrfEnabled(), true); // Default is true
    config.setEnableAntiCsrf(false);
    assert.equal(config.isAntiCsrfEnabled(), false);
  });

  it("should reset to default values", () => {
    // Change several settings
    config
      .setCsrfToken("test-token")
      .setCsrfHeaderName("X-Custom-CSRF")
      .setXsrfCookieName("CUSTOM-XSRF")
      .setXsrfHeaderName("X-Custom-XSRF")
      .setEnableAutoXsrf(false)
      .setEnableAntiCsrf(false);

    // Reset and verify defaults
    config.reset();
    assert.equal(config.getCsrfToken(), null);
    assert.equal(config.getCsrfHeaderName(), "X-CSRF-Token");
    assert.equal(config.getXsrfCookieName(), "XSRF-TOKEN");
    assert.equal(config.getXsrfHeaderName(), "X-XSRF-TOKEN");
    assert.equal(config.isAutoXsrfEnabled(), true);
    assert.equal(config.isAntiCsrfEnabled(), true);
  });

  it("should reset all properties to their default values", () => {
    // Arrange - Change all config values from defaults
    const config = Config.getInstance()
      .setCsrfToken("test-token")
      .setCsrfHeaderName("X-Custom-CSRF")
      .setEnableAntiCsrf(false)
      .setXsrfCookieName("CUSTOM-XSRF-COOKIE")
      .setXsrfHeaderName("X-Custom-XSRF")
      .setEnableAutoXsrf(false);

    // Act
    config.reset();

    // Assert
    assert.equal(config.getCsrfToken(), null);
    assert.equal(config.getCsrfHeaderName(), "X-CSRF-Token");
    assert.equal(config.isAntiCsrfEnabled(), true);
    assert.equal(config.getXsrfCookieName(), "XSRF-TOKEN");
    assert.equal(config.getXsrfHeaderName(), "X-XSRF-TOKEN");
    assert.equal(config.isAutoXsrfEnabled(), true);
  });
});

describe("Config with CSRF", () => {
  let config: any;

  beforeEach(() => {
    FetchMock.install();
    config = Config.getInstance();
    config.reset();
  });

  afterEach(() => {
    FetchMock.reset();
    FetchMock.restore();
  });

  it("should apply global CSRF configuration to requests", async () => {
    // Disable anti-CSRF globally
    config.setEnableAntiCsrf(false);

    // Make a request - it should not have CSRF headers
    const request = new GetRequest();
    await request.sendTo("https://api.example.com/test");

    // Check request headers
    const [, options] = FetchMock.mock.calls[0];
    const headers = options.headers as Record<string, string>;
    assert.equal(headers["X-Requested-With"], undefined);

    // Now enable CSRF and try again
    config.setEnableAntiCsrf(true);
    const request2 = new GetRequest();
    await request2.sendTo("https://api.example.com/test2");

    // Second request should have the header
    const [, options2] = FetchMock.mock.calls[1];
    const headers2 = options2.headers as Record<string, string>;
    assert.equal(headers2["X-Requested-With"], "XMLHttpRequest");
  });
});
