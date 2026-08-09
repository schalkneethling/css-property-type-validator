# Releasing

This repository uses Bumpy to collect release intent, create package version PRs, and generate changelogs for stable npm packages. Publishing still happens from manually published GitHub Releases during the staged Bumpy migration. The publish workflow uses npm trusted publishing with GitHub OIDC, so no `NPM_TOKEN` repository secret is required.

## CI

The CI workflow runs on pull requests and pushes to `main` and verifies:

- `pnpm install --frozen-lockfile --ignore-scripts`
- `pnpm run format:check`
- `pnpm run lint`
- `pnpm run typecheck`
- `pnpm test`
- `pnpm run build`
- acceptance traceability, browser/package/read/specification/diagnostic/generated-contract guardrails
- the published-core web lane in an isolated install
- the standalone report under the pinned Ephemeral CSP and sandbox
- the project-context performance budget on Node 22/Linux

The ordinary CI workflow also creates a source-redacted standalone adoption report as a private CI
artifact. Public Ephemeral publication is a separate same-repository pull-request workflow, disabled
unless the repository variable `CPTV_EPHEMERAL_REPORTS` is exactly `true`. Never bypass redaction or
publish a report from a fork.

## Published Packages

- `@schalkneethling/css-property-type-validator-core`
- `@schalkneethling/css-property-type-validator-cli`
- `@schalkneethling/stylelint-plugin-css-property-type-validator`

Bumpy currently manages core and CLI only. The Stylelint plugin remains manual while it is on prerelease versions because Bumpy supports `major`, `minor`, and `patch` bumps, and a patch bump from `0.1.0-beta.x` would graduate it to `0.1.0`. Add it to Bumpy once it is ready for stable releases.

## Trusted Publishing Setup

Each npm package must have a trusted publisher configured with:

- Provider: GitHub Actions
- Repository: `schalkneethling/css-property-type-validator`
- Workflow filename: `.github/workflows/publish.yml`
- Environment: `publish`
- Allowed action: `npm publish`

The first publish of a brand-new package must happen manually, because npm only lets you configure trusted publishing after the package exists. After that first publish, configure trusted publishing before using the workflow.

## Conventional Commits

Use conventional commit style for PR titles and commits merged to `main`, even though package bump intent now lives in Bumpy bump files:

- `feat:` for user-facing additions
- `fix:` for bug fixes
- `docs:` for documentation-only changes
- `feat!:` or `BREAKING CHANGE:` for breaking changes

## Bumpy Bump Files

Every PR that changes one of the Bumpy-managed npm packages should include a bump file in `.bumpy/`. Create one interactively with:

```bash
pnpm run release:add
```

For non-interactive use, pass package bumps and a message directly:

```bash
pnpm exec bumpy add --packages "@schalkneethling/css-property-type-validator-core:patch" --message "Fix import URL resolution."
```

Use `patch` for fixes, `minor` for user-facing additions, and `major` for breaking changes. Use an empty bump file only when a PR touches managed package files but should not release a package:

```bash
pnpm exec bumpy add --empty --message "No package release needed."
```

Preview the release plan with:

```bash
pnpm run release:status
```

When bump files merge to `main`, the Bumpy Version PR workflow creates or updates the `bumpy/version-packages` PR. That PR updates package versions, workspace dependency ranges, lockfile metadata, and package changelogs for managed packages. During this staged migration, merging that PR does not publish packages automatically.

The workflow uses the default `github.token`; no personal access token is required for this staged setup. If you later want Bumpy-created version PRs to trigger all pull request workflows automatically, add a `BUMPY_GH_TOKEN` secret and wire it into the workflow.

## Changelog Format

Bumpy uses a repository-specific changelog formatter so generated entries stay compatible with the formatter/linter toolchain:

- `# Changelog` stays as the file title.
- Generated version headings use `## x.y.z (YYYY-MM-DD)`.
- Generated sections use headings such as `### Features` and `### Bug Fixes`.
- Generated list items use `-` bullets, not `*`.
- Generated entries must not contain repeated blank lines.

Do not hand-edit generated changelog formatting in a version PR unless `pnpm run release:check-changelogs` or `pnpm run format:check` fails.

## Release Tags

Publish by creating and publishing a GitHub Release whose tag identifies the package:

- `core-vX.Y.Z` publishes the core package
- `cli-vX.Y.Z` publishes the CLI package
- `stylelint-vX.Y.Z` publishes the Stylelint plugin
- `all-vX.Y.Z` publishes all npm packages

Use `stylelint-v0.1.0-beta.0` for the first Stylelint beta release.

Packages that depend on workspace packages must only be released after their workspace dependencies have already been published at the versions that will be written into the packed package. For example, if the Stylelint plugin uses a new core export, bump and publish core first, or use an `all-vX.Y.Z` release so core is published before the plugin.

The release and deployment order is strict:

1. Merge core behavior without enabling it in web.
2. Pack and consume all public packages outside the workspace.
3. Publish core.
4. Verify the exact core version and registry integrity from a clean install.
5. Publish CLI, then Stylelint, when their packed dependencies require that core version.
6. Open or merge the separate web consumer change pinned to the exact published core version.
7. Build and test the deployable web artifact only through `web:check-published-core`.

A normal workspace web build is future-integration evidence. It is never a deployable artifact.
The private project-context and report packages are bundled into their public consumers and must
not appear as runtime dependencies in a tarball.

## Version PR Checks

Before merging a Bumpy version PR, verify:

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm run release:verify
pnpm run release:rehearse
```

## Manual Publish Steps

1. Merge the Bumpy version PR.
2. Run the local verification gate:

   ```bash
   pnpm install --frozen-lockfile --ignore-scripts
   pnpm run release:verify
   ```

3. Pack and execute the public packages in a clean temporary consumer:

   ```bash
   pnpm run release:pack-check
   pnpm run release:consume-local
   ```

4. If web will consume the already-published core version, verify the exact registry package and
   isolated deployable build:

   ```bash
   pnpm run release:verify-publication -- \
     @schalkneethling/css-property-type-validator-core@X.Y.Z
   pnpm run web:check-published-core
   ```

5. Pack locally for manual inspection when needed:

   ```bash
   mkdir -p /tmp/css-property-type-validator-pack
   pnpm --filter @schalkneethling/css-property-type-validator-core pack --pack-destination /tmp/css-property-type-validator-pack
   pnpm --filter @schalkneethling/css-property-type-validator-cli pack --pack-destination /tmp/css-property-type-validator-pack
   pnpm --filter @schalkneethling/stylelint-plugin-css-property-type-validator pack --pack-destination /tmp/css-property-type-validator-pack
   ```

6. Create and publish a GitHub Release with the matching tag prefix. Use `all-vX.Y.Z` when releasing a package together with a workspace dependency it relies on.
7. Confirm the `Publish` workflow completes and each exact package version appears on npm before
   releasing or deploying a dependent consumer.

## Partial-release recovery

- If core publication fails, stop. Do not publish dependents and do not enable the web feature.
- If core succeeds but CLI or Stylelint fails, keep the published core, correct the dependent
  package in a new release-prep change, rerun clean consumption, and publish only the missing or
  corrected dependent. Do not reuse an npm version.
- If npm availability or integrity verification is uncertain, fail closed and retry verification;
  a workspace package is not a substitute.
- If the web consumer fails after core publication, leave the currently deployed web version in
  place and repair the separate pinned consumer change. Do not deploy a workspace artifact.
- If the Ephemeral contract drifts, retain the ordinary sanitized CI artifact, disable optional
  public publication, review the proposed manifest change, and rerun sandbox tests before updating
  the pin.
- If an audit plan or baseline is stale, regenerate and review it. Never weaken validation or apply
  a partial edit as recovery.

If Bumpy is unavailable, fall back to manually updating package versions, workspace dependency versions, and changelogs in a release-prep PR before following the same publish steps.

## Security Notes

- Keep the `publish` GitHub environment protected.
- Do not add npm auth tokens for package publishing.
- Keep GitHub Actions pinned to full commit SHAs.
- Keep `.npmrc` set to `ignore-scripts=true`; CI also installs with `--ignore-scripts`.
- Test and pack jobs use `.nvmrc` for the project runtime. The publish job uses Node 24.8.0 only for npm's OIDC trusted publishing support and does not rebuild the package tarballs.
