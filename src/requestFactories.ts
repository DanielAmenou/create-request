import {
  GetRequest,
  PostRequest,
  PutRequest,
  DeleteRequest,
  PatchRequest,
  HeadRequest,
  OptionsRequest,
} from "./requestMethods";

/**
 * Create a GET request
 */
export function get(): GetRequest {
  return new GetRequest();
}

/**
 * Create a POST request
 */
export function post(): PostRequest {
  return new PostRequest();
}

/**
 * Create a PUT request
 */
export function put(): PutRequest {
  return new PutRequest();
}

/**
 * Create a DELETE request
 * Note: We use 'del' to avoid JS keyword conflict
 */
export function del(): DeleteRequest {
  return new DeleteRequest();
}

/**
 * Create a PATCH request
 */
export function patch(): PatchRequest {
  return new PatchRequest();
}

/**
 * Create a HEAD request
 */
export function head(): HeadRequest {
  return new HeadRequest();
}

/**
 * Create an OPTIONS request
 */
export function options(): OptionsRequest {
  return new OptionsRequest();
}
