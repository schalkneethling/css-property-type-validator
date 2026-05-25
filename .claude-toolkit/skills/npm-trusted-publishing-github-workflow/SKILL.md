---
name: npm-trusted-publishing-github-workflow
description: >
  Generate, repair, or debug the GitHub Actions workflow FILE that performs an OIDC
  trusted publish of a pnpm package — the concrete publish.yml, its test → build →
  publish job shape, the package tarball artifact handoff, Node-version inference from
  package.json, pnpm setup via pnpm/action-setup, the npm-CLI-version upgrade step, and
  repository.url/Sigstore provenance matching. Use when the user wants the actual
  workflow written or fixed, or is debugging a specific CI failure: npm publish
  E404/E403/422, NODE_AUTH_TOKEN appearing unexpectedly, provenance or id-token errors,
  pnpm/action-setup version resolution, or actions/setup-node node-version-file problems.
  For the broader publishing SECURITY POSTURE — account 2FA, repository and branch
  hardening, GitHub environments, changesets versus changelogithub, sole-maintainer risk,
  or auditing an existing pipeline — use the npm-package-publishing skill instead.
---

# NPM Trusted Publish

## Goal

Implement the same hardened npm trusted publishing pattern every time, without rediscovering the details from CI logs.

## Related skills

This skill generates and debugs the publish workflow file. For the surrounding security posture — account and repository 2FA, branch protection, GitHub publish environments, release-strategy choice, and sole-maintainer risk — use the `npm-package-publishing` skill. The two are complementary: `npm-package-publishing` decides how publishing should be set up, this skill writes and fixes the YAML that does it.

One number to keep consistent between the two: both skills use Node 24.8.0 or higher as the publish-step floor. Node 24.8.0 bundles npm 11.6.0, which already exceeds the npm CLI 11.5.1 minimum that trusted publishing requires, so on that floor no manual npm upgrade is needed. If a project must publish on an older Node, it has to upgrade npm to 11.5.1 or later first — the publish job retains a guard step for exactly that case.

## Workflow

1. Inspect `package.json`, `.npmrc`, lockfiles, and existing `.github/workflows/*.yml`.
2. Resolve every workflow dependency to its latest stable version at the moment the file is created, and pin each to the full-length commit SHA of that version. The SHAs in this skill's template are placeholders that will be out of date; never copy them verbatim. See "Pinning actions to current SHAs" below for the procedure.
3. Preserve pinned action SHAs when they already exist; annotate each with a version comment so Dependabot can bump it.
4. Drive the test and build jobs' Node version from the project's **existing** target, not from a number invented for this workflow. Read it from the repo's current `.nvmrc`, `.node-version`, `volta.node`, or CI config; if none exists, ask the developer rather than guessing. Use `node-version-file: .nvmrc` for these jobs (do not point them at `package.json`, which falls through to the `engines.node` range — an unbounded range like `>=20` resolves to the newest Node release, so CI silently floats away from the version developers actually run). `.nvmrc` is a development and CI file only; npm never reads it during a consumer install, so it does not constrain consumers.
5. Never raise the project's Node version, create a new `.nvmrc`, or overwrite an existing one to "match" the publish step. The publish step's Node 24.8.0 (step 11) is an isolated requirement of the publish action and must not propagate to `.nvmrc`, to `engines.node`, or to the test and build jobs. A project that targets Node 22 keeps testing and building on Node 22; only the final `npm publish` invocation runs on 24.8.0, and it does not rebuild the artifact. Conflating these two numbers is the most likely way this skill is misapplied — do not do it.
6. Ensure every job that reads the repo (including any reading `.nvmrc`) runs `actions/checkout` first.
7. Install pnpm with `pnpm/action-setup`, omitting the `version` input so the version is read from the `packageManager` field. Do not use Corepack: it is still marked experimental and downloads the package manager from the network on first use, which is an avoidable failure surface in a release pipeline.
8. `pnpm/action-setup` does not install Node.js, so always run `actions/setup-node` as a separate step.
9. Disable setup-node package-manager caching for release/publish workflows with `package-manager-cache: false`.
10. Set `persist-credentials: false` on every `actions/checkout` step unless a later step must push to git.
11. Target Node 24.8.0 or higher in the publish step. That floor bundles npm 11.6.0, which already exceeds the npm CLI 11.5.1 minimum trusted publishing requires, so no manual npm upgrade is needed there. Keep a guard step that upgrades npm only when the resolved Node ships an npm below 11.5.1, so the workflow stays correct if a project pins an older Node. An npm that is too old silently falls back to token auth or fails to attempt OIDC at all.
12. Pack into a dedicated artifact directory, usually `package/*.tgz`.
13. In the publish job, download the artifact to `package`, find the `.tgz`, and publish its resolved path.
14. Use GitHub OIDC trusted publishing, not npm tokens. Provenance is generated automatically under trusted publishing, so the `--provenance` flag is not required.
15. Add a `concurrency` group keyed on the release so two tag pushes cannot race into overlapping publishes.

## Package Metadata

Three different Node versions live in three different places, and keeping them separate is deliberate — conflating them is the main way this workflow goes wrong. `engines.node` in `package.json` is the _consumer_ floor: the only one that constrains people who install the package, and it should reflect what the package actually supports (npm warns, but does not hard-fail, when a consumer is outside it). The test and build jobs run on the project's _own_ target version, read from the existing `.nvmrc` (or `.node-version`/`volta.node`); this is never read during a consumer install, so it does not leak into the consumer contract. The publish step pins Node 24.8.0 or higher independently, purely because that floor bundles an npm new enough for OIDC. These three are not meant to agree: a repo can develop and test on Node 22, keep `engines.node` at its true support range, and still publish on Node 24 — all without affecting consumers, and without changing what the project builds and tests against.

The publish-step version must never be copied into the other two. Do not raise `engines.node` to 24.8.0, and do not set or bump `.nvmrc` to 24, to "make things consistent". Doing so would move the test and build jobs onto Node 24, so the package would be validated against a version above its actual target and a Node-22 incompatibility could ship uncaught. The publish job runs `npm publish` on the already-built tarball with scripts ignored, so its Node version never rebuilds or retests the code; it is inert with respect to the artifact.

```json
{
  "engines": {
    "node": ">=20"
  },
  "packageManager": "pnpm@10.0.0",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/OWNER/REPO.git"
  }
}
```

The `engines.node` value above is the _consumer_ floor and should reflect what the package actually supports; `>=20` is only an example, and a bounded upper limit is sensible if the package genuinely needs one. Do not raise it to 24.8.0 to satisfy CI — the publish step pins its own Node version, and the test and build jobs read theirs from `.nvmrc`, so the trusted-publishing requirement never leaks into the consumer contract.

Because the test and build jobs read `.nvmrc`, that file must exist in the repository root with a single version line matching the project's target (for example `22`). If the repo already has one, use it as-is and do not change it. If it has none, derive the value from the project's existing Node target (`.node-version`, `volta.node`, the previous CI config, or by asking the developer) before creating it — do not default to the publish step's 24.8.0. Alternatively, point those jobs' `node-version` at the project's explicit version instead of using a file.

The `repository.url` field is not cosmetic. Provenance verification runs through Sigstore, which compares the repository in the OIDC token against `package.json`. A mismatch fails the publish with a 422 error that the user-facing npm docs do not explain. Make sure the owner/name in `repository.url` matches the repository actually running the workflow.

Do not add npm auth tokens for trusted publishing.

## Workflow Template

Use this shape for pnpm packages, adapting only names, test commands, and existing pinned action SHAs. The `@<sha>` values below are **placeholders**: before writing the file, resolve each action to its latest stable release and replace the placeholder with that release's full-length commit SHA, keeping the `# vX.Y.Z` comment accurate. Do not copy the example SHAs — see "Pinning actions to current SHAs".

```yaml
# NOTE: every action SHA below is a PLACEHOLDER and is almost certainly out of date.
# Re-resolve each action to its latest stable release and pin to that SHA before use.
# See "Pinning actions to current SHAs".
name: Publish

on:
  release:
    types: [published]

permissions:
  contents: read

concurrency:
  group: publish-${{ github.event.release.tag_name }}
  cancel-in-progress: false

jobs:
  test:
    name: Test
    runs-on: ubuntu-latest
    timeout-minutes: 60
    permissions:
      contents: read
    steps:
      - name: Checkout
        uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v4.2.2 — PLACEHOLDER SHA, re-resolve before use
        with:
          persist-credentials: false

      - name: Install pnpm
        uses: pnpm/action-setup@a7487c7e89a18df4991f7f222e4898a00d66ddda # v4.1.0 — PLACEHOLDER SHA, re-resolve before use
        # version is read from the packageManager field in package.json

      - name: Setup Node.js
        uses: actions/setup-node@1d0ff469b7ec7b3cb9d8673fde0c81c44821de2a # v4.2.0 — PLACEHOLDER SHA, re-resolve before use
        with:
          node-version-file: .nvmrc # exact dev/CI version; decoupled from engines.node
          package-manager-cache: false

      - name: Install dependencies
        run: pnpm install --frozen-lockfile --ignore-scripts

      - name: Check package
        run: pnpm run package:check

      - name: Run tests
        run: pnpm test

  build:
    name: Pack package
    needs: test
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions:
      contents: read
    steps:
      - name: Checkout
        uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v4.2.2 — PLACEHOLDER SHA, re-resolve before use
        with:
          persist-credentials: false

      - name: Install pnpm
        uses: pnpm/action-setup@a7487c7e89a18df4991f7f222e4898a00d66ddda # v4.1.0 — PLACEHOLDER SHA, re-resolve before use

      - name: Setup Node.js
        uses: actions/setup-node@1d0ff469b7ec7b3cb9d8673fde0c81c44821de2a # v4.2.0 — PLACEHOLDER SHA, re-resolve before use
        with:
          node-version-file: .nvmrc # exact dev/CI version; decoupled from engines.node
          package-manager-cache: false

      - name: Install dependencies
        run: pnpm install --frozen-lockfile --ignore-scripts

      - name: Create package directory
        run: mkdir package

      - name: Create package tarball
        run: pnpm pack --pack-destination package

      - name: Upload package tarball
        uses: actions/upload-artifact@4cec3d8aa04e39d1a68397de0c4cd6fb9dce8ec1 # v4.6.1 — PLACEHOLDER SHA, re-resolve before use
        with:
          name: npm-package
          path: package/*.tgz
          if-no-files-found: error
          retention-days: 7

  publish:
    name: Publish to npm
    needs: build
    runs-on: ubuntu-latest
    timeout-minutes: 10
    environment: publish
    permissions:
      contents: read
      id-token: write
    steps:
      - name: Checkout
        uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v4.2.2 — PLACEHOLDER SHA, re-resolve before use
        with:
          persist-credentials: false

      - name: Setup Node.js
        uses: actions/setup-node@1d0ff469b7ec7b3cb9d8673fde0c81c44821de2a # v4.2.0 — PLACEHOLDER SHA, re-resolve before use
        with:
          # Pinned for the publish step only. 24.8.0 bundles npm 11.6.0, new enough
          # for OIDC; this is independent of engines.node, the consumer floor.
          node-version: 24.8.0
          package-manager-cache: false
          registry-url: https://registry.npmjs.org

      - name: Ensure npm is new enough for trusted publishing
        # No-op on Node >= 24.8.0; the guard only matters if Node is pinned lower.
        run: |
          required="11.5.1"
          current="$(npm --version)"
          if npx -y semver -r "<$required" --include-prerelease "$current" > /dev/null 2>&1; then
            echo "npm $current is below $required; upgrading."
            npm install -g npm@latest
          fi
          npm --version

      - name: Download package tarball
        uses: actions/download-artifact@cc203385981b70ca67e1cc392babf9cc229d5806 # v4.1.9 — PLACEHOLDER SHA, re-resolve before use
        with:
          name: npm-package
          path: package

      - name: Publish to npm
        run: |
          tarball="$(find package -type f -name '*.tgz' -print -quit)"

          if [ -z "$tarball" ]; then
            echo "No package tarball found in downloaded artifact."
            find package -maxdepth 3 -type f -print
            exit 1
          fi

          npm publish "$(realpath "$tarball")" --ignore-scripts --access public
```

## Pinning actions to current SHAs

The template's SHAs are stale by design. Action versions and their commit SHAs change over time, so resolve them fresh whenever a `publish.yml` is created or reviewed. Pin to the full-length commit SHA, never a tag or branch, because a tag can be moved to point at malicious code after you have reviewed it.

There are two reliable ways to produce current pins.

The preferred approach is to let tooling resolve and pin for you. Write the workflow first using human-readable tags (for example `actions/checkout@v4`), then run `npx actions-up` in the repository to rewrite every `uses:` reference to the latest stable release pinned to its commit SHA, with a version comment appended. This is the same tool the `npm-package-publishing` skill recommends, and it removes the chance of a hand-typed SHA being wrong. After it runs, confirm each line carries a `@<40-hex-sha> # vX.Y.Z` form.

If resolving manually, for each action find the latest stable release tag, then read the exact commit that tag points to and pin that commit:

```bash
# Latest stable release tag for an action (skips pre-releases)
gh release view --repo actions/checkout --json tagName --jq .tagName

# The commit SHA that the tag resolves to — pin THIS value
gh api repos/actions/checkout/git/refs/tags/v4.2.2 --jq .object.sha
```

For an annotated tag the first lookup may return a tag object rather than a commit; dereference it with `gh api repos/<owner>/<repo>/git/tags/<sha> --jq .object.sha` to reach the underlying commit. Pin the commit SHA, not the tag SHA.

Keep the pins current after creation by letting Dependabot manage action updates. This is why every `uses:` line carries a `# vX.Y.Z` comment: Dependabot reads the comment to know which version a SHA represents and to raise update PRs. The companion Dependabot configuration should include a `github-actions` ecosystem entry pointing at `/` so the publish workflow is covered. Periodically re-running `npx actions-up` is a reasonable backstop if Dependabot is not enabled.

## Checks

After edits:

```bash
ruby -e 'require "yaml"; YAML.load_file(".github/workflows/publish.yml"); puts "YAML ok"'
```

If the project uses pnpm, validate packing without publishing:

```bash
pack_dir="$(mktemp -d)"
pnpm pack --pack-destination "$pack_dir"
```

Confirm no placeholder markers survived into the generated file, and that every action is pinned to a 40-character SHA rather than a tag:

```bash
# Must print nothing
grep -n "PLACEHOLDER" .github/workflows/publish.yml

# Every uses: line must reference a 40-hex SHA, not a tag
if ! grep -qE "uses: [^@]+@" .github/workflows/publish.yml; then
  echo "No uses lines found"
  exit 1
fi

grep -nE "uses: [^@]+@[^ ]+" .github/workflows/publish.yml \
  | grep -vE "@[0-9a-f]{40} " && echo "Unpinned action found" || echo "All actions SHA-pinned"
```

## Failure Clues

- `NODE_AUTH_TOKEN: ***` appears in the publish log: token auth is being used or injected. Trusted publishing should not need it.
- `E404 Not Found - PUT ... could not be found or you do not have permission`: often an auth/scope permission problem, especially if local manual publish works.
- `422 Unprocessable Entity` during publish with provenance: the repository in the OIDC token does not match `package.json`. Check `repository.url` first.
- npm silently publishing with a token despite trusted-publisher config: the runner's npm CLI is older than 11.5.1. This should not happen on the pinned Node 24.8.0 (which bundles npm 11.6.0); if the publish step was moved to an older Node, confirm the guard step actually upgraded npm and reported a version at or above 11.5.1.
- Tests or build now run on a newer Node than the project targets (for example Node 24 when the project is on 22): `.nvmrc` was created or bumped to match the publish step. Reset it to the project's actual target; the publish step's 24.8.0 must stay confined to the publish job.
- `package.json does not exist` from `setup-node`: the job uses `node-version-file` before checkout, or the publish job only downloaded an artifact.
- `pnpm/action-setup` cannot resolve a version: the `packageManager` field is missing, or the v6 bug in [pnpm/action-setup#227](https://github.com/pnpm/action-setup/issues/227) occasionally fails to read `packageManager` from `package.json` when `package_json_file` is set, causing version resolution to fail. Pin `pnpm/action-setup` to a known-good SHA and, if needed, set the `version` input explicitly as a fallback.
- Publishing an already-published version will fail even after the workflow is fixed.

## External Setup Reminder

Repo changes cannot create npm's trusted publisher entry. Remind the user to verify npm package settings:

- provider: GitHub Actions
- repository owner/name matches the repo
- workflow filename matches `.github/workflows/publish.yml`
- publish environment matches the workflow if npm is configured with one
- at least one allowed action is selected: configurations created after 20 May 2026 require explicitly selecting an allowed action (for example, allow `npm publish`), or the publish will be rejected

The first version of a brand-new package cannot be published via OIDC, because npm requires the package to exist before its trusted-publisher settings can be edited. Publish the initial version manually or with a token, then configure trusted publishing for subsequent releases.
