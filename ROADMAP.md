# Roadmap

## Near term

- Prioritize support for declarations containing multiple `var()` usages in a single value.
  This is likely the biggest gap for real-world design-token usage because shorthand and composite values routinely combine multiple custom properties.
- Validate authored values assigned directly to registered custom properties.
  Example: flag `--brand-color: 10px` when `--brand-color` is registered as `"<color>"`.
- Handle custom property patterns that rely on whitespace or fallback toggles.
  Example: account for the "space toggle" / `--foo: ;` pattern when validating assignments and `var(--foo, fallback)` usage.
- Improve syntax compatibility checking beyond representative sample substitution where practical.
  Goal: reduce heuristic gaps for more complex syntax descriptors and consuming properties.
- Expand diagnostics with clearer remediation guidance.
  Example: include more context about the registered syntax and the property that rejected it.
- Document and maintain a `css-tree` update strategy.
  Goal: track parser/lexer coverage as CSS evolves and reduce false positives or false negatives caused by stale syntax/property data.

## Later

- Support validation across imported stylesheets.
  Goal: allow registry assembly from `@import` graphs instead of only explicit file inputs.
  A simpler first step could be a CLI option that accepts one or more registry files explicitly.
- Add a Stylelint adapter on top of the standalone core.
- Explore an ESLint CSS adapter once the standalone core behavior is stable.
- Explore how typed CSS mixins and mixin-like patterns could strengthen the project's long-term value proposition.
  If CSS mixins land with typed parameters built on `@property`, this kind of validation becomes much closer to core tooling infrastructure.
