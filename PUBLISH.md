# Publishing Guide

## Overview

Releases are automated using [release-please](https://github.com/googleapis/release-please). The workflow automatically:

1. 📝 Updates `CHANGELOG.md` based on your commits
2. 🏷️ Creates a release PR with version bump
3. 🚀 Creates a GitHub release when the PR is merged
4. 📦 Publishes to npm automatically

## How It Works

1. **Make your changes** and commit using [conventional commits](https://www.conventionalcommits.org/)
2. **Push to main branch** - release-please will create a PR automatically
3. **Review the release PR** - it will show:
   - Version bump (patch/minor/major based on commits)
   - Updated CHANGELOG.md
   - All changes included
4. **Merge the PR** - release-please will:
   - Create a git tag automatically
   - The publish workflow will then:
     - Create a GitHub release with emoji-formatted notes from CHANGELOG.md
     - Build and test the package
     - Publish to npm (using OIDC authentication)

## Creating Specific Version Types

### Patch Version (e.g., 1.5.0 → 1.5.1)

```bash
git commit -m "fix: resolve timeout issue"
git push origin main
# → Release PR created automatically
# → Merge when ready
```

**Example:**

```bash
git commit -m "fix: resolve memory leak in request handling"
git push origin main
# Release-please creates PR for 1.5.1
```

### Minor Version (e.g., 1.5.0 → 1.6.0)

```bash
git commit -m "feat: add retry mechanism"
git push origin main
# → Release PR created automatically
# → Merge when ready
```

**Example:**

```bash
git commit -m "feat: add request interceptors"
git push origin main
# Release-please creates PR for 1.6.0
```

### Major Version (e.g., 1.5.0 → 2.0.0)

```bash
git commit -m "feat!: change API signature" -m "BREAKING CHANGE: request() now requires options parameter"
git push origin main
# → Release PR created automatically
# → Merge when ready
```

**Example:**

```bash
git commit -m "feat!: change API signature" -m "BREAKING CHANGE: request() now requires options parameter"
git push origin main
# Release-please creates PR for 2.0.0
```

### Beta/RC/Alpha Pre-release (e.g., 1.6.0-beta.0)

You have **two options** for creating pre-releases:

#### Option 1: Branch-Based (Recommended) 🎯

Use a dedicated branch (`beta`, `rc`, or `alpha`) for pre-releases:

```bash
# 1. Create and switch to beta branch (first time only)
git checkout -b beta
git push origin beta

# 2. Make commits on the beta branch
git commit -m "feat: add new feature"
git push origin beta

# 3. Release-please creates PR on the beta branch (e.g., for 1.6.0)
# 4. Edit the version in the PR to add the pre-release suffix:
#    - .release-please-manifest.json: "1.6.0" → "1.6.0-beta.0"
#    - package.json: "version": "1.6.0" → "version": "1.6.0-beta.0"
#    - CHANGELOG.md: "## [1.6.0]" → "## [1.6.0-beta.0]"
# 5. Merge the PR
# → Published as npm tag 'beta' (users install with npm install create-request@beta)
```

**For subsequent beta versions** (e.g., `1.6.0-beta.1`):

- Make more commits on the `beta` branch
- Release-please creates a new PR
- Edit version to increment: `1.6.0-beta.1`, `1.6.0-beta.2`, etc.

**For RC/Alpha releases:**

- Use `rc` or `alpha` branches instead
- Same process, but versions will be `1.6.0-rc.0`, `1.6.0-alpha.0`, etc.

#### Option 2: Manual Version Edit on Main

```bash
# 1. Make commits on main
git commit -m "feat: new feature"
git push origin main

# 2. Release-please creates PR (e.g., for 1.6.0)
# 3. Edit these files in the PR:
#    - .release-please-manifest.json: "1.6.0" → "1.6.0-beta.0"
#    - package.json: "version": "1.6.0" → "version": "1.6.0-beta.0"
#    - CHANGELOG.md: "## [1.6.0]" → "## [1.6.0-beta.0]"
# 4. Merge the PR
```

## Commit Types Reference

| Commit Type                         | Version Bump                            | Example                     |
| ----------------------------------- | --------------------------------------- | --------------------------- |
| `fix:`                              | Patch (1.5.0 → 1.5.1)                   | `fix: resolve memory leak`  |
| `feat:`                             | Minor (1.5.0 → 1.6.0)                   | `feat: add retry mechanism` |
| `feat!:` or `BREAKING CHANGE:`      | Major (1.5.0 → 2.0.0)                   | `feat!: change API`         |
| `perf:`, `docs:`, `refactor:`, etc. | No bump (unless combined with feat/fix) | `docs: update README`       |

### Pre-release Tags

- `-alpha` → npm tag: `alpha` → Install: `npm install create-request@alpha`
- `-beta` → npm tag: `beta` → Install: `npm install create-request@beta`
- `-rc` → npm tag: `rc` → Install: `npm install create-request@rc`

## Version Control Summary

- **Patch** (1.5.0 → 1.5.1): Use `fix:` commits
- **Minor** (1.5.0 → 1.6.0): Use `feat:` commits
- **Major** (1.5.0 → 2.0.0): Use `feat!:` or `BREAKING CHANGE:`
- **Pre-release**: Edit version in PR to add `-alpha`, `-beta`, or `-rc` suffix

You control when releases happen by merging the release PR.

## Troubleshooting

### Release-please doesn't create a PR

- Check the Actions tab for any errors
- Ensure you have commits with conventional commit format since the last release
- The first run might need a commit to trigger it

### npm publish fails

- Verify OIDC trust relationship is configured in npm
- Check that your npm package name matches the repository
- Ensure the package isn't already published at that version

### GitHub release not created

- Check that the tag was created successfully
- Verify workflow permissions include `contents: write`
- Check the Actions tab for errors in the publish workflow
