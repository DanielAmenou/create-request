import { get, put, head, post, patch, del, options } from "./requestFactories";
import { Config } from "./utils/Config";

// Export enums
export { HttpMethod, RequestPriority, CredentialsPolicy, RequestMode, RedirectMode, CacheMode, SameSitePolicy, ReferrerPolicy } from "./enums";

// Export types
export type { RetryCallback, RequestOptions, CookiesRecord, CookieOptions } from "./types";
export type { StorageProvider } from "./utils/StorageProvider";
export type { CacheOptions } from "./types/cache";

// Export core classes
export { ResponseWrapper } from "./ResponseWrapper";
export { CookieUtils } from "./utils/CookieUtils";
export { RequestError } from "./RequestError";

// Export request classes
export { GetRequest, PostRequest, PutRequest, DeleteRequest, PatchRequest, HeadRequest, OptionsRequest } from "./requestMethods";

// Export cache utilities
export { createMemoryStorage, createLocalStorageStorage, createSessionStorageStorage } from "./utils/CacheStorage";
export { CacheManager } from "./utils/CacheManager";

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
