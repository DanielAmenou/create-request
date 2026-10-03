# create-request

[![npm version](https://img.shields.io/npm/v/create-request.svg)](https://www.npmjs.com/package/create-request)
[![Bundle size](https://deno.bundlejs.com/badge?q=create-request)](https://bundlejs.com/?q=create-request)
[![codecov](https://codecov.io/github/danielamenou/create-request/graph/badge.svg?token=OUBR6RNXZO)](https://codecov.io/github/danielamenou/create-request)
[![npm downloads](https://img.shields.io/npm/dt/create-request.svg)](https://www.npmjs.com/package/create-request)
[![License](https://img.shields.io/npm/l/create-request.svg)](https://github.com/DanielAmenou/create-request/blob/main/LICENSE)

A small, fully typed wrapper around `fetch`. Configure a request with `with*()` methods, then
send it and read the response with a `get*()` method.

```typescript
import create from "create-request";

const users = await create
  .get("https://api.example.com/users")
  .withTimeout(5000)
  .getJson<User[]>();
```

Retries, timeouts, interceptors and schema validation are built in. It has no dependencies, is
under 5 KB min+gzip, and runs in browsers and Node.js 22+.

## Table of contents

- [Installation](#installation)
- [60-second start](#60-second-start)
- [The mental model](#the-mental-model)
- [Requests](#requests): [creating](#creating), [configuring](#configuring),
  [executing](#executing), [reusing](#reusing)
- [Errors](#errors)
- [Api instances](#api-instances)
- [Retries](#retries)
- [Timeouts and cancellation](#timeouts-and-cancellation)
- [Interceptors](#interceptors)
- [Schema validation](#schema-validation)
- [GraphQL](#graphql)
- [Streaming and downloads](#streaming-and-downloads)
- [Testing and custom fetch](#testing-and-custom-fetch)
- [Cookies and CSRF](#cookies-and-csrf)
- [TypeScript](#typescript)
- [Design principles](#design-principles)
- [Size](#size)
- [Migrating from v1](#migrating-from-v1)
- [Contributing](#contributing)
- [License](#license)

## Installation

```sh
npm install create-request
```

| Runtime                  | Support                                                                                                                                                                          |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js                  | 22 or newer                                                                                                                                                                      |
| Browsers                 | Anything with `fetch`, `AbortSignal` and ES2022: Chrome/Edge 93+, Firefox 91+, Safari 15+ (2021 and later)                                                                       |
| Bun, Deno, edge runtimes | Only standard `fetch` / `AbortSignal` / `URL` APIs are used, so they are expected to work                                                                                        |
| Module formats           | ESM (`dist/index.js`) and CommonJS (`dist/index.cjs`). From CommonJS the entry point is the `default` export: `const { default: create, createApi } = require("create-request")` |
| TypeScript               | 5.0 or newer; the declarations resolve with the DOM lib **or** with `@types/node` alone                                                                                          |

## 60-second start

```typescript
import create, { createApi, isRequestError } from "create-request";

// 1. A request is built with with*() and executed with get*()
const users = await create.get("https://api.example.com/users").getJson<User[]>();

// 2. Everything you would configure lives on the chain
const created = await create
  .post("https://api.example.com/users")
  .withBearerToken(token)
  .withBody({ name: "Ada" }) // JSON-encoded, Content-Type set for you
  .withTimeout(5000)
  .withRetries(2)
  .getJson<User>();

// 3. Shared defaults live on an api instance: create one, export it, use it everywhere
const api = createApi().withBaseURL("https://api.example.com").withBearerToken(token);

try {
  await api.delete(`/users/${id}`).getResponse();
} catch (error) {
  // one error type, with a code and a status; a 404 here means it was already deleted
  if (!(isRequestError(error) && error.status === 404)) throw error;
}
```

## The mental model

1. `create.get(url)` / `create.post(url)` / … (or `api.get(path)`) return a **request**.
2. `with*()` methods configure it and return the same request, so calls chain. Nothing is sent
   yet.
3. A `get*()` method sends it and gives you the body in the format you ask for, or the
   `ResponseWrapper` with `getResponse()`, or `{ data, error }` with `getResult()`.
4. Every failure (HTTP status, network, timeout, abort, parsing, validation, interceptor)
   rejects with a **`RequestError`** whose `code` says which.
5. An **api instance** holds defaults (base URL, auth, timeout, retries, interceptors, …) for the
   requests it creates. It is immutable: `api.withHeader(…)` returns a new instance.

## Requests

### Creating

```typescript
create.get(url); // also head, options, post, put, patch, delete (alias: del)
api.get("/users"); // joined to the api's base URL
api.get(); // no path → the base URL itself
api.get<User>("/me"); // declare the JSON type once; getJson() / getData() / getResult() use it
```

Named factories exist as well: `createGet`, `createPost`, `createPut`, `createPatch`,
`createDelete`, `createHead`, `createOptions` (the same functions as `create.get`, …), and
`createApi()` is also available as `create.api()`.

### Configuring

```typescript
create
  .post("https://api.example.com/items")
  // headers & auth: an object, a Headers object or [name, value] pairs; names are
  // case-insensitive, and null (in an object) removes a header
  .withHeaders({ Accept: "application/json", "X-Trace": id })
  .withHeader("X-Feature", "beta")
  .withContentType("application/json") // rarely needed: JSON and text bodies set it themselves
  .withBearerToken(token) // or withBasicAuth(user, pass) / withAuthorization("Custom …")
  // query string: arrays repeat the key, Dates become ISO strings, null removes the key,
  // and a key set twice keeps the last value (a request can override an api default)
  .withQueryParams({ page: 2, tags: ["a", "b"], since: new Date() })
  .withQueryParam("q", "search term")
  // body (POST, PUT, PATCH, DELETE only): objects → JSON, strings → text/plain,
  // FormData / Blob / URLSearchParams / ArrayBuffer / typed arrays / ReadableStream → sent as-is
  .withBody({ name: "Ada" })
  // resilience
  .withTimeout(5000) // per attempt; covers the response and the body read
  .withRetries(3) // see "Retries" below
  .withSignal(signal) // an AbortSignal from anywhere; call it again to combine signals
  // fetch options, typed with the DOM unions
  .withCredentials("include")
  .withMode("cors")
  .withCache("no-store")
  .withRedirect("follow")
  .withReferrer("https://app.example.com/")
  .withReferrerPolicy("no-referrer")
  .withPriority("high")
  .withKeepAlive()
  .withIntegrity("sha256-…");
```

Sending a `FormData`? Do not set a `Content-Type`: `fetch` adds the multipart boundary itself
(the library removes one if an api default put it there). The remaining methods have sections of
their own: `withCookie(s)`, `withCsrf` and `withCsrfToken`
([Cookies and CSRF](#cookies-and-csrf)), `onRetry` ([Retries](#retries)), `withAbortController`
([Timeouts and cancellation](#timeouts-and-cancellation)), `withRequestInterceptor` /
`withResponseInterceptor` / `withErrorInterceptor` ([Interceptors](#interceptors)), `withGraphQL`
([GraphQL](#graphql)) and `withFetch` ([Testing and custom fetch](#testing-and-custom-fetch)).

### Executing

| Method              | Resolves with                                                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getJson<T>()`      | The body parsed as JSON (`null` for an empty body such as a `204`); `getJson(schema)` validates it first                                                            |
| `getText()`         | The body as text                                                                                                                                                    |
| `getBlob()`         | The body as a `Blob` typed with the response `Content-Type`                                                                                                         |
| `getArrayBuffer()`  | The body as an `ArrayBuffer`                                                                                                                                        |
| `getFormData()`     | The body parsed as `multipart/form-data` or `application/x-www-form-urlencoded`                                                                                     |
| `getBody()`         | The raw `ReadableStream` (not buffered, for streaming), or `null` when there is no body (`HEAD`, `204`)                                                             |
| `getData(selector)` | `getJson()` followed by a selector, e.g. `getData(page => page.items)`                                                                                              |
| `getResult<T>()`    | `{ data, error }` instead of throwing                                                                                                                               |
| `getResponse()`     | A `ResponseWrapper`: `status`, `statusText`, `ok`, `headers`, `url`, `method`, the underlying `raw` `Response`, and every body reader above (`getJson` … `getData`) |

The body is buffered once, so on a `ResponseWrapper` you can call several readers, in any order,
even concurrently. `getBody()` is the exception: it hands you the live stream, so it must be the
only reader of that response.

```typescript
const response = await api.get<User>("/me").getResponse();
console.log(response.status, response.headers.get("etag"));
const user = await response.getJson(); // User
const raw = await response.getText(); // still works: same buffer
```

### Reusing

A request is a template until you execute it. `clone()` copies its configuration so one request
can serve many calls; interceptors, signals and body objects are shared by reference.

```typescript
const search = api.get<Page<Post>>("/search").withTimeout(2000);
const [page1, page2] = await Promise.all([
  search.clone().withQueryParam("page", 1).getJson(),
  search.clone().withQueryParam("page", 2).getJson(),
]);
```

## Errors

Every rejection is a `RequestError`. Check it with `isRequestError(error)` (or `instanceof`) and
switch on `code`:

| `code`          | When                                                                                                                                                      | Also set                                                                                          |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `"HTTP"`        | The server answered with a non-2xx status (a 3xx under `withRedirect("manual")` and an opaque response under `withMode("no-cors")` resolve instead)       | `status`, `response`, `body`, `data`                                                              |
| `"NETWORK"`     | `fetch` itself failed: DNS, connection refused, CORS, offline                                                                                             | `cause` (the error `fetch` threw)                                                                 |
| `"TIMEOUT"`     | `withTimeout()` fired, or a signal from `AbortSignal.timeout()` aborted                                                                                   | `cause`; plus `status`, `response` when it fired while the body was being read                    |
| `"ABORTED"`     | A signal passed with `withSignal()` / `withAbortController()` aborted                                                                                     | `cause` (the abort reason); plus `status`, `response` when it fired while the body was being read |
| `"PARSE"`       | The body could not be read or parsed, or a `getData` selector threw                                                                                       | `status`, `response`, `cause`, `body` (for invalid JSON)                                          |
| `"VALIDATION"`  | The response failed the schema, or the request could not be built (empty or unparsable absolute URL, invalid header name or value, non-serialisable body) | `issues`, `body`, `status`, `response` for schema failures; `cause` for a rejected header or body |
| `"INTERCEPTOR"` | An interceptor or a callback (retry, CSRF token) threw; a `RequestError` thrown by an error interceptor is kept as-is                                     | `cause`; plus `status`, `response` (and `body`) when a response existed                           |
| `"GRAPHQL"`     | The GraphQL response had `errors` and `throwOnError` was on                                                                                               | `status`, `response`, `body`, `data`                                                              |

`url` and `method` are always set. `data` is `body` parsed as JSON (the shape most APIs use for
error details) and never throws. On `"HTTP"` errors, `body` holds at most 1 MB: a response that
announces more is left unread on `error.response`; a longer chunked or compressed one is cut off
and `body` is `undefined`. `isTimeout` / `isAborted` are shorthands for the two codes. In Node.js
a relative URL is a `"NETWORK"` failure, because `fetch` there has no page to resolve it against.

`JSON.stringify(error)`, which loggers and `res.json()` use, gives `name`, `code`, `message`,
`method`, `url` and `status`. The URL loses its query string, which may hold API keys or tokens,
and the response, body and cause are left out; read those from the error itself.

A few bad arguments are caught before the request runs: `withTimeout(-1)`, `withRetries(-1)` and
a `withBody()` value that cannot be serialised to JSON (a circular object, a `BigInt`) throw a
`RequestError` with code `"VALIDATION"` from the `with*` call itself. Because they are thrown
immediately, `getResult()` and `.catch()` never see them.

```typescript
try {
  await api.get<User>("/users/42").getJson();
} catch (error) {
  if (!isRequestError(error)) throw error;
  switch (error.code) {
    case "HTTP":
      console.log(error.status, error.data); // e.g. 404, { message: "No such user" }
      break;
    case "TIMEOUT":
    case "NETWORK":
      showError("Please try again");
      break;
    case "ABORTED":
      break; // the user navigated away
    default:
      console.error(error.message, error.cause);
  }
}
```

Prefer errors as values? `getResult()` resolves with the error instead of rejecting:

```typescript
const { data, error } = await api.get<User>("/me").getResult();
if (error) showError(error.message);
else render(data);
```

## Api instances

An api instance is a bundle of defaults for the requests it creates. It has every `with*` method
a request has, except the body and signal ones (those belong to a single request), plus
`withBaseURL()`. A timeout or retry count is validated when you set it on the api; URLs and
header values are checked when a request runs.

```typescript
// src/lib/api.ts
export const api = createApi()
  .withBaseURL("https://api.example.com")
  .withBearerToken(token)
  .withTimeout(5000)
  .withRetries(2)
  .withRequestInterceptor(config => {
    config.headers["x-trace-id"] = crypto.randomUUID();
  });

// anywhere
const posts = await api.get<Post[]>("/posts").getJson();
const post = await api.post<Post>("/posts").withBody({ title: "Hello" }).getJson();
const admin = api.withHeader("X-Role", "admin"); // a NEW instance; `api` is unchanged
```

Requests inherit the defaults and can override them: `api.get("/slow").withTimeout(30_000)`,
`api.get("/public").withHeaders({ Authorization: null })`, `api.get("/live").withTimeout(0)` (no
timeout at all). Interceptors and cookies are the exception: a request adds its own to the api's
instead of replacing them.

Paths are **joined** to the base URL, not resolved: `/v1` + `/users` → `/v1/users`; `users` and
`./users` work the same; `api.get()` without a path requests the base URL; absolute URLs
(`https://…`, `//…`) are used as-is. They carry the api's headers with them, so never build a
path from untrusted input.

## Retries

```typescript
api.get("/status").withRetries(3); // 3 retries (up to 4 requests), default policy
api.get("/status").withRetries({
  attempts: 3,
  delay: ({ attempt }) => attempt * 500, // ms, or a number; default: exponential backoff
  statuses: [503], // default: 408, 425, 429, 500, 502, 503, 504
  methods: ["GET", "HEAD", "OPTIONS", "PUT", "DELETE"], // default: all, POST and PATCH included
  maxDelay: 10_000, // caps the backoff (default 30 s); a longer Retry-After gives up instead
  shouldRetry: ({ error }) => error.code === "NETWORK", // full override of the decision
  onRetry: ({ attempt, error, delay }) =>
    console.warn(`retry ${attempt} in ${delay}ms: ${error.message}`),
});
```

How retries behave:

- By default, network errors, timeouts and the statuses above are retried with exponential
  backoff (300 ms, 600 ms, 1.2 s, … plus up to 100 ms of jitter, capped at `maxDelay`);
  validation errors and other failures are not.
- Every method is retried by default, `POST` and `PATCH` included. Pass
  `methods: ["GET", "HEAD", "OPTIONS", "PUT", "DELETE"]` if a repeated request could duplicate
  work.
- A `Retry-After` header is honoured unless you set `delay`; one longer than `maxDelay` cancels
  the retry so you can react yourself.
- Aborted requests and requests with a stream body are never retried, whatever the policy. That
  includes a timeout from your own `AbortSignal.timeout()` signal, which stays aborted (only
  `withTimeout()` timeouts are retried).
- The timeout applies to each attempt; error interceptors run once, after the last attempt.

`onRetry(callback)` also exists as a method; it does not enable retries by itself.

## Timeouts and cancellation

```typescript
api.get("/slow").withTimeout(2000); // rejects with code "TIMEOUT"
api.get("/stream").withTimeout(0); // removes a timeout inherited from the api

const controller = new AbortController();
const download = api.get("/big").withAbortController(controller).getBlob();
controller.abort(); // `download` rejects with code "ABORTED"

// Data-fetching libraries hand you a signal: pass it straight through
useQuery({
  queryKey: ["user", id],
  queryFn: ({ signal }) => api.get<User>(`/users/${id}`).withSignal(signal).getJson(),
});
```

The timeout covers the whole exchange (waiting for the response _and_ reading its body) and
starts after request interceptors ran. Taking the stream with `getBody()` ends it. A signal
created with `AbortSignal.timeout()` is reported as `"TIMEOUT"` too (but, unlike `withTimeout()`,
is not retried, because the signal stays aborted); any other abort is `"ABORTED"`. A request
whose signal is already aborted fails before anything is sent.

## Interceptors

Interceptors run in registration order: api-level ones first, then request-level ones.
Returning nothing keeps your in-place changes.

```typescript
let accessToken = token;
const replayed = new WeakSet<HttpRequest>(); // requests already replayed after a 401
const authed = api
  // before the request: mutate the config, return a new one, or return a Response to skip the network
  .withRequestInterceptor(config => {
    config.headers["authorization"] = `Bearer ${accessToken}`;
  })
  // after a successful response, with the request that produced it
  .withResponseInterceptor((response, request) => {
    console.debug(request.method, response.url, response.status);
  })
  // once the request failed for good: replace the error, or recover by returning a ResponseWrapper
  .withErrorInterceptor(async (error, request) => {
    if (error.status !== 401 || replayed.has(request)) return;
    accessToken = await refreshToken(); // the request interceptor above picks it up
    const retry = request.clone(); // same method, body, headers and query
    replayed.add(retry); // the clone runs this interceptor too; never loop on a persistent 401
    return retry.getResponse();
  });
```

The `config` a request interceptor receives is the `RequestInit`-shaped object about to be sent:
`url`, `method`, lower-case `headers`, the serialised `body` (JSON bodies are already strings) and
the combined `signal`. The CSRF header (`withCsrf()`) and the timeout are added after request
interceptors ran. A `Response` returned by a request interceptor skips the network (and the
remaining request interceptors, URL/header validation and the CSRF header), but its status is
checked and response interceptors run like for a fetched one; `withTimeout()` does not apply to
it. A request or response interceptor that throws fails the request with code `"INTERCEPTOR"`;
an error interceptor that throws replaces the error with an `"INTERCEPTOR"` one (a thrown
`RequestError` is kept as-is).

## Schema validation

Pass any [Standard Schema](https://standardschema.dev) (zod 3.24+, valibot 1+, arktype 2+,
effect via `Schema.standardSchemaV1`, and more) to `getJson`, `getData` or `getResult`. The
body is validated at runtime and the result is typed from the schema; this library adds no
dependency for it.

```typescript
import { z } from "zod";

const User = z.object({ id: z.number(), name: z.string() });

const user = await api.get("/me").getJson(User); // { id: number; name: string }
const names = await api.get("/users").getData(z.array(User), users => users.map(u => u.name));
const { data, error } = await api.get("/me").getResult(User);
```

A mismatch rejects with `code: "VALIDATION"`; `error.issues` lists every problem and
`error.message` names the first one (e.g. `Response validation failed: Invalid input: expected
number, received string at id`).

## GraphQL

```typescript
const result = await api
  .post("/graphql")
  .withGraphQL("query ($id: ID!) { user(id: $id) { name } }", { id }, { throwOnError: true })
  .getJson<{ data: { user: User } }>();
```

`withGraphQL` sends `{ query, variables }` as JSON. With `throwOnError`, a response whose `errors`
array is non-empty is reported as a `"GRAPHQL"` error by `getJson()`, `getData()` and `getResult()`
(GraphQL servers answer `200` for those); `getResponse()` and the other readers do not check it.

## Streaming and downloads

`getBody()` returns the raw stream; everything else is available on the wrapper.

```typescript
const response = await api.get("/export.csv").getResponse();
const total = Number(response.headers.get("content-length")) || undefined;
const decoder = new TextDecoder();
let loaded = 0;
const reader = response.getBody()!.getReader(); // ends the withTimeout() deadline: the stream is yours
for (;;) {
  const { done, value } = await reader.read();
  if (done) break;
  loaded += value.length;
  if (total) onProgress(loaded / total);
  handleChunk(decoder.decode(value, { stream: true }));
}
```

Request bodies can be streams too (`withBody(readableStream)`), sent with `duplex: "half"`.
Node.js and Chromium support that; Firefox and Safari do not. Stream bodies are never retried.
Upload _progress_ is not something `fetch` exposes in browsers, so there is no API for it.

## Testing and custom fetch

`withFetch()` makes a request or an api call your function instead of the global `fetch`: a stub
in tests, undici with a dispatcher in Node.js (an `Agent` for keep-alive tuning and mTLS, a
`ProxyAgent` for proxies), or a framework's patched fetch. The function receives the final URL
and `RequestInit`; it must honour `init.signal` for timeouts and cancellation to keep working.

```typescript
// Tests: no global mocks
const stubbed = api.withFetch(
  async () => new Response('{"id":1}', { headers: { "content-type": "application/json" } })
);

// Node.js: undici with a dispatcher (an Agent here; a ProxyAgent for proxies)
const viaAgent = api.withFetch(
  (url, init) =>
    undiciFetch(url, {
      ...(init as object),
      dispatcher: agent,
    }) as unknown as Promise<Response>
);

// Next.js: pass caching hints to the framework's fetch
const cached = api.withFetch((url, init) =>
  fetch(url, { ...init, next: { revalidate: 60 } } as RequestInit)
);
```

## Cookies and CSRF

- `withCookie(name, value)` / `withCookies({ … })` add a `Cookie` header (**server-side only**).
  Browsers ignore a `Cookie` header on `fetch` and send their own cookies; use
  `withCredentials("include")` there. Names and values are sent verbatim, so never pass untrusted
  input (a `;` in a value would smuggle in another cookie).
- `withCsrf()` copies the `XSRF-TOKEN` cookie (URL-decoded) into an `X-XSRF-TOKEN` header unless
  the request already has one (the Angular, Laravel and Spring convention), **only for
  same-origin URLs**. The origin is judged on the final request URL, after interceptors and
  before any redirect (`fetch` forwards custom headers across redirects, so use
  `withRedirect("error")` for endpoints that may redirect elsewhere). Outside a browser there is
  no page origin and every URL counts as same-origin. Configure other setups with
  `withCsrf({ cookie: "csrftoken", header: "X-CSRFToken" })` (Django),
  `withCsrf({ token: () => readMetaTag() })` (Rails; the token is then sent as `X-CSRF-Token`) or
  `withCsrf({ crossOrigin: true })`.
- `withCsrfToken(token)` sends a token you already hold as a plain header, wherever you send the
  request; prefer `withCsrf({ token })` to keep the same-origin check.
- Nothing is sent unless you ask for it: there is no automatic `X-Requested-With` header. Add
  `withHeader("X-Requested-With", "XMLHttpRequest")` if a framework still checks it.

Custom headers (including these) make cross-origin requests CORS-preflighted; that is standard
browser behaviour, not something the library adds on its own.

## TypeScript

- `api.get<User>("/me")` (or `create.get<User>(url)`) declares the response type once; every
  reader uses it: `getJson()`, `getData(user => user.name)`, `getResult()`, `getResponse()`.
- Per-call overrides still work: `getJson<Other>()`. An endpoint that can answer `204` is typed as
  `getJson<User | null>()`, since an empty body yields `null` at runtime.
- `withBody` / `withGraphQL` are a compile error on `GET`, `HEAD` and `OPTIONS` requests (and on
  a `BaseRequest`, whose method is unknown; narrow it with `as BodyRequest`).
- Method-typed aliases are exported for annotations: `GetRequest<T>`, `PostRequest<T>`, …,
  `BaseRequest<T>` (any method), `BodyRequest<T>`; the class itself is `HttpRequest<Method, T>`.
- `ApiBuilder` (the api instance type) is derived from `HttpRequest`, so the two can never drift,
  and hovering an api method shows the request method's documentation.
- `RequestError<TData>` types `error.data`; `error.code` is the `RequestErrorCode` union.
- Exported types: `Method`, `BodyMethod`, `Body`, `QueryValue`, `QueryParams`, `HeadersRecord`,
  `CookiesRecord`, `RetryConfig`, `RetryContext`, `RequestConfig`, `RequestInterceptor`,
  `ResponseInterceptor`, `ErrorInterceptor`, `FetchFunction`, `CsrfOptions`, `GraphQLOptions`,
  `RequestResult`, `RequestErrorCode`, `RequestErrorOptions`, `ApiBuilder`, `StandardSchemaV1`.
- The fetch options (`withCache`, `withCredentials`, `withMode`, `withRedirect`, `withPriority`,
  `withReferrerPolicy`) are typed with the DOM unions, spelled so that they also resolve in a
  Node-only project (`@types/node`, no `dom` lib).
- `withQueryParams`, `withHeaders`, `withCookies` and `withGraphQL` variables accept
  interface-typed objects (no index signature needed).

## Design principles

- **One thing at a time.** Every option is a method your editor autocompletes, so the whole API
  is discoverable from the chain.
- **Correct by default.** Only retriable failures are retried (with backoff and `Retry-After`),
  aborted requests are never retried, CSRF tokens only go to same-origin URLs, and a body can be
  read in any format, in any order.
- **Types you can trust.** `getJson<User>()` is a `Promise<User>`, `withBody` on a `GET` does not
  compile, api instances share the request's configuration methods (derived, not copied), and
  `error.code` narrows.
- **Nothing global.** Defaults live on immutable api instances that you create and export
  yourself.

## Size

Measured with `size-limit` on the published build of this version (`npm run size`):

| Import                         | min + gzip | min + brotli |
| ------------------------------ | ---------: | -----------: |
| everything (`import * as …`)   |    4.92 KB |      4.46 KB |
| `import { createGet }` only    |    4.32 KB |              |
| `import { RequestError }` only |    0.25 KB |              |

The package is one module with no side effects, so bundlers drop whatever you do not import. The
JavaScript ships without JSDoc comments; the documentation lives in the declaration files, where
your editor reads it.

## Migrating from v1

v2 keeps the fluent API and most method names, and removes the global `create.config`, the
`.withCache.NO_CACHE()`-style enum getters and the runtime enums. See [MIGRATION.md](MIGRATION.md)
for the complete v1 → v2 map and the list of behaviour changes.

## Contributing

`npm run check` runs lint, format, type-check, the type tests (including every TypeScript code
block of this README), the test suite at 100% coverage, the build, package linting and the size
gate. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) · [Website](https://create-request.com) · [Sponsor](https://github.com/sponsors/DanielAmenou)
