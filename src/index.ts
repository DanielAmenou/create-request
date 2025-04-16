import { get, put, head, post, patch, del, options } from "./requestFactories.js";
import { Config } from "./utils/Config.js";

// Export enums
export { HttpMethod, RequestPriority, CredentialsPolicy, RequestMode, RedirectMode, CacheMode, SameSitePolicy, ReferrerPolicy } from "./enums.js";

// Export types
export type { RetryCallback, RequestOptions, CookiesRecord, CookieOptions } from "./types.js";
export type { StorageProvider } from "./utils/StorageProvider.js";
export type { CacheOptions } from "./types/cache.js";

// Export core classes
export { ResponseWrapper } from "./ResponseWrapper.js";
export { CookieUtils } from "./utils/CookieUtils.js";
export { RequestError } from "./RequestError.js";

// Export request classes
export { GetRequest, PostRequest, PutRequest, DeleteRequest, PatchRequest, HeadRequest, OptionsRequest } from "./requestMethods.js";

// Export cache utilities
export { createMemoryStorage, createLocalStorageStorage, createSessionStorageStorage } from "./utils/CacheStorage.js";
export { CacheManager } from "./utils/CacheManager.js";

// Export factory functions directly for both ESM and CommonJS usage
export { get, post, put, del, patch, head, options };

/**
 * Main API object for creating HTTP requests
 * Provides factory methods for all HTTP methods and access to global configuration.
 */
const create = {
  get,
  post,
  put,
  del,
  patch,
  head,
  options,
  config: Config.getInstance(),
} as const;

// Default export
export default create;
