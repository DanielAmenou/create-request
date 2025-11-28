import { get, put, head, post, patch, del, options } from "./requestFactories.js";
import { Config } from "./utils/Config.js";
import { api } from "./apiBuilder.js";

// Export enums
export { HttpMethod, RequestPriority, CredentialsPolicy, RequestMode, RedirectMode, SameSitePolicy, ReferrerPolicy, CacheMode } from "./enums.js";

// Export types
export type {
  RetryCallback,
  RetryConfig,
  CookiesRecord,
  CookieOptions,
  RequestConfig,
  GraphQLOptions,
  RequestOptions,
  ErrorInterceptor,
  RequestInterceptor,
  RetryDelayFunction,
  ResponseInterceptor,
} from "./types.js";

// Export core classes
export { ResponseWrapper } from "./ResponseWrapper.js";
export { CookieUtils } from "./utils/CookieUtils.js";
export { RequestError } from "./RequestError.js";

// Export request classes
export { GetRequest, PostRequest, PutRequest, DeleteRequest, PatchRequest, HeadRequest, OptionsRequest } from "./requestMethods.js";

// Export request factory functions individually
export {
  get as createGet,
  post as createPost,
  put as createPut,
  del as createDelete,
  patch as createPatch,
  head as createHead,
  options as createOptions,
} from "./requestFactories.js";

// Export api function
export { api as createApi } from "./apiBuilder.js";

/**
 * Main API object for creating HTTP requests.
 * Provides factory methods for all HTTP methods and access to global configuration.
 *
 * @example
 * ```typescript
 * import create from 'create-request';
 *
 * // Simple GET request
 * const users = await create.get('/api/users').getJson();
 *
 * // POST request with body
 * const newUser = await create.post('/api/users')
 *   .withBody({ name: 'John', email: 'john@example.com' })
 *   .getJson();
 *
 * // Configure API instance with defaults
 * const api = create.api()
 *   .withBaseURL('https://api.example.com')
 *   .withBearerToken('token123');
 *
 * const data = await api.get('/users').getJson();
 * ```
 */
const create = {
  api,
  get,
  put,
  del,
  post,
  patch,
  head,
  options,
  config: Config.getInstance(),
} as const;

// Default export
export default create;
