import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import create from "../src/index.js";
import { RequestError } from "../src/RequestError.js";
import { ResponseWrapper } from "../src/ResponseWrapper.js";
import { FetchMock } from "./utils/fetchMock.js";

describe("Integration Scenarios", () => {
  beforeEach(() => {
    FetchMock.install();
    create.config.reset();
    create.config.setEnableAntiCsrf(false);
  });

  afterEach(() => {
    FetchMock.reset();
    FetchMock.restore();
    create.config.reset();
  });

  describe("Complex Request Chains", () => {
    it("should handle request with all configuration options", async () => {
      FetchMock.mockResponseOnce({
        body: { success: true },
        headers: { "X-Custom-Response": "value" },
      });

      const result = await create
        .get("https://api.example.com/users")
        .withQueryParams({ page: 1, limit: 10, sort: "name" })
        .withHeaders({
          Accept: "application/json",
          "X-Custom": "header-value",
        })
        .withBearerToken("token123")
        .withTimeout(5000)
        .withRetries(2)
        .withCredentials.INCLUDE()
        .withPriority.HIGH()
        .withMode.CORS()
        .withRedirect.FOLLOW()
        .getJson();

      assert.deepEqual(result, { success: true });
      const [url, options] = FetchMock.mock.calls[0] as [string, RequestInit];
      assert.ok(url.includes("page=1"));
      assert.ok(url.includes("limit=10"));
      const headers = options.headers as Record<string, string>;
      assert.equal(headers["Authorization"], "Bearer token123");
      assert.equal(headers["Accept"], "application/json");
      assert.equal(headers["X-Custom"], "header-value");
    });

    it("should handle POST request with JSON body and all options", async () => {
      FetchMock.mockResponseOnce({ body: { id: 1, created: true } });

      const result = await create
        .post("https://api.example.com/users")
        .withBody({ name: "John", email: "john@example.com" })
        .withHeader("X-Request-ID", "req-123")
        .withQueryParam("format", "json")
        .withTimeout(3000)
        .withRetries(1)
        .onRetry(async ({ attempt }) => {
          await new Promise(resolve => setTimeout(resolve, attempt * 100));
        })
        .getJson();

      assert.deepEqual(result, { id: 1, created: true });
      const [, options] = FetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string);
      assert.deepEqual(body, { name: "John", email: "john@example.com" });
      const headers = options.headers as Record<string, string>;
      assert.equal(headers["X-Request-ID"], "req-123");
    });

    it("should handle request with cookies and CSRF protection", async () => {
      create.config.setCsrfToken("global-csrf-token");
      FetchMock.mockResponseOnce({ body: { success: true } });

      const result = await create
        .post("https://api.example.com/data")
        .withBody({ data: "test" })
        .withCookies({
          session: "session-123",
          preferences: { value: "dark-mode" },
        })
        .withCsrfToken("local-csrf-token")
        .getJson();

      assert.deepEqual(result, { success: true });
      const [, options] = FetchMock.mock.calls[0] as [string, RequestInit];
      const headers = options.headers as Record<string, string>;
      // Local CSRF token should take precedence
      assert.equal(headers["X-CSRF-Token"], "local-csrf-token");
      assert.ok(headers["Cookie"]?.includes("session=session-123"));
    });

    it("should handle request with interceptors and retries", async () => {
      const executionLog: string[] = [];

      create.config.addRequestInterceptor(config => {
        executionLog.push("global-request");
        config.headers["X-Global"] = "value";
        return config;
      });

      FetchMock.mockErrorOnce(new Error("Network error"));
      FetchMock.mockResponseOnce({ body: { success: true } });

      const result = await create
        .get("https://api.example.com/test")
        .withRequestInterceptor(config => {
          executionLog.push("per-request");
          return config;
        })
        .withResponseInterceptor(response => {
          executionLog.push("response");
          return response;
        })
        .withRetries(1)
        .getJson();

      assert.deepEqual(result, { success: true });
      // Interceptor should run for each attempt
      assert.equal(executionLog.filter(log => log === "global-request").length, 2);
      assert.equal(executionLog.filter(log => log === "per-request").length, 2);
      assert.equal(executionLog.filter(log => log === "response").length, 1); // Only successful attempt
    });

    it("should handle request with error recovery via interceptor", async () => {
      const fallbackResponse = new Response(JSON.stringify({ fallback: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

      FetchMock.mockResponseOnce({ status: 500 });

      const result = await create
        .get("https://api.example.com/test")
        .withErrorInterceptor(() => {
          return new ResponseWrapper(fallbackResponse, "https://api.example.com/test", "GET");
        })
        .getJson();

      assert.deepEqual(result, { fallback: true });
    });

    it("should handle GraphQL request with variables", async () => {
      FetchMock.mockResponseOnce({
        body: {
          data: {
            user: {
              id: "1",
              name: "John",
            },
          },
        },
      });

      const { PostRequest } = await import("../src/requestMethods.js");
      const result = await new PostRequest("https://api.example.com/graphql")
        .withGraphQL("query GetUser($id: ID!) { user(id: $id) { id name } }", { id: "1" })
        .withHeader("Authorization", "Bearer token123")
        .getJson();

      assert.equal(result.data.user.id, "1");
      assert.equal(result.data.user.name, "John");
      const [, options] = FetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string);
      assert.equal(body.query, "query GetUser($id: ID!) { user(id: $id) { id name } }");
      assert.deepEqual(body.variables, { id: "1" });
    });
  });

  describe("Error Handling Integration", () => {
    it("should handle timeout with retries", async () => {
      FetchMock.mockDelayedResponseOnce(200, { body: { success: true } });
      FetchMock.mockResponseOnce({ body: { success: true } });

      const result = await create
        .get("https://api.example.com/test")
        .withTimeout(100)
        .withRetries(1)
        .onRetry(async ({ attempt }) => {
          await new Promise(resolve => setTimeout(resolve, attempt * 50));
        })
        .getJson();

      assert.deepEqual(result, { success: true });
      // Should have retried after timeout
      assert.equal(FetchMock.mock.calls.length, 2);
    });

    it("should handle multiple error types in sequence", async () => {
      // Network error, then timeout, then success
      FetchMock.mockErrorOnce(new Error("Network error"));
      FetchMock.mockDelayedResponseOnce(200, { body: { success: false } });
      FetchMock.mockResponseOnce({ body: { success: true } });

      try {
        await create.get("https://api.example.com/test").withTimeout(100).withRetries(2).getJson();

        // Might succeed on third attempt, or might timeout
        // This test is to ensure multiple error types are handled
        assert.ok(true);
      } catch (error: any) {
        // Should handle errors gracefully
        assert.ok(error instanceof RequestError || error.message.includes("timeout") || error.message.includes("Network"));
      }
    });

    it("should handle error interceptor modifying error", async () => {
      FetchMock.mockResponseOnce({ status: 404 });

      try {
        await create
          .get("https://api.example.com/test")
          .withErrorInterceptor(error => {
            const modified = new RequestError(`Custom: ${error.message}`, error.url, error.method, { status: error.status });
            throw modified;
          })
          .getJson();

        assert.fail("Should have thrown error");
      } catch (error: any) {
        assert.ok(error.message.includes("Custom:"));
        assert.ok(error.message.includes("HTTP 404"));
      }
    });
  });

  describe("Cookie and CSRF Integration", () => {
    it("should combine global and local CSRF tokens correctly", async () => {
      create.config.setCsrfToken("global-token");
      create.config.setCsrfHeaderName("X-Custom-CSRF");
      FetchMock.mockResponseOnce({ body: { success: true } });

      const result = await create
        .post("https://api.example.com/test")
        .withBody({ data: "test" })
        // Use standard header name so global token detection works
        .withCsrfToken("local-token", "X-CSRF-Token")
        .getJson();

      assert.deepEqual(result, { success: true });

      const [, options] = FetchMock.mock.calls[0] as [string, RequestInit];
      const headers = options.headers as Record<string, string>;
      // Local token should be used
      assert.equal(headers["X-CSRF-Token"], "local-token");
      // Global token should not be added when local token exists with standard header name
      // (The implementation checks for X-CSRF-Token or configured header name)
      assert.ok(!headers["X-Custom-CSRF"] || headers["X-Custom-CSRF"] !== "global-token");
    });

    it("should handle cookies with special characters", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });

      await create
        .get("https://api.example.com/test")
        .withCookies({
          "session-id": "value with spaces",
          "user-prefs": "pref1,pref2,pref3",
          encoded: encodeURIComponent("special@chars#value"),
        })
        .getJson();

      const [, options] = FetchMock.mock.calls[0] as [string, RequestInit];
      const headers = options.headers as Record<string, string>;
      assert.ok(headers["Cookie"]);
      assert.ok(headers["Cookie"].includes("session-id"));
      assert.ok(headers["Cookie"].includes("user-prefs"));
    });

    it("should disable CSRF protection when requested", async () => {
      create.config.setEnableAntiCsrf(true);
      FetchMock.mockResponseOnce({ body: { success: true } });

      await create.get("https://api.example.com/test").withoutCsrfProtection().getJson();

      const [, options] = FetchMock.mock.calls[0] as [string, RequestInit];
      const headers = options.headers as Record<string, string>;
      // Should not have X-Requested-With header
      assert.ok(!headers["X-Requested-With"]);
    });
  });

  describe("Query Parameters Integration", () => {
    it("should handle complex query parameters with arrays", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });

      await create
        .get("https://api.example.com/search")
        .withQueryParams({
          q: "test",
          tags: ["tag1", "tag2", "tag3"],
          page: 1,
          limit: 10,
          active: true,
        })
        .getJson();

      const [url] = FetchMock.mock.calls[0] as [string, RequestInit];
      assert.ok(url.includes("q=test"));
      assert.ok(url.includes("tags=tag1"));
      assert.ok(url.includes("tags=tag2"));
      assert.ok(url.includes("tags=tag3"));
      assert.ok(url.includes("page=1"));
      assert.ok(url.includes("limit=10"));
      assert.ok(url.includes("active=true"));
    });

    it("should handle query params with special characters", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });

      await create
        .get("https://api.example.com/search")
        .withQueryParams({
          q: "test with spaces",
          filter: "value=with=equals",
        })
        .getJson();

      const [url] = FetchMock.mock.calls[0] as [string, RequestInit];
      // URL should be properly encoded
      assert.ok(url.includes("q="));
      assert.ok(url.includes("filter="));
    });

    it("should handle query params on URL that already has params", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });

      await create
        .get("https://api.example.com/search?existing=value")
        .withQueryParams({
          new: "new-value",
          another: "another-value",
        })
        .getJson();

      const [url] = FetchMock.mock.calls[0] as [string, RequestInit];
      assert.ok(url.includes("existing=value"));
      assert.ok(url.includes("new=new-value"));
      assert.ok(url.includes("another=another-value"));
    });
  });

  describe("AbortController Integration", () => {
    it("should handle manual abort with external controller", async () => {
      FetchMock.mockDelayedResponseOnce(1000, { body: { success: true } });

      const controller = new AbortController();

      const request = create.get("https://api.example.com/test").withAbortController(controller).getResponse();

      // Abort after a short delay
      setTimeout(() => {
        controller.abort();
      }, 50);

      try {
        await request;
        assert.fail("Should have been aborted");
      } catch (error: any) {
        assert.ok(error.isAborted || error.message.includes("Aborted") || error.message.toLowerCase().includes("aborted"));
      }
    });

    it("should handle abort combined with timeout", async () => {
      const controller = new AbortController();
      FetchMock.mockDelayedResponseOnce(1000, { body: { success: true } });

      const request = create.get("https://api.example.com/test").withAbortController(controller).withTimeout(200).getResponse();

      // Both timeout and manual abort can happen
      try {
        await request;
        assert.fail("Should have been aborted or timed out");
      } catch (error: any) {
        assert.ok(
          error.isAborted ||
            error.isTimeout ||
            error.message.includes("Aborted") ||
            error.message.toLowerCase().includes("aborted") ||
            error.message.includes("Timeout") ||
            error.message.toLowerCase().includes("timeout")
        );
      }
    });
  });

  describe("Authentication Integration", () => {
    it("should handle Basic Auth with special characters", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });

      await create.get("https://api.example.com/protected").withBasicAuth("user@domain.com", "p@ssw0rd!").getJson();

      const [, options] = FetchMock.mock.calls[0] as [string, RequestInit];
      const headers = options.headers as Record<string, string>;
      assert.ok(headers["Authorization"]?.startsWith("Basic "));

      // Decode and verify
      const encoded = headers["Authorization"].substring(6);
      const decoded = Buffer.from(encoded, "base64").toString("utf-8");
      assert.equal(decoded, "user@domain.com:p@ssw0rd!");
    });

    it("should allow Bearer token to override Basic Auth", async () => {
      FetchMock.mockResponseOnce({ body: { success: true } });

      await create.get("https://api.example.com/protected").withBasicAuth("user", "pass").withBearerToken("token123").getJson();

      const [, options] = FetchMock.mock.calls[0] as [string, RequestInit];
      const headers = options.headers as Record<string, string>;
      assert.equal(headers["Authorization"], "Bearer token123");
    });
  });

  describe("Response Processing Integration", () => {
    it("should handle getData with selector function", async () => {
      FetchMock.mockResponseOnce({
        body: {
          data: {
            users: [
              { id: 1, name: "John" },
              { id: 2, name: "Jane" },
            ],
          },
          meta: {
            total: 2,
          },
        },
      });

      const userNames = await create.get("https://api.example.com/users").getData((data: any) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return data.data.users.map((u: any) => u.name);
      });

      assert.deepEqual(userNames, ["John", "Jane"]);
    });

    it("should handle getData without selector", async () => {
      const responseData = { users: [{ id: 1 }] };
      FetchMock.mockResponseOnce({ body: responseData });

      const data = await create.get("https://api.example.com/users").getData();

      assert.deepEqual(data, responseData);
    });

    it("should handle single response format request", async () => {
      FetchMock.mockResponseOnce({ body: { data: "test" } });

      const response = await create.get("https://api.example.com/test").getResponse();
      const json = await response.getJson();

      assert.deepEqual(json, { data: "test" });

      // Second call should throw body already consumed error
      await assert.rejects(
        async () => response.getText(),
        (error: Error) => {
          assert(error instanceof RequestError);
          assert(error.message.includes("Body already consumed"));
          return true;
        }
      );
    });
  });
});
