import { BaseRequest } from "./BaseRequest.js";
import { get, post, put, del, patch, head, options } from "./requestFactories.js";
import type { CookiesRecord, CookieOptions, RetryConfig, RequestInterceptor, ResponseInterceptor, ErrorInterceptor } from "./types.js";
import type { GetRequest, PostRequest, PutRequest, DeleteRequest, PatchRequest, HeadRequest, OptionsRequest } from "./requestMethods.js";

type RequestModifier = (request: RequestType) => RequestType;
type RequestType = GetRequest | PostRequest | PutRequest | DeleteRequest | PatchRequest | HeadRequest | OptionsRequest;

interface ApiBuilderRequestMethods {
  withoutCsrfProtection(): ApiBuilder;
  withAntiCsrfHeaders(): ApiBuilder;
  withTimeout(timeout: number): ApiBuilder;
  withReferrer(referrer: string): ApiBuilder;
  withKeepAlive(keepalive: boolean): ApiBuilder;
  withIntegrity(integrity: string): ApiBuilder;
  withHeader(key: string, value: string): ApiBuilder;
  withHeaders(headers: Record<string, string>): ApiBuilder;
  withRetries(retries: number | RetryConfig): ApiBuilder;
  withBearerToken(token: string): ApiBuilder;
  withCookies(cookies: CookiesRecord): ApiBuilder;
  withContentType(contentType: string): ApiBuilder;
  withAuthorization(authValue: string): ApiBuilder;
  withBasicAuth(username: string, password: string): ApiBuilder;
  withCsrfToken(token: string, headerName?: string): ApiBuilder;
  withErrorInterceptor(interceptor: ErrorInterceptor): ApiBuilder;
  withCookie(name: string, value: string | CookieOptions): ApiBuilder;
  withRequestInterceptor(interceptor: RequestInterceptor): ApiBuilder;
  withResponseInterceptor(interceptor: ResponseInterceptor): ApiBuilder;
  withQueryParam(key: string, value: string | string[] | number | boolean | null | undefined): ApiBuilder;
  withQueryParams(params: Record<string, string | string[] | number | boolean | null | undefined>): ApiBuilder;
}

/**
 * Resolves a URL against a base URL.
 * If the URL is absolute (starts with http:// or https://), it is returned as-is.
 * Otherwise, it is resolved relative to the base URL.
 *
 * @param baseURL - The base URL to resolve against, or undefined if not set
 * @param url - The URL to resolve, or undefined to return the base URL
 * @returns The resolved absolute URL string
 * @example
 * resolveURL("https://api.example.com", "/users") // "https://api.example.com/users"
 * resolveURL("https://api.example.com", "users") // "https://api.example.com/users"
 * resolveURL("https://api.example.com", "https://other.com") // "https://other.com"
 */
function resolveURL(baseURL: string | undefined, url: string | undefined): string {
  if (!url) return baseURL || "";
  if (!baseURL) return url;
  if (/^https?:\/\//.test(url)) return url;
  try {
    return new URL(url, baseURL.endsWith("/") ? baseURL : baseURL + "/").toString();
  } catch {
    return baseURL.replace(/\/$/, "") + (url.startsWith("/") ? url : "/" + url);
  }
}

/**
 * API builder for creating configured API instances with default settings.
 * Allows you to set default headers, timeouts, authentication, and other options
 * that will be applied to all requests created through this builder.
 *
 * @example
 * ```typescript
 * const api = create.api()
 *   .withBaseURL("https://api.example.com")
 *   .withBearerToken("token123")
 *   .withTimeout(5000);
 *
 * // All requests will use the base URL, bearer token, and timeout
 * await api.get("/users").getJson();
 * await api.post("/posts").withBody({ title: "Hello" }).getJson();
 * ```
 */
export class ApiBuilder {
  private baseURL?: string;
  private modifiers?: RequestModifier[];

  /**
   * Sets the base URL for all requests created through this API builder.
   * Relative URLs will be resolved against this base URL.
   *
   * @param baseURL - The base URL to use for all requests
   * @returns The API builder instance for method chaining
   * @example
   * ```typescript
   * const api = create.api().withBaseURL("https://api.example.com");
   * await api.get("/users").getJson(); // Requests https://api.example.com/users
   * ```
   */
  withBaseURL(baseURL: string): this {
    this.baseURL = baseURL;
    return this;
  }

  /**
   * Adds a modifier function that will be applied to all requests created through this builder.
   *
   * @private
   * @param modifier - A function that modifies a request and returns it
   * @returns The API builder instance for method chaining
   */
  private addModifier(modifier: RequestModifier): this {
    if (!this.modifiers) this.modifiers = [];
    this.modifiers.push(modifier);
    return this;
  }

  /**
   * Creates a GET request with the configured default settings.
   *
   * @param url - Optional URL path. If not provided, uses the base URL. If relative, resolves against base URL.
   * @returns A GetRequest instance ready to be executed
   * @example
   * ```typescript
   * const api = create.api().withBaseURL("https://api.example.com");
   * await api.get("/users").getJson();
   * await api.get("https://other.com/data").getJson(); // Absolute URL overrides base
   * ```
   */
  get = (url?: string): GetRequest => {
    const request = get(resolveURL(this.baseURL, url));
    if (this.modifiers) for (const modifier of this.modifiers) modifier(request);
    return request;
  };
  /**
   * Creates a POST request with the configured default settings.
   *
   * @param url - Optional URL path. If not provided, uses the base URL. If relative, resolves against base URL.
   * @returns A PostRequest instance ready to be executed
   * @example
   * ```typescript
   * const api = create.api().withBaseURL("https://api.example.com");
   * await api.post("/users").withBody({ name: "John" }).getJson();
   * ```
   */
  post = (url?: string): PostRequest => {
    const request = post(resolveURL(this.baseURL, url));
    if (this.modifiers) for (const modifier of this.modifiers) modifier(request);
    return request;
  };
  /**
   * Creates a PUT request with the configured default settings.
   *
   * @param url - Optional URL path. If not provided, uses the base URL. If relative, resolves against base URL.
   * @returns A PutRequest instance ready to be executed
   * @example
   * ```typescript
   * const api = create.api().withBaseURL("https://api.example.com");
   * await api.put("/users/123").withBody({ name: "Jane" }).getJson();
   * ```
   */
  put = (url?: string): PutRequest => {
    const request = put(resolveURL(this.baseURL, url));
    if (this.modifiers) for (const modifier of this.modifiers) modifier(request);
    return request;
  };
  /**
   * Creates a DELETE request with the configured default settings.
   *
   * @param url - Optional URL path. If not provided, uses the base URL. If relative, resolves against base URL.
   * @returns A DeleteRequest instance ready to be executed
   * @example
   * ```typescript
   * const api = create.api().withBaseURL("https://api.example.com");
   * await api.del("/users/123").getResponse();
   * ```
   */
  del = (url?: string): DeleteRequest => {
    const request = del(resolveURL(this.baseURL, url));
    if (this.modifiers) for (const modifier of this.modifiers) modifier(request);
    return request;
  };
  /**
   * Creates a PATCH request with the configured default settings.
   *
   * @param url - Optional URL path. If not provided, uses the base URL. If relative, resolves against base URL.
   * @returns A PatchRequest instance ready to be executed
   * @example
   * ```typescript
   * const api = create.api().withBaseURL("https://api.example.com");
   * await api.patch("/users/123").withBody({ name: "Updated" }).getJson();
   * ```
   */
  patch = (url?: string): PatchRequest => {
    const request = patch(resolveURL(this.baseURL, url));
    if (this.modifiers) for (const modifier of this.modifiers) modifier(request);
    return request;
  };
  /**
   * Creates a HEAD request with the configured default settings.
   *
   * @param url - Optional URL path. If not provided, uses the base URL. If relative, resolves against base URL.
   * @returns A HeadRequest instance ready to be executed
   * @example
   * ```typescript
   * const api = create.api().withBaseURL("https://api.example.com");
   * const response = await api.head("/users").getResponse();
   * ```
   */
  head = (url?: string): HeadRequest => {
    const request = head(resolveURL(this.baseURL, url));
    if (this.modifiers) for (const modifier of this.modifiers) modifier(request);
    return request;
  };
  /**
   * Creates an OPTIONS request with the configured default settings.
   *
   * @param url - Optional URL path. If not provided, uses the base URL. If relative, resolves against base URL.
   * @returns An OptionsRequest instance ready to be executed
   * @example
   * ```typescript
   * const api = create.api().withBaseURL("https://api.example.com");
   * await api.options("/users").getResponse();
   * ```
   */
  options = (url?: string): OptionsRequest => {
    const request = options(resolveURL(this.baseURL, url));
    if (this.modifiers) for (const modifier of this.modifiers) modifier(request);
    return request;
  };

  /**
   * Creates a new ApiBuilder instance with a Proxy that enables dynamic method forwarding.
   * The Proxy allows calling any `with*` method from BaseRequest on the API builder,
   * which will apply that configuration to all requests created through this builder.
   *
   * @internal
   */
  constructor() {
    const proxy = new Proxy(this, {
      get(target, prop: string | symbol) {
        const propertyValue = (target as Record<string | symbol, unknown>)[prop];
        if (propertyValue !== undefined) {
          if (typeof propertyValue === "function") {
            return (...args: unknown[]) => {
              const result = (propertyValue as (...args: unknown[]) => unknown).apply(target, args);
              return result === target ? proxy : result;
            };
          }
          return propertyValue;
        }
        if (typeof prop === "string" && prop.startsWith("with") && prop !== "withBaseURL") {
          if (prop === "withAbortController" || prop === "withBody" || prop === "withGraphQL") return undefined;
          const prototypeMethod = (BaseRequest.prototype as unknown as Record<string, unknown>)[prop];
          if (typeof prototypeMethod === "function") {
            return (...args: unknown[]) => {
              target.addModifier((request: RequestType) => (prototypeMethod as (...args: unknown[]) => RequestType).apply(request, args));
              return proxy;
            };
          }
        }
        return undefined;
      },
    });
    return proxy;
  }
}

/**
 * Creates a new API builder instance for configuring default request settings.
 * The builder allows you to set base URLs, authentication, headers, timeouts,
 * and other options that will be applied to all requests created through it.
 *
 * @returns A new ApiBuilder instance with all configuration methods available
 * @example
 * ```typescript
 * // Create an API instance with default configuration
 * const api = create.api()
 *   .withBaseURL("https://api.example.com")
 *   .withBearerToken("your-token")
 *   .withTimeout(5000)
 *   .withHeaders({ "X-Custom": "value" });
 *
 * // All requests will use these defaults
 * const users = await api.get("/users").getJson();
 * const newUser = await api.post("/users").withBody({ name: "John" }).getJson();
 * ```
 */
export function api(): ApiBuilder & ApiBuilderRequestMethods {
  return new ApiBuilder() as ApiBuilder & ApiBuilderRequestMethods;
}
