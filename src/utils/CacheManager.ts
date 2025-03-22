import type { CacheEntry, CacheOptions } from "../types/cache";
import { createStorageProvider, parseSize } from "./CacheStorage";
import type { StorageProvider } from "./StorageProvider";

/**
 * Cache manager that handles storage operations
 * Provides methods for storing, retrieving, and managing cached API responses.
 */
export class CacheManager {
  private storage: StorageProvider;
  private options: CacheOptions;
  private entryCount = 0;
  private totalSize = 0;

  constructor(options: CacheOptions = {}) {
    this.options = options;
    this.storage = createStorageProvider(options);
  }

  /**
   * Generate a cache key based on request details
   * Keys can vary based on URL, method, headers, and request body.
   *
   * @param url - The request URL
   * @param method - The HTTP method
   * @param headers - Request headers that might affect caching
   * @param body - Request body for non-GET requests
   * @returns A unique cache key string
   *
   * @example
   * const key = cacheManager.generateKey("/api/users", "GET", { "Accept": "application/json" });
   */
  generateKey(url: string, method: string, headers?: Record<string, string>, body?: unknown): string {
    // Use custom key generator if provided
    if (this.options.keyGenerator) {
      const customKey = this.options.keyGenerator(url, method, headers, body);
      return this.options.keyPrefix ? `${this.options.keyPrefix}:${customKey}` : customKey;
    }

    // Default key generation
    let key = `${method}:${url}`;

    // Add vary headers to key if specified
    if (this.options.varyByHeaders && headers) {
      const varyHeaders: Record<string, string> = {};

      this.options.varyByHeaders.forEach(header => {
        const normalizedHeader = header.toLowerCase();

        // Find the header in case-insensitive way
        Object.keys(headers).forEach(h => {
          if (h.toLowerCase() === normalizedHeader) {
            varyHeaders[normalizedHeader] = headers[h];
          }
        });
      });

      if (Object.keys(varyHeaders).length > 0) {
        key += `:${JSON.stringify(varyHeaders)}`;
      }
    }

    // Include body in cache key for non-GET requests if it's a simple value
    if (method !== "GET" && body !== undefined && body !== null) {
      try {
        if (typeof body === "string" || typeof body === "number" || typeof body === "boolean") {
          key += `:${String(body)}`;
        } else if (typeof body === "object") {
          key += `:${JSON.stringify(body)}`;
        }
      } catch (e) {
        console.warn("Failed to stringify request body for cache key");
      }
    }

    // Add prefix if specified
    return this.options.keyPrefix ? `${this.options.keyPrefix}:${key}` : key;
  }

  /**
   * Get a cached value by key
   * Checks if the entry exists and isn't expired before returning it.
   *
   * @param key - The cache key to retrieve
   * @returns The cached entry or null if not found or expired
   *
   * @example
   * const entry = await cacheManager.get("GET:/api/users");
   */
  async get(key: string): Promise<CacheEntry | null> {
    const value = await Promise.resolve(this.storage.get(key));
    if (!value) return null;

    try {
      const entry: CacheEntry = JSON.parse(value) as CacheEntry;

      // Check if the entry has expired
      if (entry.expiry && entry.expiry < Date.now()) {
        await Promise.resolve(this.storage.delete(key));
        return null;
      }

      return entry;
    } catch (e) {
      // If we can't parse the cached value, remove it
      await Promise.resolve(this.storage.delete(key));
      return null;
    }
  }

  /**
   * Store a value in the cache
   * Enforces size and entry count limits if configured.
   *
   * @param key - The cache key
   * @param value - The value to cache
   * @param headers - Response headers to store with the cached value
   * @returns Promise that resolves when caching is complete
   *
   * @example
   * await cacheManager.set("GET:/api/users", userData, { "Content-Type": "application/json" });
   */
  async set(key: string, value: unknown, headers?: Record<string, string>): Promise<void> {
    const now = Date.now();
    const ttl = this.options.ttl;

    const entry: CacheEntry = {
      value,
      timestamp: now,
      expiry: ttl ? now + ttl : null,
      headers,
    };

    const serialized = JSON.stringify(entry);

    // Check size constraints if applicable
    if (this.options.maxSize) {
      const maxBytes = parseSize(this.options.maxSize);
      const entrySize = new TextEncoder().encode(serialized).length;

      // If a single entry exceeds the max size, reject it without clearing the cache
      if (entrySize > maxBytes) {
        console.warn(`Cache entry size (${entrySize} bytes) exceeds maximum cache size (${maxBytes} bytes)`);
        return;
      }

      // Only clear if adding this entry would exceed the total limit
      if (this.totalSize + entrySize > maxBytes) {
        // Simple strategy: clear everything
        // A more sophisticated strategy would remove oldest entries first
        await Promise.resolve(this.storage.clear());
        this.totalSize = 0;
        this.entryCount = 0;
      }

      this.totalSize += entrySize;
    }

    // Check max entries constraint
    if (this.options.maxEntries) {
      this.entryCount++;

      if (this.entryCount > this.options.maxEntries) {
        // Simple strategy: clear everything
        // A more sophisticated strategy would use LRU cache
        await Promise.resolve(this.storage.clear());
        this.entryCount = 1;
      }
    }

    // Pass ttl to storage provider if available
    await Promise.resolve(this.storage.set(key, serialized, ttl));
  }

  /**
   * Check if a key exists in the cache
   *
   * @param key - The cache key to check
   * @returns Promise that resolves to true if the key exists, false otherwise
   *
   * @example
   * if (await cacheManager.has("GET:/api/users")) {
   *   // Use cached value
   * }
   */
  async has(key: string): Promise<boolean> {
    return Promise.resolve(this.storage.has(key));
  }

  /**
   * Delete a specific key from the cache
   *
   * @param key - The cache key to delete
   * @returns Promise that resolves when deletion is complete
   *
   * @example
   * await cacheManager.delete("GET:/api/users");
   */
  async delete(key: string): Promise<void> {
    return Promise.resolve(this.storage.delete(key));
  }

  /**
   * Clear the entire cache
   * Resets internal counters for entry count and size.
   *
   * @returns Promise that resolves when the cache is cleared
   *
   * @example
   * await cacheManager.clear();
   */
  async clear(): Promise<void> {
    this.entryCount = 0;
    this.totalSize = 0;
    return Promise.resolve(this.storage.clear());
  }
}
