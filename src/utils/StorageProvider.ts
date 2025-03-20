/**
 * Interface for storage providers used by the cache system
 */
export interface StorageProvider {
  /**
   * Get a value from storage
   * @param key The key to retrieve
   * @returns The stored value or null if not found
   */
  get(key: string): Promise<string | null> | string | null;

  /**
   * Set a value in storage
   * @param key The key to store
   * @param value The value to store
   * @param ttl Optional TTL in milliseconds
   * @returns Promise or void
   */
  set(key: string, value: string, ttl?: number): Promise<void> | void;

  /**
   * Check if a key exists in storage
   * @param key The key to check
   */
  has(key: string): Promise<boolean> | boolean;

  /**
   * Delete a value from storage
   * @param key The key to delete
   */
  delete(key: string): Promise<void> | void;

  /**
   * Clear all values from storage
   */
  clear(): Promise<void> | void;
}
