# Diagnostic contract acceptance boundaries

These criteria define the Phase 1 machine-readable diagnostic contract before its RED tests and
implementation. They do not change CSS validation semantics.

## Scope and provenance

- Normative baseline: [CSS Properties and Values API Level 1, 26 March 2024](https://www.w3.org/TR/2024/WD-css-properties-values-api-1-20240326/).
- Supporting specifications are accepted only through exact W3C snapshot anchors recorded by the
  provenance catalog.
- Product policy: permanent diagnostic identifiers, confidence, default gating, evidence, edits,
  and fingerprints describe validator output; they are not browser conformance rules.

## Contract table

| Criterion     | In-scope outcome                                                                                                                                       | Out of scope                                                                | Preconditions                                                          | Observable result                                                                                                                                                       | Conservative uncertainty                                                | Provenance / decision                                                                         | Classification               |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------- |
| `AC-DIAG-001` | Every emitted diagnostic branch has one permanent unique `CPTV_*` ID while retaining legacy `code` and `reason`.                                       | Renaming legacy fields or adding new CSS rules.                             | A validation branch emits a diagnostic.                                | The ID matches the committed registry; the explicit diagnostic basis distinguishes direct evidence from representative inference without changing legacy reason values. | An uncatalogued branch is rejected by contract tests; no ID is guessed. | Exact references already catalogued in `specification.ts`; machine-contract product decision. | Gating contract invariant.   |
| `AC-DIAG-002` | Every emitted diagnostic exposes an explicit UTF-16 offset location with 1-based line and column metadata, related locations, and structured evidence. | DOM/cascade locations or recovery of a location the parser did not provide. | Caller supplies CSS content; parser supplies a source range or `null`. | Astral characters before a finding do not change the stated UTF-16 unit; related registration locations and evidence are deterministic.                                 | Missing parser ranges remain `null`, never synthesized.                 | CSS source location is tool policy; exact semantic references remain on the diagnostic.       | Tool contract; non-semantic. |
| `AC-DIAG-003` | Confidence and default gating follow provenance.                                                                                                       | Changing legacy severity or making advisory findings fatal.                 | Diagnostic provenance is catalogued.                                   | Only a high-confidence diagnostic classified as normative has `gating: "gating"`; all tool-policy/advisory/uncertain findings are review-only or advisory.              | Unknown confidence/provenance cannot gate.                              | Official W3C anchors plus accepted conservative gating policy.                                | Gating policy.               |
| `AC-DIAG-004` | Every diagnostic has exact provenance, suggested-edit metadata, and deterministic SHA-256 baseline identity.                                           | Inventing a correction where no safe exact edit is supported.               | The same accepted input is analyzed twice.                             | `specReferences`, provenance class/rule ID, evidence, empty-or-safe edits, and `sha256:<64 lowercase hex>` baseline fingerprint are identical.                          | Unsafe semantic edits produce an empty edit list.                       | Official W3C anchors; source-fingerprint/edit applicability product policy.                   | Machine contract.            |
| `AC-DIAG-005` | The committed JSON registry is source-equivalent to the public TypeScript diagnostic registry.                                                         | Treating plan/audit skip codes as CSS diagnostics.                          | Contract checks load both registries.                                  | Diagnostic IDs, legacy codes/reasons, provenance class, confidence, and gating agree exactly; other stable `CPTV_*` codes are explicitly categorized.                   | Drift fails the contract check.                                         | Generated-contract/current-registry product decision.                                         | Repository invariant.        |

## RED / GREEN boundaries

- RED proves one criterion at a time and fails because the public result lacks that accepted field or
  invariant.
- GREEN decorates existing diagnostics without changing when a diagnostic is emitted.
- No suggested edit is emitted in this slice because the current branches do not establish a safe,
  exact semantic correction.
- Direct authored assignment mismatches are normative/high-confidence. Assignment findings derived
  from representative `var()` substitution use a separate tool-policy basis and never gate by
  default. Fallback findings also remain tool-policy/review-required until complete registered-
  syntax fallback validation is accepted and proven in Phase 5.
- Refactoring may centralize decoration and hashing, but tests must not depend on private AST shapes
  or the hashing implementation.

## Traceability

| Criterion     | Fixtures/tests                                   | Implementation                                          | Documentation/specification                       |
| ------------- | ------------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------- |
| `AC-DIAG-001` | `test/diagnostic-contract.test.ts` registry case | `src/diagnostics.ts`, `src/types.ts`                    | This document; `src/specification.ts`             |
| `AC-DIAG-002` | UTF-16 and related-location cases                | `src/diagnostics.ts`, existing parser ranges            | This document                                     |
| `AC-DIAG-003` | normative/tool-policy gating cases               | `src/diagnostics.ts`                                    | This document; `docs/specification/provenance.md` |
| `AC-DIAG-004` | repeatability and no-unsafe-edit cases           | `src/diagnostics.ts`, `src/sha256.ts`                   | This document                                     |
| `AC-DIAG-005` | JSON/source parity case                          | `contracts/diagnostic-codes.json`, `src/diagnostics.ts` | This document                                     |

`contracts/diagnostic-v1.schema.json` defines the accepted public diagnostic object independently
of the larger analysis envelope. A complete `AnalysisResultV1` JSON Schema remains a separate
Phase 1/2 generated-contract slice because graph and coverage shapes are still being stabilized;
this diagnostic slice must not freeze those adjacent contracts implicitly.
