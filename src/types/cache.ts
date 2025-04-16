import type { StorageProvider } from "../utils/StorageProvider.js";

/**
 * Cache entry with metadata
 */
export interface CacheEntry {
  value: any;
  expiry: number | null;
  timestamp: number;
  headers?: Record<string, string>;
}

/**
 * Options for cache configuration
 */
export interface CacheOptions {
  /**
   * Storage provider to use for caching
   * Default is memory cache (new Map())
   */
  storage?: StorageProvider | Storage | Map<string, any>;

  /**
   * Time to live in milliseconds
   * Default is no expiration
   */
  ttl?: number;

  /**
   * Custom key generator function
   * @param url Request URL
   * @param method Request method
   * @param headers Request headers
   * @param body Request body
   */
  keyGenerator?: (url: string, method: string, headers?: Record<string, string>, body?: any) => string;

  /**
   * Headers to vary the cache by
   * If these headers change, a new cache entry will be created
   */
  varyByHeaders?: string[];

  /**
   * Maximum number of entries in the cache
   * Only applicable for memory cache (Map)
   */
  maxEntries?: number;

  /**
   * Maximum size of the cache in bytes or with units (e.g. "10MB")
   * String format supports KB, MB, GB (case-insensitive)
   */
  maxSize?: number | string;

  /**
   * Prefix for cache keys
   * Useful for namespacing cache entries
   */
  keyPrefix?: string;
}

/**
 * Type for cacheable response data
 */
export type CacheableResponse = {
  data: any;
  headers: Record<string, string>;
  status: number;
  statusText: string;
};
