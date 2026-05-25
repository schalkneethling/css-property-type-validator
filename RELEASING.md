# Releasing

This repository publishes npm packages from manually published GitHub Releases. The publish workflow uses npm trusted publishing with GitHub OIDC, so no `NPM_TOKEN` repository secret is required.

## CI

The CI workflow runs on pull requests and pushes to `main` and verifies:

- `pnpm install --frozen-lockfile --ignore-scripts`
- `pnpm run format:check`
- `pnpm run lint`
- `pnpm run typecheck`
- `pnpm test`
- `pnpm run build`

## Published Packages

- `@schalkneethling/css-property-type-validator-core`
- `@schalkneethling/css-property-type-validator-cli`
- `@schalkneethling/stylelint-plugin-css-property-type-validator`

## Trusted Publishing Setup

Each npm package must have a trusted publisher configured with:

- Provider: GitHub Actions
- Repository: `schalkneethling/css-property-type-validator`
- Workflow filename: `.github/workflows/publish.yml`
- Environment: `publish`
- Allowed action: `npm publish`

The first publish of a brand-new package must happen manually, because npm only lets you configure trusted publishing after the package exists. After that first publish, configure trusted publishing before using the workflow.

## Conventional Commits

Use conventional commit style for PR titles and commits merged to `main`, even though version bumps are manual:

- `feat:` for user-facing additions
- `fix:` for bug fixes
- `docs:` for documentation-only changes
- `feat!:` or `BREAKING CHANGE:` for breaking changes

## Release Tags

Publish by creating and publishing a GitHub Release whose tag identifies the package:

- `core-vX.Y.Z` publishes the core package
- `cli-vX.Y.Z` publishes the CLI package
- `stylelint-vX.Y.Z` publishes the Stylelint plugin
- `all-vX.Y.Z` publishes all npm packages

Use `stylelint-v0.1.0-beta.0` for the first Stylelint beta release.

## Manual Release Steps

1. Update the target package version in its `package.json`.
2. Update the relevant changelog or release notes.
3. Run the local verification gate:

   ```bash
   pnpm install
   pnpm run check
   pnpm run check:supported-syntax-names
   pnpm run build
   ```

4. Pack locally to inspect the tarball before release:

   ```bash
   mkdir -p /tmp/css-property-type-validator-pack
   pnpm --filter @schalkneethling/css-property-type-validator-core pack --pack-destination /tmp/css-property-type-validator-pack
   pnpm --filter @schalkneethling/css-property-type-validator-cli pack --pack-destination /tmp/css-property-type-validator-pack
   pnpm --filter @schalkneethling/stylelint-plugin-css-property-type-validator pack --pack-destination /tmp/css-property-type-validator-pack
   ```

5. Merge the release-prep PR.
6. Create and publish a GitHub Release with the matching tag prefix.
7. Confirm the `Publish` workflow completes and the package appears on npm.

## Security Notes

- Keep the `publish` GitHub environment protected.
- Do not add npm auth tokens for package publishing.
- Keep GitHub Actions pinned to full commit SHAs.
- Keep `.npmrc` set to `ignore-scripts=true`; CI also installs with `--ignore-scripts`.
- Test and pack jobs use `.nvmrc` for the project runtime. The publish job uses Node 24.8.0 only for npm's OIDC trusted publishing support and does not rebuild the package tarballs.
