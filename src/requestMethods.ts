import { BaseRequest } from "./BaseRequest";
import { BodyRequest } from "./BodyRequest";
import { HttpMethod } from "./enums";

// Methods without body
export class GetRequest extends BaseRequest {
  protected method: HttpMethod = HttpMethod.GET;
}

export class HeadRequest extends BaseRequest {
  protected method: HttpMethod = HttpMethod.HEAD;
}

export class OptionsRequest extends BaseRequest {
  protected method: HttpMethod = HttpMethod.OPTIONS;
}

export class DeleteRequest extends BaseRequest {
  protected method: HttpMethod = HttpMethod.DELETE;
}

// Methods with body
export class PostRequest extends BodyRequest {
  protected method: HttpMethod = HttpMethod.POST;
}

export class PutRequest extends BodyRequest {
  protected method: HttpMethod = HttpMethod.PUT;
}

export class PatchRequest extends BodyRequest {
  protected method: HttpMethod = HttpMethod.PATCH;
}
