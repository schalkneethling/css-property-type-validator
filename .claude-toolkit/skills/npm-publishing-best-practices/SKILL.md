---
name: npm-package-publishing
description: >
  Apply best practices when publishing npm packages, including secure CI/CD workflows, trusted
  publishing via OIDC, GitHub repository hardening, and supply-chain attack prevention. Use this
  skill whenever the user asks about publishing an npm package, setting up a publish workflow,
  configuring GitHub Actions for release automation, managing npm tokens or secrets, setting up
  changesets, or auditing an existing publishing pipeline for security. Also trigger when the user
  mentions publint, OIDC trusted publishing, release automation, or package versioning workflows.
---

# npm Package Publishing — Best Practices

Based on the [e18e publishing guide](https://e18e.dev/docs/publishing.html). Reference it for
the canonical source; this skill distils the actionable steps.

> **Package manager note.** All examples in this skill use `npm` to match the e18e source
> material, but nothing here is npm-specific. Always use whichever package manager the project
> already uses — `pnpm`, `yarn`, `bun`, etc. Adapt commands accordingly:
>
> | npm                               | pnpm                                              | yarn                                              |
> | --------------------------------- | ------------------------------------------------- | ------------------------------------------------- |
> | `npm ci --ignore-scripts`         | `pnpm install --frozen-lockfile --ignore-scripts` | `yarn install --frozen-lockfile --ignore-scripts` |
> | `npm i -g npm`                    | `pnpm add -g pnpm`                                | `yarn set version stable`                         |
> | `ignore-scripts=true` in `.npmrc` | `ignore-scripts=true` in `.npmrc`                 | `enableScripts: false` in `.yarnrc.yml`           |
>
> Detect the project's package manager by checking for a lockfile (`pnpm-lock.yaml`,
> `yarn.lock`, `bun.lockb`) or a `packageManager` field in `package.json` before
> generating any commands or workflow steps.

---

## 1 · Prerequisites

### 1.1 · Enforce 2FA everywhere

| Account | Location                               | Recommended method                                                           |
| ------- | -------------------------------------- | ---------------------------------------------------------------------------- |
| npm     | Account → Security                     | Security key (YubiKey, Touch ID, Windows Hello); fallback: authenticator app |
| GitHub  | Settings → Password and authentication | Same priority order                                                          |

Use a password manager with generated passwords for both accounts.

### 1.2 · Harden GitHub Actions settings

`Settings → Actions → General`:

- ✅ Require actions to be pinned to a **full-length commit SHA**
- ✅ Require approval for first-time contributors
- ✅ Set default workflow permissions to **"Read repository contents and packages"**

> If the repository belongs to an organisation, apply these settings at org level for consistency
> across all repositories.

### 1.3 · Configure branch protection

`Settings → Branches` → create a ruleset for `main`:

- ✅ Require a pull request before merging
- ✅ Require at least 1 approval
- ✅ Dismiss stale approvals when new commits are pushed
- ✅ Require approval of the most recent reviewable push

### 1.4 · Remove legacy npm tokens

`Settings → Secrets & Variables → Actions`: remove any stored npm tokens. OIDC trusted publishing
replaces them entirely — no long-lived secrets needed in the repository.

---

## 2 · Trusted Publishing (OIDC)

Trusted publishing means GitHub Actions authenticates directly with npm via OIDC — no npm token
ever touches the repository.

### 2.1 · Configure on npmjs.com

1. Open your package page → **Settings** tab → **Trusted Publishing** section.
2. Add a trusted publisher:
   - **Organisation / user**: your GitHub org or username
   - **Repository**: the repository name
   - **Workflow filename**: e.g. `publish.yml`
3. Check **"Require two-factor authentication and disallow tokens"** — this forces manual publishes
   to use 2FA as well.

> For bulk configuration across many packages, use
> [`open-packages-on-npm`](https://github.com/antfu/open-packages-on-npm) to open each package
> in a new tab, then the
> [npm-trusted-publisher userscript](https://github.com/sxzz/userscripts/blob/main/src/npm-trusted-publisher.md)
> to configure them rapidly.

### 2.2 · npm CLI version requirement

The publish step **must** use npm CLI ≥ 11.5.1 for automatic OIDC trusted publishing.
Node.js 24 bundles npm 11.5.1; with older CI images, add a step before publishing:

```yaml
- run: npm i -g npm
```

---

## 3 · Standard Publish Workflow

Use the [e18e setup-publish template](https://github.com/e18e/setup-publish/blob/main/templates/default.yml)
as your base, or scaffold it with:

```bash
npx @e18e/setup-publish
```

### 3.1 · Job structure

The workflow **must** separate build from publish. This ensures publish permissions (the OIDC
token) are never exposed to build-time code.

```
test  →  build  →  publish
```

### 3.2 · Non-negotiable workflow constraints

| Constraint                                             | Why                                                         |
| ------------------------------------------------------ | ----------------------------------------------------------- |
| All actions pinned to full-length commit SHA           | Prevents supply-chain attacks via action updates            |
| `npm ci --ignore-scripts` (or `--ignore-scripts` flag) | Prevents malicious lifecycle scripts running during install |
| Build and publish in **separate jobs**                 | Isolates publish permissions from arbitrary build code      |

### 3.3 · Suppress lifecycle scripts project-wide

Add to `.npmrc` in the repository:

```
ignore-scripts=true
```

Also apply globally on developer machines:

```bash
npm config set -g ignore-scripts true
```

### 3.4 · Creating a release

```bash
git tag v1.0.0
git push origin v1.0.0
```

Then in GitHub UI: **Releases → Draft a new release** → choose the tag → **Generate release notes**
→ **Publish release**. This triggers the workflow.

---

## 4 · Alternative Workflow Strategies

### 4.1 · Changesets (recommended for teams)

Use the [changesets template](https://github.com/e18e/setup-publish/blob/main/templates/changesets.yml).

- Merged PRs automatically update a release pull request
- Changelog is generated by changesets and included in the release PR
- Releasing = merging the generated release PR — no manual tagging

### 4.2 · changelogithub (changelog from commit messages)

Use the [changelogithub template](https://github.com/e18e/setup-publish/blob/main/templates/changelogithub.yml).

- Tags are still pushed manually
- GitHub release + changelog are created automatically on tag push
- Package is published on tag push

---

## 5 · Ongoing Maintenance

### 5.1 · Keep dependencies updated

Set up **Dependabot** or **Renovate** to receive automated PRs for dependency updates,
addressing security vulnerabilities promptly.

### 5.2 · Keep GitHub Actions updated

All actions must be pinned to a commit SHA (not a tag). To migrate existing workflows and keep
them current:

```bash
npx actions-up
```

Run this periodically, or let Dependabot/Renovate manage action updates once SHAs are in place.

### 5.3 · Lint workflows for vulnerabilities

[`zizmor`](https://github.com/zizmorcore/zizmor) detects template injection vulnerabilities and
excessive permission scopes in GitHub workflow files:

```bash
zizmor .github/workflows/publish.yml
```

Integrate this into CI or run it before merging workflow changes.

### 5.4 · Validate package.json and exports

[`publint`](https://publint.dev) checks for common publishing issues: missing files, incorrect
`exports` fields, wrong `main`/`module` paths, and more.

```bash
npx publint
```

Review the [full list of publint rules](https://publint.dev/rules) to understand what it checks.
Run this locally before tagging a release.

### 5.5 · Visualise dependency changes

[`multiocular`](https://github.com/multiocular-com/multiocular) shows exactly what code changed
between dependency versions, helping catch unexpected changes or potential security issues.

---

## 6 · Further Security Hardening

### 6.1 · Use a GitHub environment (important for shared repos)

Without a GitHub environment, **any account with write access can trigger a publish** by creating
a branch and modifying the release workflow — bypassing code review entirely.

`Settings → Environments`:

1. Create an environment named `publish`.
2. **Do not** allow administrator bypass of protection rules.
3. Limit deployment to explicit branch names only (e.g. `main`, `v1`). Do not use wildcards.
   Remove stale branches promptly.
4. Update the publish job in `publish.yml`:

```yaml
jobs:
  publish:
    environment: publish
```

5. Update the npm trusted publisher settings on `npmjs.com` to include the environment name.

> Optionally configure the `publish` environment to require **manual approval** before the job
> proceeds — providing a human gate even if malicious code reaches a release branch.

### 6.2 · Consider hardware security keys _(optional)_

Physical security keys (YubiKey, etc.) are significantly more resistant to phishing and credential
theft than authenticator apps or SMS. They are worth recommending but should never be enforced —
not everyone has access to one, and a good authenticator app is a perfectly reasonable alternative.
Mention this as a suggestion, not a requirement.

### 6.3 · Protect all long-lived branches and tags

Apply branch protection rules not just to `main` but to all long-lived branches and to all tags.

### 6.4 · Enable immutable releases

Enable [GitHub immutable releases](https://docs.github.com/en/code-security/supply-chain-security/understanding-your-software-supply-chain/immutable-releases)
to prevent modification or deletion of tags and releases after creation.

---

## 7 · Sole Maintainer Considerations

There is an [open feature request](https://github.com/orgs/community/discussions/174507) to
support 2FA for GitHub environment approvals. Until that lands, trusted publishing carries a risk
for solo maintainers: a leaked GitHub token could be used to publish through the trusted workflow
without a 2FA challenge.

**Recommendation for sole maintainers**: consider publishing locally with `npm publish` and
2FA-protected npm access until environment-level 2FA approval is supported. Continue to follow
all other security recommendations in this document regardless.

---

## Quick Reference Checklist

Use this when setting up a new package or auditing an existing one.

### Account security

- [ ] npm 2FA enabled (security key preferred)
- [ ] GitHub 2FA enabled (security key preferred)
- [ ] Password manager in use

### Repository settings

- [ ] Actions pinned to full-length commit SHAs (enforced in settings)
- [ ] First-time contributor approval required
- [ ] Default workflow permissions set to read-only
- [ ] `main` branch protected (PR + review required)
- [ ] No npm tokens in repository secrets

### Trusted publishing

- [ ] OIDC trusted publisher configured on npmjs.com
- [ ] "Require 2FA, disallow tokens" enabled on npm
- [ ] Publish step uses Node.js ≥ 24.8.0
- [ ] GitHub environment (`publish`) configured with branch restrictions

### Workflow hygiene

- [ ] Build and publish are separate jobs
- [ ] `npm ci --ignore-scripts` used in all install steps
- [ ] `ignore-scripts=true` in `.npmrc`
- [ ] `zizmor` passes on all workflow files

### Package quality

- [ ] `npx publint` passes with no errors
- [ ] Dependabot or Renovate configured
- [ ] `actions-up` run to migrate to SHA-pinned actions
