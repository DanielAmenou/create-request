import { get, put, head, post, patch, del, options } from "./requestFactories";
import { Config } from "./utils/Config";

// Export enums
export { HttpMethod, RequestPriority, CredentialsPolicy, RequestMode, RedirectMode, CacheMode, SameSitePolicy, ReferrerPolicy } from "./enums";

// Export types
export type { RetryCallback, RequestOptions, CookieOptions, CookiesRecord } from "./types";

// Export classes
export { RequestError } from "./RequestError";
export { ResponseWrapper } from "./ResponseWrapper";
export { CookieUtils } from "./utils/CookieUtils";

// Export request classes
export { GetRequest, PostRequest, PutRequest, DeleteRequest, PatchRequest, HeadRequest, OptionsRequest } from "./requestMethods";

// Re-export cache utilities
export { createMemoryStorage, createLocalStorageStorage, createSessionStorageStorage } from "./utils/CacheStorage";
export { CacheManager } from "./utils/CacheManager";
export type { CacheOptions } from "./types/cache";
export type { StorageProvider } from "./utils/StorageProvider";

/**
 * Main API object for creating HTTP requests
 * Provides factory methods for all HTTP methods and access to global configuration.
 *
 * @example
 * // Making a GET request
 * const users = await create.get()
 *   .withQueryParams({ limit: 10 })
 *   .sendTo('/api/users')
 *   .getJson();
 *
 * // Configure global settings
 * create.config.setCsrfToken('token123');
 */
const create = {
  get,
  post,
  put,
  del,
  patch,
  head,
  options,
  // Add configuration access
  config: Config.getInstance(),
} as const;

// Default export
export default create;
