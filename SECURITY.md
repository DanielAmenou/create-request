# Security Policy

## Supported Versions

We actively support and provide security updates for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 2.x     | :white_check_mark: |
| 1.x     | :x:                |

## Security Advisories

| Affected | Fixed in | Issue                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ≤ 1.6.1  | 2.0.0    | In browsers, the automatic CSRF headers (`X-Requested-With`, the global CSRF token and the token read from the `XSRF-TOKEN` cookie) were sent to **every** origin, disclosing the tokens to third-party hosts. Since 2.0.0 nothing is sent automatically, and `withCsrf()` attaches tokens to same-origin requests only (judged on the request URL before any redirect — pair it with `withRedirect("error")` on endpoints that may redirect elsewhere; outside a browser every URL counts as same-origin). Mitigation on 1.x: `create.config.setEnableAutoXsrf(false)`, avoid `setCsrfToken`, and set tokens per request with `withCsrfToken()`. |

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security vulnerability in `create-request`, please follow these steps:

### 1. **Do NOT** open a public issue

Please do not report security vulnerabilities through public GitHub issues, discussions, or any other public channels.

### 2. Report privately

Please report security vulnerabilities by emailing the maintainer directly:

- **Email**: amenou.daniel@gmail.com
- **Subject**: `[SECURITY] create-request vulnerability report`

### 3. Include the following information

When reporting a vulnerability, please include:

- A clear description of the vulnerability
- Steps to reproduce the issue
- Potential impact and severity assessment
- Suggested fix (if you have one)
- Your contact information (optional, but helpful for follow-up questions)

### 4. Response timeline

We aim to:

- **Acknowledge** your report within **48 hours**
- Provide an initial assessment within **7 days**
- Keep you informed of our progress
- Release a fix as soon as possible, typically within **30 days** depending on severity

### 5. Disclosure policy

- We will work with you to understand and resolve the issue quickly
- We will credit you for the discovery (unless you prefer to remain anonymous)
- We will coordinate the public disclosure after a fix is available
- We will not disclose your identity without your permission

## Security Best Practices

When using `create-request`, please follow these security best practices:

### 1. Keep dependencies updated

Regularly update `create-request` to the latest version to receive security patches:

```bash
npm update create-request
```

### 2. Validate and sanitize input

Always validate and sanitize user input before sending it in requests:

```typescript
import create from "create-request";

// Validate input before making requests
function createUser(userData: unknown) {
  // Validate userData before sending
  if (!isValidUserData(userData)) {
    // isValidUserData is a type guard: userData is CreateUserInput below
    throw new Error("Invalid user data");
  }

  return create.post("https://api.example.com/users").withBody(userData).getJson();
}
```

### 3. Use HTTPS

Always use HTTPS endpoints in production to encrypt data in transit:

```typescript
// ✅ Good
create.get("https://api.example.com/data");

// ❌ Bad (in production)
create.get("http://api.example.com/data");
```

### 4. Protect sensitive credentials

Never commit API keys, tokens, or credentials to version control. Use environment variables or secure credential management:

```typescript
// ✅ Good
const apiKey = process.env.API_KEY!;
create.get("https://api.example.com/data").withBearerToken(apiKey);

// ❌ Bad
create.get("https://api.example.com/data").withBearerToken("hardcoded-token-12345");
```

## Known Security Considerations

### Fetch API Limitations

`create-request` is built on top of the native Fetch API. Be aware of:

- **CORS**: Cross-origin requests are subject to CORS policies
- **Cookie handling**: Cookies are not sent by default in cross-origin requests unless credentials are explicitly included
- **Same-origin policy**: Browsers enforce same-origin policy restrictions

### What the library does not protect you from

- **Untrusted input in URLs, headers and cookies.** An api instance's base URL is not a boundary: an
  absolute `path` (`https://…`, `//…`) is used as-is and carries the api's headers with it. Header
  values `fetch` would reject (CR/LF, non-Latin-1) fail with a `VALIDATION` error, but a `;` in a
  cookie value smuggles in another cookie, because `withCookies` sends values verbatim.
- **Redirects.** `fetch` strips `Authorization` on cross-origin redirects but forwards every other
  header, including CSRF tokens and API keys. Use `withRedirect("error")` (or `"manual"`) when an
  endpoint may redirect to another origin.
- **Retrying non-idempotent requests.** Every method is retried by default; pass
  `methods: ["GET", "HEAD", "OPTIONS", "PUT", "DELETE"]` where a repeated `POST` could duplicate work.
- **Large bodies you read yourself.** Error bodies are capped at 1 MB, but `getJson()`/`getText()`
  read whatever the server sends; combine `withTimeout()` with a `Content-Length` check for
  untrusted servers.

### Content Security Policy (CSP)

The library adds no inline scripts or styles; a policy only has to allow `connect-src` to your API
endpoints.

## Security Updates

Security updates will be:

- Released as patch versions (e.g., `2.0.0` → `2.0.1`)
- Documented in the [CHANGELOG.md](./CHANGELOG.md)
- Announced via GitHub releases
- Tagged with security-related labels

## Questions?

If you have questions about security that are not vulnerabilities, please:

- Open a [GitHub Discussion](https://github.com/DanielAmenou/create-request/discussions)
- Open a [GitHub Issue](https://github.com/DanielAmenou/create-request/issues)

---

**Thank you for helping keep `create-request` and its users safe!**
