# Project Goal

## North Star

CSS Property Type Validator exists to make typed CSS custom properties practical to adopt and maintain by catching invalid `@property` registrations and incompatible `var()` usage before those mistakes ship.

## Who This Is For

- CSS authors and design-system maintainers.
- Teams adopting `@property` in existing CSS codebases and needing a low-risk migration path.
- Tooling users who want the same validation available in CI, local command-line checks, Stylelint, VS Code-compatible editors, and a browser UI.
- Integrators who need a stable TypeScript validation engine with machine-readable diagnostics.

## Core Goals

1. Provide a conservative standalone validation core that understands registered custom properties, validates required `@property` descriptors, and checks compatible usage through `var()`.
2. Make typed custom property validation available wherever developers need it, while keeping behavior consistent through a shared core.
3. Help existing projects adopt typed custom properties incrementally by generating reviewable `@property` registrations from concrete authored custom property declarations.
4. Produce diagnostics that are clear for humans and stable for automation.
5. Support real-world token architectures without assuming one global CSS shape.

## Success Looks Like

- A project can add the CLI or Stylelint plugin to CI and catch real typed-token mistakes without being flooded by false positives.
- The same CSS produces compatible results across the core and every implementation built on it.
- Generated `@property` output is conservative enough to review, useful enough to lower adoption friction, and transparent about values that need human judgment.
- Diagnostics point users toward the invalid registration, assignment, fallback, unresolved import, or incompatible consuming property with enough context to fix it.
- Supported CSS syntax data stays current enough to preserve trust in the validator as CSS evolves.

## Non-Goals

- Do not simulate the full browser cascade, DOM-specific computed values, or runtime custom property resolution.
- Do not report diagnostics for ambiguous CSS patterns unless the validator can do so with high confidence.
- Do not make unknown custom property checks mandatory or present them as full cascade analysis; they are opt-in static checks against configured token inputs.
- Do not let package surfaces drift into separate behavior; new integrations should reuse the core rather than reimplementing validation.

## Principles and Constraints

- Prefer skipping uncertain cases over creating false positives.
- Keep configuration explicit: registry inputs, token inputs, and unresolved-reference checks should be visible choices in each integration.
- Keep generated registrations reviewable rather than magical.
- Preserve stable machine-readable diagnostic fields for downstream tools.
- Require spec-driven behavior and test coverage for both failing and compatible cases.
- Keep manual release and package-publishing workflows auditable.
- Target the maintained runtime baseline used by the repo, currently Node.js 22 or newer.

## Current Focus

- Improve support for custom property patterns that rely on whitespace or fallback toggles.
- Reduce heuristic gaps in syntax compatibility checks where doing so remains conservative.
- Make diagnostics more actionable by adding clearer remediation context.
- Harden the Stylelint beta through real-project feedback.
- Add config-file based registry discovery to reduce repeated CLI, VS Code, and Stylelint setup.
- Expand validation to more languages, file types, and editor workflows when the core can model them safely.
- Explore automatic fixes where remediation is clear, tested, and consistent across core-backed implementations.
- Evaluate integrating `@property` generation into implementations beyond the CLI and browser UI where it fits the developer workflow.
- Track how future CSS `@function` and mixin-like features should shape typed custom property validation.

## Open Questions

- How far should the generator go in explaining why each syntax was inferred before the output becomes too noisy?
- Which additional integrations best satisfy the goal of making typed custom property validation available wherever developers need it?
