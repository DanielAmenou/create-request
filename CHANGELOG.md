# Changelog

## 2.0.0 — unreleased

A ground-up rewrite with the same fluent API, a fifth fewer bytes on the wire, a 70 % smaller package and none of the known bugs. See [MIGRATION.md](MIGRATION.md) for the v1 → v2 map.

### Breaking

- **Node.js 20.3+** is required. The package ships `dist/index.js` (ESM), `dist/index.cjs` (CommonJS) and bundled declaration files; the `production` export condition and the `dist/library/*` files are gone.
- **No global configuration.** `create.config` and the `Config` singleton are removed; defaults live on immutable api instances (`createApi()` / `create.api()`), which now have every request method except body and signal ones, derived from the request type.
- **String literals instead of enums.** The `.withCache.NO_CACHE()`-style getters and the runtime enums (`CacheMode`, `CredentialsPolicy`, `RequestMode`, `RedirectMode`, `ReferrerPolicy`, `RequestPriority`, `SameSitePolicy`, `HttpMethod`) are removed; the setters take the DOM string unions.
- **CSRF is explicit.** Nothing is sent automatically: `withCsrf()` enables the XSRF-cookie → header copy (same-origin only), `withCsrf({ token })` sends a token you hold; `withoutCsrfProtection()`, `withAntiCsrfHeaders()` and `X-Requested-With` by default are gone.
- **One request class.** `GetRequest`, `PostRequest`, … are now type aliases of `HttpRequest<M, T>`; construct requests with the factories.
- `getJson<T>()` returns `Promise<T>` (an empty body still yields `null` at runtime); `getData`'s selector receives `T`, not `T | null`.
- `RequestError` takes an options object (`{ code, url, method, … }`), `error.getJson()` becomes `error.data`, and the static factories are removed. Messages are readable (`HTTP 404 Not Found`, `Request timed out after 5000ms`, …) and every rejection carries a `code`.
- Retries only retry retriable failures (network errors, timeouts, 408/425/429/500/502/503/504), with exponential backoff by default and `Retry-After` support; validation errors are not retried by default, aborts and stream bodies never; error interceptors run once, after the last attempt.
- `withQueryParams` replaces a key that is already present instead of appending; `null` removes it.
- Interceptors run in registration order (api-level first); a request interceptor may return nothing; `config.headers` is a lower-case-keyed copy; short-circuit responses go through the status check.
- `withCookie` / `withCookies` take string values sent verbatim; `CookieOptions` and `CookieUtils` are gone.
- `error.response`'s body is consumed when `error.body` is captured; `body` is capped at 1 MB (a larger declared `Content-Length` leaves the body unread, a longer chunked or compressed body is cut off and `body` is `undefined`).

### Added

- `withSignal(signal)` (combinable), `getResult()` (`{ data, error }`), `getFormData()`, `clone()`, `create.delete()` / `api.delete()`, `withCsrf(options)`, `isRequestError()`.
- Standard Schema validation: `getJson(schema)`, `getData(schema, selector?)`, `getResult(schema)` with zod, valibot, arktype and any other implementation — typed from the schema, failures have `code: "VALIDATION"` and `error.issues`.
- Response types at the request: `api.get<User>("/me").getJson()`.
- `RetryConfig.statuses`, `methods`, `maxDelay`, `shouldRetry`, `onRetry`; the `delay` callback receives `{ attempt, error }`, `onRetry` receives `{ attempt, error, delay }`.
- Query values accept numbers, booleans, `Date`s, arrays and `URLSearchParams`; header values accept numbers and `null` (unset).
- `DELETE` requests can carry a body; `ReadableStream` bodies are sent with `duplex: "half"`.
- `withRedirect("manual")` and `withMode("no-cors")` resolve with the redirect / opaque response.
- `withTimeout()` covers the whole exchange (response and body read); `0` / `Infinity` remove a timeout; a signal from `AbortSignal.timeout()` is reported as `"TIMEOUT"`.
- Response and error interceptors receive the `HttpRequest` as a second argument, so a failed request can be replayed with `request.clone()`.
- `withQueryParams`, `withHeaders`, `withCookies` and `withGraphQL` variables accept interface-typed objects.
- A `FormData` body drops any `Content-Type` (fetch sets the multipart boundary); an already-aborted signal fails the request before interceptors run; api defaults are validated when set; `Retry-After` accepts decimals.

### Fixed

- Reading a body in two formats (`getText()` then `getJson()`, …) no longer throws "Body used".
- Aborts with a custom reason are classified as aborted; network errors carry the underlying cause's message (or code) in their own message and keep `cause`; timeouts are detected from the signal, not from message text.
- Query strings are inserted before a `#fragment`; `./users` joins onto a base URL cleanly.
- Case-insensitive header merging; basic auth handles UTF-8 credentials.
- Library options (`timeout`, `retries`, …) no longer leak into `fetch`'s `RequestInit`.
- The timeout starts after request interceptors ran.
- An interceptor's header mutations no longer persist on the request across executions.
- A `URIError` from a malformed cookie can no longer escape `getResponse()`.
- `import { RequestError } from "create-request"` tree-shakes to ≈ 0.2 KB.

### Security

- CSRF/XSRF tokens are attached only to same-origin requests, judged on the final URL after interceptors and before any redirect, unless `crossOrigin: true` is passed (v1 leaked them to every host, cf. axios CVE-2023-45857). Outside a browser every URL counts as same-origin; `fetch` forwards custom headers across redirects, so pair `withCsrf()` with `withRedirect("error")` on endpoints that may redirect elsewhere.
- Error bodies are capped at 1 MB however they are encoded (a compressed or chunked 5xx can no longer inflate into memory), header values `fetch` would reject fail before the request is sent instead of being retried, and header/cookie objects are read by own keys only.

### Internal

- Build with `tsdown`; ESLint (typescript-eslint strict), Prettier, lint-staged and commitlint; CI on Node 20/22/24 with lint, type-check, type tests (including every README code block), 100% test coverage, package linting (`attw`, `publint`) and a `size-limit` gate; npm publishing with provenance.

## 1.6.1 and earlier

See the [GitHub releases](https://github.com/DanielAmenou/create-request/releases).
