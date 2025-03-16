import { get, put, head, post, patch, del, options } from "./requestFactories";

// Export enums
export {
  HttpMethod,
  RequestPriority,
  CredentialsPolicy,
  RequestMode,
  RedirectMode,
  CacheMode,
} from "./enums";

// Export types
export type { RetryCallback, RequestOptions } from "./types";

// Export classes
export { RequestError } from "./RequestError";
export { ResponseWrapper } from "./ResponseWrapper";

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

// Create the main API object
const create = {
  get,
  post,
  put,
  del,
  patch,
  head,
  options,
} as const;

// Default export
export default create;
