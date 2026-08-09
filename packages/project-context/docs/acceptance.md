# Project-context acceptance boundaries

These criteria define the externally observable outcomes for this package before RED tests or implementation. This package does not interpret CSS semantics, model the cascade, resolve Node packages, or decide which imported stylesheet is effective.

## AC-PC-001 — Bounded reads

| Boundary          | Contract                                                                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| In scope          | Read a UTF-8 regular file inside the configured canonical root after checking its metadata.                                               |
| Out of scope      | Streaming oversized files, non-UTF-8 decoding recovery, or following a symlink outside the root.                                          |
| Preconditions     | An existing project root and positive per-file, file-count, and aggregate limits.                                                         |
| Observable result | Valid content and a canonical path are returned; oversized, non-regular, escaping, or invalid UTF-8 inputs fail with a stable error code. |
| Uncertainty       | Files changed during the read are rejected if their post-read bytes exceed either the pre-read size or configured budgets.                |
| Authority         | Product safety invariant and repository `AGENTS.md`; not an `@property` semantic rule.                                                    |
| Classification    | Gating.                                                                                                                                   |

## AC-PC-002 — Shared run budget

| Boundary          | Contract                                                                                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| In scope          | Count unique canonical files and their bytes across direct inputs and resolved imports in one reader.                                                    |
| Out of scope      | Cross-process/global accounting.                                                                                                                         |
| Preconditions     | One `ProjectReader` is used for one project run.                                                                                                         |
| Observable result | Exceeding file-count or aggregate-byte limits fails before the violating file is read. Re-reading a cached canonical file consumes no additional budget. |
| Uncertainty       | A file whose metadata changes invalidates its cached assumptions only in a new reader/run.                                                               |
| Authority         | Product resource-safety decision.                                                                                                                        |
| Classification    | Gating.                                                                                                                                                  |

## AC-PC-003 — Deterministic glob loading

```gherkin
Scenario: Overlapping CSS patterns load deterministically
  Given multiple patterns match the same CSS file and a non-CSS file
  When project inputs are loaded
  Then each canonical CSS file is returned exactly once
  And inputs are sorted by canonical path
  And direct and imported reads use the same run budget
```

Out of scope: CSS entry-point/cascade ordering and package-manager glob conventions. Empty matches return an empty list. Authority: product determinism decision. Classification: gating.

## AC-PC-004 — Conservative local import resolution

```gherkin
Scenario: A local stylesheet import is resolved safely
  Given an importing CSS file inside the project root
  When a relative or enabled root-relative `.css` specifier is resolved
  Then the canonical in-root stylesheet and UTF-8 content are returned through the shared bounded reader
```

Remote URLs, protocol-relative URLs, fragments, bare package specifiers, non-CSS paths, and disabled root-relative paths return an explicit unsupported result. Missing local files return `not-found`. Root escapes and unsafe file types remain gating errors. Import conditions and CSS semantics are out of scope. Authority: product safety/resolution policy. Classification: gating for unsafe paths, reviewable for unsupported imports.

## AC-PC-005 — JSON config discovery and validation

```gherkin
Scenario: The nearest bounded JSON configuration is loaded
  Given nested project directories and an explicit search boundary
  And more than one directory contains the configured filename
  When configuration discovery starts in the nested directory
  Then the nearest configuration is selected
  And its JSON is validated before it is returned
```

Executable configuration, implicit repository discovery, schema migrations, and CLI precedence are out of scope. Missing configuration returns `null`. Malformed JSON, unknown keys, invalid values, oversized files, and boundary escapes fail with stable codes. Authority: product configuration and safety decision. Classification: gating.

## AC-PC-PERF-001 — Ubuntu/Node 22 project-load performance gate

| Boundary          | Contract                                                                                                                                                                                                                                                                                           |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| In scope          | A separately invoked performance gate creates 1,000 in-root, regular UTF-8 CSS files totaling exactly 10 MiB and loads them twice through `ProjectReader`.                                                                                                                                         |
| Out of scope      | CSS parsing, import-graph traversal, performance of the caller's filesystem, and a timing assertion in normal unit tests.                                                                                                                                                                          |
| Preconditions     | The gate runs on Linux with Node 22, a writable system temporary directory, and the package's default project limits.                                                                                                                                                                              |
| Observable result | It emits JSON containing Node/platform/architecture, file/byte totals, elapsed milliseconds, RSS, and deterministic-order result; it exits non-zero when the input is not loaded within 10,000 ms, peak RSS exceeds 512 MiB, output is nondeterministic, or the required CI environment is absent. |
| Uncertainty       | Environmental failure is explicit rather than silently passing on a different runtime. The synthetic directory is removed in `finally`, including gate failure.                                                                                                                                    |
| Authority         | Product performance and resource-safety decision for `ubuntu-latest`/Node 22; not an `@property` semantic rule.                                                                                                                                                                                    |
| Classification    | Gating in the dedicated performance CI job; advisory unless explicitly run locally.                                                                                                                                                                                                                |

## Traceability

| Criterion/scenario | Fixtures/tests            | Implementation                           | Documentation/authority                |
| ------------------ | ------------------------- | ---------------------------------------- | -------------------------------------- |
| AC-PC-001          | `bounded-read.test.ts`    | `bounded-reader.ts`                      | This document; repository `AGENTS.md`  |
| AC-PC-002          | `bounded-read.test.ts`    | `bounded-reader.ts`, `project-reader.ts` | This document                          |
| AC-PC-003          | `project-reader.test.ts`  | `project-reader.ts`                      | This document                          |
| AC-PC-004          | `project-reader.test.ts`  | `imports.ts`, `project-reader.ts`        | This document                          |
| AC-PC-005          | `config.test.ts`          | `config.ts`                              | This document                          |
| AC-PC-PERF-001     | `scripts/performance.mjs` | `project-reader.ts`, `bounded-reader.ts` | This document; root CI performance job |
