# Phase 5 acceptance boundaries: deeper validation

The normative profile for these slices is the 26 March 2024 W3C Working Draft of
CSS Properties and Values API Level 1. Static compatibility and repository-order
inference remain tool policy unless the cited text itself establishes the result.

## AC-DEEP-001 — aliased registered assignments

| Boundary          | Contract                                                                                                                                                                                                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| In scope          | A registered custom-property assignment whose value is an exact `var()` reference to another registered, non-universal custom property.                                                                                                                                    |
| Out of scope      | DOM cascade state, computed relative units, non-exact aliases, unregistered targets, universal syntax, and runtime `CSS.registerProperty()` calls.                                                                                                                         |
| Preconditions     | Both registrations are valid and visible in the supplied core inputs.                                                                                                                                                                                                      |
| Observable result | Compatible syntax evidence passes; incompatible representative substitution emits `CPTV_ASSIGN_002`, medium confidence, review-required.                                                                                                                                   |
| Uncertainty       | Missing/universal/non-exact evidence is skipped and never gates.                                                                                                                                                                                                           |
| Provenance        | CSS Properties and Values API Level 1 [§2.4](https://www.w3.org/TR/2024/WD-css-properties-values-api-1-20240326/#computed-value) and [§2.7](https://www.w3.org/TR/2024/WD-css-properties-values-api-1-20240326/#substitution). Static syntax compatibility is tool policy. |

## AC-DEEP-002 — registered-property fallbacks at assignment sites

```gherkin
Scenario: A concrete assignment-site fallback violates the referenced registration
  Given a valid non-universal registration for the referenced custom property
  And a registered custom-property assignment contains var() with a concrete fallback
  When the fallback does not match the referenced registration syntax
  Then a direct normative fallback diagnostic is emitted
  And it gates with high confidence
```

| Boundary          | Contract                                                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| In scope          | Concrete fallbacks on `var()` references to valid, non-universal registered custom properties, including registered assignment sites.                  |
| Out of scope      | Proving which cascade branch will be used or interpreting universal syntax as a type.                                                                  |
| Preconditions     | The referenced registration and fallback token stream parse successfully.                                                                              |
| Observable result | Matching fallback passes; mismatching fallback emits `CPTV_USAGE_002` against the referenced registration, regardless of whether the fallback is used. |
| Uncertainty       | Unregistered, universal, or unparseable evidence is skipped/review-only.                                                                               |
| Provenance        | CSS Properties and Values API Level 1 [§2.7.1](https://www.w3.org/TR/2024/WD-css-properties-values-api-1-20240326/#fallbacks-in-var-references).       |

## AC-DEEP-003 — nested fallback proof boundary

| Boundary          | Contract                                                                                                                                                                                                                                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| In scope          | A nested fallback that is exactly one registered `var()` reference with the same non-universal syntax as the outer referenced registration; independently checkable concrete leaf fallbacks.                                                                                                             |
| Out of scope      | Mixed tokens, differing or universal syntaxes, dependency cycles, unregistered references, DOM/cascade reachability, and semantic subtype inference.                                                                                                                                                     |
| Preconditions     | Every exact-alias step is registered, acyclic, and has an identical syntax string.                                                                                                                                                                                                                       |
| Observable result | Exact same-syntax chains are accepted; an incompatible concrete leaf emits the normative fallback diagnostic.                                                                                                                                                                                            |
| Uncertainty       | Any unproved nested substitution adds `CPTV_SKIP_NESTED_FALLBACK_UNPROVEN`; no outer compatibility diagnostic is guessed.                                                                                                                                                                                |
| Provenance        | CSS Properties and Values API Level 1 [§2.7.1](https://www.w3.org/TR/2024/WD-css-properties-values-api-1-20240326/#fallbacks-in-var-references) and CSS Variables Level 1 [§3](https://www.w3.org/TR/2022/CR-css-variables-1-20220616/#using-variables). The exact-syntax proof boundary is tool policy. |

## AC-DEEP-004 — consuming-property compatibility

| Boundary          | Contract                                                                                                                                                                                                                                                                          |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| In scope          | Ordinary declarations whose outermost `var()` references all resolve to registered, non-universal syntaxes for which representative values exist.                                                                                                                                 |
| Out of scope      | A full computed-style engine, selector matching, relative-unit resolution, arbitrary unregistered values, and exhaustive grammar-subtype proofs.                                                                                                                                  |
| Preconditions     | The declaration, registrations, and generated representative values parse.                                                                                                                                                                                                        |
| Observable result | Compatible representative combinations pass; incompatible combinations emit `CPTV_USAGE_001` with exact source/registration evidence.                                                                                                                                             |
| Uncertainty       | Incomplete evidence skips; all representative findings remain medium confidence, review-required, and non-gating.                                                                                                                                                                 |
| Provenance        | CSS Properties and Values API Level 1 [§2.7](https://www.w3.org/TR/2024/WD-css-properties-values-api-1-20240326/#substitution) plus CSS Variables Level 1 [§3.1](https://www.w3.org/TR/2022/CR-css-variables-1-20220616/#invalid-variables). Static compatibility is tool policy. |

## AC-DEEP-005 — stylesheet registration selection

```gherkin
Scenario: One complete entry point proves the last stylesheet registration
  Given one supplied entry point with a complete unconditional import graph
  And multiple valid @property rules for the same name
  When their stylesheet document order is deterministically reconstructed
  Then the conflict records the last rule as the effective stylesheet registration

Scenario: Repository evidence cannot prove one order
  Given independent, conditional, cyclic, missing, external, or unresolved stylesheet evidence
  When repeated registrations are audited
  Then no effective registration is selected
  And an ordering uncertainty skip is emitted
```

The selected identifier is scoped to the supplied stylesheet graph. It is not a
claim that no script calls `CSS.registerProperty()`, which the specification says
would outrank stylesheet rules.

Provenance: CSS Properties and Values API Level 1 [§2.1](https://www.w3.org/TR/2024/WD-css-properties-values-api-1-20240326/#determining-the-registration).

## AC-DEEP-006 — typed custom-property animation opportunities

| Boundary          | Contract                                                                                                                                                                      |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| In scope          | Custom-property declarations inside standard `@keyframes` and custom-property names explicitly listed in `transition-property`.                                               |
| Out of scope      | Transition shorthand parsing, runtime animation activity, interpolation success for particular endpoints, selector matching, and vendor at-rules.                             |
| Preconditions     | The stylesheet parses and the occurrence is source-authored.                                                                                                                  |
| Observable result | Deterministic advisory opportunities include exact locations, evidence kinds, entry points, observed registration status, and §2.5 provenance.                                |
| Uncertainty       | Registration status is `uncertain` without a complete supplied entry-point graph; transition shorthand remains unclaimed.                                                     |
| Provenance        | CSS Properties and Values API Level 1 [§2.5](https://www.w3.org/TR/2024/WD-css-properties-values-api-1-20240326/#animation-behavior). Opportunity classification is advisory. |

## Traceability

| Criterion   | Fixtures/tests                            | Implementation                  | Specification/policy                   |
| ----------- | ----------------------------------------- | ------------------------------- | -------------------------------------- |
| AC-DEEP-001 | `deeper-validation.test.ts` alias cases   | `validate.ts`                   | §§2.4, 2.7; audit policy 007           |
| AC-DEEP-002 | assignment fallback cases                 | `validate.ts`, `diagnostics.ts` | §2.7.1; `CPTV_USAGE_002`               |
| AC-DEEP-003 | nested compatible/diagnostic/skip cases   | `validate.ts`, `audit-graph.ts` | §2.7.1, Variables §3; audit policy 008 |
| AC-DEEP-004 | consumer compatible/diagnostic/skip cases | `validate.ts`                   | §2.7, Variables §3.1; audit policy 009 |
| AC-DEEP-005 | single-root and uncertain conflict cases  | `audit-graph.ts`                | §2.1; audit policy 010                 |
| AC-DEEP-006 | keyframes/transition/uncertain cases      | `audit-graph.ts`                | §2.5; audit policy 011                 |
