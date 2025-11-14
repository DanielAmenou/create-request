import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { PostRequest } from "../src/requestMethods.js";
import { RequestError } from "../src/RequestError.js";
import { FetchMock } from "./utils/fetchMock.js";

describe("GraphQL Error Handling", () => {
  beforeEach(() => {
    FetchMock.install();
  });

  describe("throwOnError: true", () => {
    it("should throw RequestError when GraphQL response contains errors", async () => {
      const graphQLErrors = [
        {
          message: "User not found",
          path: ["user"],
          locations: [{ line: 2, column: 3 }],
        },
      ];

      FetchMock.mockResponseOnce({
        status: 200,
        body: {
          data: null,
          errors: graphQLErrors,
        },
      });

      const query = "query GetUser($id: ID!) { user(id: $id) { name } }";
      const request = new PostRequest("https://api.example.com/graphql").withGraphQL(query, { id: "1" }, { throwOnError: true });

      await assert.rejects(
        async () => request.getJson(),
        (error: Error) => {
          assert.ok(error instanceof RequestError);
          return true;
        }
      );
    });

    it("should include formatted error message with path and location info", async () => {
      const graphQLErrors = [
        {
          message: "Field 'email' is required",
          path: ["user", "email"],
          locations: [{ line: 3, column: 5 }],
        },
      ];

      FetchMock.mockResponseOnce({
        status: 200,
        body: {
          data: null,
          errors: graphQLErrors,
        },
      });

      const query = "query { user { name email } }";
      const request = new PostRequest("https://api.example.com/graphql").withGraphQL(query, undefined, { throwOnError: true });

      try {
        await request.getJson();
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.ok(error instanceof RequestError);
        const reqError = error;
        assert.match(reqError.message, /GraphQL request failed/);
        assert.match(reqError.message, /Field 'email' is required/);
      }
    });

    it("should include error message with GraphQL error details", async () => {
      const graphQLErrors = [
        {
          message: "Authentication required",
          extensions: { code: "UNAUTHENTICATED" },
        },
      ];

      FetchMock.mockResponseOnce({
        status: 200,
        body: {
          data: null,
          errors: graphQLErrors,
        },
      });

      const query = "query { me { id } }";
      const request = new PostRequest("https://api.example.com/graphql").withGraphQL(query, undefined, { throwOnError: true });

      try {
        await request.getJson();
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.ok(error instanceof RequestError);
        const reqError = error;
        assert.match(reqError.message, /Authentication required/);
      }
    });

    it("should include status code in RequestError", async () => {
      const graphQLErrors = [{ message: "Server error" }];

      FetchMock.mockResponseOnce({
        status: 200,
        body: {
          data: null,
          errors: graphQLErrors,
        },
      });

      const query = "query { user { id } }";
      const request = new PostRequest("https://api.example.com/graphql").withGraphQL(query, undefined, { throwOnError: true });

      try {
        await request.getJson();
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.ok(error instanceof RequestError);
        const reqError = error;
        assert.equal(reqError.status, 200);
        assert.ok(reqError.response);
        assert.equal(reqError.response?.status, 200);
      }
    });

    it("should handle multiple GraphQL errors", async () => {
      const graphQLErrors = [
        {
          message: "Field 'name' is required",
          path: ["user", "name"],
        },
        {
          message: "Field 'email' is invalid",
          path: ["user", "email"],
        },
        {
          message: "Age must be positive",
          path: ["user", "age"],
        },
      ];

      FetchMock.mockResponseOnce({
        status: 200,
        body: {
          data: null,
          errors: graphQLErrors,
        },
      });

      const query = "mutation CreateUser($input: UserInput!) { createUser(input: $input) { id } }";
      const request = new PostRequest("https://api.example.com/graphql").withGraphQL(query, { input: { age: -5 } }, { throwOnError: true });

      try {
        await request.getJson();
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.ok(error instanceof RequestError);
        const reqError = error;
        assert.match(reqError.message, /Field 'name' is required, Field 'email' is invalid, Age must be positive/);
      }
    });

    it("should work with getData() method", async () => {
      const graphQLErrors = [
        {
          message: "Invalid query",
        },
      ];

      FetchMock.mockResponseOnce({
        status: 200,
        body: {
          data: null,
          errors: graphQLErrors,
        },
      });

      const query = "query { invalid }";
      const request = new PostRequest("https://api.example.com/graphql").withGraphQL(query, undefined, { throwOnError: true });

      await assert.rejects(
        async () => request.getData(),
        (error: Error) => error instanceof RequestError
      );
    });

    it("should work with getResponse().getJson() chain", async () => {
      const graphQLErrors = [
        {
          message: "Rate limit exceeded",
        },
      ];

      FetchMock.mockResponseOnce({
        status: 200,
        body: {
          data: null,
          errors: graphQLErrors,
        },
      });

      const query = "query { user { id } }";
      const request = new PostRequest("https://api.example.com/graphql").withGraphQL(query, undefined, { throwOnError: true });

      const response = await request.getResponse();
      await assert.rejects(
        async () => response.getJson(),
        (error: Error) => error instanceof RequestError
      );
    });

    it("should throw when errors array exists even with partial data", async () => {
      FetchMock.mockResponseOnce({
        status: 200,
        body: {
          data: {
            user: { id: "1", name: "John" },
          },
          errors: [
            {
              message: "Email field failed to resolve",
              path: ["user", "email"],
            },
          ],
        },
      });

      const query = "query { user { id name email } }";
      const request = new PostRequest("https://api.example.com/graphql").withGraphQL(query, undefined, { throwOnError: true });

      await assert.rejects(
        async () => request.getJson(),
        (error: Error) => {
          assert.match(error.message, /Email field failed to resolve/);
          return true;
        }
      );
    });

    it("should handle errors with extensions properly", async () => {
      const graphQLErrors = [
        {
          message: "Forbidden",
          extensions: {
            code: "FORBIDDEN",
            timestamp: "2024-01-01T00:00:00Z",
            details: { reason: "Insufficient permissions" },
          },
        },
      ];

      FetchMock.mockResponseOnce({
        status: 200,
        body: {
          data: null,
          errors: graphQLErrors,
        },
      });

      const query = "query { secretData }";
      const request = new PostRequest("https://api.example.com/graphql").withGraphQL(query, undefined, { throwOnError: true });

      try {
        await request.getJson();
        assert.fail("Should have thrown an error");
      } catch (error) {
        const reqError = error as RequestError;
        assert.match(reqError.message, /Forbidden/);
      }
    });

    it("should handle GraphQL errors as strings (non-standard format)", async () => {
      // Some GraphQL APIs return errors as strings instead of objects
      const graphQLErrors = ['Cannot query field "test" on type "filterItem".', "Syntax error in query"];

      FetchMock.mockResponseOnce({
        status: 200,
        body: {
          data: null,
          errors: graphQLErrors,
        },
      });

      const query = "query { test }";
      const request = new PostRequest("https://api.example.com/graphql").withGraphQL(query, undefined, { throwOnError: true });

      try {
        await request.getJson();
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.ok(error instanceof RequestError);
        const reqError = error;
        assert.match(reqError.message, /GraphQL request failed/);
        assert.match(reqError.message, /Cannot query field "test" on type "filterItem"., Syntax error in query/);
      }
    });
  });

  describe("throwOnError: false (default)", () => {
    it("should NOT throw when GraphQL response contains errors", async () => {
      FetchMock.mockResponseOnce({
        status: 200,
        body: {
          data: null,
          errors: [{ message: "Something went wrong" }],
        },
      });

      const query = "query { user { id } }";
      const request = new PostRequest("https://api.example.com/graphql").withGraphQL(query);

      const result = await request.getJson<{ data: unknown; errors: unknown[] }>();
      assert.ok(result.errors);
      assert.equal(result.errors.length, 1);
    });

    it("should return response with errors field when throwOnError not specified", async () => {
      const graphQLErrors = [
        {
          message: "User not found",
          path: ["user"],
        },
      ];

      FetchMock.mockResponseOnce({
        status: 200,
        body: {
          data: null,
          errors: graphQLErrors,
        },
      });

      const query = "query GetUser($id: ID!) { user(id: $id) { name } }";
      const request = new PostRequest("https://api.example.com/graphql").withGraphQL(query, { id: "999" });

      const result = await request.getJson<{ data: unknown; errors: { message: string; path?: string[] }[] }>();
      assert.ok(result.errors);
      assert.equal(result.errors[0].message, "User not found");
    });

    it("should allow manual error handling", async () => {
      FetchMock.mockResponseOnce({
        status: 200,
        body: {
          data: { users: [] },
          errors: [{ message: "No users found" }],
        },
      });

      const query = "query { users { id } }";
      const request = new PostRequest("https://api.example.com/graphql").withGraphQL(query);

      const result = await request.getJson<{ data: { users: unknown[] }; errors?: { message: string }[] }>();

      // Manual error handling
      if (result.errors && result.errors.length > 0) {
        assert.equal(result.errors[0].message, "No users found");
      }
      assert.equal(result.data.users.length, 0);
    });

    it("should work with throwOnError explicitly set to false", async () => {
      FetchMock.mockResponseOnce({
        status: 200,
        body: {
          data: null,
          errors: [{ message: "Error occurred" }],
        },
      });

      const query = "query { test }";
      const request = new PostRequest("https://api.example.com/graphql").withGraphQL(query, undefined, { throwOnError: false });

      const result = await request.getJson<{ data: unknown; errors: unknown[] }>();
      assert.ok(result.errors);
      assert.equal(result.errors.length, 1);
    });
  });

  describe("GraphQL error handling on response", () => {
    it("should check for errors on JSON response", async () => {
      FetchMock.mockResponseOnce({
        status: 200,
        body: {
          data: null,
          errors: [{ message: "GraphQL error" }],
        },
      });

      const query = "query { user { id } }";
      const request = new PostRequest("https://api.example.com/graphql").withGraphQL(query, undefined, { throwOnError: true });

      const response = await request.getResponse();

      // First call should throw
      await assert.rejects(
        async () => response.getJson(),
        (error: Error) => {
          assert.match(error.message, /GraphQL error/);
          return true;
        }
      );

      // Second call should throw body already consumed error
      await assert.rejects(
        async () => response.getJson(),
        (error: Error) => {
          assert.match(error.message, /Body already consumed/);
          return true;
        }
      );
    });

    it("should handle response with no errors", async () => {
      FetchMock.mockResponseOnce({
        status: 200,
        body: {
          data: { user: { id: "1", name: "John" } },
        },
      });

      const query = "query { user { id name } }";
      const request = new PostRequest("https://api.example.com/graphql").withGraphQL(query, undefined, { throwOnError: true });

      const response = await request.getResponse();

      // First call should succeed
      const result1 = await response.getJson();
      assert.ok(Object.hasOwn(result1, "data"));

      // Second call should throw body already consumed error
      await assert.rejects(
        async () => response.getJson(),
        (error: Error) => {
          assert.match(error.message, /Body already consumed/);
          return true;
        }
      );
    });
  });

  describe("Edge cases", () => {
    it("should not throw for empty errors array", async () => {
      FetchMock.mockResponseOnce({
        status: 200,
        body: {
          data: { user: { id: "1" } },
          errors: [],
        },
      });

      const query = "query { user { id } }";
      const request = new PostRequest("https://api.example.com/graphql").withGraphQL(query, undefined, { throwOnError: true });

      const result = await request.getJson();
      assert.ok(Object.hasOwn(result, "data"));
    });

    it("should not throw when errors field is missing", async () => {
      FetchMock.mockResponseOnce({
        status: 200,
        body: {
          data: { user: { id: "1" } },
        },
      });

      const query = "query { user { id } }";
      const request = new PostRequest("https://api.example.com/graphql").withGraphQL(query, undefined, { throwOnError: true });

      const result = await request.getJson();
      assert.ok(Object.hasOwn(result, "data"));
    });

    it("should not throw when errors is null", async () => {
      FetchMock.mockResponseOnce({
        status: 200,
        body: {
          data: { user: { id: "1" } },
          errors: null,
        },
      });

      const query = "query { user { id } }";
      const request = new PostRequest("https://api.example.com/graphql").withGraphQL(query, undefined, { throwOnError: true });

      const result = await request.getJson();
      assert.ok(Object.hasOwn(result, "data"));
    });

    it("should handle error without path or locations", async () => {
      FetchMock.mockResponseOnce({
        status: 200,
        body: {
          data: null,
          errors: [{ message: "Generic error" }],
        },
      });

      const query = "query { test }";
      const request = new PostRequest("https://api.example.com/graphql").withGraphQL(query, undefined, { throwOnError: true });

      try {
        await request.getJson();
        assert.fail("Should have thrown an error");
      } catch (error) {
        const reqError = error as RequestError;
        assert.match(reqError.message, /Generic error/);
      }
    });

    it("should handle invalid GraphQL options object", () => {
      const query = "query { user { id } }";

      assert.throws(
        () => {
          // @ts-expect-error - Testing invalid GraphQL options
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          new PostRequest("https://api.example.com/graphql").withGraphQL(query, undefined, [] as any);
        },
        (error: Error) => {
          assert.match(error.message, /Invalid GraphQL options/);
          return true;
        }
      );

      assert.throws(
        () => {
          // @ts-expect-error - Testing invalid GraphQL options
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          new PostRequest("https://api.example.com/graphql").withGraphQL(query, undefined, null as any);
        },
        (error: Error) => {
          assert.match(error.message, /Invalid GraphQL options/);
          return true;
        }
      );
    });

    it("should handle non-GraphQL JSON responses gracefully", async () => {
      FetchMock.mockResponseOnce({
        status: 200,
        body: {
          result: "success",
          message: "Operation completed",
        },
      });

      const query = "query { user { id } }";
      const request = new PostRequest("https://api.example.com/graphql").withGraphQL(query, undefined, { throwOnError: true });

      // Should not throw for non-GraphQL responses
      const result = await request.getJson<{ result: string; message: string }>();
      assert.equal(result.result, "success");
    });
  });

  describe("Error formatting", () => {
    it("should format errors with multiple locations", async () => {
      FetchMock.mockResponseOnce({
        status: 200,
        body: {
          data: null,
          errors: [
            {
              message: "Syntax error",
              locations: [
                { line: 1, column: 5 },
                { line: 2, column: 10 },
              ],
            },
          ],
        },
      });

      const query = "query { invalid syntax }";
      const request = new PostRequest("https://api.example.com/graphql").withGraphQL(query, undefined, { throwOnError: true });

      try {
        await request.getJson();
        assert.fail("Should have thrown an error");
      } catch (error) {
        const reqError = error as RequestError;
        assert.match(reqError.message, /Syntax error/);
      }
    });

    it("should format errors with nested path", async () => {
      FetchMock.mockResponseOnce({
        status: 200,
        body: {
          data: null,
          errors: [
            {
              message: "Cannot resolve field",
              path: ["user", "posts", 0, "comments", "author"],
            },
          ],
        },
      });

      const query = "query { user { posts { comments { author { id } } } } }";
      const request = new PostRequest("https://api.example.com/graphql").withGraphQL(query, undefined, { throwOnError: true });

      try {
        await request.getJson();
        assert.fail("Should have thrown an error");
      } catch (error) {
        const reqError = error as RequestError;
        assert.match(reqError.message, /Cannot resolve field/);
      }
    });

    it("should handle GraphQL errors with no message property", async () => {
      FetchMock.mockResponseOnce({
        status: 200,
        body: {
          data: null,
          errors: [
            {
              code: "ERROR_CODE",
              path: ["user"],
            },
          ],
        },
      });

      const query = "query { user { id } }";
      const request = new PostRequest("https://api.example.com/graphql").withGraphQL(query, undefined, { throwOnError: true });

      try {
        await request.getJson();
        assert.fail("Should have thrown an error");
      } catch (error) {
        const reqError = error as RequestError;
        assert.match(reqError.message, /GraphQL request failed/);
        assert.equal(reqError.status, 200);
        assert.ok(reqError.response);
      }
    });

    it("should handle GraphQL errors with null message (uses Unknown error)", async () => {
      FetchMock.mockResponseOnce({
        status: 200,
        body: {
          data: null,
          errors: [
            {
              message: null,
              code: "ERROR_CODE",
            },
          ],
        },
      });

      const query = "query { user { id } }";
      const request = new PostRequest("https://api.example.com/graphql").withGraphQL(query, undefined, { throwOnError: true });

      try {
        await request.getJson();
        assert.fail("Should have thrown an error");
      } catch (error) {
        const reqError = error as RequestError;
        assert.match(reqError.message, /Unknown error/);
        assert.equal(reqError.status, 200);
        assert.ok(reqError.response);
      }
    });

    it("should handle GraphQL errors that are neither strings nor objects with message", async () => {
      FetchMock.mockResponseOnce({
        status: 200,
        body: {
          data: null,
          errors: [123, true, null],
        },
      });

      const query = "query { user { id } }";
      const request = new PostRequest("https://api.example.com/graphql").withGraphQL(query, undefined, { throwOnError: true });

      try {
        await request.getJson();
        assert.fail("Should have thrown an error");
      } catch (error) {
        const reqError = error as RequestError;
        assert.match(reqError.message, /GraphQL request failed/);
        assert.equal(reqError.status, 200);
        assert.ok(reqError.response);
      }
    });
  });
});
