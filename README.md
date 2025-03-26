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
- 📝 **Response Caching** - Flexible caching system with multiple storage options
- 🛑 **Request Cancellation** - Abort requests on demand with AbortController integration

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
    .post()
    .withBasicAuth("username", "password")
    .withBody(userData) // Content-Type automatically set to application/json
    .sendTo("https://api.example.com/users")
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

// Create different request types
const getRequest = create.get(); // GET
const putRequest = create.put(); // PUT
const postRequest = create.post(); // POST
const patchRequest = create.patch(); // PATCH
const deleteRequest = create.del(); // DELETE
const headRequest = create.head(); // HEAD
const optionsRequest = create.options(); // OPTIONS
```

### Request Configuration

The library provides a comprehensive set of configuration methods that can be chained together to customize your requests:

```typescript
import create, { RequestPriority, CredentialsPolicy, RequestMode, RedirectMode, ReferrerPolicy } from "create-request";

// Configure request options
const request = create
  .get()
  // Basic headers
  .withHeaders({ "X-API-Key": "abc123", "Accept-Language": "en-US" })
  .withHeader("Custom-Header", "value") // Add a single header

  // Timeout settings
  .withTimeout(5000) // Request will abort after 5 seconds

  // Automatic retry configuration
  .withRetries(3) // Retry up to 3 times on failure
  .onRetry(({ attempt, error }) => {
    console.log(`Attempt ${attempt} failed: ${error.message}. Retrying...`);
    // You can implement backoff strategy here
    return new Promise(resolve => setTimeout(resolve, attempt * 1000));
  })

  // Authentication methods
  .withBearerToken("your-token") // Adds Authorization: Bearer your-token
  .withBasicAuth("username", "password") // HTTP Basic Authentication

  // URL parameters
  .withQueryParams({ search: "term", page: 1, limit: 20 })
  .withQueryParam("filter", "active") // Add a single query parameter

  // Request body configuration (for POST/PUT/PATCH)
  .withContentType("application/json") // Set specific content type

  // Fetch API options
  .withCredentials(CredentialsPolicy.INCLUDE) // Includes cookies with cross-origin requests
  .withMode(RequestMode.CORS) // Controls CORS behavior
  .withRedirect(RedirectMode.FOLLOW) // Controls redirect behavior (follow, error, manual)
  .withReferrer("https://example.com") // Sets request referrer
  .withReferrerPolicy(ReferrerPolicy.NO_REFERRER_WHEN_DOWNGRADE) // Controls referrer policy
  .withPriority(RequestPriority.HIGH); // Sets request priority
```

Each configuration method returns the request object, allowing for a fluent interface where methods can be chained together. You can configure only what you need for a specific request:

```typescript
// Simple example with just what's needed
const searchUsers = create.get().withBearerToken(userToken).withQueryParams({ q: searchTerm, limit: 20 }).withTimeout(3000);

// Now execute the request
const users = await searchUsers.sendTo("https://api.example.com/users").getData();
```

You can also create reusable base requests with common settings:

```typescript
// Create base authenticated request
const apiBase = create
  .get()
  .withHeaders({
    "X-API-Version": "1.2",
    "Accept-Language": "en-US",
  })
  .withBearerToken(authToken)
  .withTimeout(5000)
  .withRetries(2);

// Use the base request for different endpoints
const users = await apiBase.sendTo("https://api.example.com/users").getData();
const products = await apiBase.sendTo("https://api.example.com/products").getData();
```

### Request Bodies (POST/PUT/PATCH)

```typescript
// JSON body (Content-Type automatically set to application/json)
const jsonRequest = create.post().withBody({ name: "John", age: 30 });

// String body (Content-Type automatically set to text/plain)
const textRequest = create.post().withBody("Plain text content");

// Form data
const formData = new FormData();
formData.append("name", "John");
formData.append("file", fileBlob);

const formRequest = create.post().withBody(formData);

// URLSearchParams (typically used for application/x-www-form-urlencoded)
const params = new URLSearchParams();
params.append("username", "john");
params.append("password", "secret");

const formUrlEncodedRequest = create.post().withBody(params);
```

### Executing Requests

```typescript
// Simple execution
const response = await request.sendTo("https://api.example.com/endpoint");

// With direct data extraction
const jsonData = await request.sendTo("https://api.example.com/endpoint").getJson();
const textData = await request.sendTo("https://api.example.com/endpoint").getText();
const blobData = await request.sendTo("https://api.example.com/endpoint").getBlob();
const bodyStream = await request.sendTo("https://api.example.com/endpoint").getBody();
const arrayBuffer = await request.sendTo("https://api.example.com/endpoint").getArrayBuffer();

// Using the data selector API to extract specific data
const userData = await request.sendTo("https://api.example.com/users").getData(data => data.results.users);

// Using the data selector without a selector function just returns the full JSON response
const fullData = await request.sendTo("https://api.example.com/data").getData();
```

### Error Handling

All errors from requests are instances of `RequestError` with detailed information:

```typescript
try {
  const data = await request.sendTo("https://api.example.com/data").getJson();
} catch (error) {
  // error will always be a RequestError
  console.log(error.message); // Error message
  console.log(error.status); // HTTP status code (if available)
  console.log(error.url); // Request URL
  console.log(error.method); // HTTP method
  console.log(error.timeoutError); // Whether it was a timeout

  // Access the original response if available
  if (error.response) {
    // Raw Response object is available
    console.log(error.response.status);
  }
}
```

### Caching Requests

```typescript
import create, { createMemoryStorage, createLocalStorageStorage, createSessionStorageStorage } from "create-request";

// Simple in-memory caching
const request = create
  .get()
  .withCache({
    storage: createMemoryStorage(),
    ttl: 60000, // 1 minute in milliseconds
  })
  .sendTo("https://api.example.com/data");

// Using localStorage storage
const request = create
  .get()
  .withCache({
    storage: createLocalStorageStorage(),
    ttl: 5 * 60 * 1000, // 5 minutes
    maxSize: "1MB",
    keyPrefix: "user-data",
  })
  .sendTo("https://api.example.com/users");

// Using sessionStorage for per-session caching
const request = create
  .get()
  .withCache({
    storage: createSessionStorageStorage(),
    maxEntries: 50,
    varyByHeaders: ["x-api-version"],
  })
  .sendTo("https://api.example.com/data");
```

## Advanced Usage

### Request Reuse

```typescript
// Create a base authenticated request
const authRequest = create.get().withBearerToken("token123").withTimeout(5000).withRetries(2);

// Reuse for different endpoints
const users = await authRequest.sendTo("https://api.example.com/users").getJson();
const products = await authRequest.sendTo("https://api.example.com/products").getJson();

// You can also create application-wide base requests
const apiBase = () =>
  create
    .get()
    .withHeaders({
      "X-API-Version": "1.2",
      "Accept-Language": "en-US",
    })
    .withBearerToken(getAuthToken()) // Get fresh token each time
    .withTimeout(5000);

// Use throughout your application
function getUsers() {
  return apiBase().sendTo("https://api.example.com/users").getData();
}

function getProducts() {
  return apiBase().sendTo("https://api.example.com/products").getData();
}
```

### Request Cancellation

```typescript
const controller = new AbortController();

const request = create.get().withTimeout(10000).withAbortController(controller);

// Later, cancel the request if needed
setTimeout(() => controller.abort(), 2000);

try {
  const data = await request.sendTo("https://api.example.com/slow-endpoint").getJson();
} catch (error) {
  if (error.name === "AbortError") {
    console.log("Request was cancelled by user");
  } else if (error.timeoutError) {
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
const posts = await request.sendTo("https://api.example.com/feed").getData(data => data.feed.posts);

// Transform data in the selector function
const usernames = await request.sendTo("https://api.example.com/users").getData(data => data.users.map(user => user.username));

// Apply filtering in the selector
const activeUsers = await request.sendTo("https://api.example.com/users").getData(data => data.users.filter(user => user.isActive));

// Combine data from complex nested structures
const combinedData = await request.sendTo("https://api.example.com/dashboard").getData(data => ({
  userCount: data.stats.users.total,
  recentPosts: data.content.recent.slice(0, 5),
  notifications: data.user.notifications.unread,
}));
```

When a selector fails, the error message will contain the original response data to help diagnose the issue:

```typescript
try {
  // This will fail if the response structure doesn't match expectations
  const result = await request.sendTo("https://api.example.com/data").getData(data => data.results.items);
} catch (error) {
  console.error(error);
  // Error message includes the original response data for debugging
}
```

### Implementing Custom Storage Providers

You can create your own storage provider by implementing the `StorageProvider` interface:

```typescript
import { StorageProvider } from "create-request";

// Create a namespaced storage provider
export function createNamespacedStorage(namespace: string): StorageProvider {
  return {
    get(key: string): string | null {
      return localStorage.getItem(`${namespace}:${key}`);
    },

    set(key: string, value: string): void {
      try {
        localStorage.setItem(`${namespace}:${key}`, value);
      } catch (e) {
        // Handle quota exceeded errors
        console.warn("Storage quota exceeded, clearing cache");
        this.clear();
        try {
          localStorage.setItem(`${namespace}:${key}`, value);
        } catch (e) {
          console.error("Failed to set cache item even after clearing cache");
        }
      }
    },

    has(key: string): boolean {
      return localStorage.getItem(`${namespace}:${key}`) !== null;
    },

    delete(key: string): void {
      localStorage.removeItem(`${namespace}:${key}`);
    },

    clear(): void {
      // Only clear items in our namespace
      Object.keys(localStorage)
        .filter(key => key.startsWith(`${namespace}:`))
        .forEach(key => localStorage.removeItem(key));
    },
  };
}

// Usage:
const request = create
  .get()
  .withCache({
    storage: createNamespacedStorage("api-cache"),
    ttl: 24 * 60 * 60 * 1000, // 24 hours
  })
  .sendTo("https://api.example.com/data");
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
const response = await create.get().sendTo("https://api.example.com/users").getJson<ApiResponse<User[]>>();

// Or use getData with type parameters
const users = await create
  .get()
  .sendTo("https://api.example.com/users")
  .getData<ApiResponse<User[]>, User[]>(data => data.data);

// TypeScript knows the types
users.forEach(user => {
  console.log(`${user.name} (${user.email}): ${user.isActive ? "Active" : "Inactive"}`);
});

// Function with proper types
async function getUserById(id: number): Promise<User> {
  return create
    .get()
    .withQueryParam("id", id)
    .sendTo("https://api.example.com/users")
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

### Integrating with Backend Frameworks

Most modern frameworks support CSRF protection out of the box. The library works seamlessly with:

- **Laravel**: Automatically reads XSRF-TOKEN cookie and sends X-XSRF-TOKEN header
- **Rails**: Works with the Rails CSRF token system
- **Django**: Compatible with Django's CSRF middleware
- **Express.js + csurf**: Works with the csurf middleware token pattern

## Performance Considerations

create-request is designed to be lightweight and efficient:

- **Zero Dependencies**: No extra libraries to load
- **Tree-Shakable**: Only import what you need
- **Minimal Overhead**: Thin wrapper around the native Fetch API
- **Memory Efficient**: Doesn't create unnecessary objects
- **Cache Management**: Configurable caching to reduce network requests

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
| **Caching**         | ✅             | ❌     | ❌      | ✅         | ✅      | ❌     | ❌         | ❌       |
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

**Notes:**

- "Modern" browser support: Chrome 42+, Firefox 39+, Safari 10.1+, Edge 14+, Opera 29+
- 🛠️ Feature requires additional plugins or adapters (not available out-of-the-box)

## License

MIT
