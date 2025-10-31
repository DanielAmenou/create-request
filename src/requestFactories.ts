import { GetRequest, PostRequest, PutRequest, DeleteRequest, PatchRequest, HeadRequest, OptionsRequest } from "./requestMethods.js";

/**
 * Create a GET request
 * Used for retrieving resources from the server.
 *
 * @param url - The URL to send the request to
 * @returns A new GET request instance
 *
 * @example
 * const request = get('/api/users')
 *   .withQueryParams({ limit: 10 });
 * const users = await request.getData();
 */
export function get(url: string): GetRequest {
  return new GetRequest(url);
}

/**
 * Create a POST request
 * Used for creating new resources or submitting data.
 *
 * @param url - The URL to send the request to
 * @returns A new POST request instance
 *
 * @example
 * const request = post('/api/users')
 *   .withJson({ name: 'John', email: 'john@example.com' });
 * const newUser = await request.getData();
 */
export function post(url: string): PostRequest {
  return new PostRequest(url);
}

/**
 * Create a PUT request
 * Used for replacing or updating an existing resource.
 *
 * @param url - The URL to send the request to
 * @returns A new PUT request instance
 *
 * @example
 * const request = put('/api/users/123')
 *   .withJson({ name: 'John Updated', email: 'john@example.com' });
 * const updatedUser = await request.getData();
 */
export function put(url: string): PutRequest {
  return new PutRequest(url);
}

/**
 * Create a DELETE request
 * Used for removing resources from the server.
 *
 * @param url - The URL to send the request to
 * @returns A new DELETE request instance
 *
 * @example
 * const request = del('/api/users/123');
 * await request.getData();
 */
export function del(url: string): DeleteRequest {
  return new DeleteRequest(url);
}

/**
 * Create a PATCH request
 * Used for applying partial modifications to a resource.
 *
 * @param url - The URL to send the request to
 * @returns A new PATCH request instance
 *
 * @example
 * const request = patch('/api/users/123')
 *   .withJson({ status: 'active' });
 * const patchedUser = await request.getData();
 */
export function patch(url: string): PatchRequest {
  return new PatchRequest(url);
}

/**
 * Create a HEAD request
 * Similar to GET but returns only headers without a body.
 *
 * @param url - The URL to send the request to
 * @returns A new HEAD request instance
 *
 * @example
 * const request = head('/api/users/123');
 * const response = await request.get();
 * console.log(response.headers.get('Last-Modified'));
 */
export function head(url: string): HeadRequest {
  return new HeadRequest(url);
}

/**
 * Create an OPTIONS request
 * Used to describe the communication options for a resource.
 *
 * @param url - The URL to send the request to
 * @returns A new OPTIONS request instance
 *
 * @example
 * const request = options('/api/users');
 * const response = await request.get();
 * console.log(response.headers.get('Allow'));
 */
export function options(url: string): OptionsRequest {
  return new OptionsRequest(url);
}
