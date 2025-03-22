import { GetRequest, PostRequest, PutRequest, DeleteRequest, PatchRequest, HeadRequest, OptionsRequest } from "./requestMethods";

/**
 * Create a GET request
 * Used for retrieving resources from the server.
 *
 * @returns A new GET request instance
 *
 * @example
 * const users = await get()
 *   .withQueryParams({ limit: 10 })
 *   .sendTo('/api/users')
 *   .getJson();
 */
export function get(): GetRequest {
  return new GetRequest();
}

/**
 * Create a POST request
 * Used for creating new resources or submitting data.
 *
 * @returns A new POST request instance
 *
 * @example
 * const newUser = await post()
 *   .withJson({ name: 'John', email: 'john@example.com' })
 *   .sendTo('/api/users')
 *   .getJson();
 */
export function post(): PostRequest {
  return new PostRequest();
}

/**
 * Create a PUT request
 * Used for replacing or updating an existing resource.
 *
 * @returns A new PUT request instance
 *
 * @example
 * const updatedUser = await put()
 *   .withJson({ name: 'John Updated', email: 'john@example.com' })
 *   .sendTo('/api/users/123')
 *   .getJson();
 */
export function put(): PutRequest {
  return new PutRequest();
}

/**
 * Create a DELETE request
 * Used for removing resources from the server.
 *
 * @returns A new DELETE request instance
 *
 * @example
 * await del()
 *   .sendTo('/api/users/123')
 *   .getJson();
 */
export function del(): DeleteRequest {
  return new DeleteRequest();
}

/**
 * Create a PATCH request
 * Used for applying partial modifications to a resource.
 *
 * @returns A new PATCH request instance
 *
 * @example
 * const patchedUser = await patch()
 *   .withJson({ status: 'active' })
 *   .sendTo('/api/users/123')
 *   .getJson();
 */
export function patch(): PatchRequest {
  return new PatchRequest();
}

/**
 * Create a HEAD request
 * Similar to GET but returns only headers without a body.
 *
 * @returns A new HEAD request instance
 *
 * @example
 * const response = await head()
 *   .sendTo('/api/users/123');
 * console.log(response.headers.get('Last-Modified'));
 */
export function head(): HeadRequest {
  return new HeadRequest();
}

/**
 * Create an OPTIONS request
 * Used to describe the communication options for a resource.
 *
 * @returns A new OPTIONS request instance
 *
 * @example
 * const response = await options()
 *   .sendTo('/api/users');
 * console.log(response.headers.get('Allow'));
 */
export function options(): OptionsRequest {
  return new OptionsRequest();
}
