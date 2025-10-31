import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { GetRequest } from "../src/requestMethods.js";
import { FetchMock } from "./utils/fetchMock.js";

describe("getData Feature", () => {
  beforeEach(() => {
    FetchMock.install();
  });

  afterEach(() => {
    FetchMock.reset();
    FetchMock.restore();
  });

  // Define interfaces for test data structures
  interface UsersResponse {
    users: Array<{
      id: number;
      name: string;
      role: string;
    }>;
    pagination: {
      total: number;
      page: number;
    };
  }

  interface NestedResponse {
    data: {
      results: {
        items: Array<{
          id: number;
          value: string;
        }>;
      };
    };
    meta: {
      processed: boolean;
    };
  }

  interface SimpleUsersResponse {
    users: Array<{
      id: number;
      name: string;
      role: string;
    }>;
  }

  it("should get full JSON data without a selector", async () => {
    // Arrange
    const responseData: UsersResponse = {
      users: [
        { id: 1, name: "Alice", role: "admin" },
        { id: 2, name: "Bob", role: "user" },
      ],
      pagination: { total: 2, page: 1 },
    };

    FetchMock.mockResponseOnce({ body: responseData });
    const request = new GetRequest("https://api.example.com/test");

    // Act
    const result = await request.getData<UsersResponse>();

    // Assert
    assert.deepEqual(result, responseData);
  });

  it("should extract data using a selector", async () => {
    // Arrange
    const responseData: UsersResponse = {
      users: [
        { id: 1, name: "Alice", role: "admin" },
        { id: 2, name: "Bob", role: "user" },
      ],
      pagination: { total: 2, page: 1 },
    };

    FetchMock.mockResponseOnce({ body: responseData });
    const request = new GetRequest("https://api.example.com/test");

    // Act - specify both input and output types for getData
    type UserArray = Array<{ id: number; name: string; role: string }>;
    const users = await request.getData<UsersResponse, UserArray>(data => data.users);

    // Assert
    assert.deepEqual(users, responseData.users);
  });

  it("should extract nested data using a selector", async () => {
    // Arrange
    const responseData: NestedResponse = {
      data: {
        results: {
          items: [
            { id: 1, value: "first" },
            { id: 2, value: "second" },
          ],
        },
      },
      meta: { processed: true },
    };

    FetchMock.mockResponseOnce({ body: responseData });
    const request = new GetRequest("https://api.example.com/test");

    // Act - specify both input and output types
    type ItemArray = Array<{ id: number; value: string }>;
    const items = await request.getData<NestedResponse, ItemArray>(data => data.data.results.items);

    // Assert
    assert.deepEqual(items, responseData.data.results.items);
  });

  it("should support transformation in selectors", async () => {
    // Arrange
    const responseData: SimpleUsersResponse = {
      users: [
        { id: 1, name: "Alice", role: "admin" },
        { id: 2, name: "Bob", role: "user" },
      ],
    };

    FetchMock.mockResponseOnce({ body: responseData });
    const request = new GetRequest("https://api.example.com/test");

    // Act - extract only names with proper typing
    const names = await request.getData<SimpleUsersResponse, string[]>(data => data.users.map(user => user.name));

    // Assert
    assert.deepEqual(names, ["Alice", "Bob"]);
  });

  it("should maintain type safety with selectors", async () => {
    // Arrange
    interface ApiResponse {
      users: Array<{
        id: number;
        name: string;
        email: string;
      }>;
      total: number;
    }

    const responseData: ApiResponse = {
      users: [
        { id: 1, name: "Alice", email: "alice@example.com" },
        { id: 2, name: "Bob", email: "bob@example.com" },
      ],
      total: 2,
    };

    FetchMock.mockResponseOnce({ body: responseData });
    const request = new GetRequest("https://api.example.com/test");

    // Act - with type annotations
    const result = await request.getData<ApiResponse, string[]>(data => data.users.map(u => u.email));

    // Assert
    assert.deepEqual(result, ["alice@example.com", "bob@example.com"]);
  });
});
