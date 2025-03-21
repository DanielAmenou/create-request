# create-request

[![npm version](https://img.shields.io/npm/v/create-request.svg)](https://www.npmjs.com/package/create-request)
[![License](https://img.shields.io/npm/l/create-request.svg)](https://github.com/DanielAmenou/create-request/blob/main/LICENSE)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/create-request)](https://bundlephobia.com/package/create-request)

`create-request` is a modern TypeScript library that transforms how you make API calls. Built as an elegant wrapper around the native Fetch API, it provides a chainable, fluent interface that dramatically reduces boilerplate while adding powerful features like automatic retries, timeout handling, and comprehensive error management.

## Core Features

- ⏱️ **Timeout Support** - Set timeouts for any request
- 🚀 **Performance** - Tiny bundle size with zero dependencies
- 🚧 **Error Handling** - Detailed error info with custom error class
- 🔐 **Auth Helpers** - Simple methods for common authentication patterns
- ⛓️ **Chainable API** - Build and execute requests with a fluent interface
- 📉 **Reduced Boilerplate** - Write 60% less code for common API operations
- 🔁 **Automatic Retries** - Retry failed requests with customizable settings
- 🛡️ **Type Safety** - Full TypeScript support with intelligent type inference
- 📝 **Response Caching** - Flexible caching system with multiple storage options

## Why create-request?

**API interactions often require repetitive code patterns** - handling HTTP status checks, parsing responses, managing errors, and dealing with TypeScript types. `create-request` provides a clean, efficient solution with an elegant API that separates request building from execution:

```typescript
// Before: Regular fetch
async function createUser(userData) {
  try {
    const response = await fetch('https://api.example.com/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + btoa('username:password')
      },
      body: JSON.stringify(userData)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Fetch error:', error);
    throw error;
  }
}

// After: With create-request
import create from 'create-request';

function createUser(userData) {
  return create.post()
    .withBasicAuth('username', 'password')
    .withBody(userData)
    .sendTo('https://api.example.com/users')
    .getData<User>()
    .catch(error => {
      console.error('Fetch error:', error);
      throw error;
    });
}
```

## Installation

```bash
npm install create-request
```

Or with yarn:

```bash
yarn add create-request
```

## Basic Usage

### Creating Requests

```typescript
import create from 'create-request';

// Create different request types
const getRequest = create.get();
const postRequest = create.post();
const putRequest = create.put();
const headRequest = create.head();
const deleteRequest = create.del();
const patchRequest = create.patch();
const optionsRequest = create.options();
```

### Request Configuration

The library provides a comprehensive set of configuration methods that can be chained together to customize your requests:

```typescript
import create, { RequestPriority, CredentialsPolicy, RequestMode, CacheMode, RedirectMode, ReferrerPolicy } from 'create-request';

// Configure request options
const request = create.get()
  // Basic headers
  .withHeaders({ 'X-API-Key': 'abc123', 'Accept-Language': 'en-US' })
  .withHeader('Custom-Header', 'value') // Add a single header

  // Timeout settings
  .withTimeout(5000) // Request will abort after 5 seconds

  // Automatic retry configuration
  .withRetries(3) // Retry up to 3 times on failure
  .onRetry(({ attempt, error }) => {
    console.log(`Attempt ${attempt} failed: ${error.message}. Retrying...`);
  })

  // Authentication methods
  .withBearerToken('your-token') // Adds Authorization: Bearer your-token
  .withBasicAuth('username', 'password') // HTTP Basic Authentication

  // URL parameters
  .withQueryParams({ search: 'term', page: 1, limit: 20 })
  .withQueryParam('filter', 'active') // Add a single query parameter

  // Request body configuration (for POST/PUT/PATCH)
  .withContentType('application/json') // Set specific content type

  // Fetch API options
  .withCredentials(CredentialsPolicy.INCLUDE) // Includes cookies with cross-origin requests
  .withMode(RequestMode.CORS) // Controls CORS behavior
  .withRedirect(RedirectMode.FOLLOW) // Controls redirect behavior (follow, error, manual)
  .withReferrer('https://example.com') // Sets request referrer
  .withReferrerPolicy(ReferrerPolicy.NO_REFERRER_WHEN_DOWNGRADE) // Controls referrer policy
  .withPriority(RequestPriority.HIGH) // Sets request priority
```

Each configuration method returns the request object, allowing for a fluent interface where methods can be chained together. You can configure only what you need for a specific request:

```typescript
// Simple example with just what's needed
const searchUsers = create.get()
  .withBearerToken(userToken)
  .withQueryParams({ q: searchTerm, limit: 20 })
  .withTimeout(3000);

// Now execute the request
const users = await searchUsers.sendTo('https://api.example.com/users').getData();
```

You can also create reusable base requests with common settings:

```typescript
// Create base authenticated request
const apiBase = create.get()
  .withHeaders({
    'X-API-Version': '1.2',
    'Accept-Language': 'en-US'
  })
  .withBearerToken(authToken)
  .withTimeout(5000)
  .withRetries(2);

// Use the base request for different endpoints
const users = await apiBase.sendTo('https://api.example.com/users').getData();
const products = await apiBase.sendTo('https://api.example.com/products').getData();
```

### Request Bodies (POST/PUT/PATCH)

```typescript
// JSON body
const jsonRequest = create.post()
  .withBody({ name: 'John', age: 30 });

// String body
const textRequest = create.post()
  .withBody('Plain text content');

// Form data
const formData = new FormData();
formData.append('name', 'John');
formData.append('file', fileBlob);

const formRequest = create.post()
  .withBody(formData);
```

### Executing Requests

```typescript
// Simple execution
const response = await request.sendTo('https://api.example.com/endpoint');

// With direct data extraction
const jsonData = await request.sendTo('https://api.example.com/endpoint').getJson();
const textData = await request.sendTo('https://api.example.com/endpoint').getText();
const blobData = await request.sendTo('https://api.example.com/endpoint').getBlob();
const bodyStream = await request.sendTo('https://api.example.com/endpoint').getBody();
const arrayBuffer = await request.sendTo('https://api.example.com/endpoint').getArrayBuffer();

// Using the data selector API to extract specific data
const userData = await request.sendTo('https://api.example.com/users')
  .getData(data => data.results.users);

// Using the data selector without a selector function just returns the full JSON response
const fullData = await request.sendTo('https://api.example.com/data').getData();
```

### Data Selection

The `getData` method provides a powerful way to extract and transform specific data from API responses:

```typescript
// Extract specific properties from nested structures
const posts = await request
  .sendTo('https://api.example.com/feed')
  .getData(data => data.feed.posts);

// Transform data in the selector function
const usernames = await request
  .sendTo('https://api.example.com/users')
  .getData(data => data.users.map(user => user.username));

// Apply filtering in the selector
const activeUsers = await request
  .sendTo('https://api.example.com/users')
  .getData(data => data.users.filter(user => user.isActive));

// Combine data from complex nested structures
const combinedData = await request
  .sendTo('https://api.example.com/dashboard')
  .getData(data => ({
    userCount: data.stats.users.total,
    recentPosts: data.content.recent.slice(0, 5),
    notifications: data.user.notifications.unread
  }));
```

When a selector fails, the error message will contain the original response data to help diagnose the issue:

```typescript
try {
  const result = await request
    .sendTo('https://api.example.com/data')
    .getData(data => data.results.items); // Will fail if structure is different
} catch (error) {
  console.error(error);
  // Error message includes the original response data
}
```

### Error Handling

All errors from requests are instances of `RequestError` with detailed information:

```typescript
try {
  const data = await request.sendTo('https://api.example.com/data').getJson();
} catch (error) {
  // error will always be a RequestError
  console.log(error.message);     // Error message
  console.log(error.status);      // HTTP status code (if available)
  console.log(error.url);         // Request URL
  console.log(error.method);      // HTTP method
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
import create, { createMemoryStorage, createLocalStorageStorage, createSessionStorageStorage } from 'create-request';

// Simple in-memory caching
const request = create.get()
  .withCache({
    storage: createMemoryStorage(),
    ttl: 60000 // 1 minute in milliseconds
  })
  .sendTo('https://api.example.com/data');

// Using localStorage storage
const request = create.get()
  .withCache({
    storage: createLocalStorageStorage(),
    ttl: 5 * 60 * 1000, // 5 minutes
    maxSize: '1MB',
    keyPrefix: 'user-data'
  })
  .sendTo('https://api.example.com/users');

// Using sessionStorage for per-session caching
const request = create.get()
  .withCache({
    storage: createSessionStorageStorage(),
    maxEntries: 50,
    varyByHeaders: ['x-api-version']
  })
  .sendTo('https://api.example.com/data');
```

## Advanced Usage

### Request Reuse

```typescript
// Create a base authenticated request
const authRequest = create.get()
  .withBearerToken('token123')
  .withTimeout(5000)
  .withRetries(2);

// Reuse for different endpoints
const users = await authRequest.sendTo('https://api.example.com/users').getJson();
const products = await authRequest.sendTo('https://api.example.com/products').getJson();
```

### Request Cancellation

```typescript
const controller = new AbortController();

const request = create.get()
  .withTimeout(10000)
  .withAbortController(controller);

// Later, cancel the request if needed
setTimeout(() => controller.abort(), 2000);

try {
  const data = await request.sendTo('https://api.example.com/slow-endpoint').getJson();
} catch (error) {
  // Check if request was cancelled
  console.log('Request was cancelled:', error.name === 'AbortError');
}
```

### Working with Typed Responses

```typescript
interface User {
  id: number;
  name: string;
  email: string;
}

interface ApiResponse {
  users: User[];
  pagination: {
    total: number;
    page: number;
  }
}

const userRequest = create.get();

// Type the full response
const response = await userRequest
  .sendTo('https://api.example.com/users')
  .getJson<ApiResponse>();

// Or use getData with type parameters
const users = await userRequest
  .sendTo('https://api.example.com/users')
  .getData<ApiResponse, User[]>(data => data.users);

// Or just get the full typed response
const fullData = await userRequest
  .sendTo('https://api.example.com/users')
  .getData<ApiResponse>();

// TypeScript knows the types
console.log(users[0].name);
```

### Promise Chaining

```typescript
const request = create.get();

request.sendTo('https://api.example.com/data')
  .then(response => {
    console.log('Status:', response.status);
    return response.getJson();
  })
  .then(data => {
    console.log('Data:', data);
  })
  .catch(error => {
    console.error('Error:', error.message);
  });
```

### Advanced Caching

```typescript
import create, { createMemoryStorage, StorageProvider } from 'create-request';

// Custom key generation
const request = create.get()
  .withCache({
    storage: createMemoryStorage(),
    keyGenerator: (url, method, headers) => {
      // Include user ID from authorization header in the cache key
      const authHeader = headers?.['Authorization'] || '';
      const userMatch = authHeader.match(/User-(\d+)/);
      const userId = userMatch ? userMatch[1] : 'anonymous';
      return `${method}:${userId}:${url}`;
    }
  })
  .sendTo('https://api.example.com/data');
```

### Implementing Custom Storage Providers

You can create your own storage provider by implementing the `StorageProvider` interface:

```typescript
import { StorageProvider } from 'create-request';

// Create a simple custom storage provider
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
    }
  };
}

// Usage:
const request = create.get()
  .withCache({
    storage: createNamespacedStorage('api-cache'),
    ttl: 24 * 60 * 60 * 1000 // 24 hours
  })
  .sendTo('https://api.example.com/data');
```

With custom storage providers, you can integrate with any storage system, such as:

- Custom browser storage solutions
- Memory caches with expiration policies
- Session-based storage mechanisms
- Encrypted storage providers
- Third-party storage libraries

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
create.config.setCsrfToken('your-csrf-token');
create.config.setCsrfHeaderName('X-CSRF-Token'); // Default header name
create.config.setXsrfCookieName('XSRF-TOKEN'); // Default cookie name
create.config.setEnableAntiCsrf(true); // Enable/disable X-Requested-With header
create.config.setEnableAutoXsrf(true); // Enable/disable automatic cookie-to-header token
```

### Per-Request CSRF Settings

You can also configure CSRF protection on individual requests:

```typescript
// Configure CSRF for a specific request
const request = create.post()
  .withCsrfToken('request-specific-token') // Set a specific token
  .withAntiCsrfHeaders() // Explicitly add X-Requested-With header
  .withoutCsrfProtection(); // Or disable all automatic CSRF protection
```

### Integrating with Backend Frameworks

Most modern frameworks support CSRF protection out of the box. The library works seamlessly with:

- **Laravel**: Automatically reads XSRF-TOKEN cookie and sends X-XSRF-TOKEN header
- **Rails**: Works with the Rails CSRF token system
- **Django**: Compatible with Django's CSRF middleware
- **Express.js + csurf**: Works with the csurf middleware token pattern

When your server sends a CSRF token in a cookie or response header, `create-request` can automatically extract and include it in subsequent requests.

## Browser Support

This library works with all browsers that support the Fetch API:

- Chrome 42+
- Firefox 39+
- Safari 10.1+
- Edge 14+
- Opera 29+

## License

MIT
