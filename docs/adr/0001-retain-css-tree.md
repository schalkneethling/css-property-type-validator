# ADR 0001: Retain and Isolate css-tree

- Status: Accepted for the adoption-platform implementation
- Date: 2026-08-08
- Review: 2027-02-08, or when css-tree's Webref migration lands

## Context

The validator relies on detailed value ASTs, CSS Value Definition Syntax parsing, arbitrary syntax matching, property grammar matching, exact locations, and browser-compatible ESM. Parser choice is an implementation decision; official CSS specifications remain the semantic authority.

## Decision

Retain `css-tree` for v1 and isolate parser/grammar operations behind an internal facade. Capture tolerant parse recovery and `Raw` nodes explicitly. Prevent new direct imports outside the facade once the migration is complete.

PostCSS remains at the Stylelint boundary. It has a larger ecosystem and strong formatting/source-map behavior, but declaration values remain strings and it cannot replace the required grammar matcher without a second value engine.

Lightning CSS is a benchmark/comparison oracle. It is fast and actively maintained, but does not expose an equivalent arbitrary registration-syntax matching contract and complicates the browser surface through native/WASM delivery.

## Dependency health

The decision is conditional, not permanent:

- `css-tree` has a smaller maintainer base than PostCSS.
- Its grammar data currently depends on deprecated `mdn-data`.
- The [Webref migration](https://github.com/csstree/csstree/pull/355) remains pending.
- The [maintenance-status discussion](https://github.com/csstree/csstree/issues/279) records syntax-data false positives and negatives.

Mitigations are a conformance corpus, pinned dependency updates, explicit grammar drift checks, current TypeScript types, and the scheduled review above.

### Evidence captured 2026-08-08

Registry and repository metadata is a maintenance signal, not semantic authority. It is recorded so the dependency decision can be reproduced and revisited.

| Option                                                           | npm release / last modification |  npm maintainers | GitHub activity                    | Community signal          | Relevant capability and cost                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------- | ------------------------------- | ---------------: | ---------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`css-tree`](https://github.com/csstree/csstree)                 | 3.2.1 / 2026-03-05              |                2 | pushed 2026-03-05; 70 open issues  | 2,113 stars; 127 forks    | Already supplies value ASTs, CSS Value Definition Syntax parsing and matching, property grammar matching, locations, and browser-compatible JavaScript. Smaller contributor/maintainer base and syntax-data risk require isolation and drift tests.                                       |
| [`postcss`](https://github.com/postcss/postcss)                  | 8.5.26 / 2026-08-06             | 1 npm maintainer | pushed 2026-08-06; 20 open issues  | 28,981 stars; 1,625 forks | Strongest stylesheet transformation ecosystem and the natural Stylelint boundary. Declaration values remain strings, so matching arbitrary registered syntaxes requires another value parser/matcher; adopting it in core would add a second semantic engine rather than replace one.     |
| [`lightningcss`](https://github.com/parcel-bundler/lightningcss) | 1.33.0 / 2026-07-20             | 1 npm maintainer | pushed 2026-07-20; 387 open issues | 7,648 stars; 291 forks    | Actively maintained high-performance parser/transformer. Native/WASM distribution increases browser and package complexity, and its public API does not expose the arbitrary syntax-matching contract the validator needs. It remains a performance and parse-recovery comparison oracle. |

The metrics above came from the npm registry and GitHub repository APIs on the capture date. They must be refreshed at the scheduled review; popularity alone cannot decide correctness.

## Acceptance boundary

| Criterion     | Outcome                                                                                  | Out of scope                                                | Evidence            |
| ------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------- |
| AC-PARSER-001 | Existing registration, assignment, fallback, and consumption behavior remains compatible | Changing CSS semantics                                      | Core contract tests |
| AC-PARSER-002 | Parser recovery is surfaced as evidence or uncertainty                                   | Treating tolerant recovery as a definitive semantic failure | Recovery fixtures   |
| AC-PARSER-003 | Core remains browser-buildable                                                           | Node-only parser adapters                                   | Web build           |
| AC-PARSER-004 | A replacement requires grammar/location parity without dual parsing                      | Migrating for ecosystem size alone                          | Comparative corpus  |

## Consequences

The project avoids a high-risk rewrite while making future replacement tractable. Any mismatch between css-tree and the official specification is patched, skipped, or reported explicitly; the library never becomes normative authority.
