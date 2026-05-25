---
name: dependabot-config
description: >
  Generate or update Dependabot configuration files for projects. Use this skill
  whenever the user asks to add, create, update, configure, or fix Dependabot for
  a project — including phrases like "set up Dependabot", "add Dependabot config",
  "update my dependabot.yml", "enable Dependabot updates", or "configure automated
  dependency updates". Always apply this skill even if the user only mentions one
  ecosystem (e.g. "add Dependabot for npm") — the canonical config covers all
  required ecosystems.
---

# Dependabot Configuration Skill

Produces the canonical `.github/dependabot.yml` configuration for any project.
Always emit the complete canonical config, never a partial one, unless the user
explicitly overrides a specific field after reviewing it.

---

## Canonical Configuration

The authoritative configuration to emit is:

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "daily"
    cooldown:
      default-days: 7
      semver-major-days: 7
      semver-minor-days: 3
      semver-patch-days: 2
      include:
        - "*"

  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "daily"
    cooldown:
      default-days: 7
      include:
        - "*"
```

---

## Cooldown Rationale

Document this to the user when relevant:

| Field               | Value | Reasoning                                              |
| ------------------- | ----- | ------------------------------------------------------ |
| `default-days`      | 7     | Catch-all safety buffer for uncategorised updates      |
| `semver-major-days` | 7     | Breaking changes warrant the longest review window     |
| `semver-minor-days` | 3     | New features; moderate confidence, shorter delay       |
| `semver-patch-days` | 2     | Bug/security fixes; high confidence, fast-track        |
| `include: ["*"]`    | —     | Apply cooldown rules to all packages without exception |

---

## Workflow

### 1. Identify context

- Determine whether a `.github/dependabot.yml` already exists in the project.
  - **Exists**: read the file, explain any differences from the canonical config,
    then overwrite it with the canonical config using a file tool.
  - **Does not exist**: create `.github/dependabot.yml` with the canonical config
    using a file tool.

### 2. Check for non-npm ecosystems

If the project uses additional package ecosystems (e.g. `pip`, `cargo`, `bundler`,
`docker`, `composer`), add an additional `updates` block per ecosystem using the
same `schedule` and `cooldown` values. Keep `npm` and `github-actions` blocks
unchanged. Use the references file for additional ecosystem identifiers if needed.

### 3. Handle directory variations

If the user's project has packages in subdirectories (e.g. a monorepo), ask which
directories need coverage and emit one block per directory per ecosystem, keeping
all other fields from the canonical config intact.

### 4. Write the file

Write the config directly to `.github/dependabot.yml` in the project root using a
file tool — do not present it as a fenced code block for the user to copy manually.
Ensure the `.github/` directory exists before writing.

After writing, confirm the file path to the user and follow with a concise
explanation of what was configured and why — particularly the cooldown strategy —
without repeating every field verbatim.

---

## Constraints

- **Never omit the `cooldown` block** from any ecosystem entry.
- **`semver-*` cooldown fields are only valid for package managers that use semver** (e.g. `npm`, `pip`, `cargo`). Do not include `semver-major-days`, `semver-minor-days`, or `semver-patch-days` for `github-actions` or any other non-semver ecosystem — Dependabot will reject the config.
- **Never change the canonical values** unless the user explicitly requests it and
  provides a reason (e.g. a monorepo with a stricter release cadence).
- **Always include `github-actions`** as an ecosystem, even if the user only asked
  about npm or another runtime ecosystem.
- **YAML formatting**: two-space indentation, string values quoted, list items with
  `- ` prefix. Validate indentation before emitting — malformed YAML is a silent
  failure in Dependabot.

---

## Reference

See `references/ecosystems.md` for the full list of Dependabot-supported
`package-ecosystem` identifiers and their directory conventions.
