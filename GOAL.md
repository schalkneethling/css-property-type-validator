# Project Goal

## North Star

CSS Property Type Validator makes typed CSS custom properties practical to adopt and maintain by discovering registration opportunities, producing reviewable evidence, and catching invalid `@property` registrations and incompatible usage before mistakes ship.

## Who This Is For

- CSS authors and design-system maintainers adopting `@property` in existing codebases.
- Teams enforcing typed custom properties through local tooling, Stylelint, and CI.
- Coding agents that require deterministic analysis, exact evidence, safe suggested edits, and stable machine-readable contracts.
- Integrators consuming the browser-safe TypeScript core or CLI.

## Product Lifecycle

The project owns one connected workflow:

**audit → review → generate → validate → gate**

1. Audit repository CSS and explain registration coverage, conflicts, skips, and opportunities.
2. Review evidence and decisions in JSON or a standalone HTML report.
3. Generate conservative registrations only after required human or configured decisions.
4. Validate registrations, assignments, fallbacks, aliases, and consuming-property compatibility.
5. Gate incremental adoption with stable diagnostics, baselines, JSON, SARIF, and exit codes.

## Owned Surfaces

- **Core:** filesystem-free parsing, analysis, validation, evidence, coverage, inference, and edit plans.
- **CLI:** project discovery, bounded I/O, configuration, reports, CI policy, baselines, and application of reviewed edits.
- **Stylelint:** focused feedback for Stylelint-owned files using the shared core.
- **Web:** a local review and learning sandbox that consumes only published-compatible core APIs.

Other editor integrations may consume the core or CLI, but maintaining them is not a project responsibility.

## Success Looks Like

- Existing projects can measure adoption before enabling a gate.
- Diagnostics and coverage are stable, deterministic, and useful to both engineers and agents.
- Generated registrations expose evidence, confidence, policy provenance, and unresolved human decisions.
- `inherits` and `initial-value` are never guessed.
- CI can fail only on new or explicitly gated findings while retaining existing debt.
- Human reports work offline and in the pinned Ephemeral Pages sandbox.
- Web never exposes a capability that is unavailable from the exact published core package it declares.

## Non-Goals

- Do not simulate the full browser cascade, DOM-specific computed values, or runtime resolution.
- Do not infer behavior unsupported by the official CSS specifications.
- Do not report ambiguous behavior as a definite error.
- Do not own editor extensions, preprocessors, SFC extraction, or additional lint adapters.
- Do not make unresolved-reference checks mandatory or present them as cascade analysis.
- Do not automatically choose semantic values for `inherits` or `initial-value`.
- Do not allow package surfaces to reimplement or drift from the core.

## Principles and Constraints

- The official published CSS specifications are the authority for every semantic `@property` rule. Libraries, MDN, Webref, WPT, and browsers are supporting evidence only.
- Define acceptance boundaries before RED tests; trace every test to an accepted outcome.
- Prefer structured uncertainty and review over false positives.
- Keep the core browser-safe and filesystem-free.
- Enforce bounded reads before allocation and check bytes again after reading.
- Treat workspace compatibility and published-package compatibility as separate claims.
- Treat the pinned Ephemeral Pages delivery contract as the report compatibility authority.
- Keep machine-readable schemas, diagnostic IDs, sorting, and fingerprints versioned and deterministic.
- Keep publishing auditable, artifact-driven, and protected by OIDC and exact-version verification.
- Target Node.js 22 or newer for maintained Node surfaces.

## Current Focus

1. Establish specification provenance, acceptance traceability, and stable analysis contracts.
2. Retire the VS Code package and remove editor ownership from active tooling.
3. Add shared bounded project context and repository-wide audit/coverage.
4. Deliver standalone review HTML compatible with Ephemeral Pages.
5. Replace implicit generation choices with explicit evidence and decisions.
6. Add baselines, SARIF, and incremental CI gates.
7. Harden Stylelint and the published-consumer web boundary.
