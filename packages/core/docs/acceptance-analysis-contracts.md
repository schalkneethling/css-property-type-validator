# Phase 1 acceptance boundaries: versioned analysis and registration plans

This slice adds browser-safe, deterministic contracts. The Phase 2 audit graph extends the
inventory while preserving this contract's conservative repository-context boundary.

## AC-CONTRACT-001 — deterministic versioned analysis

| Boundary          | Contract                                                                                                                                                                                                                                                              |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| In scope          | `analyzeInputs()` returns schema, tool, and pinned specification versions; sorted input identities; the existing validated registration and diagnostic results; conservative registration candidates; and explicit skips for inventory not implemented in this slice. |
| Out of scope      | Repository discovery, filesystem access, load-root/cascade conclusions, duplicate-registration selection, complete assignment/alias/reference/fallback/consumer/import inventories, and source edits.                                                                 |
| Preconditions     | Callers provide CSS content and stable input identities. Import resolution, when requested, is caller-owned.                                                                                                                                                          |
| Observable result | Reordering equivalent inputs produces the same result, including array order. Existing `validateFiles()` behavior remains available.                                                                                                                                  |
| Uncertainty       | Inventories are source-complete for parseable supplied inputs. Missing entry-point/import context is represented by `CPTV_SKIP_REPOSITORY_CONTEXT_UNAVAILABLE`, never a browser-effective claim.                                                                      |
| Provenance        | Semantic diagnostics and candidate evidence retain references from the pinned official specification catalog. Contract shape and sorting are tool policy.                                                                                                             |
| Classification    | Advisory analysis; only existing high-confidence validator errors retain their current severity.                                                                                                                                                                      |

## AC-CONTRACT-002 — explicit semantic decisions before planning

```gherkin
Scenario: A candidate has evidence but no human semantic decision
  Given analysis suggests a syntax and an observed initial value for a custom property
  And no accepted decision supplies syntax, inherits, and the required initial value
  When planPropertyRegistrations is called
  Then no registration CSS is emitted for that property
  And the plan contains a review-required skip with the candidate evidence
```

```gherkin
Scenario: A caller accepts every registration descriptor
  Given analysis contains a registration candidate
  And an accepted decision explicitly supplies syntax, inherits, and initial-value
  When planPropertyRegistrations is called
  Then the proposed registration is validated by the existing normative registry checks
  And valid registrations are emitted in deterministic property-name order
  And invalid decisions remain review-required without emitted CSS
```

| Boundary          | Contract                                                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| In scope          | Explicit per-property decisions, normative self-validation, deterministic proposed CSS, provenance, and review-required skips.                               |
| Out of scope      | Choosing `inherits`, choosing an `initial-value`, modifying source files, selecting insertion points, or accepting inferred evidence on the caller's behalf. |
| Preconditions     | A decision targets a candidate from `AnalysisResultV1`.                                                                                                      |
| Observable result | Missing, rejected, unknown, invalid, or already-registered decisions never emit registration CSS.                                                            |
| Uncertainty       | Evidence may suggest descriptor values, but it is never promoted to an accepted semantic decision.                                                           |
| Provenance        | CSS Properties and Values API Level 1 §§3.1–3.3 through the existing pinned catalog.                                                                         |
| Classification    | Review-required until a complete explicit decision validates.                                                                                                |

## Traceability

| Criterion/scenario | Fixtures/tests          | Implementation                        | Documentation/specification                                    |
| ------------------ | ----------------------- | ------------------------------------- | -------------------------------------------------------------- |
| AC-CONTRACT-001    | `test/analysis.test.ts` | `src/analysis.ts`, `src/contracts.ts` | This document; pinned catalog in `src/specification.ts`        |
| AC-CONTRACT-002    | `test/analysis.test.ts` | `src/analysis.ts`, `src/contracts.ts` | This document; CSS Properties and Values API Level 1 §§3.1–3.3 |
