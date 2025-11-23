# create-request

[![License](https://img.shields.io/npm/l/create-request.svg)](https://github.com/DanielAmenou/create-request/blob/main/LICENSE)
[![codecov](https://codecov.io/github/danielamenou/create-request/graph/badge.svg?token=OUBR6RNXZO)](https://codecov.io/github/danielamenou/create-request)
[![npm downloads](https://img.shields.io/npm/dt/create-request.svg)](https://www.npmjs.com/package/create-request)
[![npm version](https://img.shields.io/npm/v/create-request.svg)](https://www.npmjs.com/package/create-request)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/create-request)](https://bundlephobia.com/package/create-request)
[![TypeScript](https://img.shields.io/badge/TypeScript-4.7%2B-blue)](https://www.typescriptlang.org/)
[![Known Vulnerabilities](https://snyk.io/test/github/DanielAmenou/create-request/badge.svg)](https://snyk.io/test/github/DanielAmenou/create-request)

`create-request` is a modern TypeScript library that transforms how you make API calls. Built as an elegant wrapper around the native Fetch API, it provides a chainable, fluent interface that dramatically reduces boilerplate while adding powerful features like automatic retries, timeout handling, and comprehensive error management.

## Table of Contents

- [Core Features](#core-features)
- [Why create-request](#why-create-request)
- [Mental Model](#mental-model)
- [Installation](#installation)
- [Basic Usage](#basic-usage)
- [URL Handling](#url-handling)
- [Advanced Usage](#advanced-usage)
  - [API Builder](#api-builder)
  - [Automatic Retries with Delay](#automatic-retries-with-delay)
  - [Interceptors](#interceptors)
  - [Request Cancellation](#request-cancellation)
  - [Data Selection](#data-selection)
  - [TypeScript Support](#typescript-support)
  - [CSRF Protection](#csrf-protection)
  - [Subresource Integrity and Cache Control](#subresource-integrity-and-cache-control)
- [Performance Considerations](#performance-considerations)
- [Browser Support](#browser-support)
- [Comparison of JavaScript HTTP Client Libraries](#comparison-of-javascript-http-client-libraries)
- [License](#license)

## Core Features

- 🚀 **Performance** - Tiny bundle size with zero dependencies
- 🚧 **Error Handling** - Detailed error info with custom error class
- ⛓️ **Chainable API** - Build and execute requests with a fluent interface
- ⏱️ **Timeout Support** - Set timeouts for requests with automatic aborts
- 🛡️ **Type Safety** - Full TypeScript support with intelligent type inference
- 🔐 **Auth Helpers** - Simple methods for common authentication patterns
- 🔍 **Data Selection** - Extract and transform specific data from responses
- 🔁 **Automatic Retries** - Retry failed requests with customizable settings
- 📉 **Reduced Boilerplate** - Write 60% less code for common API operations
- 🔒 **CSRF Protection** - Built-in safeguards against cross-site request forgery
- 🏗️ **API Builder** - Create configured API instances with reusable default settings
- 🛑 **Request Cancellation** - Abort requests on demand with AbortController integration
- 🔌 **Interceptors** - Global and per-request interceptors for requests, responses, and errors
- 🔷 **GraphQL Support** - Built-in GraphQL query and mutation helpers

## Why create-request?

**API interactions often require repetitive code patterns** - handling HTTP status checks, parsing responses, managing errors, and dealing with TypeScript types. `create-request` provides a clean, efficient solution with an elegant API that separates request building from execution:

### With Regular Fetch

```typescript
async function createUser(userData) {
  try {
    const response = await fetch("https://api.example.com/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Basic " + btoa("username:password"),
      },
      body: JSON.stringify(userData),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Fetch error:", error);
    throw error;
  }
}
```

### With create-request

```typescript
import create from "create-request";

function createUser(userData) {
  return create
    .post("https://api.example.com/users")
    .withBasicAuth("username", "password")
    .withBody(userData) // Content-Type automatically set to application/json
    .getData<User>() // Type-safe response handling
    .catch(error => {
      console.error("Fetch error:", error);
      throw error;
    });
}
```

### Why Not Object-Based Configuration?

Many HTTP client libraries (like Axios, Got, and even the native Fetch API) use object-based configuration where all options are passed in a single configuration object. While this approach works, it creates a poor developer experience:

**The Developer Experience Problem:**

With object-based configuration, you're constantly context-switching between your code and documentation. You need to:

- Remember exact option names and their structure
- Look up documentation to discover available options
- Guess at nested object structures
- Hope your IDE autocomplete works with complex nested types

```typescript
// Object-based: What options are available? What's the structure? Need to check docs
axios.post("https://api.example.com/users", userData, {
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  timeout: 5000,
  params: { validate: true },
  withCredentials: true,
});
```

**Superior Developer Experience with Fluent API:**

`create-request`'s fluent API is designed for an exceptional developer experience. Every method is discoverable, self-documenting, and provides rich IDE support:

#### 1. Intelligent Autocomplete & IntelliSense

As you type, your IDE suggests the exact methods you need. No guessing, no documentation lookup:

```typescript
// Start typing and see all available methods
create
  .post(url)
  .withBearerToken() // ← IDE suggests: withBearerToken(token: string)
  .withTimeout() // ← IDE suggests: withTimeout(ms: number)
  .withRetries(); // ← IDE suggests: withRetries(count: number | RetryConfig)
```

#### 2. Rich JSDoc Documentation in Your IDE

Hover over any method to see comprehensive documentation, examples, and parameter details - all without leaving your editor:

```typescript
// Hover over withRetries to see:
// "Configures automatic retry behavior for failed requests.
//  @param retries - Number of retry attempts or retry configuration object
//  @example
//    .withRetries(3)
//    .withRetries({ attempts: 3, delay: 1000 })"
create.get(url).withRetries(3);
```

#### 3. Discoverability Through Method Chaining

Each method reveals what's available next. Explore the API naturally through autocomplete:

```typescript
// Discover available options as you chain
create
  .post(url)
  .withHeaders() // ← See all header methods
  .withBearerToken() // ← See all auth methods
  .withTimeout() // ← See all timeout/retry methods
  .withQueryParams(); // ← See all query param methods
```

#### 4. No Context Switching

Stay in your flow. Everything you need is in your IDE - documentation, types, examples, and autocomplete. No alt-tabbing to documentation websites.

This developer-first approach means you spend less time looking things up and more time writing code that works.

## Mental Model

### 1. **Separation of Building and Execution**

Requests are built first, then executed. This separation allows you to:

- Configure requests incrementally
- Reuse request configurations
- Pass requests around before executing them
- Chain configuration methods fluently

```typescript
// Building phase: configure the request
const request = create
  .get("https://api.example.com/users")
  .withBearerToken(token)
  .withTimeout(5000);

// Execution phase: actually make the HTTP call
const data = await request.getJson();
```

### 2. **Fluent Chainable Interface**

Every configuration method returns the request instance, enabling method chaining. This creates a readable, declarative API that reads like a sentence:

```typescript
// Reads like: "Create a POST request to users endpoint, with auth, body, and timeout, then get JSON"
const user = await create
  .post("https://api.example.com/users")
  .withBearerToken(token)
  .withBody(userData)
  .withTimeout(3000)
  .getJson();
```

### 3. **Configuration Layers**

Configuration follows a layered approach, with more specific settings overriding general ones:

1. **Global Configuration** (via `create.config`) - Applies to all requests
2. **API Builder Defaults** (via `create.api()`) - Applies to requests from that API instance
3. **Per-Request Configuration** - Specific to individual requests

```typescript
// Global: all requests get this
create.config.setCsrfToken("global-token");

// API instance: requests from this API get these defaults
const api = create
  .api()
  .withBaseURL("https://api.example.com")
  .withBearerToken("default-token");

// Per-request: this specific request overrides the default token
const user = await api
  .get("/users")
  .withBearerToken("specific-token") // Overrides default-token
  .getJson();
```

### 4. **Request Definition with `with...` Functions**

All request configuration is done through methods that start with `with...`. This consistent naming convention makes it immediately clear which methods are used for configuration:

```typescript
// All configuration uses 'with...' prefix
const request = create
  .get("https://api.example.com/users")
  .withHeaders({ "X-API-Key": "abc123" })
  .withBearerToken("token")
  .withTimeout(5000)
  .withRetries(3)
  .withQueryParams({ page: 1 })
  .withCookie("session", "abc123");
```

This pattern makes the API self-documenting - any method starting with `with...` is a configuration method that returns the request instance for chaining.

### 5. **Request Lifecycle**

The typical request lifecycle follows this pattern:

```text
Build → Configure → Execute → Transform → Handle
```

1. **Build**: Create a request with a method and URL (`create.get(url)`)
2. **Configure**: Chain configuration methods using `with...` functions (`.withHeaders()`, `.withTimeout()`, etc.)
3. **Execute**: Call an execution method (`.getJson()`, `.getData()`, etc.)
4. **Transform**: Optionally transform the response (via `.getData()` selector or interceptors)
5. **Handle**: Process the result or catch errors

### 6. **Promise-Based Execution**

All execution methods return Promises, making the library compatible with:

- `async/await` syntax (recommended)
- `.then()/.catch()` chains
- Promise utilities like `Promise.all()`, `Promise.race()`, etc.

```typescript
// All of these work:
const data1 = await request.getJson();

request.getJson().then(data => console.log(data));

const results = await Promise.all([
  create.get("/users").getJson(),
  create.get("/posts").getJson(),
]);
```

### 7. **Comprehensive JSDoc Documentation**

The library includes extensive JSDoc documentation throughout the codebase. This documentation is valuable for developers of all levels:

- **For Junior Developers**: JSDoc provides clear explanations of what each method does, parameter types, return values, and usage examples directly in your IDE. This helps with learning and understanding the API without constantly referring to external documentation.

- **For Senior Developers**: JSDoc offers detailed type information, edge cases, and implementation details that enable deeper understanding and more advanced usage patterns. The type definitions help with TypeScript inference and ensure type safety.

## Installation

```bash
# npm
npm install create-request

# yarn
yarn add create-request

# pnpm
pnpm add create-request
```

## Basic Usage

### Creating Requests

```typescript
import create from "create-request";

// Create different request types with URL
const getRequest = create.get("https://api.example.com/users"); // GET
const putRequest = create.put("https://api.example.com/users/1"); // PUT
const postRequest = create.post("https://api.example.com/users"); // POST
const headRequest = create.head("https://api.example.com/users/1"); // HEAD
const patchRequest = create.patch("https://api.example.com/users/1"); // PATCH
const deleteRequest = create.del("https://api.example.com/users/1"); // DELETE
const optionsRequest = create.options("https://api.example.com/users"); // OPTIONS
```

### Request Configuration

The library provides a comprehensive set of configuration methods that can be chained together to customize your requests:

```typescript
import create, {
  RequestPriority,
  CredentialsPolicy,
  RedirectMode,
  ReferrerPolicy,
  SameSitePolicy,
  CacheMode,
} from "create-request";

// Configure request options
const request = create
  .get("https://api.example.com/users")
  // Basic headers
  .withHeaders({ "X-API-Key": "abc123", "Accept-Language": "en-US" })
  .withHeader("Custom-Header", "value") // Add a single header

  // Timeout settings
  .withTimeout(5000) // Request will abort after 5 seconds

  // Automatic retry configuration
  .withRetries(3) // Retry up to 3 times on failure
  // Or use a config object with delay support:
  .withRetries({ attempts: 3, delay: 1000 }) // Retry 3 times with 1 second delay between attempts
  .onRetry(({ attempt, error }) => {
    console.log(`Attempt ${attempt} failed: ${error.message}. Retrying...`);
  })

  // Authentication methods
  .withBearerToken("your-token") // Adds Authorization: Bearer your-token
  .withBasicAuth("username", "password") // HTTP Basic Authentication
  .withAuthorization("auth-scheme value") // Custom authorization header

  // Add a single cookie
  .withCookie("language", "en-US")

  // Add multiple cookies
  .withCookies({
    sessionId: "abc123",
    preferences: { value: "dark-mode", secure: true },
    tracking: { value: "enabled", sameSite: SameSitePolicy.STRICT },
  })

  // URL parameters (supports arrays, null/undefined filtering, and all types)
  .withQueryParams({ search: "term", page: 1, limit: 20, tags: ["js", "ts"] })
  .withQueryParam("filter", "active") // Add a single query parameter
  .withQueryParam("ids", [1, 2, 3]) // Array values create multiple query params

  // Request body configuration (for POST/PUT/PATCH)
  .withContentType("application/json") // Set specific content type

  // Fetch API options
  // Note: These methods support three styles - Fluent API (shown below), Enum-based (e.g., .withMode(RequestMode.CORS)), or String-based (e.g., .withMode("cors"))
  .withCredentials.INCLUDE() // Includes cookies with cross-origin requests
  .withMode.CORS() // Controls CORS behavior
  .withRedirect.FOLLOW() // Controls redirect behavior (follow, error, manual)
  .withReferrer("https://example.com") // Sets request referrer
  .withReferrerPolicy.NO_REFERRER_WHEN_DOWNGRADE() // Controls referrer policy
  .withPriority.HIGH() // Sets request priority
  .withKeepAlive(true) // Keeps connection alive after the page is unloaded
  .withIntegrity("sha256-abcdef1234567890...") // Sets subresource integrity hash
  .withCache("no-cache"); // Controls cache behavior (or use .withCache.NO_CACHE())
```

Each configuration method returns the request object, allowing for a fluent interface where methods can be chained together. You can configure only what you need for a specific request:

```typescript
// Simple example with just what's needed
const users = await create
  .get("https://api.example.com/users")
  .withBearerToken(userToken)
  .withQueryParams({ q: searchTerm, limit: 20 })
  .withTimeout(3000)
  .getData();
```

### Request Bodies (POST/PUT/PATCH)

```typescript
// JSON body (Content-Type automatically set to application/json)
const jsonRequest = create
  .post("https://api.example.com/users")
  .withBody({ name: "John", age: 30 });

// String body (Content-Type automatically set to text/plain)
const textRequest = create
  .post("https://api.example.com/users")
  .withBody("Plain text content");

// Form data
const formData = new FormData();
formData.append("name", "John");
formData.append("file", fileBlob);

const formRequest = create.post("https://api.example.com/users").withBody(formData);

// URLSearchParams (typically used for application/x-www-form-urlencoded)
const params = new URLSearchParams();
params.append("username", "john");
params.append("password", "secret");

const formUrlEncodedRequest = create.post("https://api.example.com/login").withBody(params);
```

### GraphQL Requests

The library provides built-in support for GraphQL queries and mutations:

```typescript
// GraphQL query without variables
const userQuery = "query { users { id name email } }";
const users = await create
  .post("https://api.example.com/graphql")
  .withGraphQL(userQuery)
  .getJson();

// GraphQL query with variables
const userQuery = "query GetUser($id: ID!) { user(id: $id) { name email } }";
const user = await create
  .post("https://api.example.com/graphql")
  .withGraphQL(userQuery, { id: "123" })
  .getJson();
```

#### GraphQL Error Handling

GraphQL errors do not cause exceptions by default. Use the `throwOnError` option to make them throw exceptions:

```typescript
// Throw an error if the GraphQL response contains errors
const userQuery = "query GetUser($id: ID!) { user(id: $id) { name email } }";
try {
  const user = await create
    .post("https://api.example.com/graphql")
    .withGraphQL(userQuery, { id: "123" }, { throwOnError: true })
    .getJson();
} catch (error) {
  console.error(error.message);
}
```

The `withGraphQL` method automatically:

- Formats the body as JSON with `query` and optional `variables` properties
- Sets `Content-Type` to `application/json`
- Validates the query is non-empty
- Validates variables are a plain object (not arrays or null)
- Optionally throws errors when GraphQL response contains errors (with `throwOnError: true`)

### Query Parameters Advanced Features

The library supports advanced query parameter handling:

```typescript
// Array values create multiple query params with the same key
const request = create.get("https://api.example.com/search").withQueryParams({
  tags: ["javascript", "typescript", "node"], // ?tags=javascript&tags=typescript&tags=node
  page: 1,
  active: true,
});

// Null and undefined values are automatically filtered out
const filtered = create.get("https://api.example.com/users").withQueryParams({
  name: "John",
  age: null, // Ignored
  email: undefined, // Ignored
});

// Supports all JavaScript types (strings, numbers, booleans, arrays)
const typed = create.get("https://api.example.com/data").withQueryParams({
  page: 1, // Number
  active: true, // Boolean
  tags: ["js", "ts"], // Array
  name: "John", // String
});

// Merge with existing query params in URL
const merged = create
  .get("https://api.example.com/users?existing=value")
  .withQueryParams({ new: "param" }); // Both existing and new params included
```

### Executing Requests

```typescript
// Get the full response
const response = await create.get("https://api.example.com/endpoint").getResponse();

// With direct data extraction
const jsonData = await create.get("https://api.example.com/endpoint").getJson();
const textData = await create.get("https://api.example.com/endpoint").getText();
const blobData = await create.get("https://api.example.com/endpoint").getBlob();
const bodyStream = await create.get("https://api.example.com/endpoint").getBody();
const arrayBuffer = await create.get("https://api.example.com/endpoint").getArrayBuffer();

// Using the data selector API to extract specific data
const userData = await create
  .get("https://api.example.com/users")
  .getData(data => data.results.users);

// Using the data selector without a selector function just returns the full JSON response
const fullData = await create.get("https://api.example.com/data").getData();
```

### ResponseWrapper Properties

When you use `getResponse()`, you get a `ResponseWrapper` object that provides convenient access to response properties and methods:

```typescript
const response = await create.get("https://api.example.com/users").getResponse();

// Access response properties directly
console.log(response.status); // HTTP status code (e.g., 200)
console.log(response.statusText); // Status text (e.g., "OK")
console.log(response.ok); // Boolean: true if status is 200-299
console.log(response.headers); // Headers object
console.log(response.url); // Request URL
console.log(response.method); // HTTP method
console.log(response.raw); // Raw Response object from fetch

// Use wrapper methods for body parsing
const stream = response.getBody(); // ReadableStream or null
const json = await response.getJson();
const text = await response.getText();
const blob = await response.getBlob();
const arrayBuffer = await response.getArrayBuffer();
```

### Error Handling

All errors from requests are instances of `RequestError` with detailed information:

```typescript
try {
  const data = await create.get("https://api.example.com/data").getJson();
} catch (error) {
  // error will always be a RequestError
  console.log(error.message); // Error message
  console.log(error.status); // HTTP status code (if available)
  console.log(error.url); // Request URL
  console.log(error.method); // HTTP method
  console.log(error.isTimeout); // Whether it was a timeout
  console.log(error.isAborted); // Whether it was aborted/cancelled

  // Access the original response if available
  if (error.response) {
    // Raw Response object is available
    console.log(error.response.status);
  }
}
```

## URL Handling

The library handles both absolute and relative URLs, and automatically merges query parameters:

```typescript
// Relative URLs (preserved as-is)
const relative = await create.get("/api/users").getJson();

// Absolute URLs
const absolute = await create.get("https://api.example.com/users").getJson();

// Merging query params with existing URL params
const merged = await create
  .get("https://api.example.com/users?page=1")
  .withQueryParams({ limit: 20, sort: "name" })
  .getJson();
// Result: https://api.example.com/users?page=1&limit=20&sort=name

// Special characters and unicode are properly encoded
const encoded = await create
  .get("https://api.example.com/search")
  .withQueryParams({ name: "用户名", filter: "status:active" })
  .getJson();
```

## Advanced Usage

### API Builder

The API builder allows you to create configured API instances with default settings that can be reused across your application. This is perfect for setting up a base URL, default headers, timeout values, and other request configurations once and using them for all requests.

#### Creating an API Instance

```typescript
import create from "create-request";

// Create a configured API instance
const api = create.api().withBaseURL("https://api.example.com").withTimeout(20000);

// Use it with relative URLs
const users = await api.get("/users").getJson();

// Or without URL (uses baseURL)
const users = await api.get().getJson();
const newUser = await api.post().withBody({ name: "John" }).getJson();
```

#### Core API Builder Method

- **`.withBaseURL(baseURL: string)`** - Set the base URL for all requests. Relative URLs will be resolved against this base URL.

#### Available Request Methods

The API builder provides access to all request configuration methods from `BaseRequest` that can be used as defaults. These methods will apply to all requests made through the API instance:

**Authentication & Headers:**

- `withHeaders(headers)` - Set default headers for all requests
- `withHeader(key, value)` - Add a single default header
- `withAuthorization(authValue)` - Set Authorization header
- `withBasicAuth(username, password)` - Add Basic Authentication
- `withBearerToken(token)` - Add Bearer token authentication
- `withContentType(contentType)` - Set default Content-Type header

**Cookies:**

- `withCookies(cookies)` - Add cookies to all requests
- `withCookie(name, value)` - Add a single cookie

**Request Configuration:**

- `withTimeout(timeout)` - Set default timeout for all requests
- `withRetries(retries)` - Configure default retry behavior
- `withReferrer(referrer)` - Set default referrer
- `withKeepAlive(keepalive)` - Configure keep-alive
- `withIntegrity(integrity)` - Set integrity check

**CSRF Protection:**

- `withCsrfToken(token, headerName?)` - Set CSRF token
- `withoutCsrfProtection()` - Disable CSRF protection
- `withAntiCsrfHeaders()` - Enable anti-CSRF headers

**Interceptors:**

- `withRequestInterceptor(interceptor)` - Add default request interceptor
- `withResponseInterceptor(interceptor)` - Add default response interceptor
- `withErrorInterceptor(interceptor)` - Add default error interceptor

These methods can be chained together and will apply to all requests made through the API instance:

```typescript
const api = create
  .api()
  .withBaseURL("https://api.example.com")
  .withBearerToken("token123")
  .withCookies({ session: "abc123" })
  .withTimeout(5000)
  .withHeaders({ "X-Custom": "value" });

// All requests will include the Bearer token, cookies, timeout, and headers
await api.get("/users").getJson();
await api.post("/posts").withBody({ title: "Hello" }).getJson();
```

#### URL Resolution

The API builder intelligently resolves URLs:

```typescript
const api = create.api().withBaseURL("https://api.example.com");

// Relative URLs are resolved against baseURL
await api.get("users").getJson(); // → https://api.example.com/users
await api.get("/users").getJson(); // → https://api.example.com/users
await api.get("./users").getJson(); // → https://api.example.com/users

// Absolute URLs are used as-is
await api.get("https://other-api.com/data").getJson(); // → https://other-api.com/data

// No URL uses baseURL directly
await api.get().getJson(); // → https://api.example.com
```

#### Overriding Defaults

You can override default settings on individual requests:

```typescript
const api = create
  .api()
  .withBaseURL("https://api.example.com")
  .withTimeout(5000)
  .withBearerToken("token123");

// Override timeout for this specific request
await api.get("/slow-endpoint").withTimeout(30000).getJson();

// Override headers (merges with defaults)
await api
  .get("/users")
  .withBearerToken("newtoken")
  .withHeaders({ "X-Custom": "value" })
  .getJson();
// Result: Authorization: "Bearer newtoken", X-Custom: "value"
```

#### All HTTP Methods Supported

The API instance supports all HTTP methods:

```typescript
const api = create.api().withBaseURL("https://api.example.com");

await api.get("/users").getJson();
await api.post("/users").withBody({ name: "John" }).getJson();
await api.put("/users/1").withBody({ name: "Jane" }).getJson();
await api.patch("/users/1").withBody({ status: "active" }).getJson();
await api.del("/users/1").getJson();
await api.head("/users").getResponse();
await api.options("/users").getResponse();
```

#### Merging Default Headers

Multiple calls to `withHeaders` will merge headers, with later calls taking precedence:

```typescript
const api = create
  .api()
  .withBaseURL("https://api.example.com")
  .withBearerToken("token123")
  .withHeaders({ "X-Custom": "value1" })
  .withHeaders({ "X-Other": "value2" })
  .withBearerToken("newtoken");

// Result: Authorization: "Bearer newtoken", X-Custom: "value1", X-Other: "value2"
```

#### Complete Example

```typescript
// Set up your API once
const api = create
  .api()
  .withBaseURL("https://api.example.com/v1")
  .withHeaders({ "Content-Type": "application/json" })
  .withCookies({ session: "abc123" })
  .withBearerToken("token123")
  .withTimeout(20000);

// Use throughout your application
async function getUsers() {
  return api.get("/users").getJson();
}

async function createUser(userData: User) {
  return api.post("/users").withBody(userData).getJson();
}

async function updateUser(id: string, userData: Partial<User>) {
  return api.put(`/users/${id}`).withBody(userData).getJson();
}

async function deleteUser(id: string) {
  return api.del(`/users/${id}`).getJson();
}
```

### Automatic Retries with Delay

The `withRetries()` method supports both simple number-based retries and object-based configuration with customizable delays:

```typescript
// Simple number
const request1 = create.get("https://api.example.com/data").withRetries(3);

// With fixed delay between retries
const request2 = create
  .get("https://api.example.com/data")
  .withRetries({ attempts: 3, delay: 1000 }); // Wait 1 second between retries

// With exponential backoff function
const request3 = create.get("https://api.example.com/data").withRetries({
  attempts: 5,
  delay: ({ attempt }) => Math.min(1000 * Math.pow(2, attempt - 1), 10000), // Exponential backoff capped at 10s
});

// With error-aware delay (e.g., longer delay for rate limits)
const request4 = create.get("https://api.example.com/data").withRetries({
  attempts: 3,
  delay: ({ attempt, error }) => {
    if (error.status === 429) {
      return 5000; // Wait 5 seconds for rate limit errors
    }
    return attempt * 1000; // Linear backoff for other errors
  },
});
```

**Rate Limit Aware:**

```typescript
.withRetries({
  attempts: 3,
  delay: ({ error }) => {
    if (error.status === 429) {
      // Check Retry-After header if available
      const retryAfter = error.response?.headers.get("Retry-After");
      return retryAfter ? parseInt(retryAfter) * 1000 : 5000;
    }
    return 1000; // Default delay
  },
})
```

### Interceptors

Interceptors allow you to modify requests, transform responses, or handle errors globally or per-request. This is perfect for adding authentication tokens, logging, error recovery, and more.

#### Global Interceptors

Global interceptors apply to all requests:

```typescript
// Add a global request interceptor (modify all requests)
const requestInterceptorId = create.config.addRequestInterceptor(config => {
  // Add auth token to all requests
  config.headers["Authorization"] = `Bearer ${getToken()}`;
  // Modify URL, headers, body, etc.
  return config;
});

// Add a global response interceptor (transform all responses)
const responseInterceptorId = create.config.addResponseInterceptor(response => {
  console.log(`Response received: ${response.status}`);
  // Transform or modify the response
  return response;
});

// Add a global error interceptor (handle all errors)
const errorInterceptorId = create.config.addErrorInterceptor(error => {
  console.error("Request failed:", error.message);
  // Can throw to propagate error, or return ResponseWrapper to recover
  throw error;
});

// Remove interceptors when no longer needed
create.config.removeRequestInterceptor(requestInterceptorId);
create.config.removeResponseInterceptor(responseInterceptorId);
create.config.removeErrorInterceptor(errorInterceptorId);

// Clear all interceptors at once
create.config.clearInterceptors();
```

#### Per-Request Interceptors

Per-request interceptors apply only to a specific request:

```typescript
// Request interceptor - modify request configuration
const data = await create
  .get("https://api.example.com/users")
  .withRequestInterceptor(config => {
    config.headers["X-Custom-Header"] = "value";
    config.url = "https://api.example.com/modified-url"; // Can modify URL
    return config;
  })
  .getJson();

// Response interceptor - transform response
const transformed = await create
  .get("https://api.example.com/users")
  .withResponseInterceptor(response => {
    console.log(`Got response with status ${response.status}`);
    return response;
  })
  .getJson();

// Error interceptor - handle or recover from errors
const recovered = await create
  .get("https://api.example.com/users")
  .withErrorInterceptor(error => {
    // Option 1: Throw to propagate error
    throw error;

    // Option 2: Return a ResponseWrapper to recover from error
    // return new ResponseWrapper(fallbackResponse, error.url, error.method);
  })
  .getJson();
```

#### Interceptor Execution Order

Interceptors execute in a specific order:

1. **Request interceptors**: Global interceptors run first (in registration order), then per-request interceptors (in registration order)
2. **Response interceptors**: Per-request interceptors run first (in registration order), then global interceptors (in reverse registration order)
3. **Error interceptors**: Per-request interceptors run first (in registration order), then global interceptors (in reverse registration order)

```typescript
// Request: Global 1 → Global 2 → Per-request 1 → Per-request 2
// Response: Per-request 1 → Per-request 2 → Global 2 → Global 1
const data = await create
  .get("https://api.example.com/users")
  .withRequestInterceptor(() => console.log("Per-request 1"))
  .withRequestInterceptor(() => console.log("Per-request 2"))
  .getJson();
```

#### Advanced Interceptor Patterns

```typescript
// Short-circuit request with early response
const cached = await create
  .get("https://api.example.com/users")
  .withRequestInterceptor(() => {
    // Return early response from cache
    return new Response(JSON.stringify(cachedData), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  })
  .getJson();

// Recover from error with fallback
const fallback = await create
  .get("https://api.example.com/users")
  .withErrorInterceptor(error => {
    // Return fallback response instead of throwing
    const fallbackResponse = new Response(JSON.stringify({ users: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    return new ResponseWrapper(fallbackResponse, error.url, error.method);
  })
  .getJson();

// Async interceptors
const asyncData = await create
  .get("https://api.example.com/users")
  .withRequestInterceptor(async config => {
    const token = await getTokenAsync();
    config.headers["Authorization"] = `Bearer ${token}`;
    return config;
  })
  .getJson();
```

### Request Cancellation

```typescript
const controller = new AbortController();

const request = create
  .get("https://api.example.com/slow-endpoint")
  .withTimeout(10000)
  .withAbortController(controller);

// Later, cancel the request if needed
setTimeout(() => controller.abort(), 2000);

try {
  const data = await request.getJson();
} catch (error) {
  if (error.name === "AbortError") {
    console.log("Request was cancelled by user");
  } else if (error.isTimeout) {
    console.log("Request timed out");
  } else {
    console.log("Other error:", error.message);
  }
}
```

### Data Selection

The `getData` method provides a powerful way to extract and transform specific data from API responses:

```typescript
// Extract specific properties from nested structures
const posts = await create
  .get("https://api.example.com/feed")
  .getData(data => data.feed.posts);

// Transform data in the selector function
const usernames = await create
  .get("https://api.example.com/users")
  .getData(data => data.users.map(user => user.username));

// Apply filtering in the selector
const activeUsers = await create
  .get("https://api.example.com/users")
  .getData(data => data.users.filter(user => user.isActive));

// Combine data from complex nested structures
const combinedData = await create.get("https://api.example.com/dashboard").getData(data => ({
  userCount: data.stats.users.total,
  recentPosts: data.content.recent.slice(0, 5),
  notifications: data.user.notifications.unread,
}));
```

When a selector fails, the error message will contain helpful context to diagnose the issue:

```typescript
try {
  // This will fail if the response structure doesn't match expectations
  const result = await create
    .get("https://api.example.com/data")
    .getData(data => data.results.items);
} catch (error) {
  console.error(error);
  // Error message includes context for debugging
}
```

### TypeScript Support

```typescript
interface User {
  id: number;
  name: string;
  email: string;
  isActive: boolean;
}

interface ApiResponse<T> {
  data: T;
  meta: {
    total: number;
    page: number;
  };
}

// Type the full response
const response = await create
  .get("https://api.example.com/users")
  .getJson<ApiResponse<User[]>>();

// Or use getData with type parameters
const users = await create
  .get("https://api.example.com/users")
  .getData<ApiResponse<User[]>, User[]>(data => data.data);

// TypeScript knows the types
users.forEach(user => {
  console.log(`${user.name} (${user.email}): ${user.isActive ? "Active" : "Inactive"}`);
});

// Function with proper types
async function getUserById(id: number): Promise<User> {
  return create
    .get("https://api.example.com/users")
    .withQueryParam("id", id)
    .getData<ApiResponse<User[]>, User>(data => {
      const user = data.data[0];
      if (!user) throw new Error(`User with ID ${id} not found`);
      return user;
    });
}
```

### CSRF Protection

Cross-Site Request Forgery (CSRF) is a type of security vulnerability where unauthorized commands are executed on behalf of an authenticated user. `create-request` provides built-in protection mechanisms to help prevent CSRF attacks.

### How CSRF Protection Works

The library employs multiple strategies to protect against CSRF attacks:

1. **Automatic X-Requested-With Header**: By default, all requests include the `X-Requested-With: XMLHttpRequest` header, which helps servers identify legitimate AJAX requests.

2. **CSRF Token Support**: The library can automatically include CSRF tokens in request headers, which servers can validate to ensure the request came from your application.

3. **XSRF Cookie Reading**: For frameworks that use the double-submit cookie pattern (like Laravel, Rails, or Django), the library can automatically read XSRF tokens from cookies and include them in request headers.

### Global CSRF Configuration

You can configure CSRF settings globally for all requests:

```typescript
// Configure CSRF settings for all requests
create.config.setCsrfToken("your-csrf-token");
create.config.setCsrfHeaderName("X-CSRF-Token"); // Default header name for CSRF token
create.config.setXsrfCookieName("XSRF-TOKEN"); // Default cookie name to read from
create.config.setXsrfHeaderName("X-XSRF-TOKEN"); // Default header name for XSRF token from cookie
create.config.setEnableAntiCsrf(true); // Enable/disable X-Requested-With header
create.config.setEnableAutoXsrf(true); // Enable/disable automatic cookie-to-header token

// Reset all configuration to defaults
create.config.reset();
```

### Per-Request CSRF Settings

You can also configure CSRF protection on individual requests:

```typescript
// Configure CSRF for a specific request
const request = create
  .post("https://api.example.com/users")
  .withCsrfToken("request-specific-token") // Set a specific token
  .withAntiCsrfHeaders() // Explicitly add X-Requested-With header
  .withoutCsrfProtection(); // Or disable all automatic CSRF protection
```

### Subresource Integrity and Cache Control

The library supports subresource integrity verification and cache control options:

```typescript
// Subresource Integrity - ensures the fetched resource hasn't been tampered with
const secureRequest = create
  .get("https://cdn.example.com/script.js")
  .withIntegrity("sha256-abcdef1234567890..."); // Browser will verify the hash

// Cache Control - supports all cache modes via fluent API or string values
const cachedRequest = create.get("https://api.example.com/data").withCache("no-cache"); // Direct string value

// Using fluent API for cache modes
const fluentCache = create.get("https://api.example.com/data").withCache.NO_CACHE(); // Fluent API method

// All available cache modes:
create
  .get("https://api.example.com/data")
  .withCache.DEFAULT() // Default cache behavior
  .withCache.NO_STORE() // Don't store in cache
  .withCache.RELOAD() // Reload from server
  .withCache.NO_CACHE() // Validate with server before using cache
  .withCache.FORCE_CACHE() // Use cache even if stale
  .withCache.ONLY_IF_CACHED(); // Only use cache, don't fetch from server

// Using enum values (import from create-request)
import { CacheMode } from "create-request";

const enumCache = create.get("https://api.example.com/data").withCache(CacheMode.NO_CACHE);

// Combining integrity and cache
const secureCached = create
  .get("https://cdn.example.com/resource.js")
  .withIntegrity("sha256-abcdef1234567890...")
  .withCache("no-store"); // Ensure no caching for sensitive resources
```

## Performance Considerations

create-request is designed to be lightweight and efficient:

- **Zero Dependencies**: No extra libraries to load
- **Tree-Shakable**: Only import what you need
- **Minimal Overhead**: Thin wrapper around the native Fetch API
- **Memory Efficient**: Doesn't create unnecessary objects
- **Clean API**: Simple and intuitive interface

## Browser Support

This library works with all browsers that support the Fetch API:

- Chrome 42+
- Firefox 39+
- Safari 10.1+
- Edge 14+
- Opera 29+

## Comparison of JavaScript HTTP Client Libraries

| Feature               | create-request | Fetch  | Axios   | SuperAgent | Got     | Ky     | node-fetch | Redaxios |
| --------------------- | -------------- | ------ | ------- | ---------- | ------- | ------ | ---------- | -------- |
| **Size (min+gzip)**   | ~6.3KB         | Native | ~13.6KB | ~17.8KB    | ~17.8KB | ~3.4KB | ~7.7KB     | ~1KB     |
| **Browser**           | Modern         | Modern | IE11+   | IE9+       | ❌ No   | Modern | ❌ No      | Modern   |
| **Node.js**           | ✅             | ✅     | ✅      | ✅         | ✅      | ✅     | ✅         | ✅       |
| **HTTP/2**            | ✅             | ✅     | ✅      | ✅         | ✅      | ✅     | ❌         | ❌       |
| **Auto Retries**      | ✅             | ❌     | 🛠️      | ✅         | ✅      | ✅     | ❌         | ❌       |
| **Cancellation**      | ✅             | ✅     | ✅      | ✅         | ✅      | ✅     | ✅         | ✅       |
| **Auto JSON**         | ✅             | ❌     | ✅      | ✅         | ✅      | ✅     | ❌         | ✅       |
| **Timeout**           | ✅             | ❌     | ✅      | ✅         | ✅      | ✅     | ✅         | ✅       |
| **TypeScript**        | ✅             | ✅     | ✅      | ✅         | ✅      | ✅     | ✅         | ✅       |
| **Streaming**         | ✅             | ✅     | ✅      | ✅         | ✅      | ✅     | ✅         | ❌       |
| **Progress**          | ❌             | ❌     | ✅      | ✅         | ✅      | ✅     | ❌         | ❌       |
| **Cookies**           | ✅             | ✅     | 🛠️      | ✅         | ✅      | ❌     | ❌         | ❌       |
| **Pagination API**    | ❌             | ❌     | ❌      | ❌         | ✅      | ❌     | ❌         | ❌       |
| **Zero Deps**         | ✅             | ✅     | ❌      | ❌         | ❌      | ✅     | ✅         | ✅       |
| **Chainable API**     | ✅             | ❌     | ❌      | ✅         | ✅      | ✅     | ❌         | ❌       |
| **CSRF Protection**   | ✅             | ❌     | ✅      | ❌         | ❌      | ❌     | ❌         | ❌       |
| **GraphQL Support**   | ✅             | ❌     | ❌      | ❌         | ❌      | ❌     | ❌         | ❌       |
| **Interceptors**      | ✅             | ❌     | ✅      | ✅         | ✅      | ✅     | ❌         | ❌       |
| **Instance Creation** | ✅             | ❌     | ✅      | ✅         | ✅      | ✅     | ❌         | ❌       |

**Notes:**

- "Modern" browser support: Chrome 42+, Firefox 39+, Safari 10.1+, Edge 14+, Opera 29+
- 🛠️ Feature requires additional plugins or adapters (not available out-of-the-box)

## License

MIT

---

## Website

Visit [create-request.com](https://create-request.com) for documentation, examples, and more resources.
