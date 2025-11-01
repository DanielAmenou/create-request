# create-request

[![npm version](https://img.shields.io/npm/v/create-request.svg)](https://www.npmjs.com/package/create-request)
[![License](https://img.shields.io/npm/l/create-request.svg)](https://github.com/DanielAmenou/create-request/blob/main/LICENSE)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/create-request)](https://bundlephobia.com/package/create-request)
[![TypeScript](https://img.shields.io/badge/TypeScript-4.7%2B-blue)](https://www.typescriptlang.org/)

`create-request` is a modern TypeScript library that transforms how you make API calls. Built as an elegant wrapper around the native Fetch API, it provides a chainable, fluent interface that dramatically reduces boilerplate while adding powerful features like automatic retries, timeout handling, and comprehensive error management.

## Table of Contents

- [Core Features](#core-features)
- [Why create-request](#why-create-request)
- [Installation](#installation)
- [Basic Usage](#basic-usage)
- [Advanced Usage](#advanced-usage)
- [GraphQL Support](#graphql-support)
- [Interceptors](#interceptors)
- [TypeScript Support](#typescript-support)
- [CSRF Protection](#csrf-protection)
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
  .withKeepAlive(true); // Keeps connection alive after the page is unloaded
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
const users = await create
  .post("https://api.example.com/graphql")
  .withGraphQL("query { users { id name email } }")
  .getJson();

// GraphQL query with variables
const user = await create
  .post("https://api.example.com/graphql")
  .withGraphQL("query GetUser($id: ID!) { user(id: $id) { name email } }", { id: "123" })
  .getJson();

// GraphQL mutation
const result = await create
  .post("https://api.example.com/graphql")
  .withGraphQL(
    "mutation CreateUser($name: String!) { createUser(name: $name) { id name } }",
    { name: "John Doe" }
  )
  .getJson();
```

The `withGraphQL` method automatically:

- Formats the body as JSON with `query` and optional `variables` properties
- Sets `Content-Type` to `application/json`
- Trims whitespace from the query string
- Validates the query is non-empty
- Validates variables are a plain object (not arrays or null)

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

// Using the data selector API to extract specific data
const userData = await create
  .get("https://api.example.com/users")
  .getData(data => data.results.users);

// Using the data selector without a selector function just returns the full JSON response
const fullData = await create.get("https://api.example.com/data").getData();
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

  // Access the original response if available
  if (error.response) {
    // Raw Response object is available
    console.log(error.response.status);
  }
}
```

## Advanced Usage

### GraphQL Support

`create-request` provides first-class support for GraphQL with the `withGraphQL` method:

```typescript
// Simple query
const query = "query { user { name email } }";
const data = await create
  .post("https://api.example.com/graphql")
  .withGraphQL(query)
  .getJson();

// Query with variables
const queryWithVars = "query GetUser($id: ID!) { user(id: $id) { name email } }";
const user = await create
  .post("https://api.example.com/graphql")
  .withGraphQL(queryWithVars, { id: "123" })
  .getJson();

// Mutation
const mutation =
  "mutation CreateUser($name: String!) { createUser(name: $name) { id name } }";
const result = await create
  .post("https://api.example.com/graphql")
  .withGraphQL(mutation, { name: "John Doe" })
  .getJson();

// Complex variables with nested objects
const complexQuery =
  "query SearchUsers($filters: UserFilters!) { users(filters: $filters) { id name } }";
const results = await create
  .post("https://api.example.com/graphql")
  .withGraphQL(complexQuery, {
    filters: {
      name: "John",
      age: 30,
      tags: ["active", "verified"],
      metadata: {
        source: "web",
        verified: true,
      },
    },
  })
  .getJson();
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

### URL Handling

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

## TypeScript Support

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

## CSRF Protection

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
create.config.setCsrfHeaderName("X-CSRF-Token"); // Default header name
create.config.setXsrfCookieName("XSRF-TOKEN"); // Default cookie name
create.config.setEnableAntiCsrf(true); // Enable/disable X-Requested-With header
create.config.setEnableAutoXsrf(true); // Enable/disable automatic cookie-to-header token
```

### Per-Request CSRF Settings

You can also configure CSRF protection on individual requests:

```typescript
// Configure CSRF for a specific request
const request = create
  .post()
  .withCsrfToken("request-specific-token") // Set a specific token
  .withAntiCsrfHeaders() // Explicitly add X-Requested-With header
  .withoutCsrfProtection(); // Or disable all automatic CSRF protection
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

| Feature             | create-request | Fetch  | Axios   | SuperAgent | Got     | Ky     | node-fetch | Redaxios |
| ------------------- | -------------- | ------ | ------- | ---------- | ------- | ------ | ---------- | -------- |
| **Size (min+gzip)** | ~5.1KB         | Native | ~13.6KB | ~17.8KB    | ~17.8KB | ~3.4KB | ~7.7KB     | ~1KB     |
| **Browser**         | Modern         | Modern | IE11+   | IE9+       | ❌ No   | Modern | ❌ No      | Modern   |
| **Node.js**         | ✅             | ✅     | ✅      | ✅         | ✅      | ✅     | ✅         | ✅       |
| **HTTP/2**          | ✅             | ✅     | ✅      | ✅         | ✅      | ✅     | ❌         | ❌       |
| **Auto Retries**    | ✅             | ❌     | 🛠️      | ✅         | ✅      | ✅     | ❌         | ❌       |
| **Cancellation**    | ✅             | ✅     | ✅      | ✅         | ✅      | ✅     | ✅         | ✅       |
| **Auto JSON**       | ✅             | ❌     | ✅      | ✅         | ✅      | ✅     | ❌         | ✅       |
| **Timeout**         | ✅             | ❌     | ✅      | ✅         | ✅      | ✅     | ✅         | ✅       |
| **TypeScript**      | ✅             | ✅     | ✅      | ✅         | ✅      | ✅     | ✅         | ✅       |
| **Streaming**       | ✅             | ✅     | ✅      | ✅         | ✅      | ✅     | ✅         | ❌       |
| **Progress**        | ❌             | ❌     | ✅      | ✅         | ✅      | ✅     | ❌         | ❌       |
| **Middleware**      | ❌             | ❌     | ✅      | ✅         | ✅      | ✅     | ❌         | ❌       |
| **Cookies**         | ✅             | ✅     | 🛠️      | ✅         | ✅      | ❌     | ❌         | ❌       |
| **Pagination API**  | ❌             | ❌     | ❌      | ❌         | ✅      | ❌     | ❌         | ❌       |
| **Zero Deps**       | ✅             | ✅     | ❌      | ❌         | ❌      | ✅     | ✅         | ✅       |
| **Chainable API**   | ✅             | ❌     | ❌      | ✅         | ✅      | ✅     | ❌         | ❌       |
| **CSRF Protection** | ✅             | ❌     | ✅      | ❌         | ❌      | ❌     | ❌         | ❌       |
| **GraphQL Support** | ✅             | ❌     | ❌      | ❌         | ❌      | ❌     | ❌         | ❌       |
| **Interceptors**    | ✅             | ❌     | ✅      | ✅         | ✅      | ✅     | ❌         | ❌       |

**Notes:**

- "Modern" browser support: Chrome 42+, Firefox 39+, Safari 10.1+, Edge 14+, Opera 29+
- 🛠️ Feature requires additional plugins or adapters (not available out-of-the-box)

## License

MIT
