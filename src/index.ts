import { get, put, head, post, patch, del, options } from "./requestFactories";
import { Config } from "./utils/Config";

// Export enums
export {
  HttpMethod,
  RequestPriority,
  CredentialsPolicy,
  RequestMode,
  RedirectMode,
  CacheMode,
  SameSitePolicy,
} from "./enums";

// Export types
export type { RetryCallback, RequestOptions, CookieOptions, CookiesRecord } from "./types";

// Export classes
export { RequestError } from "./RequestError";
export { ResponseWrapper } from "./ResponseWrapper";
export { CookieUtils } from "./utils/CookieUtils";

// Export request classes
export {
  GetRequest,
  PostRequest,
  PutRequest,
  DeleteRequest,
  PatchRequest,
  HeadRequest,
  OptionsRequest,
} from "./requestMethods";

// Create the main API object with configuration
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
