# Security Policy

## Supported Versions

We actively support and provide security updates for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 1.5.x   | :white_check_mark: |
| 1.4.x   | :white_check_mark: |
| < 1.4   | :x:                |

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
    throw new Error("Invalid user data");
  }

  return create.post("https://api.example.com/users").withBody(userData).getData();
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
const apiKey = process.env.API_KEY;
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

### Content Security Policy (CSP)

If you're using Content Security Policy headers, ensure your policy allows:

- Network requests to your API endpoints
- Inline scripts if using certain features (check your specific use case)

## Security Updates

Security updates will be:

- Released as patch versions (e.g., `1.5.0` → `1.5.1`)
- Documented in the [CHANGELOG.md](./CHANGELOG.md)
- Announced via GitHub releases
- Tagged with security-related labels

## Questions?

If you have questions about security that are not vulnerabilities, please:

- Open a [GitHub Discussion](https://github.com/DanielAmenou/create-request/discussions)
- Open a [GitHub Issue](https://github.com/DanielAmenou/create-request/issues)

---

**Thank you for helping keep `create-request` and its users safe!**
