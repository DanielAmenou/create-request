import { HttpRequest } from "./request.js";
import type { Method, QueryValue } from "./types.js";

type Defaults = (request: HttpRequest) => void;

/** Chainable `HttpRequest` methods that make sense as api-wide defaults (everything but body, signal and clone). */
type ApiKeys = Exclude<
  { [K in keyof HttpRequest]: K extends `with${string}` | "onRetry" ? K : never }[keyof HttpRequest],
  "withBody" | "withGraphQL" | "withSignal" | "withAbortController"
>;

type ApiChainables = {
  [K in keyof HttpRequest as K extends ApiKeys ? K : never]: HttpRequest[K] extends (...args: infer A) => unknown ? (...args: A) => ApiBuilder : never;
};

/**
 * A set of defaults for the requests it creates: base URL, headers, auth, timeout, retries, interceptors —
 * every `with*` method of {@link HttpRequest} except the body and signal ones, with the same signatures.
 *
 * Api instances are **immutable**: each `with*` call returns a new instance and leaves the original
 * untouched, so an api can be specialised safely (`const admin = api.withHeader("X-Role", "admin")`).
 * Requests created from it can still override any default. Arguments are applied to every request the
 * api creates (an object passed to `withHeaders` is read each time, so treat it as frozen).
 *
 * @example
 * ```typescript
 * export const api = createApi()
 *   .withBaseURL("https://api.example.com")
 *   .withBearerToken(token)
 *   .withTimeout(5000)
 *   .withRetries(2);
 *
 * const users = await api.get("/users").getJson<User[]>();
 * const user = await api.post("/users").withBody({ name: "Ada" }).getJson<User>();
 * ```
 */
export interface ApiBuilder extends ApiChainables {
  // Generic members are redeclared so that interface-typed arguments are accepted here too (docs are inherited).
  withHeaders<H extends { [K in keyof H]: string | number | null | undefined }>(headers: H | Headers | readonly (readonly [string, string])[]): ApiBuilder;
  withCookies<C extends { [K in keyof C]: string }>(cookies: C): ApiBuilder;
  withQueryParams<P extends { [K in keyof P]: QueryValue }>(params: P | URLSearchParams): ApiBuilder;
  /**
   * Prefixes relative paths with `baseURL`. Paths are *joined*, not resolved: `/v1` + `/users` → `/v1/users`,
   * `./users` and `users` work the same, and absolute URLs (`https://…`, `//…`) are used as-is.
   */
  withBaseURL(baseURL: string): ApiBuilder;
  /** Creates a GET request. `T` declares the JSON type the response is expected to have. */
  get<T = unknown>(path?: string): HttpRequest<"GET", T>;
  /** Creates a HEAD request. */
  head<T = unknown>(path?: string): HttpRequest<"HEAD", T>;
  /** Creates an OPTIONS request. */
  options<T = unknown>(path?: string): HttpRequest<"OPTIONS", T>;
  /** Creates a POST request. */
  post<T = unknown>(path?: string): HttpRequest<"POST", T>;
  /** Creates a PUT request. */
  put<T = unknown>(path?: string): HttpRequest<"PUT", T>;
  /** Creates a PATCH request. */
  patch<T = unknown>(path?: string): HttpRequest<"PATCH", T>;
  /** Creates a DELETE request (`del` is an alias). */
  delete<T = unknown>(path?: string): HttpRequest<"DELETE", T>;
  /** Alias of `delete`. */
  del<T = unknown>(path?: string): HttpRequest<"DELETE", T>;
  /** Creates a QUERY request (RFC 10008): a safe, idempotent read whose query is sent with `withBody()`. */
  query<T = unknown>(path?: string): HttpRequest<"QUERY", T>;
}

const ABSOLUTE = /^([a-z][a-z0-9+.-]*:)?\/\//i;

class Api {
  // Declared and assigned in the constructor (not parameter properties), so no class-field definitions are emitted.
  declare private readonly _base: string;
  declare private readonly _defaults: readonly Defaults[];

  constructor(base = "", defaults: readonly Defaults[] = []) {
    this._base = base;
    this._defaults = defaults;
  }

  /** @internal */
  _with(fn: Defaults): ApiBuilder {
    fn(new HttpRequest("GET", "")); // validate the arguments now, not when the first request is created
    return new Api(this._base, [...this._defaults, fn]) as unknown as ApiBuilder;
  }

  withBaseURL(baseURL: string): ApiBuilder {
    return new Api(baseURL, this._defaults) as unknown as ApiBuilder;
  }

  /** @internal */
  _make(method: Method, path = ""): HttpRequest {
    const base = this._base;
    const url = !base ? path : !path ? base : ABSOLUTE.test(path) ? path : `${base.replace(/\/+$/, "")}/${path.replace(/^\.?\/+/, "")}`;
    const request = new HttpRequest(method, url);
    for (const apply of this._defaults) apply(request);
    return request;
  }
}

const METHODS: readonly Method[] = ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE", "QUERY"];
let installed = false;

/**
 * Creates an empty {@link ApiBuilder}. Configure it once, export it, and create every request through it.
 * (`create.api()` is the same function.)
 */
export function createApi(): ApiBuilder {
  if (!installed) {
    // The request factories and every chainable HttpRequest method are installed on Api once, so the
    // api surface is derived from the request surface (at the type level too) and the two cannot drift.
    installed = true;
    const proto = Api.prototype as unknown as Record<string, unknown>;
    for (const method of METHODS) {
      proto[method.toLowerCase()] = function (this: Api, path?: string): HttpRequest {
        return this._make(method, path);
      };
    }
    proto["del"] = proto["delete"];
    for (const key of Object.getOwnPropertyNames(HttpRequest.prototype)) {
      if (/^(with|onRetry)/.test(key) && !/^with(Body|GraphQL|Signal|AbortController)$/.test(key)) {
        proto[key] = function (this: Api, ...args: unknown[]): ApiBuilder {
          return this._with(request => void (request as unknown as Record<string, (...a: unknown[]) => unknown>)[key]!(...args));
        };
      }
    }
  }
  return new Api() as unknown as ApiBuilder;
}
