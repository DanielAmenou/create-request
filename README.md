# create-request

[![npm version](https://img.shields.io/npm/v/create-request.svg)](https://www.npmjs.com/package/create-request)
[![License](https://img.shields.io/npm/l/create-request.svg)](https://github.com/DanielAmenou/create-request/blob/main/LICENSE)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/create-request)](https://bundlephobia.com/package/create-request)

`create-request` is a modern TypeScript library that transforms how you make API calls. Built as an elegant wrapper around the native Fetch API, it provides a chainable, fluent interface that dramatically reduces boilerplate while adding powerful features like automatic retries, timeout handling, and comprehensive error management.

## Core Features

- ⛓️ **Chainable API** - Build and execute requests with a fluent interface
- ⏱️ **Timeout Support** - Set timeouts for any request
- 🔁 **Automatic Retries** - Retry failed requests with customizable settings
- 🔐 **Auth Helpers** - Simple methods for common authentication patterns
- 📦 **Typed Responses** - Full TypeScript support for response data
- 🚧 **Error Handling** - Detailed error info with custom error class
- 📝 **Response Caching** - Flexible caching system with multiple storage options

## Why create-request?

**You've probably been here before:** writing boilerplate fetch code, handling retries manually, struggling with timeouts, or wrestling with TypeScript types for your API responses. `create-request` solves all of that with an elegant API that separates request building from execution:

```typescript
// Create a request
const usersRequest = create.get()
  .withTimeout(5000)
  .withRetries(3)
  .withBearerToken('your-token');

// Execute the request
const users = await usersRequest.sendTo('https://api.example.com/users')
  .getJson<User[]>();
```

## Installation

```bash
npm install create-request
```

Or with yarn:

```bash
yarn add create-request
```

## 🔄 Fetch API Comparison

### Fetch API

```typescript
// Basic GET request with fetch
try {
  const response = await fetch('https://api.example.com/users');
  if (!response.ok) {
    throw new Error(`HTTP error ${response.status}`);
  }
  const users = await response.json();
  console.log(users);
} catch (error) {
  console.error('Error fetching users:', error);
}

// POST request with fetch
try {
  const response = await fetch('https://api.example.com/users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer token123'
    },
    body: JSON.stringify({ name: 'John Doe', email: 'john@example.com' })
  });
  if (!response.ok) {
    throw new Error(`HTTP error ${response.status}`);
  }
  const result = await response.json();
  console.log(result);
} catch (error) {
  console.error('Error creating user:', error);
}
```

### create-request API

```typescript
// Basic GET request with create-request
try {
  const users = await create.get().sendTo('https://api.example.com/users').getJson();
  console.log(users);
} catch (error) {
  console.error('Error fetching users:', error.message);
}

// POST request with create-request
const createUserRequest = create.post()
  .withBody({ name: 'John Doe', email: 'john@example.com' })
  .withBearerToken('token123');

try {
  const result = await createUserRequest.sendTo('https://api.example.com/users').getJson();
  console.log(result);
} catch (error) {
  console.error('Error creating user:', error.message);
}
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

```typescript
import { RequestPriority, CredentialsPolicy } from 'create-request';

// Configure request options
const request = create.get()
  // Headers
  .withHeaders({ 'X-API-Key': 'abc123' })

  // Timeout and retries
  .withTimeout(5000)
  .withRetries(3)
  .onRetry(({ attempt, error }) => {
    console.log(`Attempt ${attempt} failed: ${error.message}`);
  })

  // Authentication
  .withBearerToken('your-token')

  // Query parameters
  .withQueryParams({ search: 'term', page: 1 })

  // Advanced options
  .withCredentials(CredentialsPolicy.INCLUDE)
  .withPriority(RequestPriority.HIGH);
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
import create, { createLocalStorageStorage } from 'create-request';

// Simple in-memory caching (default storage provider)
const request = create.get()
  .withCache()
  .sendTo('https://api.example.com/data');

// Cache with localStorage
const request = create.get()
  .withCache({
    storage: localStorage,
    ttl: 60000, // 1 minute in milliseconds
    maxEntries: 100
  })
  .sendTo('https://api.example.com/data');

// Cache with detailed configuration
const request = create.get()
  .withCache({
    storage: createLocalStorageStorage('api-cache:'),
    ttl: 5 * 60 * 1000, // 5 minutes
    maxSize: '1MB',
    varyByHeaders: ['x-api-version'],
    keyPrefix: 'user-data'
  })
  .sendTo('https://api.example.com/users');

// With sessionStorage
const request = create.get()
  .withCache({ storage: sessionStorage })
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

const userRequest = create.get();
const user = await userRequest.sendTo('https://api.example.com/user/123')
  .getJson<User>();

// TypeScript knows the type
console.log(user.name);
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
import create, { createMemoryStorage } from 'create-request';

// Using a Map instance for storage
const cacheMap = new Map();
const request = create.get()
  .withCache({
    storage: cacheMap,
    ttl: 300000 // 5 minutes
  });

// Custom key generation
const request = create.get()
  .withCache({
    keyGenerator: (url, method, headers) => {
      // Include user ID from authorization header in the cache key
      const authHeader = headers?.['Authorization'] || '';
      const userId = extractUserIdFromToken(authHeader);
      return `${method}:${url}:${userId}`;
    }
  });

// Custom storage provider
const customStorage = {
  async get(key) {
    // Your custom logic
    return await myCustomStore.retrieve(key);
  },
  async set(key, value) {
    await myCustomStore.store(key, value);
  },
  async has(key) {
    return await myCustomStore.exists(key);
  },
  async delete(key) {
    await myCustomStore.remove(key);
  },
  async clear() {
    await myCustomStore.clearAll();
  }
};

const request = create.get()
  .withCache({ storage: customStorage })
  .sendTo('https://api.example.com/data');

// Using IndexedDB (example with a hypothetical adapter)
const request = create.get()
  .withCache({
    storage: createIndexedDbStorage({
      dbName: 'apiCache',
      storeName: 'responses'
    })
  })
  .sendTo('https://api.example.com/data');
```

### Implementing Custom Storage Providers

You can create your own storage provider by implementing the `StorageProvider` interface. Here's a complete example with IndexedDB:

```typescript
import { StorageProvider } from 'create-request';

// Create an IndexedDB storage provider
export function createIndexedDbStorage(options: {
  dbName: string;
  storeName?: string;
  version?: number;
}): StorageProvider {
  const dbName = options.dbName;
  const storeName = options.storeName || 'cache';
  const version = options.version || 1;

  let dbPromise: Promise<IDBDatabase>;

  // Initialize the database
  const initDb = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, version);

      request.onerror = (event) => {
        reject(new Error('Failed to open IndexedDB'));
      };

      request.onupgradeneeded = (event) => {
        const db = request.result;
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName);
        }
      };

      request.onsuccess = (event) => {
        resolve(request.result);
      };
    });
  };

  // Get the database instance
  const getDb = (): Promise<IDBDatabase> => {
    if (!dbPromise) {
      dbPromise = initDb();
    }
    return dbPromise;
  };

  // Use transaction to perform operations
  const withStore = async <T>(mode: IDBTransactionMode, callback: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);

      const request = callback(store);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  };

  return {
    async get(key: string): Promise<string | null> {
      try {
        const value = await withStore('readonly', store => store.get(key));
        return value || null;
      } catch (error) {
        console.error('IndexedDB get error:', error);
        return null;
      }
    },

    async set(key: string, value: string): Promise<void> {
      try {
        await withStore('readwrite', store => store.put(value, key));
      } catch (error) {
        console.error('IndexedDB set error:', error);
      }
    },

    async has(key: string): Promise<boolean> {
      try {
        const value = await withStore('readonly', store => store.get(key));
        return value !== undefined;
      } catch (error) {
        console.error('IndexedDB has error:', error);
        return false;
      }
    },

    async delete(key: string): Promise<void> {
      try {
        await withStore('readwrite', store => store.delete(key));
      } catch (error) {
        console.error('IndexedDB delete error:', error);
      }
    },

    async clear(): Promise<void> {
      try {
        await withStore('readwrite', store => store.clear());
      } catch (error) {
        console.error('IndexedDB clear error:', error);
      }
    }
  };
}

// Using the custom IndexedDB storage
const request = create.get()
  .withCache({
    storage: createIndexedDbStorage({ dbName: 'api-cache' }),
    ttl: 24 * 60 * 60 * 1000 // 24 hours
  })
  .sendTo('https://api.example.com/data');
```

With custom storage providers, you can integrate with any storage system, such as:
- WebSQL
- Firebase
- LevelDB (Node.js)
- Redis (through a server API)
- Custom browser extensions storage
- Secure storage solutions

## CSRF Protection

### Global CSRF Configuration

```typescript
// Configure CSRF settings for all requests
create.config.setCsrfToken('your-csrf-token');
create.config.setCsrfHeaderName('X-CSRF-Token');
create.config.setXsrfCookieName('XSRF-TOKEN');
```

### Per-Request CSRF Settings

```typescript
// Configure CSRF for a specific request
const request = create.post()
  .withCsrfToken('request-specific-token')
  .withoutCsrfProtection(); // Disable automatic CSRF protection
```

## Browser Support

This library works with all browsers that support the Fetch API:

- Chrome 42+
- Firefox 39+
- Safari 10.1+
- Edge 14+
- Opera 29+

## License

MIT
