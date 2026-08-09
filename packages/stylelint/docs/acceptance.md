# Stylelint project-context acceptance boundaries

## AC-SL-PC-001 — Focused bounded contextual inputs

```gherkin
Scenario: Stylelint loads configured contextual CSS safely
  Given one CSS source is being linted
  And registry or token file patterns are configured for the rule
  When the rule validates that source
  Then only that source and its configured/imported context are analyzed
  And contextual files use the shared bounded reader
  And a reader safety failure is reported as a stable Stylelint configuration warning
```

In scope: the current Stylelint rule options, one linted PostCSS root, configured registry/token context inside that source's project directory, and local imports. Repository-wide audit, generation, application, project-wide scanning, contextual inputs outside the source project root, and CSS semantic changes are out of scope. Missing/unsupported imports preserve current diagnostic behavior; unsafe or out-of-root files fail closed. Authority: product package-boundary and filesystem-safety decisions. Classification: gating.

## AC-SL-PC-002 — Existing rule configuration remains authoritative

| Boundary          | Contract                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------ |
| Preconditions     | The Stylelint rule receives its current `registryFiles`, `tokenFiles`, and `checkUnknownCustomProperties` options. |
| Observable result | Existing option validation and warnings remain unchanged while file access is delegated to project-context.        |
| Out of scope      | Automatic repository config discovery and CLI precedence.                                                          |
| Uncertainty       | Inputs without file paths do not receive invented local import resolution.                                         |
| Authority         | Product compatibility decision; no CSS semantics are changed.                                                      |
| Classification    | Gating.                                                                                                            |

Configured `registryFiles` and `tokenFiles` are resolved from the stable Stylelint invocation
working directory, matching the existing rule contract and README examples. The linted file's
directory is not a configuration root: files in different source subdirectories that use the same
options share one canonical bounded project context and cache key. Each linted source and every
resolved local import must still remain inside that invocation root.

## AC-SL-PC-003 — Publishable private integration

| Boundary          | Contract                                                                                              |
| ----------------- | ----------------------------------------------------------------------------------------------------- |
| In scope          | Bundle project-context into the Stylelint runtime artifact while keeping core and Stylelint external. |
| Out of scope      | Publishing or re-exporting project-context.                                                           |
| Observable result | The packed plugin has no runtime dependency/import for the private package.                           |
| Uncertainty       | Any residual private-package reference fails the package-boundary gate.                               |
| Authority         | Published-consumer product invariant.                                                                 |
| Classification    | Gating.                                                                                               |

## AC-SL-PC-004 — Bounded per-run contextual reuse

```gherkin
Scenario: Concurrent Stylelint roots share unchanged contextual inputs
  Given two Stylelint-owned CSS roots in different source subdirectories have the same invocation working directory and rule options
  And registry or token file patterns are configured
  When Stylelint validates both roots concurrently
  Then the configured contextual globs are loaded once for that cache key
  And each validation still supplies only its own CSS root to core
  And no audit, registration plan, or apply operation runs

Scenario: A contextual cache is invalidated before a later lint request
  Given a cached contextual file has changed
  When the cache is explicitly invalidated or its short lifetime has elapsed
  Then the next lint request reads the changed file through a new bounded reader
  And the later diagnostic reflects the changed contextual content
```

In scope: coalescing identical concurrent contextual loads within a canonical
Stylelint project root, a finite cache lifetime, and explicit invalidation for
embedding hosts. Out of scope: repository-wide discovery, persistent file
watching, cross-root sharing, and cache entries that outlive a lint process.
Preconditions: source files have paths and configured contextual patterns stay
within the Stylelint-owned root. Cache or reader failures remain stable
configuration warnings. Authority: product package-boundary and filesystem
safety decisions. Classification: gating.

## Traceability

| Criterion    | Tests                               | Implementation                                                | Authority                                   |
| ------------ | ----------------------------------- | ------------------------------------------------------------- | ------------------------------------------- |
| AC-SL-PC-001 | `test/valid-property-types.test.ts` | `src/project-context.ts`, `src/rules/valid-property-types.ts` | This document; repository `AGENTS.md`       |
| AC-SL-PC-002 | `test/valid-property-types.test.ts` | `src/rules/valid-property-types.ts`                           | This document                               |
| AC-SL-PC-003 | package-boundary build inspection   | `vite.config.ts`, `package.json`                              | This document; published-consumer invariant |
| AC-SL-PC-004 | `test/valid-property-types.test.ts` | `src/project-context.ts`, `src/rules/valid-property-types.ts` | This document; repository `AGENTS.md`       |
