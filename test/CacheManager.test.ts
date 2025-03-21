import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import create from "../src/index";
import { CacheManager } from "../src/utils/CacheManager";
import { createMemoryStorage, createLocalStorageStorage } from "../src/utils/CacheStorage";
import type { StorageProvider } from "../src/utils/StorageProvider";
import { FetchMock } from "./utils/fetchMock";

describe("CacheManager", () => {
  let cacheManager: CacheManager;

  beforeEach(() => {
    cacheManager = new CacheManager();
  });

  it("should generate basic cache keys", () => {
    const key = cacheManager.generateKey("https://api.example.com/users", "GET");
    assert.equal(key, "GET:https://api.example.com/users");
  });

  it("should include headers in cache key when varyByHeaders is specified", () => {
    cacheManager = new CacheManager({
      varyByHeaders: ["content-type", "accept"],
    });

    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: "Bearer token123",
    };

    const key = cacheManager.generateKey("https://api.example.com/users", "GET", headers);

    // The key should contain the headers we want to vary by, but not Authorization
    assert.ok(key.includes('"content-type":"application/json"'));
    assert.ok(key.includes('"accept":"application/json"'));
    assert.ok(!key.includes("token123"));
  });

  it("should add prefix to cache keys", () => {
    cacheManager = new CacheManager({
      keyPrefix: "api",
    });

    const key = cacheManager.generateKey("https://api.example.com/users", "GET");
    assert.equal(key, "api:GET:https://api.example.com/users");
  });

  it("should use custom key generator if provided", () => {
    cacheManager = new CacheManager({
      keyGenerator: (url, method) => `custom:${method}:${url}`,
    });

    const key = cacheManager.generateKey("https://api.example.com/users", "GET");
    assert.equal(key, "custom:GET:https://api.example.com/users");
  });

  it("should include body in cache key for non-GET requests", () => {
    const bodyKey = cacheManager.generateKey("https://api.example.com/users", "POST", {}, { id: 123, name: "Test User" });

    // Fix the assertion - the key format is "POST:https://api.example.com/users:..."
    assert.ok(bodyKey.startsWith("POST:https"));
    assert.ok(bodyKey.includes("Test User"));
    assert.ok(bodyKey.includes("123"));
  });

  it("should handle simple value bodies in cache key", () => {
    const stringBodyKey = cacheManager.generateKey("https://api.example.com/users", "POST", {}, "string body");
    const numberBodyKey = cacheManager.generateKey("https://api.example.com/users", "POST", {}, 123);
    const booleanBodyKey = cacheManager.generateKey("https://api.example.com/users", "POST", {}, true);

    assert.ok(stringBodyKey.includes("string body"));
    assert.ok(numberBodyKey.includes("123"));
    assert.ok(booleanBodyKey.includes("true"));
  });
});

describe("StorageProvider Tests", () => {
  it("should create memory storage provider", async () => {
    const storage = createMemoryStorage();

    // Test basic operations
    await storage.set("testKey", "testValue");
    const value = await storage.get("testKey");

    assert.equal(value, "testValue");
    assert.equal(await storage.has("testKey"), true);

    await storage.delete("testKey");
    assert.equal(await storage.get("testKey"), null);
    assert.equal(await storage.has("testKey"), false);
  });

  it("should handle Map as storage", async () => {
    const map = new Map<string, string>();
    const cacheManager = new CacheManager({ storage: map });

    // Store in cache
    await cacheManager.set("testKey", { data: "testValue" });

    // Verify it's in the map
    assert.equal(map.size, 1);

    // Retrieve from cache
    const entry = await cacheManager.get("testKey");

    assert.deepEqual(entry?.value, { data: "testValue" });
  });

  // Custom mock storage for testing
  class MockStorage implements StorageProvider {
    private store = new Map<string, string>();
    public getCallCount = 0;
    public setCallCount = 0;

    async get(key: string): Promise<string | null> {
      this.getCallCount++;
      return Promise.resolve(this.store.get(key) || null);
    }

    set(key: string, value: string): Promise<void> {
      this.setCallCount++;
      this.store.set(key, value);
      return Promise.resolve();
    }

    has(key: string): Promise<boolean> {
      return Promise.resolve(this.store.has(key));
    }

    delete(key: string): Promise<void> {
      this.store.delete(key);
      return Promise.resolve();
    }

    clear(): Promise<void> {
      this.store.clear();
      return Promise.resolve();
    }
  }

  it("should work with custom storage provider", async () => {
    const mockStorage = new MockStorage();
    const cacheManager = new CacheManager({ storage: mockStorage });

    await cacheManager.set("testKey", { data: "testValue" });
    const entry = await cacheManager.get("testKey");

    assert.equal(mockStorage.setCallCount, 1);
    assert.equal(mockStorage.getCallCount, 1);
    assert.deepEqual(entry?.value, { data: "testValue" });
  });
});

describe("Cache TTL and Expiration", () => {
  it("should expire entries after TTL", async () => {
    const storage = createMemoryStorage();
    const cacheManager = new CacheManager({
      storage,
      ttl: 100, // 100ms TTL
    });

    // Store in cache
    await cacheManager.set("testKey", "testValue");

    // Immediately available
    let entry = await cacheManager.get("testKey");
    assert.equal(entry?.value, "testValue");

    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 150));

    // Should be expired now
    entry = await cacheManager.get("testKey");
    assert.equal(entry, null);
  });

  it("should keep entries without TTL", async () => {
    const storage = createMemoryStorage();
    const cacheManager = new CacheManager({ storage });

    // Store in cache with no TTL
    await cacheManager.set("testKey", "testValue");

    // Should be immediately available
    const entry = await cacheManager.get("testKey");
    assert.equal(entry?.value, "testValue");
    assert.equal(entry?.expiry, null);
  });
});

describe("Cache Size and Entry Limits", () => {
  it("should respect maxEntries limit", async () => {
    const storage = createMemoryStorage();
    const cacheManager = new CacheManager({
      storage,
      maxEntries: 2,
    });

    // Add two entries (within limit)
    await cacheManager.set("key1", "value1");
    await cacheManager.set("key2", "value2");

    // Both should be in cache
    assert.equal((await cacheManager.get("key1"))?.value, "value1");
    assert.equal((await cacheManager.get("key2"))?.value, "value2");

    // Add third entry (exceeds limit)
    await cacheManager.set("key3", "value3");

    // First two should be cleared, only the new one remains
    assert.equal(await cacheManager.get("key1"), null);
    assert.equal(await cacheManager.get("key2"), null);
    assert.equal((await cacheManager.get("key3"))?.value, "value3");
  });

  it("should respect maxSize limit", async () => {
    const storage = createMemoryStorage();
    const cacheManager = new CacheManager({
      storage,
      maxSize: 200, // bytes
    });

    // Add small entry (within limit)
    await cacheManager.set("key1", "small value");

    // Should be in cache
    assert.equal((await cacheManager.get("key1"))?.value, "small value");

    // Add large entry that exceeds max size limit for a single entry
    const largeValue = "x".repeat(1000);
    await cacheManager.set("key2", largeValue);

    // The large entry should be rejected (not stored)
    assert.equal(await cacheManager.get("key2"), null);

    // But the first entry should still be there (fixed expectation)
    const firstEntry = await cacheManager.get("key1");
    assert.notEqual(firstEntry, null);
    assert.equal(firstEntry?.value, "small value");
  });
});

describe("Request Caching Integration Tests", () => {
  beforeEach(() => {
    FetchMock.install();
  });

  afterEach(() => {
    FetchMock.reset();
    FetchMock.restore();
  });

  it("should cache GET requests", async () => {
    // Arrange - mock a successful response
    const responseData = { id: 1, name: "Test User" };
    FetchMock.mockResponseOnce({ body: responseData });

    // Create a request with cache enabled
    const request = create.get().withCache();

    // Act - make first request
    const result1 = await request.sendTo("https://api.example.com/users/1").getJson();

    // Should have made one fetch call
    assert.equal(FetchMock.mock.calls.length, 1);
    assert.deepEqual(result1, responseData);

    // Act - make second request to same URL
    const result2 = await request.sendTo("https://api.example.com/users/1").getJson();

    // Assert - should not have made another fetch call
    assert.equal(FetchMock.mock.calls.length, 1); // Still 1
    assert.deepEqual(result2, responseData);
  });

  it("should not cache failed requests", async () => {
    // Arrange - mock a failed response
    FetchMock.mockResponseOnce({ status: 404, body: { error: "Not Found" } });
    FetchMock.mockResponseOnce({ status: 200, body: { id: 1, name: "Test User" } });

    // Create a request with cache enabled
    const request = create.get().withCache();

    // Act - make first request, which should fail
    try {
      await request.sendTo("https://api.example.com/users/1").getJson();
      assert.fail("Request should have failed");
    } catch (error) {
      // Expected error
    }

    // Should have made one fetch call
    assert.equal(FetchMock.mock.calls.length, 1);

    // Act - make second request to same URL
    const result = await request.sendTo("https://api.example.com/users/1").getJson();

    // Assert - should have made another fetch call since error wasn't cached
    assert.equal(FetchMock.mock.calls.length, 2);
    assert.deepEqual(result, { id: 1, name: "Test User" });
  });

  it("should vary cache by headers", async () => {
    // Arrange
    const v1Response = { version: "v1", data: [1, 2, 3] };
    const v2Response = { version: "v2", data: [4, 5, 6] };

    FetchMock.mockResponseOnce({ body: v1Response });
    FetchMock.mockResponseOnce({ body: v2Response });

    // Create a request with cache that varies by version header
    const request = create.get().withCache({
      varyByHeaders: ["x-api-version"],
    });

    // Act - make request with v1 header
    const result1 = await request.withHeaders({ "x-api-version": "1.0" }).sendTo("https://api.example.com/data").getJson();

    // Assert
    assert.equal(FetchMock.mock.calls.length, 1);
    assert.deepEqual(result1, v1Response);

    // Act - make request with v2 header
    const result2 = await request.withHeaders({ "x-api-version": "2.0" }).sendTo("https://api.example.com/data").getJson();

    // Assert - should make a new request due to different header
    assert.equal(FetchMock.mock.calls.length, 2);
    assert.deepEqual(result2, v2Response);

    // Act - repeat v1 request
    const result3 = await request.withHeaders({ "x-api-version": "1.0" }).sendTo("https://api.example.com/data").getJson();

    // Assert - should use cache for v1
    assert.equal(FetchMock.mock.calls.length, 2); // Still 2
    assert.deepEqual(result3, v1Response);
  });

  it("should respect cache TTL", async () => {
    // Arrange
    const response1 = { data: "first response" };
    const response2 = { data: "second response" };

    FetchMock.mockResponseOnce({ body: response1 });
    FetchMock.mockResponseOnce({ body: response2 });

    // Create a request with short TTL
    const request = create.get().withCache({
      ttl: 100, // 100ms
    });

    // Act - make first request
    const result1 = await request.sendTo("https://api.example.com/data").getJson();

    // Assert
    assert.equal(FetchMock.mock.calls.length, 1);
    assert.deepEqual(result1, response1);

    // Wait for TTL to expire
    await new Promise(resolve => setTimeout(resolve, 150));

    // Act - make second request to same URL
    const result2 = await request.sendTo("https://api.example.com/data").getJson();

    // Assert - should have made a new request due to TTL expiration
    assert.equal(FetchMock.mock.calls.length, 2);
    assert.deepEqual(result2, response2);
  });

  it("should support keyPrefix for organizing cache", async () => {
    // Arrange
    const userResponse = { id: 1, name: "User" };
    const productResponse = { id: 1, name: "Product" };

    FetchMock.mockResponseOnce({ body: userResponse });
    FetchMock.mockResponseOnce({ body: productResponse });

    // Create requests with different prefixes
    const userRequest = create.get().withCache({
      keyPrefix: "users",
    });

    const productRequest = create.get().withCache({
      keyPrefix: "products",
    });

    // Act - make requests
    const user = await userRequest.sendTo("https://api.example.com/item/1").getJson();
    const product = await productRequest.sendTo("https://api.example.com/item/1").getJson();

    // Assert - should make separate requests due to different prefixes
    assert.equal(FetchMock.mock.calls.length, 2);
    assert.deepEqual(user, userResponse);
    assert.deepEqual(product, productResponse);

    // Act - repeat requests
    const cachedUser = await userRequest.sendTo("https://api.example.com/item/1").getJson();
    const cachedProduct = await productRequest.sendTo("https://api.example.com/item/1").getJson();

    // Assert - should use cache
    assert.equal(FetchMock.mock.calls.length, 2); // Still 2
    assert.deepEqual(cachedUser, userResponse);
    assert.deepEqual(cachedProduct, productResponse);
  });
});
