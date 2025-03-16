import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { CredentialsPolicy, RequestMode, RedirectMode, RequestPriority } from "../src/enums";
import { RequestError } from "../src/RequestError";
import { GetRequest } from "../src/requestMethods";
import { FetchMock, wait } from "./utils/fetchMock";

describe("BaseRequest", () => {
  beforeEach(() => {
    FetchMock.install();
  });

  afterEach(() => {
    FetchMock.reset();
    FetchMock.restore();
  });

  it("should make a basic GET request", async () => {
    // Arrange
    const expectedResponse = { success: true };
    FetchMock.mockResponseOnce({ body: expectedResponse });
    const request = new GetRequest();

    // Act
    const result = await request.sendTo("https://api.example.com/test").json();

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
    const request = new GetRequest().withHeaders({
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
    const parsedUrl = new URL(url);
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
    const response = await request.sendTo("https://api.example.com/test").json();

    // Assert
    assert.deepEqual(response, { success: true });
    assert.equal(FetchMock.mock.calls.length, 2);
    assert.equal(retryCallbackCalled, true);
  });

  it("should not retry on timeout errors", async () => {
    // Arrange
    const timeout = 50;
    const responseDelay = 200; // Longer than timeout

    FetchMock.mockDelayedResponseOnce(responseDelay);

    let retryCallbackCalled = false;
    const request = new GetRequest()
      .withTimeout(timeout)
      .withRetries(1)
      .onRetry(() => {
        retryCallbackCalled = true;
      });

    // Act & Assert
    try {
      await request.sendTo("https://api.example.com/test");
      assert.fail("Expected request to timeout but it succeeded");
    } catch (error) {
      assert(error instanceof RequestError);
      assert(error.timeoutError);
      assert.equal(retryCallbackCalled, false); // Should not retry on timeouts
    }
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
    const request = new GetRequest().withContentType("text/plain");

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
    const request = new GetRequest().withAuthorization("Bearer token123");

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
    const request = new GetRequest().withBasicAuth("username", "password");

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
    const request = new GetRequest().withBearerToken("token123");

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
    const result = await request.sendTo("https://api.example.com/test").text();

    // Assert
    assert.equal(result, textContent);
  });

  it("should get response as blob using chained method", async () => {
    // Arrange
    const content = "Blob content";
    FetchMock.mockResponseOnce({ body: content });
    const request = new GetRequest();

    // Act
    const result = await request.sendTo("https://api.example.com/test").blob();

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
    const result = await request.sendTo("https://api.example.com/test").arrayBuffer();

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
    const result = await request.sendTo("https://api.example.com/test").body();

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
    const result = await response.json<{ name: string; age: number; isActive: boolean }>();

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
    const result = await response.json<ComplexResponse>();

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
    const result = await response.text();

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
    const request = new GetRequest().withCookies({
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
    const request = new GetRequest().withCookies({
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
    const request = new GetRequest()
      .withHeaders({ Cookie: "existing=value" })
      .withCookies({ newCookie: "newValue" });

    // Act
    await request.sendTo("https://api.example.com/test");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    assert.deepEqual(options.headers, {
      Cookie: "existing=value; newCookie=newValue",
    });
  });
});
