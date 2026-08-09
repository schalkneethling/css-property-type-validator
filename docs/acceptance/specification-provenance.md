# Specification provenance acceptance boundaries

These criteria define the first implementation slice for specification provenance. They are
approved product boundaries, not descriptions of the internal implementation.

## AC-SPEC-001 — Complete diagnostic provenance

- **In scope:** Every public `DiagnosticReason` has one stable provenance entry classified as
  `normative`, `tool-policy`, or `advisory` and linked to exact anchors in official W3C
  specifications.
- **Out of scope:** Verifying links over the network in ordinary test runs or changing existing
  diagnostic behavior and severity.
- **Preconditions:** The published specification profiles recorded by the core are the active
  semantic baseline.
- **Observable result:** Consumers can enumerate the catalog and find exactly one entry for every
  diagnostic reason.
- **Uncertainty:** Static checks that cannot prove browser-effective behavior are labelled as tool
  policy; they are not presented as normative browser conclusions.
- **Provenance:** [CSS Properties and Values API Level 1](https://www.w3.org/TR/2024/WD-css-properties-values-api-1-20240326/),
  including [The `@property` Rule](https://www.w3.org/TR/2024/WD-css-properties-values-api-1-20240326/#at-property-rule),
  plus its official normative references where a diagnostic concerns parsing, imports, or
  `var()` behavior.
- **Outcome:** Gating contract check.

## AC-SPEC-002 — Diagnostics expose their authority

- **In scope:** Diagnostics returned by `validateFiles()` and
  `generatePropertyRegistrations()` include non-empty `specReferences` matching the diagnostic
  reason's catalog entry.
- **Out of scope:** Adding new diagnostic codes, changing messages, or claiming that a static
  report reproduces the browser cascade.
- **Preconditions:** A diagnostic is emitted by the existing public API.
- **Observable result:** JSON consumers can follow exact official specification anchors without
  parsing human-readable messages.
- **Uncertainty:** References explain the normative basis; a `tool-policy` classification remains
  visible for checks whose conclusion depends on the validator's configured input boundary.
- **Provenance:** [Registered Custom Properties](https://www.w3.org/TR/2024/WD-css-properties-values-api-1-20240326/#registered-custom-properties)
  and the exact per-rule anchors in the catalog.
- **Outcome:** Public additive API contract.

## AC-SPEC-003 — Generator policies are explicit

- **In scope:** Every existing semantic generator decision is represented by a stable catalog
  entry with exact specification anchors and an honest classification.
- **Out of scope:** Replacing the experimental generator, changing its emitted CSS, or treating
  `inherits: true` and the first observed initial value as inferred author intent.
- **Preconditions:** The existing `generatePropertyRegistrations()` behavior remains available.
- **Observable result:** Consumers can distinguish specification requirements from generator
  heuristics such as supported-syntax order, exact-alias resolution, and the legacy inheritance
  default.
- **Uncertainty:** The catalog explicitly records that inheritance and initial-value intent cannot
  be established from the current static evidence.
- **Provenance:** [`syntax`](https://www.w3.org/TR/2024/WD-css-properties-values-api-1-20240326/#syntax-descriptor),
  [`inherits`](https://www.w3.org/TR/2024/WD-css-properties-values-api-1-20240326/#inherits-descriptor),
  and [`initial-value`](https://www.w3.org/TR/2024/WD-css-properties-values-api-1-20240326/#initial-value-descriptor).
- **Outcome:** Review-required product contract.

## AC-SPEC-004 — Published specification profile is pinned

- **In scope:** Export the specification title, publication date, dated W3C URL, latest-published
  URL, and Editor's Draft URL used by the catalog.
- **Out of scope:** Automatically adopting Editor's Draft changes.
- **Preconditions:** CSS Properties and Values API Level 1 Working Draft, 26 March 2024, remains
  the approved baseline.
- **Observable result:** Analysis consumers and future reports can identify the exact semantic
  profile used by this core release.
- **Uncertainty:** Drift is reviewed separately and never changes runtime semantics implicitly.
- **Provenance:** [W3C publication snapshot](https://www.w3.org/TR/2024/WD-css-properties-values-api-1-20240326/).
- **Outcome:** Gating contract check.

## Contract table

| Contract            | Required observable behavior                                                       |
| ------------------- | ---------------------------------------------------------------------------------- |
| Diagnostic coverage | Catalog diagnostic subjects equal the `DiagnosticReason` set, with no duplicates   |
| Generator coverage  | All documented current generator policy IDs occur exactly once                     |
| Reference authority | Every reference is an HTTPS URL on `www.w3.org` with a section fragment            |
| Classification      | Each entry is exactly `normative`, `tool-policy`, or `advisory`                    |
| Result enrichment   | Every emitted diagnostic has the same references as its reason's catalog entry     |
| Compatibility       | Existing diagnostic code, reason, message, severity, and ordering remain unchanged |

## Overreach review

Tests for this slice must not encode private AST shapes, catalog storage layout, browser behavior,
or new generator behavior. In particular, they must not turn unresolved imports/references into
normative CSS violations or present the legacy `inherits: true` output as inferred intent.

## Traceability

| Criterion   | Fixtures/tests                                                               | Implementation                       | Documentation/specification               |
| ----------- | ---------------------------------------------------------------------------- | ------------------------------------ | ----------------------------------------- |
| AC-SPEC-001 | `packages/core/test/specification.test.ts` catalog coverage                  | `packages/core/src/specification.ts` | This document; per-entry official anchors |
| AC-SPEC-002 | `packages/core/test/specification.test.ts` result enrichment                 | Core diagnostic enrichment helpers   | This document; catalog references         |
| AC-SPEC-003 | `packages/core/test/specification.test.ts` generator coverage/classification | Generator policy catalog             | `docs/specification/provenance.md`        |
| AC-SPEC-004 | `packages/core/test/specification.test.ts` pinned profile                    | Exported specification profile       | W3C snapshot dated 26 March 2024          |
