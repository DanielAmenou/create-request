# Contributing to create-request

Thank you for considering contributing to create-request! This document provides guidelines and instructions to help you contribute effectively.


## Development Setup

1. Clone the repository
2. Run `npm install`
3. Run `npm run build` to build the library
4. Run `npm test` to run the tests

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
6. Run `npm test` to make sure all tests pass
7. Submit a pull request

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
- Maintain test coverage for your code
- Document public APIs

Thank you for your contributions!
