# Contributing

Thanks for helping improve CSS Property Type Validator.

## Setup

This repository uses pnpm workspaces and requires Node.js 22 or newer.

```bash
pnpm install
pnpm run build
pnpm test
```

## Quick Feedback

Use these commands while developing:

```bash
pnpm run format
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run build
pnpm run check:supported-syntax-names
```

Before opening a pull request, run:

```bash
pnpm run check
pnpm run check:supported-syntax-names
```

`pnpm run check` runs formatting, linting, type checking, tests, and package builds.

## Validation Changes

The validator should stay conservative. When behavior is uncertain, prefer skipping a declaration over reporting a diagnostic that may be a false positive.

Add or update tests for:

- the diagnostic that should be reported
- the compatible case that should stay quiet
- any conservative skip path introduced by the change
- CLI behavior when the change affects user-visible output

Spec-driven behavior should include a short comment with the relevant reason or reference. Avoid comments that repeat the code.

## Releases

This project uses Release Please and conventional commits. Use commit or pull request titles such as:

- `feat: support a new validation case`
- `fix: avoid a false positive for fallback values`
- `docs: clarify registry-only usage`

See [RELEASING.md](./RELEASING.md) for the release workflow and npm trusted publishing details.
