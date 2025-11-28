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
  protected method: HttpMethod = HttpMethod.GET;

  constructor(url: string) {
    super(url);
  }
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
  protected method: HttpMethod = HttpMethod.HEAD;

  constructor(url: string) {
    super(url);
  }
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
  protected method: HttpMethod = HttpMethod.OPTIONS;

  constructor(url: string) {
    super(url);
  }
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
  protected method: HttpMethod = HttpMethod.DELETE;

  constructor(url: string) {
    super(url);
  }
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
  protected method: HttpMethod = HttpMethod.POST;

  constructor(url: string) {
    super(url);
  }
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
  protected method: HttpMethod = HttpMethod.PUT;

  constructor(url: string) {
    super(url);
  }
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
  protected method: HttpMethod = HttpMethod.PATCH;

  constructor(url: string) {
    super(url);
  }
}
