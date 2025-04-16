import type { CacheOptions } from "../types/cache.js";
import type { StorageProvider } from "./StorageProvider.js";

/**
 * Create a memory storage provider using Map
 * This provider stores data in memory and is cleared when the application restarts.
 *
 * @returns A storage provider using an in-memory Map
 *
 * @example
 * const storage = createMemoryStorage();
 * storage.set("key", "value");
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
 * This provider persists data between browser sessions.
 *
 * @returns A storage provider using localStorage
 * @throws Console warnings if localStorage is not available or storage quota is exceeded
 *
 * @example
 * const storage = createLocalStorageStorage();
 * storage.set("key", "value");
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
 * This provider persists data only for the current browser session.
 *
 * @returns A storage provider using sessionStorage
 * @throws Console warnings if sessionStorage is not available or storage quota is exceeded
 *
 * @example
 * const storage = createSessionStorageStorage();
 * storage.set("key", "value");
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
 * Create a storage provider from cache options
 * Selects the appropriate storage implementation based on the provided options.
 * Falls back to memory storage if no suitable storage is found.
 *
 * @param options - Cache configuration options
 * @returns A storage provider based on the options
 *
 * @example
 * const storage = createStorageProvider({ storage: localStorage });
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
