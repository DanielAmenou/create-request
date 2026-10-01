# Migrating from v1 to v2

v2 is a redesign of the internals with a smaller, more correct and fully typed surface. The
fluent style and most method names are unchanged, so for most code bases the migration is
mechanical: replace the enum getters with string literals, move global configuration to an api
instance, and drop a few options that never did anything.

Node.js 22+ is required. The published files are `dist/index.js` (ESM),
`dist/index.cjs` (CommonJS) and their declaration files; deep imports of `dist/library/*` no
longer exist.

## Checklist

1. Replace `.withX.VALUE()` getters and enum arguments with string literals.
2. Replace `create.config.*` with an api instance you export from one module.
3. Replace `withoutCsrfProtection()` / `withAntiCsrfHeaders()` / automatic XSRF handling with
   `withCsrf()` where you need it.
4. Rename `error.getJson()` to `error.data`, and check `error.code` instead of message prefixes.
5. Remove `| null` handling around `getJson()` unless the endpoint really answers `204`.
6. Review retries: they now retry only retriable failures, with backoff, and honour `Retry-After`.
7. Check `withQueryParams` calls that relied on repeated keys — pass an array instead.
8. Cookie values are sent verbatim; `CookieOptions` objects are gone.

## Method by method

| v1                                                                                                                                                               | v2                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.withCache.NO_CACHE()`, `.withCredentials.INCLUDE()`, `.withMode.CORS()`, `.withRedirect.FOLLOW()`, `.withReferrerPolicy.NO_REFERRER()`, `.withPriority.HIGH()` | `.withCache("no-cache")`, `.withCredentials("include")`, `.withMode("cors")`, `.withRedirect("follow")`, `.withReferrerPolicy("no-referrer")`, `.withPriority("high")` — the DOM string unions, autocompleted |
| `withCache(CacheMode.NO_CACHE)` and the other enum arguments                                                                                                     | the string literal                                                                                                                                                                                            |
| `import { CacheMode, CredentialsPolicy, RequestMode, RedirectMode, ReferrerPolicy, RequestPriority, SameSitePolicy, HttpMethod }`                                | removed — use string literals; the `Method` type replaces `HttpMethod`                                                                                                                                        |
| `withKeepAlive(true)`                                                                                                                                            | `withKeepAlive()` (`true` is the default; `withKeepAlive(false)` still works)                                                                                                                                 |
| `withTimeout(ms)` (headers only; `0` threw)                                                                                                                      | covers the whole exchange including the body read; `0` / `Infinity` remove the timeout                                                                                                                        |
| `withResponseInterceptor(response => …)`, `withErrorInterceptor(error => …)`                                                                                     | unchanged, and both also receive the `HttpRequest` as a second argument (`(error, request) => request.clone()…`)                                                                                              |
| `withQueryParams({ page: 2 })` called twice with the same key → `page=1&page=2`                                                                                  | the last call wins (`page=2`); pass an array for repeated keys                                                                                                                                                |
| `withQueryParam("ids", ["1", "2"])` (strings only)                                                                                                               | numbers, booleans, `Date`s and arrays are accepted too (`withQueryParams` also takes a `URLSearchParams`); `null` removes a key                                                                               |
| `withHeaders({ a: undefined })` (type error, ignored at runtime)                                                                                                 | allowed: `null` / `undefined` remove the header (useful to drop an api default)                                                                                                                               |
| `withCookie("t", { value: "x", secure: true })`, `CookieOptions`, `SameSitePolicy`                                                                               | `withCookie("t", "x")` — values are sent verbatim, options were never sent anyway                                                                                                                             |
| `withAbortController(controller)`                                                                                                                                | unchanged; `withSignal(signal)` added (call several times to combine signals)                                                                                                                                 |
| `withoutCsrfProtection()`                                                                                                                                        | removed — nothing is automatic any more                                                                                                                                                                       |
| `withAntiCsrfHeaders()`                                                                                                                                          | `withHeader("X-Requested-With", "XMLHttpRequest")` if a framework still checks it                                                                                                                             |
| `withCsrfToken(token, header?)`                                                                                                                                  | unchanged                                                                                                                                                                                                     |
| `withBody(...)` on `DeleteRequest`                                                                                                                               | now allowed (`DELETE` may carry a body); still a compile error on `GET`, `HEAD`, `OPTIONS`                                                                                                                    |
| `withGraphQL(query, variables, { throwOnError })`                                                                                                                | unchanged; GraphQL errors now have `code: "GRAPHQL"`                                                                                                                                                          |
| `withRetries({ attempts, delay })`                                                                                                                               | unchanged shape, plus `statuses`, `methods`, `maxDelay`, `shouldRetry`, `onRetry`                                                                                                                             |
| `onRetry(({ attempt, error }) => …)`                                                                                                                             | unchanged; the callback also receives `delay`                                                                                                                                                                 |
| `getJson<T>(): Promise<T \| null>`                                                                                                                               | `getJson<T>(): Promise<T>` — write `getJson<T \| null>()` where an empty body is possible                                                                                                                     |
| `getData<T, R>(d => d!.x)`                                                                                                                                       | `getData<T, R>(d => d.x)` — or `api.get<T>(url).getData(d => d.x)`; the selector receives `T`, not `T \| null`                                                                                                |
| `getResponse()` throwing on every non-2xx                                                                                                                        | unchanged; `getResult()` added as the path that resolves with the error; `redirect: "manual"` 3xx and opaque responses no longer throw                                                                        |
| `getBlob()` after `getText()` → "Body used"                                                                                                                      | works: every reader shares one buffer                                                                                                                                                                         |
| —                                                                                                                                                                | added: `getFormData()`, `getResult()`, `clone()`, `withSignal()`, `withCsrf()`, `create.delete()`, `getJson(schema)`, `isRequestError()`                                                                      |

## Global configuration → api instances

```typescript
// v1
create.config.addRequestInterceptor(addTraceId);
create.config.setCsrfToken(token);
create.config.setEnableAntiCsrf(false);
const users = await create.get("https://api.example.com/users").getJson();

// v2 — src/lib/api.ts
export const api = createApi().withBaseURL("https://api.example.com").withRequestInterceptor(addTraceId).withCsrf({ token }); // or withCsrf() for the XSRF-TOKEN cookie, or nothing at all
const users = await api.get("/users").getJson();
```

| v1 `create.config.*`                                                            | v2                                                                                       |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `addRequestInterceptor`, `addResponseInterceptor`, `addErrorInterceptor`        | `api.withRequestInterceptor(fn)`, … — interceptors are part of the instance              |
| `removeRequestInterceptor(id)`, `clearInterceptors()`                           | create another instance without them (`const anonymous = createApi().withBaseURL(base)`) |
| `setCsrfToken(token)`, `setCsrfHeaderName(name)`                                | `api.withCsrf({ token, header })`                                                        |
| `setXsrfCookieName(name)`, `setXsrfHeaderName(name)`, `setEnableAutoXsrf(bool)` | `api.withCsrf({ cookie, header })` — off unless you call it                              |
| `setEnableAntiCsrf(bool)`                                                       | `api.withHeader("X-Requested-With", "XMLHttpRequest")` — off unless you add it           |
| `reset()`                                                                       | not needed: there is no global state to reset between tests                              |

There is no ambient configuration in v2 on purpose: state that leaked across tests, tenants and
SSR requests was the source of several v1 bugs. Code you do not control that calls `create.get`
directly is unaffected by your api instance — hand it the instance instead.

## Errors

```typescript
// v1
if (error instanceof RequestError) {
  if (error.isTimeout) retryLater();
  else if (error.message.startsWith("HTTP")) console.log(error.status, error.getJson());
}

// v2
if (isRequestError(error)) {
  switch (error.code) {
    case "TIMEOUT":
      retryLater();
      break;
    case "HTTP":
      console.log(error.status, error.data);
      break;
  }
}
```

| v1                                                                                                | v2                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `error.getJson()`                                                                                 | `error.data` (a typed getter; never throws)                                                                                                                                                      |
| `error.isTimeout`, `error.isAborted`                                                              | unchanged (getters over `code`)                                                                                                                                                                  |
| message prefixes `"HTTP 404"`, `"Timeout:5000"`, `"Net:…"`, `"ReqI: …"`                           | `error.code` plus readable messages (`HTTP 404 Not Found`, `Request timed out after 5000ms`, `Network error: fetch failed (getaddrinfo ENOTFOUND api.example)`, `Request interceptor failed: …`) |
| `new RequestError(message, url, method, options)`                                                 | `new RequestError(message, { code, url, method, ...options })`                                                                                                                                   |
| `RequestError.timeout()`, `.fromResponse()`, `.networkError()`, `.abortError()`, `.captureBody()` | removed (they were implementation details)                                                                                                                                                       |
| `error.name === "AbortError"` (never true in v1 either)                                           | `error.code === "ABORTED"`                                                                                                                                                                       |
| a `URIError` or `TypeError` escaping `getResponse()`                                              | cannot happen: every rejection is a `RequestError` (even a broken `withFetch` stub, a throwing schema or a hostile GraphQL body is wrapped)                                                      |

## Interceptors

- Request interceptors may return nothing: in-place changes to `config` are kept. In v1 that
  crashed the request.
- `config.headers` is a copy with lower-case keys; mutating it no longer changes the request
  object. `config.body` is already serialised (a string for JSON bodies).
- Api-level interceptors run before request-level ones, all in registration order (v1 ran global
  response/error interceptors in reverse).
- Error interceptors run once per request, after retries (v1 ran them on every attempt).
- A `Response` returned by a request interceptor goes through the status check and the response
  interceptors like a fetched response (`withTimeout()` does not apply to it — nothing was fetched).

## Retries

- Only network errors, timeouts and 408/425/429/500/502/503/504 are retried by default. v1
  retried everything, including 404s, invalid URLs and aborted requests.
- The default delay is exponential backoff with jitter (v1: none). `Retry-After` is honoured
  unless you set `delay`; one longer than `maxDelay` (30 s) cancels the retry.
- Requests with a `ReadableStream` body are never retried.

## Types

| v1                                                                                                       | v2                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BaseRequest`, `BodyRequest` (classes)                                                                   | `HttpRequest<M, T>` class; `BaseRequest<T>` / `BodyRequest<T>` kept as type aliases                                                                                                                         |
| `GetRequest`, `PostRequest`, … (classes)                                                                 | type aliases of `HttpRequest<"GET", T>`, `HttpRequest<"POST", T>`, …; `new GetRequest(url)` → `createGet(url)`                                                                                              |
| `ApiBuilder` (hand-written)                                                                              | `ApiBuilder`, derived from `HttpRequest`                                                                                                                                                                    |
| `RequestOptions`, `RetryCallback`, `RetryDelayFunction`, `CookieOptions`, `CookiesRecord` (with options) | removed / `RetryConfig["onRetry"]`, `RetryConfig["delay"]`, `CookiesRecord` is `Record<string, string>`                                                                                                     |
| `RequestConfig.method: string`                                                                           | `Method`                                                                                                                                                                                                    |
| `withQueryParams(record)`, `withHeaders(record)` requiring an index signature                            | interface-typed objects are accepted                                                                                                                                                                        |
| `FetchFunction = (input: string \| URL \| Request, init?) => …`                                          | `(url: string, init: RequestInit) => Promise<Response>` — every v1 implementation still fits                                                                                                                |
| `CookieUtils`                                                                                            | removed (internal)                                                                                                                                                                                          |
| —                                                                                                        | added: `Method`, `BodyMethod`, `RequestErrorCode`, `RetryContext`, `QueryValue`, `QueryParams`, `HeadersRecord`, `CsrfOptions`, `CookiesRecord`, `RequestResult`, `RequestErrorOptions`, `StandardSchemaV1` |

## Behaviour changes you might notice

- Header names are stored lower-case; `withHeader("Content-Type", …)` and
  `withHeader("content-type", …)` are the same header.
- Query strings are inserted before a `#fragment`.
- `./users` joins onto a base URL cleanly (`https://e.com/users`).
- Basic auth encodes UTF-8 credentials correctly.
- `withTimeout` starts counting after request interceptors ran, and applies per attempt.
- `withMode("no-cors")` and `withRedirect("manual")` resolve instead of throwing.
- `error.body` is capped at 1 MB: a response declaring more is left unread on `error.response`, a longer
  chunked or compressed one is cut off (`body` is `undefined`).
- `error.response`'s body has been read when `error.body` is set; use `error.body` / `error.data`.
- A `FormData` body removes any `Content-Type` header (including an api-level default).
- A request whose signal is already aborted fails before interceptors run and before `fetch` is called.
