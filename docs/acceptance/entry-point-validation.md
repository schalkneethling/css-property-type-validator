# Entry-point validation isolation

## AC-CONTEXT-001 — Independent entry points do not share inferred registrations

- **In scope:** `analyzeInputs()` validates an assignment, registered `var()` fallback, or
  consuming-property usage only against registrations in the same completely evidenced entry-point
  graph. Inputs that have no supplied entry point, or belong to an uncertain graph, retain only
  same-file and explicitly configured registry evidence.
- **Out of scope:** Runtime stylesheet selection, DOM attachment, cascade layers, conditional
  imports, JavaScript `CSS.registerProperty()` calls, and a browser-effective order across separate
  entry points.
- **Preconditions:** Callers supply entry-point identities and resolved unconditional import edges
  when they want cross-file analysis. A complete graph contains every referenced local input and no
  conditional, unresolved, external, or cyclic ordering evidence.
- **Observable result:** Two independent roots may register the same name differently without one
  root's registration causing an assignment, fallback, or usage diagnostic in the other. A single
  complete root with a resolved import graph still validates against the registration selected by
  that graph's proven stylesheet order.
- **Conservative uncertainty:** Missing entry points or an uncertain graph never creates a gating
  cross-file assignment/fallback/usage finding. Proven same-file behavior and explicitly configured
  registry inputs remain available. `validateFiles()` retains its compatibility behavior because it
  does not claim repository entry-point semantics.
- **Specification provenance:** CSS Properties and Values API Level 1 §2.1 says that when multiple
  valid `@property` rules register the same name, the registration is determined by the last one in
  document order: <https://www.w3.org/TR/2024/WD-css-properties-values-api-1-20240326/#at-property-rule>.
  The specification does not define a document order for unrelated project entry points.
- **Product decision:** Entry-point isolation is a conservative tool policy. Static project input
  order is not presented as browser document order without a complete supplied graph.
- **Classification:** Gating only when graph evidence proves the relevant registration; otherwise
  uncertainty is review-only.

### SC-CONTEXT-001A — Independent roots remain isolated

```gherkin
Given two independent CSS entry points register the same custom property with different syntaxes
And an assignment in each entry point matches its own registration
When analyzeInputs validates the repository
Then neither entry point receives a diagnostic based on the other entry point's registration
```

### SC-CONTEXT-001B — A connected root retains proven validation

```gherkin
Given one complete entry point imports registration and assignment stylesheets in a supplied order
And the assignment violates the effective registration in that graph
When analyzeInputs validates the repository
Then it emits the corresponding gating assignment diagnostic with exact registration evidence
```

### SC-CONTEXT-001C — Uncertain reachability does not become a gate

```gherkin
Given a cross-file registration could affect an assignment only through an unresolved or conditional edge
When analyzeInputs validates the repository
Then it emits no gating assignment, fallback, or usage diagnostic from that uncertain relationship
And the audit graph records repository-context or ordering uncertainty
```

## Traceability

| Criterion/scenario                   | Fixtures/tests                                                                                                    | Implementation                                                                        | Documentation/specification                                                           |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| AC-CONTEXT-001 (SC-CONTEXT-001A/B/C) | `packages/core/test/entry-point-validation.test.ts` independent-root, complete-import, and conditional-edge cases | `packages/core/src/analysis.ts` context-scoped validation and complete graph ordering | This document; CSS Properties and Values API Level 1 §2.1; project entry-point policy |
