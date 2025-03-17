# create-request

[![npm version](https://img.shields.io/npm/v/create-request.svg)](https://www.npmjs.com/package/create-request)
[![License](https://img.shields.io/npm/l/create-request.svg)](https://github.com/DanielAmenou/create-request/blob/main/LICENSE)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/create-request)](https://bundlephobia.com/package/create-request)

`create-request` is a modern TypeScript library that transforms how you make API calls. Built as an elegant wrapper around the native Fetch API, it provides a chainable, fluent interface that dramatically reduces boilerplate while adding powerful features like automatic retries, timeout handling, and comprehensive error management.

With first-class TypeScript support, built-in response parsing, and intuitive authentication helpers, `create-request` makes your API code more readable, more reliable, and fully type-safe—all with zero dependencies and a tiny footprint.

## Why create-request?

**You've probably been here before:** writing boilerplate fetch code, handling retries manually, struggling with timeouts, or wrestling with TypeScript types for your API responses. `create-request` solves all of that with an elegant, chainable API:

```typescript
// Instead of verbose fetch code with manual JSON parsing, error handling, etc.
// You get a clean, intuitive API that just works
const users = await create.get()
  .withTimeout(5000)
  .withRetries(3)
  .withBearerToken('your-token')
  .sendTo('https://api.example.com/users')
  .getJson<User[]>();
```

## 🚀 Designed for Developer Happiness

- **Write Less Code** - Accomplish in one line what might take dozens with raw fetch
- **Fewer Bugs** - Strong typing and smart defaults prevent common API bugs
- **Self-Documenting** - Chainable API clearly expresses intent for easier code reviews
- **Universal** - Works the same in browser and Node.js environments

## Overview

`create-request` provides a chainable, fluent API for making HTTP requests with built-in solutions for the most common API challenges. It's designed for developers who value clean code, type safety, and robust error handling.

## Features

- 🔄 **Fully Typed** - Complete TypeScript support with accurate type definitions
- 🔗 **Chainable API** - Fluent interface for building requests
- ⏱️ **Timeout Support** - Set timeouts for any request (no more hanging requests!)
- 🔁 **Automatic Retries** - Smart retry mechanism with customizable strategies
- 🔒 **Auth Helpers** - One-liner methods for common auth patterns
- 🧩 **Query Parameter Management** - Easy query parameter handling with arrays support
- 📦 **Response Transformations** - Parse responses as JSON, text, blob, etc.
- 🚫 **Robust Error Handling** - Detailed error information with custom error class
- 🔌 **Zero Dependencies** - Built on the native Fetch API with no external baggage
- 🌐 **Universal** - Works exactly the same in all modern browsers and Node.js
- 🏷️ **Type Safety** - Enums for all string constants to prevent typos

## Installation

```bash
npm install create-request
```

Or with yarn:

```bash
yarn add create-request
```

## See the Difference: How create-request Transforms API Calls

### 1. Simplified Error Handling

```typescript
create.get()
  .sendTo('https://api.example.com/data')
  .getJson()
  .then(data => {
    console.log(data);
  })
  .catch(error => {
    if (error instanceof RequestError) {
      // Rich error details that fetch doesn't provide:
      console.log(`${error.status} error from ${error.method} ${error.url}`);
      console.log(`Was it a timeout? ${error.timeoutError}`);

      // Original error data still available:
      console.log(error.response);
    }
  });
```

### 2. Type-Safe API Responses

```typescript
interface User {
  id: number;
  name: string;
  email: string;
}

// TypeScript knows exactly what you're getting back!
const users = await create.get()
  .sendTo('https://api.example.com/users')
  .getJson<User[]>();

// No more type casting or guessing - your IDE autocomplete works perfectly
users.forEach(user => console.log(user.name));
```

### 3. Request Retries Made Simple

```typescript
// Without create-request: Pages of manual retry logic with delay calculations
// With create-request: One line

const data = await create.get()
  .withRetries(3)
  .onRetry(({ attempt, error }) => {
    console.log(`Retry attempt ${attempt} after ${error.message}`);
  })
  .sendTo('https://api.example.com/flaky-endpoint')
  .getJson();
```

## Basic Usage

```typescript
import create from 'create-request';

// Simple GET request with chained response parsing
const users = await create.get()
  .withTimeout(5000)
  .sendTo('https://api.example.com/users')
  .getJson();

// POST request with JSON body
const newUser = await create.post()
  .withBody({ name: 'Daniel Amenou', email: 'daniel@example.com' })
  .withBearerToken('your-token-here')
  .sendTo('https://api.example.com/users')
  .getJson();
```

## API Reference

### Request Creation

Create requests using the appropriate factory method:

```typescript
// Methods without body
create.get()
create.del()
create.head()
create.options()

// Methods with body
create.put()
create.post()
create.patch()
```

### Request Configuration

All requests support these configuration methods:

#### Common Settings

```typescript
import { RequestPriority, CredentialsPolicy, RequestMode, RedirectMode } from 'create-request';

// Set request headers
.withHeaders({ 'X-API-Key': 'abc123' })

// Set cookies
.withCookies({
  sessionId: 'abc123',
  preference: 'darkMode',
  region: 'us-east'
})

// Set a single content type header
.withContentType('application/json')

// Set request timeout in milliseconds
.withTimeout(5000)

// Configure retry behavior
.withRetries(3)
.onRetry(({ attempt, error }) => {
  console.log(`Retry attempt ${attempt} after error: ${error.message}`);
})

// Use an external abort controller
.withAbortController(myAbortController)

// Set credentials policy - uses same-origin by default
.withCredentials(CredentialsPolicy.INCLUDE)

// Set redirect behavior
.withRedirect(RedirectMode.FOLLOW)

// Set request mode
.withMode(RequestMode.CORS)

// Set referrer
.withReferrer('https://example.com')

// Set keepalive flag (allows request to outlive the page)
.withKeepAlive(true)

// Set request priority
.withPriority(RequestPriority.HIGH)
```

#### Query Parameters

```typescript
// Add multiple query parameters
.withQueryParams({
  search: 'keyword',
  page: 1,
  filters: ['active', 'verified']
})

// Add a single query parameter
.withQueryParam('sort', 'desc')

```

#### Authentication

```typescript
// Basic authentication
.withBasicAuth('username', 'password')

// Bearer token
.withBearerToken('your-jwt-token')

// Custom authorization header
.withAuthorization('Custom scheme-and-token')
```

### Requests with Body

For POST, PUT, and PATCH requests, you can set a body:

```typescript
// JSON body (automatically sets Content-Type: application/json)
.withBody({ name: 'John', age: 30 })

// String body
.withBody('Plain text content')

// FormData
const form = new FormData();
form.append('file', fileBlob);
.withBody(form)

// Blob body
const blob = new Blob(['Hello, world!'], { type: 'text/plain' });
const request = create.post()
  .withBody(blob)
  .sendTo('https://api.example.com/upload');

// ArrayBuffer body
const buffer = new ArrayBuffer(8);
const request = create.post()
  .withBody(buffer)
  .sendTo('https://api.example.com/upload');

// ReadableStream body
const stream = new ReadableStream();
const request = create.post()
  .withBody(stream)
  .sendTo('https://api.example.com/upload');

```

### Response Handling

The library provides convenient methods for handling responses that can be chained directly after `sendTo()`:

```typescript
// Parse as JSON with type inference
const jsonData = await create.get()
  .sendTo('https://api.example.com/data')
  .getJson<MyDataType>();

// Get as text
const text = await create.get()
  .sendTo('https://api.example.com/text')
  .getText();

// Get as blob
const blob = await create.get()
  .sendTo('https://api.example.com/file')
  .getBlob();

// Get as ArrayBuffer
const buffer = await create.get()
  .sendTo('https://api.example.com/binary')
  .getArrayBuffer();

// Get as ReadableStream
const stream = await create.get()
  .sendTo('https://api.example.com/stream')
  .getBody();

// For more control, you can access the raw response first
const response = await create.get().sendTo('https://api.example.com/data');
const status = response.status;
const headers = response.headers;
const data = await response.getJson();
```

### Streaming Responses

For large responses or real-time data, you can work with streams directly:

```typescript
// Get the response stream
const stream = await create.get()
  .sendTo('https://api.example.com/large-file')
  .getBody();

if (stream) {
  const reader = stream.getReader();

  // Process data incrementally as it arrives
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    // 'value' is a Uint8Array chunk of data
    processChunk(value);
  }
}
```

This approach:

- Avoids loading the entire response into memory
- Starts processing data as soon as it begins arriving
- Is ideal for large files, logs, or real-time feeds

#### Processing Stream with Transform Streams (Advanced)

```typescript
const response = await create.get().sendTo('https://api.example.com/large-dataset');
const stream = response.getBody();

if (stream) {
  // Create a transform stream to process each chunk
  const transformStream = new TransformStream({
    transform(chunk, controller) {
      // Process each chunk
      const processed = processData(chunk);
      controller.enqueue(processed);
    }
  });

  // Pipe the response through the transform stream
  const processedStream = stream.pipeThrough(transformStream);

  // Consume the processed stream
  // ...
}
```

### Error Handling

The library provides a `RequestError` class with details about failed requests:

```typescript
try {
  const data = await create.get()
    .sendTo('https://api.example.com/data')
    .getJson();
} catch (error) {
  if (error instanceof RequestError) {
    console.log(error.message);     // Error message
    console.log(error.status);      // HTTP status code (if available)
    console.log(error.url);         // Request URL
    console.log(error.method);      // HTTP method
    console.log(error.timeoutError); // Whether it was a timeout
    console.log(error.response);    // Raw response (if available)
  }
}
```

## Advanced Usage

### Handling File Downloads

```typescript
const blob = await create.get()
  .withHeaders({ Accept: 'application/pdf' })
  .sendTo('https://api.example.com/reports/123/download')
  .getBlob();

const url = window.URL.createObjectURL(blob);

// Create a download link
const a = document.createElement('a');
a.href = url;
a.download = 'report.pdf';
a.click();

// Clean up
window.URL.revokeObjectURL(url);
```

### Working with AbortController

```typescript
const controller = new AbortController();

// Pass the controller to the request
try {
  const data = await create.get()
    .withAbortController(controller)
    .sendTo('https://api.example.com/data')
    .getJson();
} catch (error) {
  // Handle the aborted request
}

// Cancel the request after 2 seconds
setTimeout(() => controller.abort(), 2000);
```

### Request Priority

```typescript
import { RequestPriority } from 'create-request';

// High priority for critical resources
const userProfile = await create.get()
  .withPriority(RequestPriority.HIGH)
  .sendTo('https://api.example.com/user/profile')
  .getJson();

// Low priority for non-critical resources
const recommendations = await create.get()
  .withPriority(RequestPriority.LOW)
  .sendTo('https://api.example.com/recommendations')
  .getJson();
```

### Creating Reusable Request Configurations

```typescript
import { RequestPriority, CredentialsPolicy } from 'create-request';

function createAuthenticatedRequest(token) {
  return create.get()
    .withBearerToken(token)
    .withHeaders({
      'X-App-Version': '1.0.0',
    })
    .withTimeout(10000)
    .withRetries(2)
    .withCredentials(CredentialsPolicy.INCLUDE)
    .withPriority(RequestPriority.HIGH);
}

// Later use the configured request
const users = await createAuthenticatedRequest(myToken)
  .sendTo('https://api.example.com/users')
  .getJson();
```

### Cookie Management

```typescript
// Set multiple cookies in a single request
const response = await create.get()
  .withCookies({
    sessionId: 'abc123',
    theme: 'dark',
    region: 'us-east',
    'analytics-opt-in': 'true'
  })
  .sendTo('https://api.example.com/dashboard');

// Combine with other header settings
const response = await create.get()
  .withCookies({ sessionId: 'abc123' })
  .withBearerToken('your-token-here')
  .sendTo('https://api.example.com/protected-resource');
```

## Environment-Specific Limitations

### Browser Limitations

1. **CORS Restrictions** - Browsers enforce Same-Origin Policy and CORS. Requests to different origins must have proper CORS headers set up server-side.

2. **Cookies and Authentication** - Third-party cookies might be blocked depending on browser settings. Use `withCredentials(CredentialsPolicy.INCLUDE)` for cross-origin authenticated requests.

3. **Mixed Content** - Browsers block HTTP requests from HTTPS pages. Always use HTTPS endpoints in production.

4. **Content Security Policy (CSP)** - If your application uses CSP, you must configure it to allow connections to your API endpoints.

5. **Priority Hints** - The `withPriority` feature is only supported in some modern browsers and may be ignored in others.

6. **KeepAlive** - The `withKeepAlive` feature allows requests to outlive the page but has varying support across browsers.

### Server-Side (Node.js) Limitations

1. **Missing Node.js Fetch** - Prior to Node 18, the Fetch API isn't available natively.

2. **Self-signed Certificates** - Node.js rejects self-signed certificates by default. You may need additional configuration for development environments.

3. **Memory Management** - When downloading large files or processing large responses, be mindful of memory consumption, especially when using `arrayBuffer()` or `blob()`.

4. **Proxy Support** - Additional configuration may be needed to work with HTTP proxies in Node.js.

5. **Limited Feature Support** - Features like `withKeepAlive` and `withPriority` might not be relevant or fully supported in Node.js environments.

## Browser Compatibility

This library works with all browsers that support the Fetch API:

- Chrome 42+
- Firefox 39+
- Safari 10.1+
- Edge 14+
- Opera 29+

## Comparison with Other Libraries

| Feature | create-request | axios | fetch |
|---------|---------------|-------|-------|
| Bundle Size | Small (~2KB) | Medium (~14KB) | Smallest (built-in) |
| TypeScript Support | Full with type inference | Partial | Manual |
| Type Safety | Enums for constants | Limited | None |
| Chainable API | ✅ Yes | ❌ No | ❌ No |
| Request Cancellation | ✅ Yes (AbortController) | ✅ Yes | ✅ Yes (manual) |
| Auto JSON | ✅ Yes | ✅ Yes | ❌ No |
| Timeout | ✅ Yes | ✅ Yes | ❌ No (manual) |
| Retries | ✅ Yes | ❌ No (needs addon) | ❌ No (manual) |
| Query params with arrays | ✅ Yes | ✅ Yes | ❌ No (manual) |
| Request Priority | ✅ Yes (simple API) | ❌ No | ✅ Yes (via options) |
| KeepAlive | ✅ Yes (simple API) | ❌ No | ✅ Yes (via options) |
| Learning Curve | Low | Medium | Medium |

### Why Not Just Use fetch?

The native Fetch API is powerful but low-level, requiring you to:

- Write boilerplate for common tasks like JSON parsing
- Manually implement timeout handling
- Create your own retry mechanisms
- Handle errors across multiple steps
- Parse non-2xx responses manually

`create-request` gives you all these features with a cleaner API that's designed specifically for modern TypeScript applications.

### Why Not axios?

While axios is popular, `create-request` offers:

- Smaller bundle size (~85% smaller)
- More complete TypeScript integration
- Built-in retries without addons
- Modern features like priority hints
- A more intuitive, chainable API

## Real-world Examples

### API Client for Authentication

```typescript
// Create a reusable authentication client
function createAuthClient(baseUrl) {
  return {
    login: async (email, password) => {
      return create.post()
        .withBody({ email, password })
        .withTimeout(3000)
        .sendTo(`${baseUrl}/auth/login`)
        .getJson();
    },
    refreshToken: async (refreshToken) => {
      return create.post()
        .withBody({ refreshToken })
        .withRetries(2)
        .sendTo(`${baseUrl}/auth/refresh`)
        .getJson();
    }
  };
}

const authClient = createAuthClient('https://api.example.com');
const { token, user } = await authClient.login('user@example.com', 'password');
```

### File Upload with Progress

```typescript
const uploadFile = async (file, onProgress) => {
  const controller = new AbortController();
  const form = new FormData();
  form.append('file', file);

  try {
    return await create.post()
      .withBody(form)
      .withAbortController(controller)
      .withTimeout(60000) // 1 minute timeout for large files
      .withRetries(2)
      .sendTo('https://api.example.com/upload')
      .getJson();
  } catch (error) {
    if (error instanceof RequestError) {
      console.error(`Upload failed: ${error.message}`);
    }
    throw error;
  }
  return {
    abort: () => controller.abort()
  };
};
```

### Request Retries Made Simple

```typescript
// Without create-request: Pages of manual retry logic with delay calculations
// With create-request: One line

const data = await create.get()
  .withRetries(3)
  .onRetry(({ attempt, error }) => {
    console.log(`Retry attempt ${attempt} after ${error.message}`);
  })
  .sendTo('https://api.example.com/flaky-endpoint')
  .getJson();
```

## License

MIT
