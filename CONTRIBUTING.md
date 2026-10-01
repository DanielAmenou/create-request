# Contributing to create-request

Thank you for considering contributing to create-request! This document provides guidelines and instructions to help you contribute effectively.

## Development Setup

1. Clone the repository (Node.js 24 is recommended for development; see `.nvmrc`)
2. Run `npm install`
3. Run `npm test` for the unit, e2e and regression suites, `npm run test:types` for the type tests
   (which also compile every code block of the README), `npm run test:coverage` to enforce 100% coverage
4. Run `npm run build` to build the library into `dist/`
5. Run `npm run check` before opening a pull request — it runs everything CI runs (plus `pack:check`)

## How to Contribute

### Reporting Issues

- Check existing issues before creating a new one
- Include detailed steps to reproduce the issue
- Specify your environment (Node.js version, OS, etc.)

### Feature Requests

- Clearly describe the feature and its use case
- Explain how it benefits the project

## Development Workflow

1. Fork the repository
2. Create a feature branch from `main`
   - Use a descriptive name: `feature/your-feature-name` or `fix/issue-description`
3. Make your changes with clear, descriptive commits (see Commit Message Format below)
4. Add or update tests as necessary
5. Update documentation to reflect your changes
6. Run `npm run check` to make sure lint, types, tests (100% coverage), build and size gate pass
7. Check package size impact (see Package Size Considerations below)
8. Submit a pull request

## Package Size Considerations

This project maintains strict size limits to ensure optimal bundle sizes for consumers. **All changes must include information about their impact on package size.**

### Checking Package Size

Before submitting a pull request, check the size impact of your changes:

- Run the size check: `npm run build && npm run size`

This will compare your changes against the current size limits defined in `.size-limit.json`.

### Reporting Size Impact

When submitting a pull request, **always include** in your PR description:

- The size impact of your changes (increase/decrease in bytes)
- Whether the changes stay within the size limits
- If the size increases, explain why the increase is justified

If your changes exceed the limits, discuss with maintainers before submitting the PR.

## Commit Message Format

This project uses [Conventional Commits](https://www.conventionalcommits.org/) to ensure consistent commit messages and automatic release note generation.

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation only changes
- `style`: Changes that do not affect the meaning of the code (white-space, formatting, etc.)
- `refactor`: A code change that neither fixes a bug nor adds a feature
- `perf`: A code change that improves performance
- `test`: Adding missing tests or correcting existing tests
- `build`: Changes that affect the build system or external dependencies
- `ci`: Changes to CI configuration files and scripts
- `chore`: Other changes that don't modify src or test files
- `revert`: Reverts a previous commit

### Examples

```
feat: add retry mechanism for failed requests
fix: resolve timeout issue with large payloads
docs: update API documentation for interceptors
refactor: simplify error handling logic
test: add tests for abort signal combinations
```

### Scope (Optional)

You can optionally specify a scope to provide additional context:

```
feat(interceptors): add request/response interceptors
fix(timeout): handle timeout edge cases
docs(api): update method documentation
```

**Note:** Commit messages are automatically validated. If your commit message doesn't follow this format, the commit will be rejected.

## Pull Request Guidelines

1. Link related issues in the PR description
2. Keep PRs focused on a single concern
3. Update relevant documentation
4. Add necessary tests
5. Request code review from maintainers

## Coding Standards

- Use TypeScript for type safety
- Follow the established project patterns
- Use Prettier for code formatting (`npm run format`)
- Use ESLint for linting (`npm run lint`)
- Keep coverage at 100% (`npm run test:coverage` fails otherwise); test through the public API,
  never through private fields — inject `fetch` with `withFetch()` instead of mocking globals
- Document public APIs with JSDoc; keep every `@example` valid TypeScript against the current API (the README's code blocks are compiled by `npm run test:types`; JSDoc examples are reviewed by hand)

## Releasing (maintainers)

Releases are made by pushing a tag; nothing is published from a laptop.

1. Make sure `main` is green and `CHANGELOG.md` has the entry for the version.
2. `npm version <version> -m "chore(release): %s"` — for example `npm version 2.0.0` or
   `npm version 2.0.0-next.1` — updates `package.json`, commits and creates the `v<version>` tag.
3. `git push --follow-tags`. The `Release` workflow checks that the tag matches `package.json`, runs
   the tests, publishes to npm through trusted publishing (a prerelease suffix such as `-next.1`
   goes to the `next` dist-tag, anything else to `latest`) with provenance, and creates the GitHub
   release with generated notes.

Thank you for your contributions!
