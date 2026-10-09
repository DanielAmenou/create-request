import { createApi } from "./api.js";
import { HttpRequest } from "./request.js";
import type { BodyMethod, Method } from "./types.js";

export { HttpRequest } from "./request.js";
export { ResponseWrapper } from "./response.js";
export { RequestError, isRequestError, type RequestErrorJSON, type RequestErrorOptions } from "./error.js";
export { createApi, type ApiBuilder } from "./api.js";
export type { StandardSchemaV1 } from "./schema.js";
export type {
  Body,
  BodyMethod,
  CookiesRecord,
  CsrfOptions,
  ErrorInterceptor,
  FetchFunction,
  GraphQLOptions,
  HeadersRecord,
  Method,
  QueryParams,
  QueryValue,
  RequestConfig,
  RequestErrorCode,
  RequestInterceptor,
  RequestResult,
  ResponseInterceptor,
  RetryConfig,
  RetryContext,
} from "./types.js";

/** A GET request. */
export type GetRequest<T = unknown> = HttpRequest<"GET", T>;
/** A HEAD request. */
export type HeadRequest<T = unknown> = HttpRequest<"HEAD", T>;
/** An OPTIONS request. */
export type OptionsRequest<T = unknown> = HttpRequest<"OPTIONS", T>;
/** A POST request. */
export type PostRequest<T = unknown> = HttpRequest<"POST", T>;
/** A PUT request. */
export type PutRequest<T = unknown> = HttpRequest<"PUT", T>;
/** A PATCH request. */
export type PatchRequest<T = unknown> = HttpRequest<"PATCH", T>;
/** A DELETE request. */
export type DeleteRequest<T = unknown> = HttpRequest<"DELETE", T>;
/** A QUERY request (RFC 10008). */
export type QueryRequest<T = unknown> = HttpRequest<"QUERY", T>;
/** Any request — the v1 name for {@link HttpRequest}. */
export type BaseRequest<T = unknown> = HttpRequest<Method, T>;
/** Any request that may carry a body — the v1 name for `HttpRequest<"POST" | "PUT" | "PATCH" | "DELETE" | "QUERY">`. */
export type BodyRequest<T = unknown> = HttpRequest<BodyMethod, T>;

/** Creates a GET request. `T` declares the JSON type the response is expected to have. */
export const createGet = <T = unknown>(url: string): GetRequest<T> => new HttpRequest("GET", url);
/** Creates a HEAD request. */
export const createHead = <T = unknown>(url: string): HeadRequest<T> => new HttpRequest("HEAD", url);
/** Creates an OPTIONS request. */
export const createOptions = <T = unknown>(url: string): OptionsRequest<T> => new HttpRequest("OPTIONS", url);
/** Creates a POST request. */
export const createPost = <T = unknown>(url: string): PostRequest<T> => new HttpRequest("POST", url);
/** Creates a PUT request. */
export const createPut = <T = unknown>(url: string): PutRequest<T> => new HttpRequest("PUT", url);
/** Creates a PATCH request. */
export const createPatch = <T = unknown>(url: string): PatchRequest<T> => new HttpRequest("PATCH", url);
/** Creates a DELETE request. */
export const createDelete = <T = unknown>(url: string): DeleteRequest<T> => new HttpRequest("DELETE", url);
/**
 * Creates a QUERY request ([RFC 10008](https://www.rfc-editor.org/rfc/rfc10008)): a safe, idempotent read like GET
 * whose query travels in the body, so it can be as large and as structured as needed. The server must support the
 * method and needs a `Content-Type`, which is set for you except for binary and stream bodies (use `withContentType()`).
 *
 * @example
 * ```typescript
 * const open = await create.query<Issue[]>("https://api.example.com/issues").withBody({ state: "open", labels: ["bug"] }).getJson();
 * ```
 */
export const createQuery = <T = unknown>(url: string): QueryRequest<T> => new HttpRequest("QUERY", url);

/**
 * The entry point: one factory per HTTP method plus `api()` for configured instances.
 *
 * @example
 * ```typescript
 * import create from "create-request";
 *
 * const users = await create.get("https://api.example.com/users").getJson<User[]>();
 * const api = create.api().withBaseURL("https://api.example.com").withBearerToken(token);
 * const me = await api.get("/me").getJson<User>();
 * ```
 */
const create = {
  /** Creates a GET request. `T` declares the JSON type the response is expected to have. */
  get: createGet,
  /** Creates a HEAD request. */
  head: createHead,
  /** Creates an OPTIONS request. */
  options: createOptions,
  /** Creates a POST request. */
  post: createPost,
  /** Creates a PUT request. */
  put: createPut,
  /** Creates a PATCH request. */
  patch: createPatch,
  /** Creates a DELETE request. */
  delete: createDelete,
  /** Alias of `delete`. */
  del: createDelete,
  /** Creates a QUERY request (RFC 10008): a safe, idempotent read whose query is sent with `withBody()` — see {@link createQuery}. */
  query: createQuery,
  /** Creates an api instance — see {@link createApi}. */
  api: createApi,
} as const;

export default create;
