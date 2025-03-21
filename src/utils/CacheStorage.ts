import type { CacheEntry, CacheOptions } from "../types/cache";
import type { StorageProvider } from "./StorageProvider";

/**
 * Parse size strings like "10MB" into bytes
 * @param size Size as number or string with units
 */
export function parseSize(size: string | number): number {
  if (typeof size === "number") return size;

  const match = size.match(/^(\d+(?:\.\d+)?)\s*(KB|MB|GB)?$/i);
  if (!match) return 0;

  const num = parseFloat(match[1]);
  const unit = match[2]?.toUpperCase();

  switch (unit) {
    case "KB":
      return num * 1024;
    case "MB":
      return num * 1024 * 1024;
    case "GB":
      return num * 1024 * 1024 * 1024;
    default:
      return num;
  }
}

/**
 * Create a memory storage provider using Map
 */
export function createMemoryStorage(): StorageProvider {
  const store = new Map<string, string>();

  return {
    get(key: string): string | null {
      return store.get(key) || null;
    },

    set(key: string, value: string): void {
      store.set(key, value);
    },

    has(key: string): boolean {
      return store.has(key);
    },

    delete(key: string): void {
      store.delete(key);
    },

    clear(): void {
      store.clear();
    },
  };
}

/**
 * Create a localStorage-based storage provider
 */
export function createLocalStorageStorage(): StorageProvider {
  return {
    get(key: string): string | null {
      if (typeof localStorage === "undefined") return null;
      return localStorage.getItem(key);
    },

    set(key: string, value: string): void {
      if (typeof localStorage === "undefined") return;
      try {
        localStorage.setItem(key, value);
      } catch (e) {
        // Handle quota exceeded errors
        console.warn("Cache storage quota exceeded, clearing cache");
        void this.clear();
        try {
          localStorage.setItem(key, value);
        } catch (e) {
          console.error("Failed to set cache item even after clearing cache");
        }
      }
    },

    has(key: string): boolean {
      if (typeof localStorage === "undefined") return false;
      return localStorage.getItem(key) !== null;
    },

    delete(key: string): void {
      if (typeof localStorage === "undefined") return;
      localStorage.removeItem(key);
    },

    clear(): void {
      if (typeof localStorage === "undefined") return;
      localStorage.clear();
    },
  };
}

/**
 * Create a sessionStorage-based storage provider
 */
export function createSessionStorageStorage(): StorageProvider {
  return {
    get(key: string): string | null {
      if (typeof sessionStorage === "undefined") return null;
      return sessionStorage.getItem(key);
    },

    set(key: string, value: string): void {
      if (typeof sessionStorage === "undefined") return;
      try {
        sessionStorage.setItem(key, value);
      } catch (e) {
        // Handle quota exceeded errors
        console.warn("Cache storage quota exceeded, clearing cache");
        void this.clear();
        try {
          sessionStorage.setItem(key, value);
        } catch (e) {
          console.error("Failed to set cache item even after clearing cache");
        }
      }
    },

    has(key: string): boolean {
      if (typeof sessionStorage === "undefined") return false;
      return sessionStorage.getItem(key) !== null;
    },

    delete(key: string): void {
      if (typeof sessionStorage === "undefined") return;
      sessionStorage.removeItem(key);
    },

    clear(): void {
      if (typeof sessionStorage === "undefined") return;
      sessionStorage.clear();
    },
  };
}

/**
 * Create a storage provider from a cache options object
 */
export function createStorageProvider(options?: CacheOptions): StorageProvider {
  const { storage } = options || {};

  if (!storage) {
    // Default to memory storage
    return createMemoryStorage();
  }

  // Check if storage is already a StorageProvider
  if (typeof (storage as StorageProvider).get === "function" && typeof (storage as StorageProvider).set === "function") {
    return storage as StorageProvider;
  }

  // Check if it's localStorage or sessionStorage
  if (storage === localStorage) {
    return createLocalStorageStorage();
  }

  if (storage === sessionStorage) {
    return createSessionStorageStorage();
  }

  // Check if it's a Map
  if (storage instanceof Map) {
    return {
      get(key: string): string | null {
        return (storage as Map<string, string>).get(key) || null;
      },

      set(key: string, value: string, _ttl?: number): void {
        (storage as Map<string, string>).set(key, value);
      },

      has(key: string): boolean {
        return (storage as Map<string, string>).has(key);
      },

      delete(key: string): void {
        (storage as Map<string, string>).delete(key);
      },

      clear(): void {
        (storage as Map<string, string>).clear();
      },
    };
  }

  // Default to memory storage
  console.warn("Unsupported storage type, falling back to memory storage");
  return createMemoryStorage();
}

/**
 * Cache manager that handles storage operations
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
   */
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  generateKey(url: string, method: string, headers?: Record<string, string>, body?: any): string {
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
   * Get a value from cache
   */
  async get(key: string): Promise<CacheEntry | null> {
    const value = await Promise.resolve(this.storage.get(key));
    if (!value) return null;

    try {
      const entry = JSON.parse(value) as CacheEntry;

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
   * Set a value in cache
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

      if (entrySize > maxBytes) {
        console.warn(`Cache entry size (${entrySize} bytes) exceeds maximum cache size (${maxBytes} bytes)`);
        return;
      }

      this.totalSize += entrySize;

      // Enforce max size if we're over the limit
      if (this.totalSize > maxBytes) {
        // Simple strategy: clear everything
        // A more sophisticated strategy would remove oldest entries first
        await Promise.resolve(this.storage.clear());
        this.totalSize = entrySize;
        this.entryCount = 1;
      }
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
   */
  async has(key: string): Promise<boolean> {
    return Promise.resolve(this.storage.has(key));
  }

  /**
   * Delete a key from the cache
   */
  async delete(key: string): Promise<void> {
    return Promise.resolve(this.storage.delete(key));
  }

  /**
   * Clear the entire cache
   */
  async clear(): Promise<void> {
    this.entryCount = 0;
    this.totalSize = 0;
    return Promise.resolve(this.storage.clear());
  }
}
