import assert from "node:assert/strict";
import { Blob } from "node:buffer";
import { describe, it, beforeEach, afterEach } from "node:test";
import create from "../src/index.js";
import { PostRequest } from "../src/requestMethods.js";
import { FetchMock } from "./utils/fetchMock.js";

describe("BodyRequest", () => {
  beforeEach(() => {
    FetchMock.install();
    // Disable anti-CSRF globally for these tests
    create.config.setEnableAntiCsrf(false);
  });

  afterEach(() => {
    FetchMock.reset();
    FetchMock.restore();
    // Reset global config after each test
    create.config.reset();
  });

  it("should properly handle JSON object body", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const data = { name: "John Doe", age: 30, active: true };
    const request = new PostRequest("https://api.example.com/test").withBody(data);

    // Act
    await request.getResponse();

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    assert.equal(options.body, JSON.stringify(data));
    assert.deepEqual(options.headers, {
      "Content-Type": "application/json",
    });
  });

  it("should handle string body", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const textContent = "Hello, world!";
    const request = new PostRequest("https://api.example.com/test").withBody(textContent);

    // Act
    await request.getResponse();

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    assert.equal(options.body, textContent);
    assert.deepEqual(options.headers, { "Content-Type": "text/plain" });
  });

  it("should handle FormData body", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const formData = new FormData();
    formData.append("name", "John Doe");
    formData.append("age", "30");

    const request = new PostRequest("https://api.example.com/test").withBody(formData);

    // Act
    await request.getResponse();

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    assert.equal(options.body, formData);

    // For FormData, we should not set Content-Type header explicitly
    // as the browser will set it to 'multipart/form-data' with boundary
    assert.deepEqual(options.headers, {});

    // Verify Content-Type is not being manually set
    assert.equal(options.headers["Content-Type"], undefined);

    // Check if the request correctly passed FormData without modification
    const mockFetchCall = FetchMock.mock.calls[0];
    assert.equal(mockFetchCall[1].body, formData);
  });

  it("should handle Blob body", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const blob = new Blob(["Hello, world!"], { type: "text/plain" });
    const request = new PostRequest("https://api.example.com/test").withBody(blob);

    // Act
    await request.getResponse();

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    assert.equal(options.body, blob);
    assert.deepEqual(options.headers, {});
  });

  it("should handle URLSearchParams body", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const params = new URLSearchParams();
    params.append("name", "John Doe");
    params.append("age", "30");

    const request = new PostRequest("https://api.example.com/test").withBody(params);

    // Act
    await request.getResponse();

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    assert.equal(options.body, params);
    assert.deepEqual(options.headers, {});
  });

  it("should handle ArrayBuffer body", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const buffer = new ArrayBuffer(8);
    const request = new PostRequest("https://api.example.com/test").withBody(buffer);

    // Act
    await request.getResponse();

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    assert.equal(options.body, buffer);
    assert.deepEqual(options.headers, {});
  });

  it("should handle null body", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const request = new PostRequest("https://api.example.com/test").withBody(null);

    // Act
    await request.getResponse();

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    assert.equal(options.body, null);
  });

  it("should throw error for unstringifiable body", () => {
    // Arrange
    const circularObj: any = {};
    circularObj.self = circularObj;

    // Act & Assert
    assert.throws(() => {
      new PostRequest("https://api.example.com/test").withBody(circularObj as Body);
    }, /JSON stringify failed/);
  });

  it("should respect existing Content-Type header when using withBody", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const data = { name: "John Doe", age: 30 };
    const request = new PostRequest("https://api.example.com/test").withHeaders({ "Content-Type": "application/vnd.custom+json" }).withBody(data);

    // Act
    await request.getResponse();

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    assert.equal(options.body, JSON.stringify(data));
    assert.deepEqual(options.headers, {
      "Content-Type": "application/vnd.custom+json", // Original header preserved
    });
  });

  it("should set Content-Type when not present in headers", async () => {
    // Arrange - Test hasContentType returning false
    FetchMock.mockResponseOnce();
    const data = { name: "John Doe", age: 30 };
    const request = new PostRequest("https://api.example.com/test").withBody(data);

    // Act
    await request.getResponse();

    // Assert - Content-Type should be set automatically
    const [, options] = FetchMock.mock.calls[0];
    assert.equal(options.body, JSON.stringify(data));
    const headers = options.headers as Record<string, string>;
    assert.equal(headers["Content-Type"], "application/json");
  });

  it("should preserve headers case sensitivity", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const request = new PostRequest("https://api.example.com/test")
      .withHeaders({
        "Content-Type": "application/json",
        "X-Custom-ID": "123",
        Authorization: "Bearer token",
      })
      .withBody({ test: true });

    // Act
    await request.getResponse();

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    assert.deepEqual(options.headers, {
      "Content-Type": "application/json",
      "X-Custom-ID": "123",
      Authorization: "Bearer token",
    });
  });

  it("should reprocess body when reusing request instance", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    FetchMock.mockResponseOnce();

    const data = { name: "Test User", action: "create" };
    const request = new PostRequest("https://api.example.com/test").withBody(data);

    // Act - Send first request
    await request.getResponse();

    // Send second request with same instance
    await request.getResponse();

    // Assert - Both requests should have the body
    assert.equal(FetchMock.mock.calls.length, 2);

    const [, options1] = FetchMock.mock.calls[0];
    const [, options2] = FetchMock.mock.calls[1];

    assert.equal(options1.body, JSON.stringify(data));
    assert.equal(options2.body, JSON.stringify(data));
  });

  it("should allow changing body between requests", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    FetchMock.mockResponseOnce();

    const request = new PostRequest("https://api.example.com/test").withBody({ id: 1, name: "First User" });

    // Act - Send first request
    await request.getResponse();

    // Change body and send second request
    request.withBody({ id: 2, name: "Second User" });
    await request.getResponse();

    // Assert
    assert.equal(FetchMock.mock.calls.length, 2);

    const [, options1] = FetchMock.mock.calls[0];
    const [, options2] = FetchMock.mock.calls[1];

    assert.equal(options1.body, JSON.stringify({ id: 1, name: "First User" }));
    assert.equal(options2.body, JSON.stringify({ id: 2, name: "Second User" }));
  });

  it("should handle headers case-insensitively in content-type detection", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const data = { name: "Test" };

    // Use a non-standard case for content-type
    const request = new PostRequest("https://api.example.com/test").withHeaders({ "content-TYPE": "application/json" }).withBody(data);

    // Act
    await request.getResponse();

    // Assert - The content-type header should remain as provided
    const [, options] = FetchMock.mock.calls[0];
    const headers = options.headers as Record<string, string>;

    assert.equal(headers["content-TYPE"], "application/json");
    assert.equal(headers["Content-Type"], undefined);
    assert.equal(options.body, JSON.stringify(data));
  });

  describe("withGraphQL", () => {
    it("should format GraphQL query without variables", async () => {
      // Arrange
      FetchMock.mockResponseOnce();
      const query = "query { user { name email } }";
      const request = new PostRequest("https://api.example.com/graphql").withGraphQL(query);

      // Act
      await request.getResponse();

      // Assert
      const [, options] = FetchMock.mock.calls[0];
      const body = JSON.parse(options.body as string);
      assert.deepEqual(body, { query: query });
      assert.deepEqual(options.headers, {
        "Content-Type": "application/json",
      });
    });

    it("should format GraphQL query with variables", async () => {
      // Arrange
      FetchMock.mockResponseOnce();
      const query = "query GetUser($id: ID!) { user(id: $id) { name email } }";
      const variables = { id: "123" };
      const request = new PostRequest("https://api.example.com/graphql").withGraphQL(query, variables);

      // Act
      await request.getResponse();

      // Assert
      const [, options] = FetchMock.mock.calls[0];
      const body = JSON.parse(options.body as string);
      assert.deepEqual(body, {
        query: query,
        variables,
      });
      assert.deepEqual(options.headers, {
        "Content-Type": "application/json",
      });
    });

    it("should format GraphQL mutation", async () => {
      // Arrange
      FetchMock.mockResponseOnce();
      const mutation = "mutation CreateUser($name: String!) { createUser(name: $name) { id name } }";
      const variables = { name: "John Doe" };
      const request = new PostRequest("https://api.example.com/graphql").withGraphQL(mutation, variables);

      // Act
      await request.getResponse();

      // Assert
      const [, options] = FetchMock.mock.calls[0];
      const body = JSON.parse(options.body as string);
      assert.deepEqual(body, {
        query: mutation,
        variables,
      });
      assert.deepEqual(options.headers, {
        "Content-Type": "application/json",
      });
    });

    it("should throw error for empty query string", () => {
      // Act & Assert
      assert.throws(() => {
        new PostRequest("https://api.example.com/graphql").withGraphQL("");
      }, /Invalid GraphQL query/);
    });

    it("should throw error for invalid variables (array)", () => {
      // Act & Assert
      assert.throws(() => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        new PostRequest("https://api.example.com/graphql").withGraphQL("query { user { name } }", [] as any);
      }, /Invalid GraphQL variables/);
    });

    it("should throw error for invalid variables (null)", () => {
      // Act & Assert
      assert.throws(() => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        new PostRequest("https://api.example.com/graphql").withGraphQL("query { user { name } }", null as any);
      }, /Invalid GraphQL variables/);
    });

    it("should respect existing Content-Type header when using withGraphQL", async () => {
      // Arrange
      FetchMock.mockResponseOnce();
      const query = "query { user { name } }";
      const request = new PostRequest("https://api.example.com/graphql").withHeaders({ "Content-Type": "application/vnd.graphql+json" }).withGraphQL(query);

      // Act
      await request.getResponse();

      // Assert
      const [, options] = FetchMock.mock.calls[0];
      const body = JSON.parse(options.body as string);
      assert.deepEqual(body, { query: query });
      assert.deepEqual(options.headers, {
        "Content-Type": "application/vnd.graphql+json", // Original header preserved
      });
    });

    it("should allow chaining withGraphQL with other methods", async () => {
      // Arrange
      FetchMock.mockResponseOnce();
      const query = "query { user { name } }";
      const request = new PostRequest("https://api.example.com/graphql").withGraphQL(query).withBearerToken("token123").withHeader("X-Custom", "value");

      // Act
      await request.getResponse();

      // Assert
      const [, options] = FetchMock.mock.calls[0];
      const body = JSON.parse(options.body as string);
      assert.deepEqual(body, { query: query });
      assert.deepEqual(options.headers, {
        "Content-Type": "application/json",
        Authorization: "Bearer token123",
        "X-Custom": "value",
      });
    });

    it("should handle complex variables object", async () => {
      // Arrange
      FetchMock.mockResponseOnce();
      const query = "query SearchUsers($filters: UserFilters!) { users(filters: $filters) { id name } }";
      const variables = {
        filters: {
          name: "John",
          age: 30,
          tags: ["active", "verified"],
          metadata: {
            source: "web",
            verified: true,
          },
        },
      };
      const request = new PostRequest("https://api.example.com/graphql").withGraphQL(query, variables);

      // Act
      await request.getResponse();

      // Assert
      const [, options] = FetchMock.mock.calls[0];
      const body = JSON.parse(options.body as string);
      assert.deepEqual(body, {
        query: query,
        variables,
      });
    });

    it("should throw error when variables contain circular reference", () => {
      // Arrange
      const query = "query { user { name } }";
      const variables: any = { data: {} };
      variables.data.self = variables.data; // Create circular reference

      // Act & Assert
      assert.throws(() => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        new PostRequest("https://api.example.com/graphql").withGraphQL(query, variables);
      }, /JSON stringify failed/);
    });

    it("should throw error when variables contain non-serializable values", () => {
      // Arrange
      const query = "query { user { name } }";
      // Create an object with a circular reference which will definitely fail to stringify
      const variables: any = { data: {} };
      variables.data.self = variables.data; // Create circular reference

      // Act & Assert
      assert.throws(() => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        new PostRequest("https://api.example.com/graphql").withGraphQL(query, variables);
      }, /JSON stringify failed/);
    });

    it("should handle variables with undefined values (which get omitted)", async () => {
      // Arrange
      FetchMock.mockResponseOnce();
      const query = "query { user { name } }";
      const variables = {
        name: "John",
        age: undefined, // This will be omitted during JSON.stringify
      } as any;

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const request = new PostRequest("https://api.example.com/graphql").withGraphQL(query, variables);

      // Act
      await request.getResponse();

      // Assert
      const [, options] = FetchMock.mock.calls[0];
      const body = JSON.parse(options.body as string);
      assert.equal(body.query, query);
      // undefined values are omitted by JSON.stringify
      assert.equal(body.variables.name, "John");
      assert.equal(body.variables.age, undefined);
    });

    it("should handle query with newlines and tabs", async () => {
      // Arrange
      FetchMock.mockResponseOnce();
      const query = "query {\n  user {\n    name\n    email\n  }\n}";
      const request = new PostRequest("https://api.example.com/graphql").withGraphQL(query);

      // Act
      await request.getResponse();

      // Assert
      const [, options] = FetchMock.mock.calls[0];
      const body = JSON.parse(options.body as string);
      assert.equal(body.query, query);
    });

    it("should handle withGraphQL with non-boolean throwOnError", async () => {
      // Arrange - Test the branch where throwOnError is not a boolean
      FetchMock.mockResponseOnce();
      const query = "query { user { name } }";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const request = new PostRequest("https://api.example.com/graphql").withGraphQL(query, undefined, { throwOnError: "true" as any });

      // Act
      await request.getResponse();

      // Assert - should work, throwOnError should be undefined since it's not a boolean
      const [, options] = FetchMock.mock.calls[0];
      const body = JSON.parse(options.body as string);
      assert.equal(body.query, query);
    });
  });
});
