# Releasing

This repository uses GitHub Actions for CI and [Release Please](https://github.com/googleapis/release-please-action) for automated versioning, changelog generation, GitHub releases, and npm publishing.

## CI

The CI workflow runs on pull requests and pushes to `main` and verifies:

- `pnpm install --frozen-lockfile`
- `pnpm run typecheck`
- `pnpm test`
- `pnpm run build`

## Automated releases

The `Release Please` workflow runs on pushes to `main`.

It does two jobs:

1. Opens or updates a release PR based on conventional commits.
2. After a release PR is merged and a release is created, publishes changed packages to npm.

## Trusted publishing

This repository uses npm trusted publishing from GitHub Actions for:

- `@schalkneethling/css-property-type-validator-core`
- `@schalkneethling/css-property-type-validator-cli`

No `NPM_TOKEN` repository secret is required for package publishing.

For trusted publishing to keep working, the npm package settings must continue to point at:

- GitHub repository: `schalkneethling/css-property-type-validator`
- GitHub Actions workflow: `.github/workflows/release-please.yml`

The workflow already includes `id-token: write`, which is required for npm trusted publishing.

## Conventional commits

Release Please determines version bumps from commit history, so PR titles or commits merged to `main` should follow conventional commit style, for example:

- `feat: support declarations with multiple var() usages`
- `fix: skip invalid @property syntax more gracefully`
- `docs: clarify current validation limitations`

Typical release behavior:

- `feat:` triggers a minor release
- `fix:` triggers a patch release
- `feat!:` or a `BREAKING CHANGE:` note triggers a major release

## Release baseline

Version `0.1.0` for both packages was published manually before Release Please was configured.

The release configuration therefore uses a bootstrap SHA so the automated release flow starts from the current repository baseline rather than trying to recreate the original `0.1.0` release history.

## Tags and releases

Release Please is configured to include the component in the tag name. That keeps the core and CLI package tags independent.

## Local verification

Useful local commands before merging release-related changes:

```bash
pnpm install
pnpm run typecheck
pnpm test
pnpm run build
```
