import { get, put, head, post, patch, del, options } from "./requestFactories.js";
import { Config } from "./utils/Config.js";

// Export enums
export { HttpMethod, RequestPriority, CredentialsPolicy, RequestMode, RedirectMode, SameSitePolicy, ReferrerPolicy } from "./enums.js";

// Export types
export type { RetryCallback, RequestOptions, CookiesRecord, CookieOptions, RequestConfig, RequestInterceptor, ResponseInterceptor, ErrorInterceptor } from "./types.js";

// Export core classes
export { ResponseWrapper } from "./ResponseWrapper.js";
export { CookieUtils } from "./utils/CookieUtils.js";
export { RequestError } from "./RequestError.js";

// Export request classes
export { GetRequest, PostRequest, PutRequest, DeleteRequest, PatchRequest, HeadRequest, OptionsRequest } from "./requestMethods.js";

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
