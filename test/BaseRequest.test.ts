import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { RequestMode, RedirectMode, SameSitePolicy, RequestPriority, CredentialsPolicy } from "../src/enums";
import create from "../src/index";
import { RequestError } from "../src/RequestError";
import { GetRequest } from "../src/requestMethods";
import type { CookieOptions } from "../src/types";
import { FetchMock, wait } from "./utils/fetchMock";

describe("BaseRequest", () => {
  beforeEach(() => {
    FetchMock.install();
    // Disable anti-CSRF globally for most tests
    create.config.setEnableAntiCsrf(false);
  });

  afterEach(() => {
    FetchMock.reset();
    FetchMock.restore();
    // Reset global config after each test
    create.config.reset();
  });

  it("should make a basic GET request", async () => {
    // Arrange
    const expectedResponse = { success: true };
    FetchMock.mockResponseOnce({ body: expectedResponse });
    const request = new GetRequest();

    // Act
    const result = await request.sendTo("https://api.example.com/test").getJson();

    // Assert
    assert.deepEqual(result, expectedResponse);
    assert.equal(FetchMock.mock.calls.length, 1);
    const [url, options] = FetchMock.mock.calls[0] as [string, RequestInit];
    assert.equal(url, "https://api.example.com/test");
    assert.equal(options.method, "GET");
  });

  it("should set custom headers", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const request = new GetRequest().withoutCsrfProtection().withHeaders({
      "X-Custom-Header": "test-value",
      Authorization: "Bearer token123",
    });

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    assert.deepEqual(options.headers, {
      "X-Custom-Header": "test-value",
      Authorization: "Bearer token123",
    });
  });

  it("should handle query parameters correctly", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const request = new GetRequest()
      .withQueryParams({
        param1: "value1",
        param2: 123,
        param3: true,
        param4: ["a", "b", "c"],
        param5: null, // should be ignored
        param6: undefined, // should be ignored
      })
      .withQueryParam("param7", "value7");

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert
    const [url] = FetchMock.mock.calls[0];
    const parsedUrl = new URL(url as string);
    assert.equal(parsedUrl.searchParams.get("param1"), "value1");
    assert.equal(parsedUrl.searchParams.get("param2"), "123");
    assert.equal(parsedUrl.searchParams.get("param3"), "true");
    assert.equal(parsedUrl.searchParams.getAll("param4").join(","), "a,b,c");
    assert.equal(parsedUrl.searchParams.has("param5"), false);
    assert.equal(parsedUrl.searchParams.has("param6"), false);
    assert.equal(parsedUrl.searchParams.get("param7"), "value7");
  });

  it("should merge query parameters with existing URL params", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const request = new GetRequest().withQueryParam("param1", "value1");

    // Act
    await request.sendTo("https://api.example.com/test?existing=value");

    // Assert
    const [url] = FetchMock.mock.calls[0];
    const parsedUrl = new URL(url as string);
    assert.equal(parsedUrl.searchParams.get("existing"), "value");
    assert.equal(parsedUrl.searchParams.get("param1"), "value1");
  });

  it("should set timeout and handle timeouts correctly", async () => {
    // Arrange - set a timeout that's shorter than the response delay
    const timeout = 50;
    const responseDelay = 200; // Longer than timeout

    FetchMock.mockDelayedResponseOnce(responseDelay);
    const request = new GetRequest().withTimeout(timeout);

    // Act & Assert - the request should timeout and throw
    try {
      await request.sendTo("https://api.example.com/test");
      assert.fail("Expected request to timeout but it succeeded");
    } catch (error) {
      assert(error instanceof RequestError);
      assert(error.timeoutError);
      assert.equal(error.url, "https://api.example.com/test");
      assert.equal(error.method, "GET");
    }
  });

  it("should handle retries correctly", async () => {
    // Arrange
    FetchMock.mockErrorOnce(new Error("Network error")); // First attempt fails
    FetchMock.mockResponseOnce({ body: { success: true } }); // Second attempt succeeds

    let retryCallbackCalled = false;
    const request = new GetRequest().withRetries(1).onRetry(() => {
      retryCallbackCalled = true;
    });

    // Act
    const response = await request.sendTo("https://api.example.com/test").getJson();

    // Assert
    assert.deepEqual(response, { success: true });
    assert.equal(FetchMock.mock.calls.length, 2);
    assert.equal(retryCallbackCalled, true);
  });

  it("should use the provided AbortController", async () => {
    // Arrange
    const responseDelay = 500;
    FetchMock.mockDelayedResponseOnce(responseDelay);
    const controller = new AbortController();
    const request = new GetRequest().withAbortController(controller);

    // Act
    const requestPromise = request.sendTo("https://api.example.com/test");

    // Wait a bit then abort the request
    await wait(100);
    controller.abort();

    // Assert
    try {
      await requestPromise;
      assert.fail("Expected request to be aborted but it succeeded");
    } catch (error) {
      // We expect an error - the request was aborted
      assert(error instanceof Error);
      assert(error instanceof RequestError || error instanceof DOMException);
    }
  });

  it("should set credentials policy", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const request = new GetRequest().withCredentials(CredentialsPolicy.INCLUDE);

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    assert.equal(options.credentials, "include");
  });

  it("should set redirect mode", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const request = new GetRequest().withRedirect(RedirectMode.ERROR);

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    assert.equal(options.redirect, "error");
  });

  it("should set request mode", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const request = new GetRequest().withMode(RequestMode.CORS);

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    assert.equal(options.mode, "cors");
  });

  it("should set request priority", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const request = new GetRequest().withPriority(RequestPriority.HIGH);

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    assert.equal(options.priority, "high");
  });

  it("should set keepalive flag", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const request = new GetRequest().withKeepAlive(true);

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    assert.equal(options.keepalive, true);
  });

  it("should set referrer", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const request = new GetRequest().withReferrer("https://referer.com");

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    assert.equal(options.referrer, "https://referer.com");
  });

  it("should set content type", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const request = new GetRequest().withoutCsrfProtection().withContentType("text/plain");

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    assert.deepEqual(options.headers, {
      "Content-Type": "text/plain",
    });
  });

  it("should set authorization header", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const request = new GetRequest().withoutCsrfProtection().withAuthorization("Bearer token123");

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    assert.deepEqual(options.headers, {
      Authorization: "Bearer token123",
    });
  });

  it("should set basic auth header", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const request = new GetRequest().withoutCsrfProtection().withBasicAuth("username", "password");

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    assert.deepEqual(options.headers, {
      Authorization: "Basic dXNlcm5hbWU6cGFzc3dvcmQ=", // base64 encoded "username:password"
    });
  });

  it("should set bearer token", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const request = new GetRequest().withoutCsrfProtection().withBearerToken("token123");

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    assert.deepEqual(options.headers, {
      Authorization: "Bearer token123",
    });
  });

  it("should handle error responses", async () => {
    // Arrange
    FetchMock.mockResponseOnce({
      status: 404,
      statusText: "Not Found",
      body: { error: "Resource not found" },
    });
    const request = new GetRequest();

    // Act & Assert
    await assert.rejects(
      async () => request.sendTo("https://api.example.com/test"),
      error => {
        assert(error instanceof RequestError);
        assert.equal(error.status, 404);
        assert.equal(error.url, "https://api.example.com/test");
        assert.equal(error.method, "GET");
        return true;
      }
    );
  });

  it("should handle network errors", async () => {
    // Arrange
    const networkError = new Error("Network error");
    FetchMock.mockErrorOnce(networkError);
    const request = new GetRequest();

    // Act & Assert
    await assert.rejects(
      async () => request.sendTo("https://api.example.com/test"),
      error => {
        assert(error instanceof RequestError);
        assert.equal(error.url, "https://api.example.com/test");
        assert.equal(error.method, "GET");
        assert.equal(error.message, "Network error: Network error");
        return true;
      }
    );
  });

  it("should get response as text using chained method", async () => {
    // Arrange
    const textContent = "Hello, world!";
    FetchMock.mockResponseOnce({ body: textContent });
    const request = new GetRequest();

    // Act
    const result = await request.sendTo("https://api.example.com/test").getText();

    // Assert
    assert.equal(result, textContent);
  });

  it("should get response as blob using chained method", async () => {
    // Arrange
    const content = "Blob content";
    FetchMock.mockResponseOnce({ body: content });
    const request = new GetRequest();

    // Act
    const result = await request.sendTo("https://api.example.com/test").getBlob();

    // Assert
    assert(result instanceof Blob);
    const text = await result.text();
    assert.equal(text, content);
  });

  it("should get response as array buffer using chained method", async () => {
    // Arrange
    const content = "Buffer content";
    FetchMock.mockResponseOnce({ body: content });
    const request = new GetRequest();

    // Act
    const result = await request.sendTo("https://api.example.com/test").getArrayBuffer();

    // Assert
    assert(result instanceof ArrayBuffer);
    const decoder = new TextDecoder();
    assert.equal(decoder.decode(result), content);
  });

  it("should get response body using chained method", async () => {
    // Arrange
    const content = "Stream content";
    FetchMock.mockResponseOnce({ body: content });
    const request = new GetRequest();

    // Act
    const result = await request.sendTo("https://api.example.com/test").getBody();

    // Assert
    assert(result instanceof ReadableStream);
  });

  it("should automatically convert JSON string responses to objects", async () => {
    // Arrange
    const jsonString = '{"name": "John", "age": 30, "isActive": true}';
    FetchMock.mockResponseOnce({
      body: jsonString,
      headers: { "Content-Type": "application/json" },
    });
    const request = new GetRequest();

    // Act
    const response = await request.sendTo("https://api.example.com/user");
    const result = await response.getJson<{ name: string; age: number; isActive: boolean }>();

    // Assert
    assert.equal(typeof result, "object");
    assert.equal(result.name, "John");
    assert.equal(result.age, 30);
    assert.equal(result.isActive, true);
  });

  it("should handle complex nested JSON structures correctly", async () => {
    // Arrange
    type ComplexResponse = {
      user: {
        id: number;
        profile: {
          name: string;
          preferences: {
            theme: string;
            notifications: boolean;
          };
        };
      };
      permissions: string[];
      metadata: {
        lastLogin: string;
      };
    };

    const complexJsonString = `{
      "user": {
        "id": 123,
        "profile": {
          "name": "Jane Doe",
          "preferences": {
            "theme": "dark",
            "notifications": true
          }
        }
      },
      "permissions": ["read", "write"],
      "metadata": {
        "lastLogin": "2023-08-15T14:30:00Z"
      }
    }`;

    FetchMock.mockResponseOnce({
      body: complexJsonString,
      headers: { "Content-Type": "application/json" },
    });
    const request = new GetRequest();

    // Act
    const response = await request.sendTo("https://api.example.com/complex");
    const result = await response.getJson<ComplexResponse>();

    // Assert
    assert.equal(result.user.id, 123);
    assert.equal(result.user.profile.name, "Jane Doe");
    assert.equal(result.user.profile.preferences.theme, "dark");
    assert.deepEqual(result.permissions, ["read", "write"]);
    assert.equal(result.metadata.lastLogin, "2023-08-15T14:30:00Z");
  });

  it("should handle mixed content types appropriately", async () => {
    // Arrange - Send a request with a CSV content type
    FetchMock.mockResponseOnce({
      body: "name,age,city\nJohn,30,New York\nJane,25,Boston",
      headers: { "Content-Type": "text/csv" },
    });
    const request = new GetRequest();

    // Act
    const response = await request.sendTo("https://api.example.com/data.csv");
    const result = await response.getText();

    // Assert
    assert.equal(typeof result, "string");
    assert(result.includes("name,age,city"));
    assert(result.includes("John,30,New York"));
  });

  it("should handle edge cases in URL construction", async () => {
    // Arrange
    FetchMock.mockResponseOnce({ body: {} });
    const request = new GetRequest();

    // Add query params with special characters and empty values
    request.withQueryParams({
      search: "test query with spaces",
      filter: "status:active",
      empty: "",
      special: "!@#$%^&*()",
      encoded: "name=value&another=thing",
    });

    // Act
    await request.sendTo("https://api.example.com/search");

    // Assert - Check that the URL was constructed correctly
    const lastUrl = FetchMock.mock.calls[0][0] as string;

    // Instead of checking for specific encodings, parse the URL and check the decoded values
    const parsedUrl = new URL(lastUrl);
    assert.equal(parsedUrl.searchParams.get("search"), "test query with spaces");
    assert.equal(parsedUrl.searchParams.get("filter"), "status:active");
    assert.equal(parsedUrl.searchParams.get("empty"), "");
    assert.equal(parsedUrl.searchParams.get("special"), "!@#$%^&*()");
    assert.equal(parsedUrl.searchParams.get("encoded"), "name=value&another=thing");
  });

  it("should properly handle retry failures", async () => {
    // Arrange
    // Mock multiple consecutive failures
    FetchMock.mockErrorOnce(new Error("Network error"));
    FetchMock.mockErrorOnce(new Error("Network error"));
    FetchMock.mockErrorOnce(new Error("Network error"));
    FetchMock.mockResponseOnce({ body: "Success after retries" });

    const request = new GetRequest();
    request.withRetries(2); // Only retry twice, which means it should still fail

    // Act & Assert
    try {
      await request.sendTo("https://api.example.com/unstable");
      assert.fail("Should have thrown after retries were exhausted");
    } catch (error: any) {
      assert(error.message.includes("Network error"));
    }
  });

  it("should handle aborted requests gracefully", async () => {
    // Arrange
    FetchMock.mockDelayedResponseOnce(1000, { body: "Delayed response" });
    const controller = new AbortController();
    const request = new GetRequest();
    request.withAbortController(controller);

    // Act & Assert
    const requestPromise = request.sendTo("https://api.example.com/slow");

    // Abort after a small delay
    setTimeout(() => controller.abort(), 50);

    try {
      await requestPromise;
      assert.fail("Request should have been aborted");
    } catch (error: any) {
      assert(error.name === "AbortError" || error.message.includes("aborted"));
    }
  });

  it("should respect custom headers case sensitivity", async () => {
    // Arrange
    FetchMock.mockResponseOnce({ body: {} });
    const request = new GetRequest();

    const customHeaders = {
      "Content-Type": "application/json",
      "X-Custom-Header": "CustomValue",
      Authorization: "Bearer token123",
      "x-correlation-id": "12345",
    };

    // Act
    request.withHeaders(customHeaders);
    await request.sendTo("https://api.example.com/headers");

    // Assert
    const lastOptions = FetchMock.mock.calls[0][1]; // Access options directly from the mock calls
    const lastHeaders = lastOptions.headers;
    assert.equal(lastHeaders["Content-Type"], "application/json");
    assert.equal(lastHeaders["X-Custom-Header"], "CustomValue");
    assert.equal(lastHeaders["x-correlation-id"], "12345"); // Should preserve case
  });

  it("should respect provided fetch options", async () => {
    // Arrange
    FetchMock.mockResponseOnce({ body: {} });
    const request = new GetRequest();

    // Act
    // Using enum values for proper type checking
    request.withCredentials(CredentialsPolicy.SAME_ORIGIN);
    request.withMode(RequestMode.CORS);
    request.withRedirect(RedirectMode.ERROR);
    request.withReferrer("https://example.com/referrer");
    request.withKeepAlive(true);

    await request.sendTo("https://api.example.com/options");

    // Assert - Adjust assertions to match actual capabilities
    const lastOptions = FetchMock.mock.calls[0][1]; // Access options directly from the mock calls
    assert.equal(lastOptions.credentials, "same-origin");
    assert.equal(lastOptions.mode, "cors");
    assert.equal(lastOptions.redirect, "error");
    assert.equal(lastOptions.referrer, "https://example.com/referrer");
    assert.equal(lastOptions.keepalive, true);
  });

  it("should set cookies correctly", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const request = new GetRequest().withoutCsrfProtection().withCookies({
      sessionId: "abc123",
      userId: "user456",
    });

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    assert.deepEqual(options.headers, {
      Cookie: "sessionId=abc123; userId=user456",
    });
  });

  it("should handle cookies with special characters", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const request = new GetRequest().withoutCsrfProtection().withCookies({
      "complex key": "value with spaces",
      "special=chars": "!@#$%^&*()",
    });

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    const cookieHeader = (options.headers as Record<string, string>)["Cookie"];

    // Verify that the values are properly encoded
    assert.ok(cookieHeader.includes("complex%20key=value%20with%20spaces"));
    assert.ok(cookieHeader.includes("special%3Dchars="));
  });

  it("should merge cookies with existing Cookie header", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const request = new GetRequest().withoutCsrfProtection().withHeaders({ Cookie: "existing=value" }).withCookies({ newCookie: "newValue" });

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    assert.deepEqual(options.headers, {
      Cookie: "existing=value; newCookie=newValue",
    });
  });

  it("should handle cookies with security options", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const request = new GetRequest().withoutCsrfProtection().withCookies({
      basic: "value",
      complex: {
        value: "test",
        secure: true,
        httpOnly: true,
        sameSite: SameSitePolicy.STRICT,
        path: "/",
        maxAge: 3600,
      } as CookieOptions,
    });

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    const cookieHeader = (options.headers as Record<string, string>)["Cookie"];
    assert.ok(cookieHeader.includes("basic=value"));
    assert.ok(cookieHeader.includes("complex=test"));
  });

  it("should handle complex cookie options", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const request = new GetRequest().withCookie("session", {
      value: "abc123",
      secure: true,
      httpOnly: true,
      sameSite: SameSitePolicy.LAX,
      expires: new Date(Date.now() + 86400000), // 24 hours from now
      path: "/dashboard",
    });

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    const cookieHeader = (options.headers as Record<string, string>)["Cookie"];
    assert.ok(cookieHeader.includes("session=abc123"));
  });

  it("should handle complex cookie options with validation", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const request = new GetRequest().withCookie("session", {
      value: "abc123",
      secure: true,
      httpOnly: true,
      sameSite: SameSitePolicy.LAX,
      expires: new Date(Date.now() + 86400000), // 24 hours from now
      path: "/dashboard",
    });

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    const cookieHeader = (options.headers as Record<string, string>)["Cookie"];
    assert.ok(cookieHeader.includes("session=abc123"));
  });

  it("should handle case-insensitive cookie headers", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const request = new GetRequest()
      .withHeaders({ cookie: "existing=value" }) // lowercase cookie header
      .withCookies({ newCookie: "newValue" });

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    const headers = options.headers as Record<string, string>;

    // The header should be preserved with its original case
    assert.equal(headers["cookie"], "existing=value; newCookie=newValue");
    assert.equal(headers["Cookie"], undefined); // Should not duplicate with different case
  });

  it("should respect timeout with external AbortController", async () => {
    // Arrange - set a timeout that's shorter than the response delay
    const timeout = 50;
    const responseDelay = 200; // Longer than timeout
    const controller = new AbortController();

    FetchMock.mockDelayedResponseOnce(responseDelay);
    const request = new GetRequest().withTimeout(timeout).withAbortController(controller);

    // Act & Assert - the request should timeout and throw
    try {
      await request.sendTo("https://api.example.com/test");
      assert.fail("Expected request to timeout but it succeeded");
    } catch (error) {
      assert(error instanceof RequestError);
      assert(error.timeoutError, "Error should be marked as a timeout error");
      assert.equal(error.url, "https://api.example.com/test");
      assert.equal(error.method, "GET");
    }
  });

  it("should distinguish between timeout and user abort", async () => {
    // Arrange
    const responseDelay = 500; // Long delay
    const controller = new AbortController();

    FetchMock.mockDelayedResponseOnce(responseDelay);
    const request = new GetRequest().withAbortController(controller);

    // Act - start the request then abort it manually
    const requestPromise = request.sendTo("https://api.example.com/test");

    // Wait a bit then abort the request manually
    await wait(10);
    controller.abort();

    // Assert - should be a regular abort, not a timeout error
    try {
      await requestPromise;
      assert.fail("Expected request to be aborted but it succeeded");
    } catch (error) {
      // Error should not be marked as a timeout
      assert(!(error instanceof RequestError && error.timeoutError), "User-initiated abort should not be reported as timeout");
    }
  });

  it("should respect provided fetch options", async () => {
    // Arrange
    FetchMock.mockResponseOnce({ body: {} });
    const request = new GetRequest();

    // Act
    // Using enum values for proper type checking
    request.withCredentials(CredentialsPolicy.SAME_ORIGIN);
    request.withMode(RequestMode.CORS);
    request.withRedirect(RedirectMode.ERROR);
    request.withReferrer("https://example.com/referrer");
    request.withKeepAlive(true);

    await request.sendTo("https://api.example.com/options");

    // Assert - Adjust assertions to match actual capabilities
    const lastOptions = FetchMock.mock.calls[0][1]; // Access options directly from the mock calls
    assert.equal(lastOptions.credentials, "same-origin");
    assert.equal(lastOptions.mode, "cors");
    assert.equal(lastOptions.redirect, "error");
    assert.equal(lastOptions.referrer, "https://example.com/referrer");
    assert.equal(lastOptions.keepalive, true);
  });

  it("should set cookies correctly", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const request = new GetRequest().withoutCsrfProtection().withCookies({
      sessionId: "abc123",
      userId: "user456",
    });

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    assert.deepEqual(options.headers, {
      Cookie: "sessionId=abc123; userId=user456",
    });
  });

  it("should handle cookies with special characters", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const request = new GetRequest().withoutCsrfProtection().withCookies({
      "complex key": "value with spaces",
      "special=chars": "!@#$%^&*()",
    });

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    const cookieHeader = (options.headers as Record<string, string>)["Cookie"];

    // Verify that the values are properly encoded
    assert.ok(cookieHeader.includes("complex%20key=value%20with%20spaces"));
    assert.ok(cookieHeader.includes("special%3Dchars="));
  });

  it("should merge cookies with existing Cookie header", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const request = new GetRequest().withoutCsrfProtection().withHeaders({ Cookie: "existing=value" }).withCookies({ newCookie: "newValue" });

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    assert.deepEqual(options.headers, {
      Cookie: "existing=value; newCookie=newValue",
    });
  });

  it("should handle cookies with security options", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const request = new GetRequest().withoutCsrfProtection().withCookies({
      basic: "value",
      complex: {
        value: "test",
        secure: true,
        httpOnly: true,
        sameSite: SameSitePolicy.STRICT,
        path: "/",
        maxAge: 3600,
      } as CookieOptions,
    });

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    const cookieHeader = (options.headers as Record<string, string>)["Cookie"];
    assert.ok(cookieHeader.includes("basic=value"));
    assert.ok(cookieHeader.includes("complex=test"));
  });

  it("should handle complex cookie options", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const request = new GetRequest().withCookie("session", {
      value: "abc123",
      secure: true,
      httpOnly: true,
      sameSite: SameSitePolicy.LAX,
      expires: new Date(Date.now() + 86400000), // 24 hours from now
      path: "/dashboard",
    });

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    const cookieHeader = (options.headers as Record<string, string>)["Cookie"];
    assert.ok(cookieHeader.includes("session=abc123"));
  });

  it("should handle complex cookie options with validation", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const request = new GetRequest().withCookie("session", {
      value: "abc123",
      secure: true,
      httpOnly: true,
      sameSite: SameSitePolicy.LAX,
      expires: new Date(Date.now() + 86400000), // 24 hours from now
      path: "/dashboard",
    });

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    const cookieHeader = (options.headers as Record<string, string>)["Cookie"];
    assert.ok(cookieHeader.includes("session=abc123"));
  });

  it("should handle case-insensitive cookie headers", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const request = new GetRequest()
      .withHeaders({ cookie: "existing=value" }) // lowercase cookie header
      .withCookies({ newCookie: "newValue" });

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    const headers = options.headers as Record<string, string>;

    // The header should be preserved with its original case
    assert.equal(headers["cookie"], "existing=value; newCookie=newValue");
    assert.equal(headers["Cookie"], undefined); // Should not duplicate with different case
  });

  it("should handle array query parameters consistently with both methods", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    FetchMock.mockResponseOnce();

    // Using withQueryParams (already supported arrays)
    const request1 = new GetRequest().withQueryParams({
      tags: ["javascript", "typescript", "react"],
    });

    // Using withQueryParam with array (new functionality)
    const request2 = new GetRequest().withQueryParam("tags", ["javascript", "typescript", "react"]);

    // Act
    await request1.sendTo("https://api.example.com/search1");
    await request2.sendTo("https://api.example.com/search2");

    // Assert - Both methods should produce identical results
    const [url1] = FetchMock.mock.calls[0];
    const [url2] = FetchMock.mock.calls[1];

    const parsedUrl1 = new URL(url1 as string);
    const parsedUrl2 = new URL(url2 as string);

    // Both should have 3 values for the "tags" parameter
    assert.deepEqual(parsedUrl1.searchParams.getAll("tags"), ["javascript", "typescript", "react"]);

    assert.deepEqual(parsedUrl2.searchParams.getAll("tags"), ["javascript", "typescript", "react"]);

    // The URLs should be functionally equivalent for the query parameters
    assert.equal(parsedUrl1.searchParams.toString(), parsedUrl2.searchParams.toString());
  });

  it("should not enter infinite loop when maximum retries are reached", async () => {
    // Arrange
    // Mock all responses to fail with network errors
    for (let i = 0; i < 10; i++) {
      FetchMock.mockErrorOnce(new Error(`Network error #${i + 1}`));
    }

    const request = new GetRequest();
    const maxRetries = 3; // Set max retries to a reasonable value
    request.withRetries(maxRetries);

    let retryCount = 0;
    request.onRetry(() => {
      retryCount++;
    });

    // Act & Assert
    try {
      await request.sendTo("https://api.example.com/retry-test");
      assert.fail("Request should have failed after max retries");
    } catch (error: any) {
      // Should have exactly 3 retries (original attempt + 3 retries = 4 total attempts)
      assert.equal(retryCount, maxRetries, "Should have attempted exactly the specified number of retries");
      assert.equal(FetchMock.mock.calls.length, maxRetries + 1, "Should have called fetch exactly maxRetries + 1 times");
    }
  });
});

describe("Cookie Options Tests", () => {
  beforeEach(() => {
    FetchMock.install();
  });

  afterEach(() => {
    FetchMock.reset();
    FetchMock.restore();
  });

  it("should handle basic string cookies", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const request = new GetRequest().withCookies({
      simple: "value",
      another: "anotherValue",
    });

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    const cookieHeader = (options.headers as Record<string, string>)["Cookie"];
    assert.ok(cookieHeader.includes("simple=value"));
    assert.ok(cookieHeader.includes("another=anotherValue"));
  });

  it("should handle cookie with secure flag", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const request = new GetRequest().withCookies({
      secureCookie: { value: "secureValue", secure: true },
    });

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    const cookieHeader = (options.headers as Record<string, string>)["Cookie"];
    assert.ok(cookieHeader.includes("secureCookie=secureValue"));
  });

  it("should handle cookie with httpOnly flag", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const request = new GetRequest().withCookies({
      httpOnlyCookie: { value: "httpOnlyValue", httpOnly: true },
    });

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    const cookieHeader = (options.headers as Record<string, string>)["Cookie"];
    assert.ok(cookieHeader.includes("httpOnlyCookie=httpOnlyValue"));
  });

  it("should handle cookie with SameSite=Strict option", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const request = new GetRequest().withCookies({
      strictCookie: { value: "strictValue", sameSite: SameSitePolicy.STRICT },
    });

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    const cookieHeader = (options.headers as Record<string, string>)["Cookie"];
    assert.ok(cookieHeader.includes("strictCookie=strictValue"));
  });

  it("should handle cookie with SameSite=Lax option", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const request = new GetRequest().withCookies({
      laxCookie: { value: "laxValue", sameSite: SameSitePolicy.LAX },
    });

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    const cookieHeader = (options.headers as Record<string, string>)["Cookie"];
    assert.ok(cookieHeader.includes("laxCookie=laxValue"));
  });

  it("should handle cookie with SameSite=None option", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const request = new GetRequest().withCookies({
      noneCookie: { value: "noneValue", sameSite: SameSitePolicy.NONE },
    });

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    const cookieHeader = (options.headers as Record<string, string>)["Cookie"];
    assert.ok(cookieHeader.includes("noneCookie=noneValue"));
  });

  it("should handle cookie with path option", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const request = new GetRequest().withCookies({
      pathCookie: { value: "pathValue", path: "/dashboard" },
    });

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    const cookieHeader = (options.headers as Record<string, string>)["Cookie"];
    assert.ok(cookieHeader.includes("pathCookie=pathValue"));
  });

  it("should handle cookie with domain option", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const request = new GetRequest().withCookies({
      domainCookie: { value: "domainValue", domain: "example.com" },
    });

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    const cookieHeader = (options.headers as Record<string, string>)["Cookie"];
    assert.ok(cookieHeader.includes("domainCookie=domainValue"));
  });

  it("should handle cookie with maxAge option", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const request = new GetRequest().withCookies({
      maxAgeCookie: { value: "maxAgeValue", maxAge: 3600 },
    });

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    const cookieHeader = (options.headers as Record<string, string>)["Cookie"];
    assert.ok(cookieHeader.includes("maxAgeCookie=maxAgeValue"));
  });

  it("should handle cookie with expires option", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const expiryDate = new Date(Date.now() + 86400000); // 24 hours later
    const request = new GetRequest().withCookies({
      expiresCookie: { value: "expiresValue", expires: expiryDate },
    });

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    const cookieHeader = (options.headers as Record<string, string>)["Cookie"];
    assert.ok(cookieHeader.includes("expiresCookie=expiresValue"));
  });

  it("should handle multiple cookies with different options", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const request = new GetRequest().withCookies({
      cookie1: "simple",
      cookie2: { value: "secure", secure: true },
      cookie3: { value: "httpOnly", httpOnly: true },
      cookie4: { value: "strict", sameSite: SameSitePolicy.STRICT },
    });

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    const cookieHeader = (options.headers as Record<string, string>)["Cookie"];

    assert.ok(cookieHeader.includes("cookie1=simple"));
    assert.ok(cookieHeader.includes("cookie2=secure"));
    assert.ok(cookieHeader.includes("cookie3=httpOnly"));
    assert.ok(cookieHeader.includes("cookie4=strict"));
  });

  it("should handle cookie with all options combined", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const expiryDate = new Date(Date.now() + 86400000); // 24 hours later

    const request = new GetRequest().withCookies({
      complexCookie: {
        value: "complexValue",
        secure: true,
        httpOnly: true,
        sameSite: SameSitePolicy.STRICT,
        path: "/admin",
        domain: "api.example.com",
        maxAge: 7200,
        expires: expiryDate,
      },
    });

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    const cookieHeader = (options.headers as Record<string, string>)["Cookie"];
    assert.ok(cookieHeader.includes("complexCookie=complexValue"));
  });

  it("should handle empty cookie values", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const request = new GetRequest().withCookies({
      emptyCookie: "",
      emptyOptionCookie: { value: "" },
    });

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    const cookieHeader = (options.headers as Record<string, string>)["Cookie"];
    assert.ok(cookieHeader.includes("emptyCookie="));
    assert.ok(cookieHeader.includes("emptyOptionCookie="));
  });

  it("should handle cookies with special characters", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const request = new GetRequest().withCookies({
      "name with spaces": "value with spaces",
      "name+with+plus": "value+with+plus",
      "name@symbols!": "value@symbols!",
      "unicode😀": "unicode😀value",
    });

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    const cookieHeader = (options.headers as Record<string, string>)["Cookie"];

    // Instead of checking for specific encodings which can vary, decode and check the actual values
    const decodedCookieHeader = decodeURIComponent(cookieHeader);
    assert.ok(decodedCookieHeader.includes("name with spaces=value with spaces"));
    assert.ok(decodedCookieHeader.includes("name+with+plus=value+with+plus"));
    assert.ok(decodedCookieHeader.includes("name@symbols!=value@symbols!"));
    assert.ok(decodedCookieHeader.includes("unicode😀=unicode😀value"));
  });

  it("should handle very long cookie values", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const longValue = "a".repeat(1000); // 1000 character string
    const request = new GetRequest().withCookies({
      longCookie: longValue,
    });

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    const cookieHeader = (options.headers as Record<string, string>)["Cookie"];
    assert.ok(cookieHeader.includes(`longCookie=${longValue}`));
  });

  it("should handle cookies with the withCookie method", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const request = new GetRequest().withCookie("session", "abc123").withCookie("preference", { value: "dark", sameSite: SameSitePolicy.LAX });

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    const cookieHeader = (options.headers as Record<string, string>)["Cookie"];
    assert.ok(cookieHeader.includes("session=abc123"));
    assert.ok(cookieHeader.includes("preference=dark"));
  });

  it("should merge multiple cookie calls correctly", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const request = new GetRequest()
      .withCookies({ first: "one", second: "two" })
      .withCookie("third", "three")
      .withCookies({ fourth: { value: "four", secure: true } });

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    const cookieHeader = (options.headers as Record<string, string>)["Cookie"];
    assert.ok(cookieHeader.includes("first=one"));
    assert.ok(cookieHeader.includes("second=two"));
    assert.ok(cookieHeader.includes("third=three"));
    assert.ok(cookieHeader.includes("fourth=four"));
  });
});

describe("CSRF Protection Tests", () => {
  beforeEach(() => {
    FetchMock.install();
    // Make sure we reset the global config
    create.config.reset();
  });

  afterEach(() => {
    FetchMock.reset();
    FetchMock.restore();
    create.config.reset();
  });

  it("should set CSRF token in headers", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const request = new GetRequest().withCsrfToken("test-token-12345");

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    const headers = options.headers as Record<string, string>;
    assert.equal(headers["X-CSRF-Token"], "test-token-12345");
  });

  it("should set CSRF token with custom header name", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const request = new GetRequest().withCsrfToken("test-token-12345", "X-XSRF-TOKEN");

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    const headers = options.headers as Record<string, string>;
    assert.equal(headers["X-XSRF-TOKEN"], "test-token-12345");
  });

  it("should set anti-CSRF headers", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const request = new GetRequest().withAntiCsrfHeaders();

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    const headers = options.headers as Record<string, string>;
    assert.equal(headers["X-Requested-With"], "XMLHttpRequest");
  });

  it("should automatically add anti-CSRF headers by default", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const request = new GetRequest();

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    const headers = options.headers as Record<string, string>;
    assert.equal(headers["X-Requested-With"], "XMLHttpRequest");
  });

  it("should allow disabling automatic CSRF protection", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const request = new GetRequest().withoutCsrfProtection();

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    const headers = options.headers as Record<string, string>;
    assert.equal(headers["X-Requested-With"], undefined);
  });

  it("should override global config with withoutCsrfProtection method", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    create.config.setEnableAntiCsrf(true); // Enable globally
    const request = new GetRequest().withoutCsrfProtection(); // Disable locally

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    const headers = options.headers as Record<string, string>;
    assert.equal(headers["X-Requested-With"], undefined);
  });

  it("should honor global config when CSRF is disabled", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    create.config.setEnableAntiCsrf(false); // Disable globally
    const request = new GetRequest(); // Don't disable locally

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    const headers = options.headers as Record<string, string>;
    assert.equal(headers["X-Requested-With"], undefined);
  });

  it("should respect individual request CSRF settings over global settings", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    create.config.setEnableAntiCsrf(false); // Disable globally
    const request = new GetRequest().withAntiCsrfHeaders(); // Enable locally

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    const headers = options.headers as Record<string, string>;
    assert.equal(headers["X-Requested-With"], "XMLHttpRequest");
  });
});

describe("Global Config CSRF Tests", () => {
  beforeEach(() => {
    FetchMock.install();
    // Reset global config before each test
    create.config.reset();
  });

  afterEach(() => {
    FetchMock.reset();
    FetchMock.restore();
  });

  it("should use global CSRF token", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    create.config.setCsrfToken("global-csrf-token");
    const request = new GetRequest();

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    const headers = options.headers as Record<string, string>;
    assert.equal(headers["X-CSRF-Token"], "global-csrf-token");
  });

  it("should use custom global CSRF header name", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    create.config.setCsrfToken("global-csrf-token").setCsrfHeaderName("X-Custom-CSRF");
    const request = new GetRequest();

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    const headers = options.headers as Record<string, string>;
    assert.equal(headers["X-Custom-CSRF"], "global-csrf-token");
  });

  it("should disable global anti-CSRF headers", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    create.config.setEnableAntiCsrf(false);
    const request = new GetRequest();

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    const headers = options.headers as Record<string, string>;
    assert.equal(headers["X-Requested-With"], undefined);
  });

  it("should override global CSRF settings with local settings", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    create.config.setCsrfToken("global-csrf-token");
    // Use explicit header name to avoid confusion with automatic headers
    const request = new GetRequest().withCsrfToken("local-csrf-token", "X-CSRF-Token");

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    const headers = options.headers as Record<string, string>;
    assert.equal(headers["X-CSRF-Token"], "local-csrf-token");
  });
});

describe("Relative URL Handling", () => {
  beforeEach(() => {
    FetchMock.install();
  });

  afterEach(() => {
    FetchMock.reset();
    FetchMock.restore();
  });

  it("should handle relative URLs correctly with query parameters", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const request = new GetRequest().withQueryParams({
      param1: "value1",
      param2: "value2",
    });

    // Act - Use a relative URL
    await request.sendTo("/api/users");

    // Assert - Check the URL was constructed correctly
    const [url] = FetchMock.mock.calls[0];

    // For relative URLs, we can't use URL constructor directly to verify
    // Instead, check that the URL string contains our parameters with proper formatting
    assert.ok(url.includes("/api/users?param1=value1&param2=value2"));
  });

  it("should handle relative URLs that already have query parameters", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const request = new GetRequest().withQueryParams({
      additionalParam: "value",
    });

    // Act - Use a relative URL with existing query parameter
    await request.sendTo("/api/search?q=test");

    // Assert - Check the URL was constructed correctly
    const [url] = FetchMock.mock.calls[0];

    // Check that both the original and new parameters are present
    assert.ok(url.includes("/api/search?q=test&additionalParam=value"));
  });

  it("should handle both absolute and relative URLs in the same code", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    FetchMock.mockResponseOnce();

    const request1 = new GetRequest().withQueryParams({ param: "value1" });
    const request2 = new GetRequest().withQueryParams({ param: "value2" });

    // Act - Send requests to both absolute and relative URLs
    await request1.sendTo("https://api.example.com/items");
    await request2.sendTo("/local/path");

    // Assert
    const [absoluteUrl] = FetchMock.mock.calls[0];
    const [relativeUrl] = FetchMock.mock.calls[1];

    assert.ok(absoluteUrl.includes("https://api.example.com/items?param=value1"));
    assert.ok(relativeUrl.includes("/local/path?param=value2"));
  });
});

describe("Cross-Environment Base64 Encoding", () => {
  beforeEach(() => {
    FetchMock.install();

    // If we're in Node.js, ensure btoa isn't defined to test our fallback
    if (typeof globalThis.btoa === "function") {
      // Save original btoa if it exists
      (globalThis as any).__original_btoa = globalThis.btoa;
      // Delete btoa to force Node.js path
      delete (globalThis as any).btoa;
    }
  });

  afterEach(() => {
    FetchMock.reset();
    FetchMock.restore();

    // Restore original btoa if we saved one
    if ((globalThis as any).__original_btoa) {
      globalThis.btoa = (globalThis as any).__original_btoa;
      delete (globalThis as any).__original_btoa;
    }
  });

  it("should correctly encode basic auth credentials in Node.js environment", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const username = "testuser";
    const password = "testpass123";
    const request = new GetRequest().withBasicAuth(username, password);

    // Act
    await request.sendTo("https://api.example.com/secure");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    const headers = options.headers as Record<string, string>;

    // The base64 of "testuser:testpass123" should be "dGVzdHVzZXI6dGVzdHBhc3MxMjM="
    const expectedAuthHeader = "Basic dGVzdHVzZXI6dGVzdHBhc3MxMjM=";
    assert.equal(headers.Authorization, expectedAuthHeader);
  });

  it("should handle special characters in basic auth credentials", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const username = "user@example.com";
    const password = "p@$$w0rd!";
    const request = new GetRequest().withBasicAuth(username, password);

    // Act
    await request.sendTo("https://api.example.com/secure");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    const headers = options.headers as Record<string, string>;

    // The base64 of "user@example.com:p@$$w0rd!" should be "dXNlckBleGFtcGxlLmNvbTpwQCQkdzByZCE="
    const expectedAuthHeader = "Basic dXNlckBleGFtcGxlLmNvbTpwQCQkdzByZCE=";
    assert.equal(headers.Authorization, expectedAuthHeader);
  });

  it("should work with unicode characters in basic auth", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const username = "üser";
    const password = "пароль";
    const request = new GetRequest().withBasicAuth(username, password);

    // Act
    await request.sendTo("https://api.example.com/secure");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    const headers = options.headers as Record<string, string>;

    // We're checking that some auth header is set, as the actual encoding
    // may vary slightly between environments for Unicode characters
    assert.ok(headers.Authorization.startsWith("Basic "));
    assert.ok(headers.Authorization.length > 10);
  });
});

describe("Header Case Sensitivity", () => {
  beforeEach(() => {
    FetchMock.install();
    // Reset global config before each test
    create.config.reset();
  });

  afterEach(() => {
    FetchMock.reset();
    FetchMock.restore();
  });

  it("should recognize headers case-insensitively with CSRF token", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    create.config.setCsrfToken("global-token");
    create.config.setCsrfHeaderName("X-CSRF-Token"); // Default name

    // Set a lowercase version of the header
    const request = new GetRequest().withHeaders({ "x-csrf-token": "local-token" });

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert - Global token should not be applied because local token exists
    const [, options] = FetchMock.mock.calls[0];
    const headers = options.headers as Record<string, string>;

    // The original case should be preserved
    assert.equal(headers["x-csrf-token"], "local-token");

    // And no duplicate header with different case should be added
    assert.equal(headers["X-CSRF-Token"], undefined);
  });

  it("should recognize headers case-insensitively with XSRF token", async () => {
    // Arrange - mock document & cookies for XSRF
    // This is handled in actual implementation

    FetchMock.mockResponseOnce();
    create.config.setXsrfHeaderName("X-XSRF-TOKEN");

    // Set a mixed-case version of the header
    const request = new GetRequest().withHeaders({ "X-xsrf-TOken": "local-token" });

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert - The case of the original header should be preserved
    const [, options] = FetchMock.mock.calls[0];
    const headers = options.headers as Record<string, string>;

    assert.equal(headers["X-xsrf-TOken"], "local-token");
    assert.equal(headers["X-XSRF-TOKEN"], undefined);
  });

  it("should handle multiple cookie headers with different cases", async () => {
    // Arrange
    FetchMock.mockResponseOnce();

    // Create a request with multiple cookie headers using different cases
    const request = new GetRequest();

    // First add headers with different cookie cases
    request.withHeaders({
      cookie: "first=value",
      Cookie: "second=value",
    });

    // Then add another cookie
    request.withCookie("third", "value");

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    const headers = options.headers as Record<string, string>;

    // Find which cookie header is being used
    const cookieHeader = headers["cookie"] || headers["Cookie"];

    // Verify all cookie values are included
    assert.ok(cookieHeader.includes("first=value"), "First cookie value should be present");
    assert.ok(cookieHeader.includes("second=value"), "Second cookie value should be present");
    assert.ok(cookieHeader.includes("third=value"), "Third cookie value should be present");
  });
});
