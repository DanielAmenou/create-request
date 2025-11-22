import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { ResponseWrapper } from "../src/ResponseWrapper.js";
import { RequestError } from "../src/RequestError.js";
import { createMockResponse } from "./utils/fetchMock.js";
import { PostRequest } from "../src/requestMethods.js";
import { FetchMock } from "./utils/fetchMock.js";

describe("Body Cache - Multiple Consumption", { timeout: 10000 }, () => {
  describe("getJson() - Multiple Calls", () => {
    it("should allow calling getJson() multiple times with cached result", async () => {
      const response = createMockResponse({
        body: { name: "John", age: 30 },
        headers: { "content-type": "application/json" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/test", "GET");

      // First call
      const result1 = await wrapper.getJson<{ name: string; age: number }>();
      assert.deepEqual(result1, { name: "John", age: 30 });

      // Second call - should use cache
      const result2 = await wrapper.getJson<{ name: string; age: number }>();
      assert.deepEqual(result2, { name: "John", age: 30 });

      // Third call - should use cache
      const result3 = await wrapper.getJson<{ name: string; age: number }>();
      assert.deepEqual(result3, { name: "John", age: 30 });

      // All results should be the same object reference (cached)
      assert.strictEqual(result1, result2);
      assert.strictEqual(result2, result3);
    });

    it("should cache getJson() result for complex nested objects", async () => {
      const complexData = {
        users: [
          { id: 1, name: "John", metadata: { role: "admin", permissions: ["read", "write"] } },
          { id: 2, name: "Jane", metadata: { role: "user", permissions: ["read"] } },
        ],
        meta: { total: 2, page: 1 },
      };

      const response = createMockResponse({
        body: complexData,
        headers: { "content-type": "application/json" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/users", "GET");

      // Call multiple times
      const result1 = await wrapper.getJson();
      const result2 = await wrapper.getJson();
      const result3 = await wrapper.getJson();

      assert.deepEqual(result1, complexData);
      assert.deepEqual(result2, complexData);
      assert.deepEqual(result3, complexData);

      // Should be the same cached object
      assert.strictEqual(result1, result2);
      assert.strictEqual(result2, result3);
    });

    it("should cache getJson() result for arrays", async () => {
      const arrayData = [1, 2, 3, { nested: "value" }, [4, 5]];

      const response = createMockResponse({
        body: arrayData,
        headers: { "content-type": "application/json" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/data", "GET");

      const result1 = await wrapper.getJson();
      const result2 = await wrapper.getJson();
      const result3 = await wrapper.getJson();

      assert.deepEqual(result1, arrayData);
      assert.strictEqual(result1, result2);
      assert.strictEqual(result2, result3);
    });

    it("should cache getJson() result for null values", async () => {
      const response = createMockResponse({
        body: null,
        headers: { "content-type": "application/json" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/data", "GET");

      const result1 = await wrapper.getJson();
      const result2 = await wrapper.getJson();

      assert.strictEqual(result1, null);
      assert.strictEqual(result2, null);
      assert.strictEqual(result1, result2);
    });

    it("should cache getJson() result for empty objects", async () => {
      const response = createMockResponse({
        body: {},
        headers: { "content-type": "application/json" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/data", "GET");

      const result1 = await wrapper.getJson();
      const result2 = await wrapper.getJson();

      assert.deepEqual(result1, {});
      assert.strictEqual(result1, result2);
    });

    it("should cache getJson() result and allow type-safe access", async () => {
      interface User {
        id: number;
        name: string;
        email: string;
      }

      const userData: User = { id: 1, name: "John", email: "john@example.com" };

      const response = createMockResponse({
        body: userData,
        headers: { "content-type": "application/json" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/user", "GET");

      // Multiple calls with type safety
      const user1 = await wrapper.getJson<User>();
      const user2 = await wrapper.getJson<User>();
      const user3 = await wrapper.getJson<User>();

      assert.equal(user1.id, 1);
      assert.equal(user1.name, "John");
      assert.equal(user1.email, "john@example.com");

      assert.strictEqual(user1, user2);
      assert.strictEqual(user2, user3);
    });
  });

  describe("getText() - Multiple Calls", () => {
    it("should allow calling getText() multiple times with cached result", async () => {
      const textContent = "Hello, World! This is a test response.";
      const response = createMockResponse({
        body: textContent,
        headers: { "content-type": "text/plain" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/text", "GET");

      // First call
      const result1 = await wrapper.getText();
      assert.equal(result1, textContent);

      // Second call - should use cache
      const result2 = await wrapper.getText();
      assert.equal(result2, textContent);

      // Third call - should use cache
      const result3 = await wrapper.getText();
      assert.equal(result3, textContent);

      // All results should be the same string
      assert.strictEqual(result1, result2);
      assert.strictEqual(result2, result3);
    });

    it("should cache getText() result for empty strings", async () => {
      const response = createMockResponse({
        body: "",
        headers: { "content-type": "text/plain" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/empty", "GET");

      const result1 = await wrapper.getText();
      const result2 = await wrapper.getText();

      assert.equal(result1, "");
      assert.strictEqual(result1, result2);
    });

    it("should cache getText() result for large text content", async () => {
      const largeText = "A".repeat(10000);
      const response = createMockResponse({
        body: largeText,
        headers: { "content-type": "text/plain" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/large", "GET");

      const result1 = await wrapper.getText();
      const result2 = await wrapper.getText();

      assert.equal(result1.length, 10000);
      assert.strictEqual(result1, result2);
    });

    it("should cache getText() result for multiline content", async () => {
      const multilineText = "Line 1\nLine 2\nLine 3\nLine 4";
      const response = createMockResponse({
        body: multilineText,
        headers: { "content-type": "text/plain" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/multiline", "GET");

      const result1 = await wrapper.getText();
      const result2 = await wrapper.getText();

      assert.equal(result1, multilineText);
      assert.strictEqual(result1, result2);
    });
  });

  describe("getBlob() - Multiple Calls", () => {
    it("should allow calling getBlob() multiple times with cached result", async () => {
      const content = "Blob content data";
      const response = createMockResponse({
        body: content,
        headers: { "content-type": "application/octet-stream" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/blob", "GET");

      // First call
      const blob1 = await wrapper.getBlob();
      assert.ok(blob1 instanceof Blob);

      // Second call - should use cache
      const blob2 = await wrapper.getBlob();
      assert.ok(blob2 instanceof Blob);

      // Third call - should use cache
      const blob3 = await wrapper.getBlob();
      assert.ok(blob3 instanceof Blob);

      // All should be the same cached blob
      assert.strictEqual(blob1, blob2);
      assert.strictEqual(blob2, blob3);

      // Verify content is the same
      const text1 = await blob1.text();
      const text2 = await blob2.text();
      const text3 = await blob3.text();

      assert.equal(text1, content);
      assert.equal(text2, content);
      assert.equal(text3, content);
    });

    it("should cache getBlob() result for binary data", async () => {
      const binaryData = new Uint8Array([0, 1, 2, 3, 255, 254, 253]);
      const response = createMockResponse({
        body: binaryData.buffer,
        headers: { "content-type": "application/octet-stream" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/binary", "GET");

      const blob1 = await wrapper.getBlob();
      const blob2 = await wrapper.getBlob();

      assert.strictEqual(blob1, blob2);
    });
  });

  describe("getArrayBuffer() - Multiple Calls", () => {
    it("should allow calling getArrayBuffer() multiple times with cached result", async () => {
      const content = "ArrayBuffer content";
      const response = createMockResponse({
        body: content,
        headers: { "content-type": "application/octet-stream" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/buffer", "GET");

      // First call
      const buffer1 = await wrapper.getArrayBuffer();
      assert.ok(buffer1 instanceof ArrayBuffer);

      // Second call - should use cache
      const buffer2 = await wrapper.getArrayBuffer();
      assert.ok(buffer2 instanceof ArrayBuffer);

      // Third call - should use cache
      const buffer3 = await wrapper.getArrayBuffer();
      assert.ok(buffer3 instanceof ArrayBuffer);

      // All should be the same cached buffer
      assert.strictEqual(buffer1, buffer2);
      assert.strictEqual(buffer2, buffer3);

      // Verify content is the same
      const decoder = new TextDecoder();
      const text1 = decoder.decode(buffer1);
      const text2 = decoder.decode(buffer2);
      const text3 = decoder.decode(buffer3);

      assert.equal(text1, content);
      assert.equal(text2, content);
      assert.equal(text3, content);
    });

    it("should cache getArrayBuffer() result for binary data", async () => {
      const binaryData = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
      const response = createMockResponse({
        body: binaryData.buffer,
        headers: { "content-type": "application/octet-stream" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/binary", "GET");

      const buffer1 = await wrapper.getArrayBuffer();
      const buffer2 = await wrapper.getArrayBuffer();

      assert.strictEqual(buffer1, buffer2);
    });
  });

  describe("getData() - Multiple Calls", () => {
    it("should allow calling getData() multiple times with cached JSON", async () => {
      const data = { users: [{ id: 1, name: "John" }], count: 1 };
      const response = createMockResponse({
        body: data,
        headers: { "content-type": "application/json" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/data", "GET");

      // First call with selector
      const users1 = await wrapper.getData(d => d.users);
      assert.deepEqual(users1, [{ id: 1, name: "John" }]);

      // Second call with same selector - should use cached JSON
      const users2 = await wrapper.getData(d => d.users);
      assert.deepEqual(users2, [{ id: 1, name: "John" }]);

      // Third call with different selector - should still use cached JSON
      const count1 = await wrapper.getData(d => d.count);
      assert.equal(count1, 1);

      // Fourth call with no selector - should use cached JSON
      const fullData = await wrapper.getData();
      assert.deepEqual(fullData, data);
    });

    it("should cache JSON when calling getData() multiple times with different selectors", async () => {
      const data = {
        meta: { total: 100, page: 1 },
        items: [{ id: 1 }, { id: 2 }],
        status: "success",
      };

      const response = createMockResponse({
        body: data,
        headers: { "content-type": "application/json" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/data", "GET");

      // Multiple calls with different selectors
      const meta = await wrapper.getData(d => d.meta);
      const items = await wrapper.getData(d => d.items);
      const status = await wrapper.getData(d => d.status);
      const full = await wrapper.getData();

      // All should work because JSON is cached
      assert.deepEqual(meta, { total: 100, page: 1 });
      assert.deepEqual(items, [{ id: 1 }, { id: 2 }]);
      assert.equal(status, "success");
      assert.deepEqual(full, data);
    });

    it("should allow calling getData() without selector multiple times", async () => {
      const data = { result: "success", data: { value: 42 } };
      const response = createMockResponse({
        body: data,
        headers: { "content-type": "application/json" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/data", "GET");

      const result1 = await wrapper.getData();
      const result2 = await wrapper.getData();
      const result3 = await wrapper.getData();

      assert.deepEqual(result1, data);
      assert.strictEqual(result1, result2);
      assert.strictEqual(result2, result3);
    });
  });

  describe("Mixed Usage Patterns", () => {
    it("should cache JSON and allow multiple getData() calls with same selector function", async () => {
      const data = { users: [{ id: 1, name: "John" }] };
      const response = createMockResponse({
        body: data,
        headers: { "content-type": "application/json" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/users", "GET");

      // Define selector function once
      const getUserNames = (d: { users: { name: string }[] }) => d.users.map(u => u.name);

      // Call multiple times with same function
      const names1 = await wrapper.getData(getUserNames);
      const names2 = await wrapper.getData(getUserNames);
      const names3 = await wrapper.getData(getUserNames);

      assert.deepEqual(names1, ["John"]);
      assert.deepEqual(names2, ["John"]);
      assert.deepEqual(names3, ["John"]);
    });

    it("should cache JSON and allow multiple getData() calls with different selector functions", async () => {
      const data = {
        users: [
          { id: 1, name: "John", active: true },
          { id: 2, name: "Jane", active: false },
        ],
      };

      const response = createMockResponse({
        body: data,
        headers: { "content-type": "application/json" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/users", "GET");

      // Multiple selector functions
      const getAllNames = (d: typeof data) => d.users.map(u => u.name);
      const getActiveUsers = (d: typeof data) => d.users.filter(u => u.active);
      const getUserIds = (d: typeof data) => d.users.map(u => u.id);

      // Call each multiple times
      const names1 = await wrapper.getData(getAllNames);
      const names2 = await wrapper.getData(getAllNames);
      const active1 = await wrapper.getData(getActiveUsers);
      const active2 = await wrapper.getData(getActiveUsers);
      const ids1 = await wrapper.getData(getUserIds);
      const ids2 = await wrapper.getData(getUserIds);

      assert.deepEqual(names1, ["John", "Jane"]);
      assert.deepEqual(names2, ["John", "Jane"]);
      assert.deepEqual(active1, [{ id: 1, name: "John", active: true }]);
      assert.deepEqual(active2, [{ id: 1, name: "John", active: true }]);
      assert.deepEqual(ids1, [1, 2]);
      assert.deepEqual(ids2, [1, 2]);
    });

    it("should work with getJson() and getData() interleaved calls", async () => {
      const data = { value: 42, nested: { deep: "value" } };
      const response = createMockResponse({
        body: data,
        headers: { "content-type": "application/json" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/data", "GET");

      // Interleave calls
      const json1 = await wrapper.getJson();
      const nested = await wrapper.getData(d => d.nested);
      const json2 = await wrapper.getJson();
      const value = await wrapper.getData(d => d.value);
      const json3 = await wrapper.getJson();

      assert.deepEqual(json1, data);
      assert.deepEqual(nested, { deep: "value" });
      assert.strictEqual(json1, json2); // Same cached object
      assert.strictEqual(json2, json3); // Same cached object
      assert.equal(value, 42);
    });
  });

  describe("Error Cases - Body Already Consumed by Different Method", () => {
    it("should throw error when calling getText() after getJson()", async () => {
      const response = createMockResponse({
        body: { name: "John" },
        headers: { "content-type": "application/json" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/test", "GET");

      await wrapper.getJson();

      // Try to get text - should fail because body is consumed
      await assert.rejects(
        async () => wrapper.getText(),
        (error: unknown) => {
          return error instanceof RequestError && error.message.includes("Body already consumed");
        }
      );
    });

    it("should throw error when calling getJson() after getText()", async () => {
      const response = createMockResponse({
        body: '{"name":"John"}',
        headers: { "content-type": "application/json" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/test", "GET");

      await wrapper.getText();

      // Try to get JSON - should fail because body is consumed
      await assert.rejects(
        async () => wrapper.getJson(),
        (error: unknown) => {
          return error instanceof RequestError && error.message.includes("Body already consumed");
        }
      );
    });

    it("should throw error when calling getBlob() after getJson()", async () => {
      const response = createMockResponse({
        body: { data: "test" },
        headers: { "content-type": "application/json" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/test", "GET");

      await wrapper.getJson();

      await assert.rejects(
        async () => wrapper.getBlob(),
        (error: unknown) => {
          return error instanceof RequestError && error.message.includes("Body already consumed");
        }
      );
    });

    it("should throw error when calling getArrayBuffer() after getText()", async () => {
      const response = createMockResponse({
        body: "text content",
        headers: { "content-type": "text/plain" },
      });
      const wrapper = new ResponseWrapper(response, "https://api.example.com/test", "GET");

      await wrapper.getText();

      await assert.rejects(
        async () => wrapper.getArrayBuffer(),
        (error: unknown) => {
          return error instanceof RequestError && error.message.includes("Body already consumed");
        }
      );
    });
  });
});

describe("GraphQL Error Consumption as JSON", { timeout: 10000 }, () => {
  beforeEach(() => {
    FetchMock.install();
  });

  afterEach(() => {
    FetchMock.reset();
    FetchMock.restore();
  });

  describe("Consuming GraphQL errors as JSON (throwOnError: false)", () => {
    it("should allow consuming GraphQL errors as JSON when throwOnError is false", async () => {
      const graphQLErrors = [
        {
          message: "User not found",
          path: ["user"],
          locations: [{ line: 2, column: 3 }],
          extensions: { code: "NOT_FOUND" },
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
      const request = new PostRequest("https://api.example.com/graphql").withGraphQL(query, { id: "999" }, { throwOnError: false });

      // Should be able to get JSON with errors
      const result = await request.getJson<{ data: null; errors: typeof graphQLErrors }>();

      assert.ok(result.errors);
      assert.equal(result.errors.length, 1);
      assert.equal(result.errors[0].message, "User not found");
      assert.deepEqual(result.errors[0].path, ["user"]);
      assert.deepEqual(result.errors[0].extensions, { code: "NOT_FOUND" });
    });

    it("should allow consuming GraphQL errors as JSON multiple times", async () => {
      const graphQLErrors = [
        { message: "Error 1", path: ["field1"] },
        { message: "Error 2", path: ["field2"] },
      ];

      FetchMock.mockResponseOnce({
        status: 200,
        body: {
          data: { partial: "data" },
          errors: graphQLErrors,
        },
      });

      const query = "query { field1 field2 }";
      const request = new PostRequest("https://api.example.com/graphql").withGraphQL(query, undefined, { throwOnError: false });

      const response = await request.getResponse();

      // Consume errors as JSON multiple times
      const result1 = await response.getJson<{ data: { partial: string }; errors: typeof graphQLErrors }>();
      const result2 = await response.getJson<{ data: { partial: string }; errors: typeof graphQLErrors }>();
      const result3 = await response.getJson<{ data: { partial: string }; errors: typeof graphQLErrors }>();

      assert.ok(result1.errors);
      assert.equal(result1.errors.length, 2);
      assert.equal(result1.data.partial, "data");

      // Should be cached
      assert.strictEqual(result1, result2);
      assert.strictEqual(result2, result3);
    });

    it("should allow using getData() to extract GraphQL errors", async () => {
      const graphQLErrors = [
        { message: "Validation error", path: ["input", "email"] },
      ];

      FetchMock.mockResponseOnce({
        status: 200,
        body: {
          data: null,
          errors: graphQLErrors,
        },
      });

      const query = "mutation { createUser(input: {}) { id } }";
      const request = new PostRequest("https://api.example.com/graphql").withGraphQL(query, undefined, { throwOnError: false });

      // Extract errors using getData()
      const errors = await request.getData<{ errors: typeof graphQLErrors }, typeof graphQLErrors>(data => data.errors);

      assert.equal(errors.length, 1);
      assert.equal(errors[0].message, "Validation error");
      assert.deepEqual(errors[0].path, ["input", "email"]);
    });

    it("should allow consuming GraphQL errors multiple times with getData()", async () => {
      const graphQLErrors = [
        { message: "Error 1" },
        { message: "Error 2" },
        { message: "Error 3" },
      ];

      FetchMock.mockResponseOnce({
        status: 200,
        body: {
          data: null,
          errors: graphQLErrors,
        },
      });

      const query = "query { test }";
      const request = new PostRequest("https://api.example.com/graphql").withGraphQL(query, undefined, { throwOnError: false });

      const response = await request.getResponse();

      // Extract errors multiple times with same selector
      const extractErrors = (data: { errors: typeof graphQLErrors }) => data.errors.map(e => e.message);

      const errorMessages1 = await response.getData(extractErrors);
      const errorMessages2 = await response.getData(extractErrors);
      const errorMessages3 = await response.getData(extractErrors);

      assert.deepEqual(errorMessages1, ["Error 1", "Error 2", "Error 3"]);
      assert.deepEqual(errorMessages2, ["Error 1", "Error 2", "Error 3"]);
      assert.deepEqual(errorMessages3, ["Error 1", "Error 2", "Error 3"]);
    });

    it("should allow consuming GraphQL errors with different selectors", async () => {
      const graphQLErrors = [
        { message: "Error 1", path: ["field1"], extensions: { code: "ERR1" } },
        { message: "Error 2", path: ["field2"], extensions: { code: "ERR2" } },
      ];

      FetchMock.mockResponseOnce({
        status: 200,
        body: {
          data: null,
          errors: graphQLErrors,
        },
      });

      const query = "query { field1 field2 }";
      const request = new PostRequest("https://api.example.com/graphql").withGraphQL(query, undefined, { throwOnError: false });

      const response = await request.getResponse();

      // Different selectors for errors
      const allErrors = await response.getData<{ errors: typeof graphQLErrors }, typeof graphQLErrors>(d => d.errors);
      const errorMessages = await response.getData<{ errors: typeof graphQLErrors }, string[]>(d => d.errors.map(e => e.message));
      const errorPaths = await response.getData<{ errors: typeof graphQLErrors }, (string[] | undefined)[]>(d => d.errors.map(e => e.path));
      const errorCodes = await response.getData<{ errors: typeof graphQLErrors }, string[]>(d =>
        d.errors.map(e => (e.extensions?.code as string) || "")
      );

      assert.equal(allErrors.length, 2);
      assert.deepEqual(errorMessages, ["Error 1", "Error 2"]);
      assert.deepEqual(errorPaths, [["field1"], ["field2"]]);
      assert.deepEqual(errorCodes, ["ERR1", "ERR2"]);
    });

    it("should allow consuming GraphQL errors with partial data", async () => {
      FetchMock.mockResponseOnce({
        status: 200,
        body: {
          data: {
            user: { id: "1", name: "John" },
            // email field failed
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
      const request = new PostRequest("https://api.example.com/graphql").withGraphQL(query, undefined, { throwOnError: false });

      const response = await request.getResponse();

      // Extract both data and errors
      const fullResponse = await response.getJson<{
        data: { user: { id: string; name: string } };
        errors: { message: string; path: string[] }[];
      }>();

      const userData = await response.getData(d => d.data.user);
      const errors = await response.getData(d => d.errors);

      assert.equal(fullResponse.data.user.id, "1");
      assert.equal(fullResponse.data.user.name, "John");
      assert.equal(errors.length, 1);
      assert.equal(errors[0].message, "Email field failed to resolve");
      assert.deepEqual(errors[0].path, ["user", "email"]);
      assert.deepEqual(userData, { id: "1", name: "John" });
    });

    it("should allow consuming GraphQL errors with extensions", async () => {
      const graphQLErrors = [
        {
          message: "Forbidden",
          extensions: {
            code: "FORBIDDEN",
            timestamp: "2024-01-01T00:00:00Z",
            details: { reason: "Insufficient permissions", userId: "123" },
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
      const request = new PostRequest("https://api.example.com/graphql").withGraphQL(query, undefined, { throwOnError: false });

      const response = await request.getResponse();

      // Extract errors with extensions
      const errors = await response.getData<{ errors: typeof graphQLErrors }, typeof graphQLErrors>(d => d.errors);
      const extensions = await response.getData<{ errors: typeof graphQLErrors }, unknown[]>(d => d.errors.map(e => e.extensions));

      assert.equal(errors[0].message, "Forbidden");
      assert.deepEqual(extensions[0], {
        code: "FORBIDDEN",
        timestamp: "2024-01-01T00:00:00Z",
        details: { reason: "Insufficient permissions", userId: "123" },
      });
    });

    it("should allow consuming GraphQL errors as strings", async () => {
      // Some GraphQL APIs return errors as strings
      const graphQLErrors = ['Cannot query field "test" on type "Query".', "Syntax error in query"];

      FetchMock.mockResponseOnce({
        status: 200,
        body: {
          data: null,
          errors: graphQLErrors,
        },
      });

      const query = "query { test }";
      const request = new PostRequest("https://api.example.com/graphql").withGraphQL(query, undefined, { throwOnError: false });

      const response = await request.getResponse();

      // Consume errors as JSON
      const result = await response.getJson<{ data: null; errors: string[] }>();

      assert.ok(result.errors);
      assert.equal(result.errors.length, 2);
      assert.equal(result.errors[0], 'Cannot query field "test" on type "Query".');
      assert.equal(result.errors[1], "Syntax error in query");
    });

    it("should allow consuming GraphQL errors multiple times with same selector function", async () => {
      const graphQLErrors = [
        { message: "Error 1", code: "ERR1" },
        { message: "Error 2", code: "ERR2" },
      ];

      FetchMock.mockResponseOnce({
        status: 200,
        body: {
          data: null,
          errors: graphQLErrors,
        },
      });

      const query = "query { test }";
      const request = new PostRequest("https://api.example.com/graphql").withGraphQL(query, undefined, { throwOnError: false });

      const response = await request.getResponse();

      // Define selector function once
      const getErrorMessages = (data: { errors: typeof graphQLErrors }) => data.errors.map(e => e.message);

      // Call multiple times with same function
      const messages1 = await response.getData(getErrorMessages);
      const messages2 = await response.getData(getErrorMessages);
      const messages3 = await response.getData(getErrorMessages);

      assert.deepEqual(messages1, ["Error 1", "Error 2"]);
      assert.deepEqual(messages2, ["Error 1", "Error 2"]);
      assert.deepEqual(messages3, ["Error 1", "Error 2"]);
    });
  });

  describe("GraphQL errors with throwOnError: true - Error handling", () => {
    it("should throw error with GraphQL error details in message", async () => {
      const graphQLErrors = [
        {
          message: "User not found",
          path: ["user"],
          extensions: { code: "NOT_FOUND" },
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
      const request = new PostRequest("https://api.example.com/graphql").withGraphQL(query, { id: "999" }, { throwOnError: true });

      try {
        await request.getJson();
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.ok(error instanceof RequestError);
        const reqError = error as RequestError;

        // Error should contain GraphQL error message
        assert.match(reqError.message, /GraphQL errors:/);
        assert.match(reqError.message, /User not found/);

        // Response should be available with status
        assert.ok(reqError.response);
        assert.equal(reqError.status, 200);
        assert.equal(reqError.response?.status, 200);

        // Note: Body is already consumed when GraphQL error is thrown,
        // so we cannot access the response body again from reqError.response
        // The error message contains all the necessary GraphQL error information
      }
    });

    it("should throw error with multiple GraphQL errors in message", async () => {
      const graphQLErrors = [
        { message: "Error 1", path: ["field1"] },
        { message: "Error 2", path: ["field2"] },
      ];

      FetchMock.mockResponseOnce({
        status: 200,
        body: {
          data: null,
          errors: graphQLErrors,
        },
      });

      const query = "query { field1 field2 }";
      const request = new PostRequest("https://api.example.com/graphql").withGraphQL(query, undefined, { throwOnError: true });

      try {
        await request.getJson();
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.ok(error instanceof RequestError);
        const reqError = error as RequestError;

        // Error message should contain both errors
        assert.match(reqError.message, /GraphQL errors:/);
        assert.match(reqError.message, /Error 1/);
        assert.match(reqError.message, /Error 2/);

        assert.equal(reqError.status, 200);
        assert.ok(reqError.response);
      }
    });
  });
});

