# Phase 2 acceptance boundaries: audit graph, conflicts, and coverage

This slice inventories caller-supplied CSS and graph evidence. It does not simulate a document,
DOM, active conditional imports, or the browser cascade.

## AC-AUDIT-001 — deterministic inventory and relationships

```gherkin
Scenario: A caller supplies CSS inputs and resolved import edges
  Given each input has a stable path
  And the caller identifies entry points and resolved import occurrences
  When analyzeInputs is called twice with equivalent inputs in different orders
  Then registrations, assignments, aliases, references, fallbacks, consumers, and imports are identical
  And every occurrence includes its exact source location and reachable entry-point identities
```

| Boundary          | Contract                                                                                                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| In scope          | Source-authored occurrences, exact `var()` aliases, fallback branches, consumer declarations, caller-supplied resolved import occurrences, and graph reachability.                                                  |
| Out of scope      | Runtime custom property values, selector matching, conditional-import activation, Shadow DOM, JavaScript registrations, and browser-effective cascade results.                                                      |
| Preconditions     | CSS contents, stable paths, entry-point paths, and resolved edge identities are caller-owned.                                                                                                                       |
| Observable result | Arrays and IDs are stable under reordered equivalent input and edge arrays. Locations retain UTF-16 offsets plus line/column from the parser.                                                                       |
| Uncertainty       | Unparseable values and incomplete graph evidence produce skips; they are not silently represented as complete empty inventories.                                                                                    |
| Provenance        | `var()` references and fallbacks: CSS Custom Properties Level 1 §3. Registration occurrences: CSS Properties and Values API Level 1 §§2.1 and 3. Graph reachability and exact-alias classification are tool policy. |
| Classification    | Advisory inventory.                                                                                                                                                                                                 |

## AC-AUDIT-002 — duplicate classification and conservatively scoped selection

```gherkin
Scenario: Registrations repeat with and without descriptor differences
  Given multiple valid @property rules register the same custom property
  When their descriptors are equal
  Then the audit classifies the set as an identical duplicate
  When any descriptor differs
  Then the audit classifies the set as conflicting
  And it reports ordering certainty separately from the classification
  And it selects the last stylesheet registration only for one complete supplied entry-point order
  And it never claims a browser-effective winner when entry-point, import-condition, or order evidence is incomplete
```

| Boundary          | Contract                                                                                                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| In scope          | Equality of normalized `syntax`, `inherits`, and `initial-value` descriptors, involved locations, shared entry points, and conservative ordering certainty.                                            |
| Out of scope      | Whether a stylesheet is loaded into a particular document, CSSOM registrations, runtime conditions, or a global winner across independent entry points.                                                |
| Preconditions     | At least two valid source-authored registration occurrences share a name.                                                                                                                              |
| Observable result | `identical` and `conflicting` are stable advisory classifications; `source-order-certain` and a scoped stylesheet selection are emitted only for one fully evidenced, unconditional entry-point graph. |
| Uncertainty       | Missing roots, independent roots, cycles, unresolved edges, or conditional edges yield `repository-order-uncertain` plus a structured skip.                                                            |
| Provenance        | CSS Properties and Values API Level 1 §2.1 defines document-order selection. CSS Cascade Level 5 §2.1 defines import placement. The conservative certainty threshold is tool policy.                   |
| Classification    | Advisory/review-required; the selected ID is not evidence that runtime `CSS.registerProperty()` is absent and is not a new gating diagnostic.                                                          |

## AC-AUDIT-003 — explicit coverage denominators and conservative skips

| Boundary          | Contract                                                                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| In scope          | Denominators and analyzed/skipped counts for registration rules, custom-property assignments, references, fallbacks, and consumer declarations.                           |
| Out of scope      | A claim that repository coverage equals runtime/document coverage.                                                                                                        |
| Preconditions     | Caller-supplied inputs; graph configuration is optional.                                                                                                                  |
| Observable result | Each category exposes `total`, `analyzed`, and `skipped`, satisfying `total = analyzed + skipped`. Missing graph configuration produces a stable repository-context skip. |
| Uncertainty       | Parse failure or unsupported value structure increments `skipped`; it never disappears from the denominator.                                                              |
| Provenance        | Counts and category definitions are tool policy. Semantic occurrences retain their official references.                                                                   |
| Classification    | Advisory; coverage regression policy belongs to a later CI slice.                                                                                                         |

## Traceability

| Criterion/scenario | Fixtures/tests             | Implementation                                              | Documentation/specification                                         |
| ------------------ | -------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------- |
| AC-AUDIT-001       | `test/audit-graph.test.ts` | `src/audit-graph.ts`, `src/analysis.ts`, `src/contracts.ts` | This document; pinned provenance catalog                            |
| AC-AUDIT-002       | `test/audit-graph.test.ts` | `src/audit-graph.ts`, `src/specification.ts`                | This document; CSS Properties and Values API §2.1; CSS Cascade §2.1 |
| AC-AUDIT-003       | `test/audit-graph.test.ts` | `src/audit-graph.ts`, `src/contracts.ts`                    | This document; tool-policy catalog                                  |
