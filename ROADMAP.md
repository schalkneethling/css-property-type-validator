# Roadmap

## Current State

- Validates `@property` syntax, `inherits`, and `initial-value` descriptors.
- Validates authored values assigned directly to registered custom properties.
- Supports declarations with multiple registered `var()` usages in one value.
- Validates simple fallback branches in ordinary consuming declarations.
- Assembles registrations from validation inputs, registry-only inputs, and local unconditioned imports.
- Maintains a frozen list of supported syntax component names and checks it against the published spec.

## Near Term

- Handle custom property patterns that rely on whitespace or fallback toggles.
  Example: account for the "space toggle" / `--foo: ;` pattern when validating assignments and `var(--foo, fallback)` usage.
- Improve syntax compatibility checking beyond representative sample substitution where practical.
  Goal: reduce heuristic gaps for more complex syntax descriptors and consuming properties.
- Expand diagnostics with clearer remediation guidance.
  Example: include more context about the registered syntax, the consuming property, and likely fixes.
- Add config-file based registry discovery.
  Goal: make repeated CLI usage easier for projects with shared token registries.

## Later

- Add a Stylelint adapter on top of the standalone core.
- Explore an ESLint CSS adapter once the standalone core behavior is stable.
- Explore how typed CSS mixins and mixin-like patterns could strengthen the project's long-term value proposition.
  If CSS mixins land with typed parameters built on `@property`, this kind of validation becomes much closer to core tooling infrastructure.
