# Parser evaluation acceptance criteria

## AC-PARSER-001 — Parser portability and recovery are measured reproducibly

- **In scope:** Run `css-tree`, PostCSS, and Lightning CSS over the same bounded, versioned corpus; record parse success/failure, elapsed time, and exact installed versions.
- **Out of scope:** Treating benchmark speed or a library result as CSS specification authority.
- **Preconditions:** Dependencies are installed from the lockfile and the corpus is unchanged.
- **Observable result:** `parser:benchmark` emits deterministic capability metadata and separately labelled timing observations.
- **Uncertainty:** Unsupported recovery or missing location/matcher APIs are reported as capability gaps, not inferred away.
- **Provenance:** Parser product decision; CSS semantics remain governed by the exact official W3C sections in the provenance catalog.
- **Outcome:** Review-required architecture evidence.

## AC-PARSER-002 — Core retains the matcher needed by the public contract

- **In scope:** A parser replacement must provide browser-safe stylesheet/value parsing, locations, CSS Value Definition Syntax parsing, arbitrary syntax matching, and consuming-property grammar matching without dual semantic parsing.
- **Out of scope:** Choosing a dependency by popularity or throughput alone.
- **Preconditions:** Existing core conformance tests pass for the candidate.
- **Observable result:** The ADR records a capability and maintenance comparison and retains `css-tree` behind an internal facade until a candidate meets every requirement.
- **Uncertainty:** Missing public APIs fail the replacement decision closed.
- **Provenance:** Product architecture decision; parser behavior is supporting evidence only.
- **Outcome:** Review-required.

## AC-PARSER-003 — Core isolates parser dependency access behind a typed facade

- **In scope:** Exactly one internal core module imports `css-tree`; registry collection, validation, generation, variable substitution, and audit-graph analysis consume only the typed operations exposed by that facade.
- **Out of scope:** Changing CSS semantics, error recovery, source locations, public exports, or replacing `css-tree` in this slice.
- **Preconditions:** The current parser-dependent core consumers and conformance fixtures are present.
- **Observable result:** A static contract test rejects every direct `css-tree` import outside the facade, while the existing core suite preserves public behavior, parse recovery, and locations.
- **Uncertainty:** Capabilities that cannot be expressed without leaking parser-private AST storage assumptions are not added to the facade and require a later reviewed criterion.
- **Provenance:** Product architecture decision. Parser and library behavior are supporting evidence only and never normative CSS authority.
- **Outcome:** Gating architecture invariant.

## Contract table

| Capability                                | css-tree      | PostCSS              | Lightning CSS                             | Replacement gate |
| ----------------------------------------- | ------------- | -------------------- | ----------------------------------------- | ---------------- |
| Browser-safe JS core                      | required      | available            | native/WASM delivery review               | required         |
| Stylesheet/value locations                | required      | stylesheet locations | parser diagnostics                        | required         |
| Arbitrary registration syntax matching    | available     | needs another engine | no equivalent public contract established | required         |
| Consuming-property grammar matching       | available     | needs another engine | no equivalent public contract established | required         |
| Tolerant recovery surfaced as uncertainty | corpus-tested | corpus-tested        | corpus-tested                             | required         |

## Facade contract

| Invariant          | Accepted outcome                                                                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dependency imports | Only `src/parser.ts` imports `css-tree`                                                                                                              |
| Consumers          | Registry, validation, generation, var substitution, and audit graph import typed facade operations                                                   |
| Surface area       | The facade exposes only parsing, generation, traversal, syntax matching, property matching, and definition-syntax parsing currently required by core |
| Encapsulation      | Facade signatures accept caller-owned structural types or `unknown`; they do not expose `css-tree` AST classes or list storage                       |
| Semantics          | Existing diagnostics, recovery behavior, locations, and generated output remain unchanged                                                            |

## Traceability

| Criterion/scenario | Fixtures/tests                                                    | Implementation                                                 | Documentation/specification                       |
| ------------------ | ----------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------- |
| AC-PARSER-001      | `fixtures/parser-corpus/*.css`; benchmark smoke run               | `scripts/benchmark-parsers.mjs`                                | This document                                     |
| AC-PARSER-002      | Existing core conformance suite                                   | Parser facade and current core matcher                         | `docs/adr/0001-retain-css-tree.md`                |
| AC-PARSER-003      | `packages/core/test/parser-boundary.test.ts`; existing core suite | `packages/core/src/parser.ts`; parser-dependent core consumers | This document; `docs/adr/0001-retain-css-tree.md` |
