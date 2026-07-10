import { BaseRequest } from "./BaseRequest.js";
import { BodyRequest } from "./BodyRequest.js";
import { HttpMethod } from "./enums.js";

/**
 * HTTP GET request implementation
 * Used for retrieving data from an API endpoint.
 *
 * @example
 * const request = new GetRequest('/api/users')
 *   .withQueryParams({ id: '123' });
 * const data = await request.getData();
 */
export class GetRequest extends BaseRequest {
  protected _method: HttpMethod = HttpMethod.GET;
}

/**
 * HTTP HEAD request implementation
 * Similar to GET but returns only headers without a response body.
 *
 * @example
 * const request = new HeadRequest('/api/users/123');
 * const response = await request.getResponse();
 */
export class HeadRequest extends BaseRequest {
  protected _method: HttpMethod = HttpMethod.HEAD;
}

/**
 * HTTP OPTIONS request implementation
 * Used to describe the communication options for the target resource.
 *
 * @example
 * const request = new OptionsRequest('/api/users');
 * const response = await request.getResponse();
 */
export class OptionsRequest extends BaseRequest {
  protected _method: HttpMethod = HttpMethod.OPTIONS;
}

/**
 * HTTP DELETE request implementation
 * Used to delete a resource on the server.
 *
 * @example
 * const request = new DeleteRequest('/api/users/123');
 * await request.getData();
 */
export class DeleteRequest extends BaseRequest {
  protected _method: HttpMethod = HttpMethod.DELETE;
}

/**
 * HTTP POST request implementation
 * Used to create a new resource or submit data for processing.
 *
 * @example
 * const request = new PostRequest('/api/users')
 *   .withBody({ name: 'John', email: 'john@example.com' });
 * const data = await request.getData();
 */
export class PostRequest extends BodyRequest {
  protected _method: HttpMethod = HttpMethod.POST;
}

/**
 * HTTP PUT request implementation
 * Used to replace or update an existing resource.
 *
 * @example
 * const request = new PutRequest('/api/users/123')
 *   .withBody({ id: '123', name: 'John', email: 'john@example.com' });
 * const data = await request.getData();
 */
export class PutRequest extends BodyRequest {
  protected _method: HttpMethod = HttpMethod.PUT;
}

/**
 * HTTP PATCH request implementation
 * Used to apply partial modifications to a resource.
 *
 * @example
 * const request = new PatchRequest('/api/users/123')
 *   .withBody({ email: 'new.email@example.com' });
 * const data = await request.getData();
 */
export class PatchRequest extends BodyRequest {
  protected _method: HttpMethod = HttpMethod.PATCH;
}
