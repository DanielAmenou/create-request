import { RequestError, type RequestErrorOptions, messageOf } from "./error.js";
import { ResponseWrapper } from "./response.js";
import type { StandardSchemaV1 } from "./schema.js";
import type {
  Body,
  BodyMethod,
  CacheMode,
  CookiesRecord,
  CorsMode,
  CredentialsMode,
  CsrfOptions,
  ErrorInterceptor,
  FetchBody,
  FetchFunction,
  GraphQLOptions,
  HeadersRecord,
  Method,
  PriorityHint,
  QueryValue,
  RedirectMode,
  ReferrerPolicyName,
  RequestConfig,
  RequestErrorCode,
  RequestInterceptor,
  RequestResult,
  ResponseInterceptor,
  RetryConfig,
  RetryContext,
} from "./types.js";
import { type Deadline, MAX_DELAY, abortError, anySignal, readCapped, readCookie, release, retryAfter, sameOrigin, sleep, validUrl } from "./utils.js";

/**
 * Everything a request remembers between `create.get(url)` and `getResponse()`.
 * @internal
 */
export interface Options {
  init: Omit<RequestInit, "headers" | "body" | "method" | "signal" | "window">;
  headers: Record<string, string>;
  query: URLSearchParams;
  body?: FetchBody;
  stream?: boolean;
  timeout?: number | undefined;
  retry?: RetryConfig;
  signals: AbortSignal[];
  fetch?: FetchFunction;
  csrf?: CsrfOptions;
  gqlThrow?: boolean | undefined;
  req: RequestInterceptor[];
  res: ResponseInterceptor[];
  err: ErrorInterceptor[];
}

const RETRY_STATUSES = [408, 425, 429, 500, 502, 503, 504];

/**
 * A request under construction. Configure it with the `with*` methods (each returns the same request,
 * so calls chain), then execute it with one of the `get*` methods. Nothing is sent until you execute.
 *
 * `M` is the HTTP method — `withBody()` and `withGraphQL()` only exist for methods that carry a body —
 * and `T` is the JSON type the response is expected to have (`api.get<User>("/me")`), used as the
 * default for `getJson()` / `getData()` / `getResult()`.
 *
 * Create requests with `create.get(url)`, `create.post(url)`, … or through an api instance; the class
 * is exported for type annotations and `instanceof` checks.
 *
 * @example
 * ```typescript
 * const user = await create
 *   .post("https://api.example.com/users")
 *   .withBearerToken(token)
 *   .withBody({ name: "Ada" })
 *   .withTimeout(5000)
 *   .withRetries(2)
 *   .getJson<User>();
 * ```
 */
export class HttpRequest<M extends Method = Method, T = unknown> {
  /** @internal */
  _o: Options = { init: {}, headers: {}, query: new URLSearchParams(), signals: [], req: [], res: [], err: [] };

  private readonly _url: string;

  /** Prefer `create.get(url)`, `create.post(url)`, … or an api instance to construct requests. */
  constructor(
    /** The HTTP method. */
    readonly method: M,
    url: string
  ) {
    this._url = url;
  }

  /** The URL this request will be sent to, including the query string. */
  get url(): string {
    const query = this._o.query.toString();
    if (!query) return this._url;
    const hashAt = this._url.indexOf("#");
    const base = hashAt < 0 ? this._url : this._url.slice(0, hashAt);
    return `${base}${base.includes("?") ? "&" : "?"}${query}${hashAt < 0 ? "" : this._url.slice(hashAt)}`;
  }

  private _fail(message: string, code: RequestErrorCode, extra?: Partial<RequestErrorOptions>): RequestError {
    return new RequestError(message, { url: this.url, method: this.method, ...extra, code });
  }

  private _set<K extends keyof Options["init"]>(key: K, value: Options["init"][K]): this {
    this._o.init[key] = value;
    return this;
  }

  /* ------------------------------------------------------------------ headers & auth */

  /**
   * Sets several headers at once. Names are case-insensitive (stored lower-case); a `null` or `undefined`
   * value removes the header, which is how a request drops a default set on its api.
   *
   * @example
   * ```typescript
   * request.withHeaders({ Accept: "application/json", "X-Request-Id": id });
   * api.get("/public").withHeaders({ Authorization: null });   // send this one unauthenticated
   * ```
   */
  withHeaders<H extends { [K in keyof H]: string | number | null | undefined }>(headers: H): this {
    for (const [name, value] of Object.entries(headers as HeadersRecord)) {
      const key = name.toLowerCase();
      if (value == null) delete this._o.headers[key];
      else this._o.headers[key] = String(value);
    }
    return this;
  }

  /** Sets one header — see {@link withHeaders}. */
  withHeader(name: string, value: string | number | null | undefined): this {
    return this.withHeaders({ [name]: value });
  }

  /**
   * Sets the `Content-Type` header. Rarely needed: JSON and text bodies set it automatically and
   * `FormData` / `Blob` bodies must leave it to `fetch` (it adds the multipart boundary).
   */
  withContentType(contentType: string): this {
    return this.withHeader("content-type", contentType);
  }

  /** Sets the `Authorization` header verbatim (`"Bearer …"`, `"Basic …"`, a custom scheme). */
  withAuthorization(value: string): this {
    return this.withHeader("authorization", value);
  }

  /** Sets `Authorization: Bearer <token>`. */
  withBearerToken(token: string): this {
    return this.withAuthorization(`Bearer ${token}`);
  }

  /** Sets `Authorization: Basic <base64(username:password)>` (UTF-8 safe). */
  withBasicAuth(username: string, password: string): this {
    return this.withAuthorization(`Basic ${btoa(String.fromCharCode(...new TextEncoder().encode(`${username}:${password}`)))}`);
  }

  /**
   * Adds cookies to the `Cookie` header. Names and values are sent verbatim — encode them yourself if
   * needed, and never pass untrusted values (a `;` would smuggle in another cookie). **Node.js /
   * server-side only**: browsers ignore a `Cookie` header on `fetch` and send their own cookies
   * instead — use `withCredentials("include")` there.
   */
  withCookies<C extends { [K in keyof C]: string }>(cookies: C): this {
    for (const [name, value] of Object.entries(cookies as CookiesRecord)) {
      const previous = this._o.headers["cookie"];
      this.withHeader("cookie", `${previous ? `${previous}; ` : ""}${name}=${value}`);
    }
    return this;
  }

  /** Adds one cookie — see {@link withCookies}. */
  withCookie(name: string, value: string): this {
    return this.withCookies({ [name]: value });
  }

  /**
   * Enables CSRF protection: a token is attached to requests whose URL (final, after interceptors) is
   * same-origin with the page, so it is not sent to third-party hosts. By default the token is read
   * from the `XSRF-TOKEN` cookie and sent as `X-XSRF-TOKEN` — the convention of Angular, Laravel and
   * Spring. See {@link CsrfOptions} for other setups.
   *
   * Two limits of that guarantee: the check happens before `fetch` runs, so a same-origin URL that
   * *redirects* to another origin still carries the header (`fetch` only strips `Authorization` on
   * cross-origin redirects) — use `withRedirect("error")` for endpoints that may redirect elsewhere;
   * and outside a browser there is no page origin, so every URL counts as same-origin.
   *
   * @example
   * ```typescript
   * api.withCsrf();                                                     // XSRF-TOKEN cookie → X-XSRF-TOKEN
   * api.withCsrf({ cookie: "csrftoken", header: "X-CSRFToken" });       // Django
   * api.withCsrf({ token: () => document.querySelector("meta[name=csrf-token]")?.getAttribute("content") }); // Rails
   * ```
   */
  withCsrf(options: CsrfOptions = {}): this {
    this._o.csrf = options;
    return this;
  }

  /**
   * Sends a CSRF token you already hold in the given header (default `X-CSRF-Token`) — with every request,
   * whatever its origin. It is a plain header; prefer {@link withCsrf} (`{ token }`) to keep the same-origin check.
   */
  withCsrfToken(token: string, header = "X-CSRF-Token"): this {
    return this.withHeader(header, token);
  }

  /* --------------------------------------------------------------------- query */

  /**
   * Sets query parameters. A key that is already present is replaced (so a request can override an
   * api-level default); arrays produce repeated keys, `Date`s are sent as ISO strings, and
   * `null` / `undefined` remove the key. Accepts a `URLSearchParams` too.
   *
   * @example
   * ```typescript
   * request.withQueryParams({ page: 2, tags: ["a", "b"], since: new Date() });
   * // ?page=2&tags=a&tags=b&since=2026-01-01T00%3A00%3A00.000Z
   * ```
   */
  withQueryParams<P extends { [K in keyof P]: QueryValue }>(params: P | URLSearchParams): this {
    const entries: [string, QueryValue][] = params instanceof URLSearchParams ? [...params] : Object.entries(params as Record<string, QueryValue>);
    for (const [key] of entries) this._o.query.delete(key);
    for (const [key, value] of entries) {
      for (const item of Array.isArray(value) ? value : [value]) {
        if (item != null) this._o.query.append(key, item instanceof Date ? item.toISOString() : String(item));
      }
    }
    return this;
  }

  /** Sets one query parameter — see {@link withQueryParams}. */
  withQueryParam(key: string, value: QueryValue): this {
    return this.withQueryParams({ [key]: value });
  }

  /* ---------------------------------------------------------- timing & resilience */

  /**
   * Fails the request with code `"TIMEOUT"` if it has not completed — response received *and* body read —
   * within `ms` milliseconds. The clock starts after request interceptors ran and applies to each attempt
   * when retries are enabled; `getBody()` ends the deadline and hands you the stream. It does not cover
   * a `Response` returned by a request interceptor (nothing was fetched).
   * `0`, `Infinity` or anything above 2^31 − 1 ms (≈ 24.8 days, the limit of `setTimeout`) remove a
   * timeout set earlier (for instance by an api instance).
   */
  withTimeout(ms: number): this {
    if (!(ms >= 0)) throw this._fail(`Invalid timeout: ${ms}`, "VALIDATION");
    this._o.timeout = ms > 0 && ms <= MAX_DELAY ? ms : undefined;
    return this;
  }

  /**
   * Retries failed requests. Pass a number of retries for the default policy (network errors, timeouts,
   * 408/425/429/500/502/503/504, exponential backoff, `Retry-After` honoured) or a {@link RetryConfig}
   * to tune it. Calling it again merges with the previous configuration.
   */
  withRetries(retries: number | RetryConfig): this {
    const config = typeof retries === "number" ? { attempts: retries } : retries;
    if (!(Number.isInteger(config.attempts) && config.attempts >= 0)) throw this._fail(`Invalid retry attempts: ${config.attempts}`, "VALIDATION");
    this._o.retry = { ...this._o.retry, ...config };
    return this;
  }

  /** Called before every retry — shorthand for `withRetries({ onRetry })`. It does not enable retries by itself. */
  onRetry(callback: RetryConfig["onRetry"]): this {
    this._o.retry = { attempts: 0, ...this._o.retry, onRetry: callback };
    return this;
  }

  /**
   * Cancels the request when `signal` aborts (error code `"ABORTED"`). Call it several times to
   * combine signals — for instance the one your data-fetching library hands you and your own.
   *
   * @example
   * ```typescript
   * useQuery({ queryKey: ["user", id], queryFn: ({ signal }) => api.get(`/users/${id}`).withSignal(signal).getJson<User>() });
   * ```
   */
  withSignal(signal: AbortSignal): this {
    this._o.signals.push(signal);
    return this;
  }

  /** Cancels the request when `controller.abort()` is called — shorthand for `withSignal(controller.signal)`. */
  withAbortController(controller: AbortController): this {
    return this.withSignal(controller.signal);
  }

  /**
   * Uses `fetchFn` instead of the global `fetch`: inject a stub in tests, an undici `Agent` or proxy in
   * Node.js, or a framework's patched fetch (Next.js caching options). It receives the final URL and
   * `RequestInit` and must honour `init.signal` for timeouts and cancellation to work.
   *
   * @example
   * ```typescript
   * request.withFetch(async () => new Response('{"ok":true}'));                       // test stub
   * request.withFetch((url, init) => undiciFetch(url, { ...init, dispatcher: agent })); // undici agent
   * request.withFetch((url, init) => fetch(url, { ...init, next: { revalidate: 60 } })); // Next.js
   * ```
   */
  withFetch(fetchFn: FetchFunction): this {
    this._o.fetch = fetchFn;
    return this;
  }

  /* ------------------------------------------------------------ fetch options */

  /** Whether cookies and auth headers are sent cross-origin: `"include"`, `"omit"` or `"same-origin"` (browser default). */
  withCredentials(credentials: CredentialsMode): this {
    return this._set("credentials", credentials);
  }

  /** CORS mode: `"cors"` (default), `"no-cors"` (opaque response, status 0 — not treated as an error) or `"same-origin"`. */
  withMode(mode: CorsMode): this {
    return this._set("mode", mode);
  }

  /**
   * Redirect handling: `"follow"` (default), `"error"` (rejects with a network error) or `"manual"`, which
   * resolves with the redirect itself — an opaque response (status 0) in browsers, the actual 3xx in Node.js.
   */
  withRedirect(redirect: RedirectMode): this {
    return this._set("redirect", redirect);
  }

  /** The `Referer` to send (browser): a URL, `""` to send none, or `"about:client"` for the default. */
  withReferrer(referrer: string): this {
    return this._set("referrer", referrer);
  }

  /** How much referrer information the browser includes (`"no-referrer"`, `"strict-origin-when-cross-origin"`, …). */
  withReferrerPolicy(policy: ReferrerPolicyName): this {
    return this._set("referrerPolicy", policy);
  }

  /** Priority hint for the browser's scheduler: `"high"`, `"low"` or `"auto"`. */
  withPriority(priority: PriorityHint): this {
    return this._set("priority", priority);
  }

  /** Lets the request outlive the page (analytics beacons, ≤ 64 KB body). */
  withKeepAlive(keepalive = true): this {
    return this._set("keepalive", keepalive);
  }

  /** Subresource-integrity hash the response must match, e.g. `"sha256-…"`. */
  withIntegrity(integrity: string): this {
    return this._set("integrity", integrity);
  }

  /** How the browser's HTTP cache is used: `"default"`, `"no-store"`, `"reload"`, `"no-cache"`, `"force-cache"` or `"only-if-cached"`. */
  withCache(cache: CacheMode): this {
    return this._set("cache", cache);
  }

  /* -------------------------------------------------------------- interceptors */

  /** Adds a {@link RequestInterceptor}. Api-level interceptors run first, then request-level ones, in registration order. */
  withRequestInterceptor(interceptor: RequestInterceptor): this {
    this._o.req.push(interceptor);
    return this;
  }

  /** Adds a {@link ResponseInterceptor}, run after every successful response in registration order (it also receives the request). */
  withResponseInterceptor(interceptor: ResponseInterceptor): this {
    this._o.res.push(interceptor);
    return this;
  }

  /** Adds an {@link ErrorInterceptor}, run once after the request has failed for good (after retries); it also receives the request, so it can replay it. */
  withErrorInterceptor(interceptor: ErrorInterceptor): this {
    this._o.err.push(interceptor);
    return this;
  }

  /* --------------------------------------------------------------------- body */

  /**
   * Sets the request body (POST, PUT, PATCH and DELETE only — a compile error elsewhere). Objects and
   * arrays are JSON-encoded; strings, `Blob`, `FormData`, `URLSearchParams`, `ArrayBuffer`, typed arrays
   * and `ReadableStream` are sent as-is. `Content-Type` is set to `application/json` / `text/plain`
   * unless already present, and removed for `FormData` (fetch must add the multipart boundary itself).
   * Stream bodies are sent with `duplex: "half"` (Chromium and Node.js only) and are never retried.
   *
   * @example
   * ```typescript
   * create.post(url).withBody({ name: "Ada" });
   * create.put(url).withBody(new FormData(form));
   * ```
   */
  withBody(this: HttpRequest<BodyMethod, T>, body: Body): this {
    const o = this._o;
    // Detected by tag rather than `instanceof`, so a Blob/FormData/… from another realm (undici's own
    // classes, jsdom, a vm context) is still sent as-is instead of being JSON-encoded as "{}".
    const tag = Object.prototype.toString.call(body).slice(8, -1);
    const raw = ArrayBuffer.isView(body) || /^(String|Blob|File|FormData|URLSearchParams|ArrayBuffer|ReadableStream)$/.test(tag);
    o.stream = tag === "ReadableStream";
    if (raw) o.body = body as FetchBody;
    else {
      try {
        o.body = JSON.stringify(body);
      } catch (e) {
        throw this._fail(`Body is not JSON-serializable: ${messageOf(e)}`, "VALIDATION", { cause: e });
      }
    }
    if (tag === "FormData")
      delete o.headers["content-type"]; // fetch must set the multipart boundary itself
    else if (!("content-type" in o.headers) && (!raw || tag === "String")) this.withContentType(raw ? "text/plain" : "application/json");
    return this as unknown as this;
  }

  /**
   * Sends a GraphQL operation as a JSON body (`{ query, variables }`). With `throwOnError`, a response
   * whose `errors` array is non-empty rejects `getJson()` with a `RequestError` of code `"GRAPHQL"`.
   *
   * @example
   * ```typescript
   * const { user } = await create
   *   .post<{ data: { user: User } }>("/graphql")
   *   .withGraphQL("query ($id: ID!) { user(id: $id) { name } }", { id }, { throwOnError: true })
   *   .getData(r => r.data);
   * ```
   */
  withGraphQL(this: HttpRequest<BodyMethod, T>, query: string, variables?: object, options?: GraphQLOptions): this {
    this._o.gqlThrow = options?.throwOnError;
    return this.withBody({ query, variables }) as unknown as this;
  }

  /**
   * An independent copy of this request, so a configured request can serve as a template.
   * Interceptors, signals and body objects are shared by reference (a `ReadableStream` body can only be sent once).
   *
   * @example
   * ```typescript
   * const search = api.get("/search").withTimeout(2000);
   * const page1 = search.clone().withQueryParam("page", 1).getJson();
   * const page2 = search.clone().withQueryParam("page", 2).getJson();
   * ```
   */
  clone(): HttpRequest<M, T> {
    const o = this._o;
    const copy = new HttpRequest<M, T>(this.method, this._url);
    copy._o = {
      ...o,
      init: { ...o.init },
      headers: { ...o.headers },
      query: new URLSearchParams(o.query),
      signals: [...o.signals],
      req: [...o.req],
      res: [...o.res],
      err: [...o.err],
    };
    return copy;
  }

  /* ---------------------------------------------------------------- execution */

  /**
   * Sends the request (with retries, if configured) and resolves with the {@link ResponseWrapper} of a
   * successful (2xx or opaque) response. Any failure — non-2xx status, network error, timeout, abort,
   * interceptor error — rejects with a {@link RequestError}; use `getResult()` for a non-throwing variant.
   */
  async getResponse(): Promise<ResponseWrapper<T>> {
    const o = this._o;
    const retry = o.retry;
    let error: RequestError;
    for (let attempt = 0; ; attempt++) {
      try {
        return await this._attempt();
      } catch (e) {
        error = e instanceof RequestError ? e : this._fail(`Unexpected error: ${messageOf(e)}`, "NETWORK", { cause: e });
        const context: RetryContext = { attempt: attempt + 1, error };
        if (attempt >= (retry?.attempts ?? 0)) break;
        try {
          if (!(await this._retriable(context))) break;
          const maxDelay = retry!.maxDelay ?? 30_000;
          const serverDelay = retry!.delay === undefined ? retryAfter(error.response) : undefined;
          if (serverDelay! > maxDelay) break;
          const delay =
            serverDelay ?? (typeof retry!.delay === "function" ? retry!.delay(context) : (retry!.delay ?? Math.min(300 * 2 ** attempt + Math.random() * 100, maxDelay)));
          await retry!.onRetry?.({ ...context, delay });
          // This response is superseded by the next attempt: release its socket without waiting for GC.
          release(error.response?.body);
          await sleep(delay, anySignal(o.signals));
        } catch (e) {
          // eslint-disable-next-line @typescript-eslint/no-misused-spread -- copies the error's context fields on purpose
          error = this._fail(`Retry callback failed: ${messageOf(e)}`, "INTERCEPTOR", { ...error, cause: e });
          break;
        }
      }
    }
    for (const interceptor of o.err) {
      try {
        const result = await interceptor(error, this);
        if (result instanceof ResponseWrapper) return result as ResponseWrapper<T>;
        if (result) error = result;
      } catch (e) {
        // eslint-disable-next-line @typescript-eslint/no-misused-spread -- copies the error's context fields on purpose
        error = e instanceof RequestError ? e : this._fail(`Error interceptor failed: ${messageOf(e)}`, "INTERCEPTOR", { ...error, cause: e });
      }
    }
    throw error;
  }

  private async _retriable(context: RetryContext): Promise<boolean> {
    const o = this._o;
    const retry = o.retry!;
    const { code, status } = context.error;
    // An aborted signal stays aborted (including `AbortSignal.timeout()`, reported as TIMEOUT): retrying could only fail again.
    if (code === "ABORTED" || o.stream || o.signals.some(signal => signal.aborted)) return false;
    if (retry.shouldRetry) return retry.shouldRetry(context);
    if (retry.methods && !retry.methods.includes(this.method)) return false;
    return code === "NETWORK" || code === "TIMEOUT" || (code === "HTTP" && (retry.statuses ?? RETRY_STATUSES).includes(status!));
  }

  private async _attempt(): Promise<ResponseWrapper<T>> {
    const o = this._o;
    const method = this.method;
    let config: RequestConfig = { ...o.init, url: this.url, method, headers: { ...o.headers }, body: o.body, signal: anySignal(o.signals) };
    if (o.stream) config.duplex = "half";
    const fail = (message: string, code: RequestErrorCode, extra?: Partial<RequestErrorOptions>): RequestError =>
      new RequestError(message, { code, url: config.url, method, ...extra });
    const early = abortError(config.signal, undefined);
    if (early) throw fail(early[1], early[0], { cause: config.signal!.reason });

    let response: Response | undefined;
    for (const interceptor of o.req) {
      let result: Awaited<ReturnType<RequestInterceptor>>;
      try {
        result = await interceptor(config);
      } catch (e) {
        throw fail(`Request interceptor failed: ${messageOf(e)}`, "INTERCEPTOR", { cause: e });
      }
      if (result instanceof Response) {
        response = result;
        break;
      }
      if (result) config = result;
    }

    let deadline: Deadline | undefined;
    let signal = config.signal;
    if (!response) {
      if (!validUrl(config.url)) throw fail(`Invalid URL: "${config.url}"`, "VALIDATION");
      try {
        this._csrf(config);
      } catch (e) {
        throw fail(`CSRF token callback failed: ${messageOf(e)}`, "INTERCEPTOR", { cause: e });
      }
      try {
        new Headers(config.headers); // what fetch would reject (CR/LF, non-Latin-1 values) fails here, without retries
      } catch (e) {
        throw fail(`Invalid header: ${messageOf(e)}`, "VALIDATION", { cause: e });
      }
      if (o.timeout) {
        const controller = new AbortController();
        deadline = { ms: o.timeout, controller, timer: setTimeout(() => controller.abort(), o.timeout) };
      }
      const { url, ...init } = config;
      init.signal = signal = anySignal([config.signal, deadline?.controller.signal]);
      try {
        response = await (o.fetch ?? fetch)(url, init as RequestInit);
      } catch (e) {
        clearTimeout(deadline?.timer);
        const aborted = abortError(signal, deadline);
        if (aborted) throw fail(aborted[1], aborted[0], { cause: e });
        const cause = (e as { cause?: { code?: string } } | null)?.cause;
        const detail = cause && (messageOf(cause) || cause.code);
        throw fail(`Network error: ${messageOf(e)}${detail ? ` (${detail})` : ""}`, "NETWORK", { cause: e });
      }
    }

    const manualRedirect = config.redirect === "manual" && response.status >= 300 && response.status < 400;
    if (!response.ok && !manualRedirect && response.type !== "opaque" && response.type !== "opaqueredirect") {
      // Captured for `error.body`, but never more than 1 MB — whatever Content-Length or Content-Encoding say.
      const body = response.bodyUsed || +response.headers.get("content-length")! > 1e6 ? undefined : await readCapped(response.body, 1e6);
      clearTimeout(deadline?.timer);
      throw fail(`HTTP ${response.status} ${response.statusText}`.trim(), "HTTP", { status: response.status, response, body });
    }

    // The deadline keeps running until the body has been read (or handed over by getBody()) — unless there is none.
    if (!response.body) clearTimeout(deadline?.timer);
    const arm = (wrapper: ResponseWrapper<T>): ResponseWrapper<T> => {
      wrapper._timeout ??= deadline;
      wrapper._signal ??= signal;
      wrapper._gqlThrow ??= o.gqlThrow;
      return wrapper;
    };
    let wrapped = arm(new ResponseWrapper<T>(response, config.url, method));
    for (const interceptor of o.res) {
      try {
        const result = (await interceptor(wrapped, this)) as ResponseWrapper<T> | undefined;
        if (result && result.raw !== response) {
          // The fetched response is being replaced: its deadline no longer applies and its body will never be read.
          clearTimeout(deadline?.timer);
          release(response.body);
        }
        wrapped = arm(result ?? wrapped);
      } catch (e) {
        clearTimeout(deadline?.timer);
        throw fail(`Response interceptor failed: ${messageOf(e)}`, "INTERCEPTOR", { status: wrapped.status, response: wrapped.raw, cause: e });
      }
    }
    return wrapped;
  }

  /** Attaches the CSRF token (see {@link withCsrf}) to `config.headers` when the final URL qualifies. */
  private _csrf(config: RequestConfig): void {
    const csrf = this._o.csrf;
    if (!csrf || !(csrf.crossOrigin || sameOrigin(config.url))) return;
    const fromToken = csrf.token !== undefined;
    const token = fromToken ? (typeof csrf.token === "function" ? csrf.token() : csrf.token) : readCookie(csrf.cookie ?? "XSRF-TOKEN");
    const header = (csrf.header ?? (fromToken ? "X-CSRF-Token" : "X-XSRF-TOKEN")).toLowerCase();
    if (token && !(header in config.headers)) config.headers[header] = token;
  }

  /**
   * Sends the request and parses the body as JSON — see {@link ResponseWrapper.getJson} for the empty-body
   * rule and schema validation.
   *
   * @example
   * ```typescript
   * const users = await api.get("/users").getJson<User[]>();
   * const user = await api.get("/me").getJson(UserSchema);   // validated + typed by the schema
   * ```
   */
  getJson<U = T>(): Promise<U>;
  getJson<S extends StandardSchemaV1>(schema: S): Promise<StandardSchemaV1.InferOutput<S>>;
  getJson(schema?: StandardSchemaV1): Promise<unknown> {
    return this.getResponse().then(response => response.getJson(schema!));
  }

  /** Sends the request and returns the body as text. */
  getText(): Promise<string> {
    return this.getResponse().then(response => response.getText());
  }

  /** Sends the request and returns the body as a `Blob` (downloads, images). */
  getBlob(): Promise<Blob> {
    return this.getResponse().then(response => response.getBlob());
  }

  /** Sends the request and returns the body as an `ArrayBuffer`. */
  getArrayBuffer(): Promise<ArrayBuffer> {
    return this.getResponse().then(response => response.getArrayBuffer());
  }

  /** Sends the request and parses the body as `FormData`. */
  getFormData(): Promise<FormData> {
    return this.getResponse().then(response => response.getFormData());
  }

  /** Sends the request and returns the raw body stream — see {@link ResponseWrapper.getBody}. */
  getBody(): Promise<ReadableStream<Uint8Array> | null> {
    return this.getResponse().then(response => response.getBody());
  }

  /**
   * Sends the request, parses JSON and applies a selector — see {@link ResponseWrapper.getData}.
   *
   * @example
   * ```typescript
   * const names = await api.get<Page<User>>("/users").getData(page => page.items.map(u => u.name));
   * ```
   */
  getData<U = T>(): Promise<U>;
  // Schema overloads first: a callable schema (arktype) must not be mistaken for a selector.
  getData<S extends StandardSchemaV1>(schema: S): Promise<StandardSchemaV1.InferOutput<S>>;
  getData<S extends StandardSchemaV1, R>(schema: S, selector: (data: StandardSchemaV1.InferOutput<S>) => R): Promise<R>;
  getData<R>(selector: (data: T) => R): Promise<R>;
  getData<U, R>(selector: (data: U) => R): Promise<R>;
  getData(schemaOrSelector?: unknown, selector?: unknown): Promise<unknown> {
    return this.getResponse().then(response => response.getData(schemaOrSelector as never, selector as never));
  }

  /**
   * Sends the request and resolves with `{ data, error }` instead of throwing — for code that prefers
   * errors as values. `error` is the same {@link RequestError} `getJson()` would have thrown.
   *
   * @example
   * ```typescript
   * const { data, error } = await api.get("/me").getResult<User>();
   * if (error) return showError(error.message);
   * render(data);
   * ```
   */
  getResult<U = T>(): Promise<RequestResult<U>>;
  getResult<S extends StandardSchemaV1>(schema: S): Promise<RequestResult<StandardSchemaV1.InferOutput<S>>>;
  async getResult(schema?: StandardSchemaV1): Promise<RequestResult<unknown>> {
    try {
      return { data: await this.getJson(schema!), error: null };
    } catch (error) {
      return { data: null, error: error as RequestError };
    }
  }
}
