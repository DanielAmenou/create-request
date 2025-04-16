import { BaseRequest } from "./BaseRequest.js";
import { BodyRequest } from "./BodyRequest.js";
import { HttpMethod } from "./enums.js";

/**
 * HTTP GET request implementation
 * Used for retrieving data from an API endpoint.
 *
 * @example
 * const request = new GetRequest()
 *   .withQueryParams({ id: '123' })
 *   .sendTo('/api/users');
 */
export class GetRequest extends BaseRequest {
  protected method: HttpMethod = HttpMethod.GET;
}

/**
 * HTTP HEAD request implementation
 * Similar to GET but returns only headers without a response body.
 *
 * @example
 * const request = new HeadRequest()
 *   .sendTo('/api/users/123');
 */
export class HeadRequest extends BaseRequest {
  protected method: HttpMethod = HttpMethod.HEAD;
}

/**
 * HTTP OPTIONS request implementation
 * Used to describe the communication options for the target resource.
 *
 * @example
 * const request = new OptionsRequest()
 *   .sendTo('/api/users');
 */
export class OptionsRequest extends BaseRequest {
  protected method: HttpMethod = HttpMethod.OPTIONS;
}

/**
 * HTTP DELETE request implementation
 * Used to delete a resource on the server.
 *
 * @example
 * const request = new DeleteRequest()
 *   .sendTo('/api/users/123');
 */
export class DeleteRequest extends BaseRequest {
  protected method: HttpMethod = HttpMethod.DELETE;
}

/**
 * HTTP POST request implementation
 * Used to create a new resource or submit data for processing.
 *
 * @example
 * const request = new PostRequest()
 *   .withJson({ name: 'John', email: 'john@example.com' })
 *   .sendTo('/api/users');
 */
export class PostRequest extends BodyRequest {
  protected method: HttpMethod = HttpMethod.POST;
}

/**
 * HTTP PUT request implementation
 * Used to replace or update an existing resource.
 *
 * @example
 * const request = new PutRequest()
 *   .withJson({ id: '123', name: 'John', email: 'john@example.com' })
 *   .sendTo('/api/users/123');
 */
export class PutRequest extends BodyRequest {
  protected method: HttpMethod = HttpMethod.PUT;
}

/**
 * HTTP PATCH request implementation
 * Used to apply partial modifications to a resource.
 *
 * @example
 * const request = new PatchRequest()
 *   .withJson({ email: 'new.email@example.com' })
 *   .sendTo('/api/users/123');
 */
export class PatchRequest extends BodyRequest {
  protected method: HttpMethod = HttpMethod.PATCH;
}
