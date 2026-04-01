# Roadmap

## Near term

- Validate authored values assigned directly to registered custom properties.
  Example: flag `--brand-color: 10px` when `--brand-color` is registered as `"<color>"`.
- Handle custom property patterns that rely on whitespace or fallback toggles.
  Example: account for the "space toggle" / `--foo: ;` pattern when validating assignments and `var(--foo, fallback)` usage.
- Support declarations containing multiple `var()` usages in a single value.
  Example: validate `margin-inline: var(--space-sm) var(--space-lg)` instead of skipping it.
- Improve syntax compatibility checking beyond representative sample substitution where practical.
  Goal: reduce heuristic gaps for more complex syntax descriptors and consuming properties.
- Expand diagnostics with clearer remediation guidance.
  Example: include more context about the registered syntax and the property that rejected it.

## Later

- Support validation across imported stylesheets.
  Goal: allow registry assembly from `@import` graphs instead of only explicit file inputs.
- Add a Stylelint adapter on top of the standalone core.
- Explore an ESLint CSS adapter once the standalone core behavior is stable.
