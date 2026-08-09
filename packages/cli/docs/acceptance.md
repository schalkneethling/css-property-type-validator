# CLI project-context acceptance boundaries

## AC-CLI-PC-001 — Configured inputs and limits

```gherkin
Scenario: CLI project inputs use bounded JSON configuration
  Given the working directory contains a valid project configuration
  And no positional input overrides are supplied
  When the configured CSS inputs are loaded
  Then paths are resolved relative to the configuration root
  And the configured file and aggregate limits are enforced before content allocation
```

In scope: non-executable JSON discovery in the working directory, configured input defaults, and shared run limits. Out of scope: implicit Git-root discovery and executable configuration. Missing configuration preserves explicit CLI arguments and defaults. Invalid or unsafe input fails with a stable project-context error and CLI exit code 2. Absolute inputs are supported only inside the discovered project root (or the working directory when no configuration exists); filesystem-root containment is explicitly out of scope. Authority: product configuration and filesystem-safety decisions; no CSS semantics are changed. Classification: gating.

## AC-CLI-PC-002 — Bounded import closure

```gherkin
Scenario: CLI validation follows a local import safely
  Given a matched CSS input imports another local CSS file
  When CLI validation prepares the import resolver
  Then imported content is loaded through the same bounded project reader
  And final validation receives a synchronous deterministic resolver
  And audit receives the exact resolved edge and direct entry point
  And the imported input is reachable from that entry point
```

Remote, non-CSS, missing, conditional, disabled root-relative, and unsupported imports are not invented. Their occurrences remain external, unresolved, or repository-context uncertainty in the core audit graph. Occurrence order and conditional state come from core's parsed inventory; the CLI adds a `toPath` only when its bounded local resolver cache contains that exact `(fromPath, specifier)` resolution. Unsafe paths and input-budget violations fail closed. Import traversal changes no `@property` semantics. Authority: project import-resolution and resource-safety decisions. Classification: gating.

## AC-CLI-PC-004 — Scan universe and explicit graph roots

```gherkin
Scenario: Configured entry points select roots without narrowing the scan universe
  Given project configuration matches multiple CSS inputs
  And it declares one or more non-empty entry-point patterns
  When CLI audit or plan assembles repository analysis
  Then inputs define the bounded scan universe
  And entry-point patterns are matched separately relative to the project root
  And every matched entry point is safely included in the analysis inputs
  And only those explicit entry points are passed as graph roots
```

When positional patterns are supplied to `audit` or `plan`, they replace configured `inputs` as
the scan universe; configured non-empty `entryPoints` remain the explicit graph roots. Without
explicit entry points, every matched scan input remains a compatibility root. Each configured
entry-point pattern must match at least one CSS file, and all matches must remain inside the bounded
project root; unmatched or escaping roots fail closed with CLI exit code 2. Entry-point selection
does not change core validation semantics. Classification: gating project-context invariant.

## AC-CLI-PC-003 — Publishable private integration

| Boundary          | Contract                                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| In scope          | Bundle project-context into the CLI runtime artifact while keeping core and Commander external.                                             |
| Out of scope      | Publishing project-context or exposing its API from the CLI package.                                                                        |
| Observable result | The packed CLI has no runtime dependency/import for the private package and remains independently installable with its public dependencies. |
| Uncertainty       | A residual private-package reference fails the package-boundary gate.                                                                       |
| Authority         | Published-consumer product invariant.                                                                                                       |
| Classification    | Gating.                                                                                                                                     |

## Traceability

| Criterion     | Tests                                                     | Implementation                         | Authority                                    |
| ------------- | --------------------------------------------------------- | -------------------------------------- | -------------------------------------------- |
| AC-CLI-PC-001 | `test/project-context.test.ts`                            | `src/project-context.ts`, `src/cli.ts` | This document; repository `AGENTS.md`        |
| AC-CLI-PC-002 | `test/project-context.test.ts`; existing CLI import tests | `src/project-context.ts`, `src/cli.ts` | This document; project-context AC-PC-001–004 |
| AC-CLI-PC-003 | package-boundary build inspection                         | `vite.config.ts`, `package.json`       | This document; published-consumer invariant  |
| AC-CLI-PC-004 | `test/cli-process.test.ts`                                | `src/cli.ts`, `src/project-context.ts` | This document; project entry-point policy    |

## AC-CLI-REPORT-002 — Conservative interactive registration review

```gherkin
Scenario: Audit HTML presents producer-supported registration choices
  Given core returns registration candidates with evidence, confidence, and specification references
  When the CLI renders standalone audit HTML
  Then each core candidate is represented by a review-required report candidate
  And only syntax alternatives supplied by core are offered
  And inherits and initial-value require explicit reviewer choices
  And no candidate defaults to accept or reject
```

```gherkin
Scenario: Redacted audit HTML does not restore authored values
  Given `--redact-source` removed observed and suggested initial values from the audit
  When the CLI maps that audit into the generic report payload
  Then registration evidence contains no removed values
  And the initial-value control remains empty
```

The CLI maps core IDs, property names, evidence, confidence, and exact specification URLs into the
report package's generic `registrationReview` contract. It does not add syntax alternatives or
semantic defaults. A producer-authored patch template is supplied only when it can reproduce the
core planner's registration formatting for a complete explicit decision. Existing or blocked
candidates remain review information and do not receive an applicable patch template. Runtime
report scripts remain the report package's responsibility. Classification: review-required and
non-gating.

## AC-CLI-BASELINE-002 — Baseline recovery and category coverage regression

```gherkin
Scenario: An audit reports stale and new baseline entries
  Given a valid baseline contains fingerprints that are absent from the current audit
  When baseline gates are evaluated
  Then stale fingerprints are reported deterministically for baseline recovery
  And only new diagnostics whose canonical gating field is `gating` can fail a new-only gate
```

```gherkin
Scenario: A requested category coverage non-regression gate detects a regression
  Given a baseline records analyzed, skipped, total, and percentage for each core coverage category
  And coverage regression gating is explicitly enabled
  When a current category percentage is lower than its baseline percentage
  Then that category is reported as a coverage regression
  And the CLI exits 1
```

Coverage categories are copied from core and use `analyzed / total`; a zero total is recorded as
unknown. An unknown current percentage regresses a previously known baseline percentage. An
unknown baseline percentage creates no gate. Legacy baselines without category coverage remain
usable for diagnostic new-only gates, but requesting coverage regression returns exit 2 with a
regeneration recovery message. Advisory diagnostics, opportunities, and uncertainty skips never
enter the diagnostic baseline or become diagnostic gate failures. Classification: explicit product
gate, not a CSS semantic claim.

## Additional traceability

| Criterion/scenario  | Fixtures/tests                                                | Implementation                           | Authority                                               |
| ------------------- | ------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------- |
| AC-CLI-REPORT-002   | `test/adoption-workflows.test.ts`                             | `src/adoption.ts` report payload mapping | Core candidate contract; report generic review contract |
| AC-CLI-BASELINE-002 | `test/adoption-workflows.test.ts`; `test/cli-process.test.ts` | `src/adoption.ts`, `src/cli.ts`          | Versioned CLI baseline and gating product decision      |

## AC-CLI-CONTRACT-001 — Canonical closed machine contracts

| Boundary          | Contract                                                                                                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| In scope          | Draft 2020-12 schemas describe analysis, audit, baseline, decisions, registration plans, and project configuration. Phase 2 analysis inventories are closed and versioned.                                   |
| Out of scope      | Inferring compatibility for an unknown version or accepting extension fields in closed consumer-input contracts.                                                                                             |
| Preconditions     | A producer or consumer selects the exact v1 schema identified by `kind` and/or `schemaVersion`.                                                                                                              |
| Observable result | Valid canonical documents pass their boundary validator; unknown fields, missing required fields, malformed fingerprints, and incompatible versions fail with a stable CLI workflow code and process exit 2. |
| Uncertainty       | Unknown contract versions and fields fail closed instead of being ignored.                                                                                                                                   |
| Authority         | Product machine-contract and release-compatibility decisions. No CSS semantic rule is introduced.                                                                                                            |
| Classification    | Gating.                                                                                                                                                                                                      |

## AC-CLI-PLAN-003 — Reviewed-plan digest and internal consistency

```gherkin
Scenario: Applying an unchanged reviewed create-file plan
  Given a plan contains one explicit create-file edit
  And its reviewed SHA-256 digest covers the schema, tool, specification, decisions, registration plan, patch, edit path/content hash, and source fingerprints
  And the source files remain unchanged
  When the CLI applies the plan
  Then it creates exactly the reviewed bytes at the reviewed path
```

```gherkin
Scenario: Applying a modified or structurally inconsistent plan
  Given a reviewed plan was edited, recomputed incompletely, duplicated, or contains incompatible nested versions
  When the CLI validates or applies the plan
  Then it fails closed with exit code 2
  And no target file is created
```

In scope: canonical overall digest verification, `sha256:` fingerprints, unique decision candidate IDs and source paths, exact create-file patch/content/path agreement, nested schema/tool/specification compatibility, source staleness, and create-file-only application. Out of scope: replacement/deletion edits, fuzzy patching, partial application, or accepting a newly computed digest as proof of human review through `apply`; plans are created only by the `plan` workflow. Malformed or uncertain input fails closed. Authority: reviewed-edit integrity and release decisions; registration semantics remain governed by the core plan and its cited official specification profile. Classification: gating.

## AC-CLI-DIAGNOSTIC-001 — Canonical core diagnostic projection

| Boundary          | Contract                                                                                                                                                                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| In scope          | CLI audit, baselines, gates, human output, and SARIF consume core `id`, `confidence`, `gating`, `baselineFingerprint`, canonical location, related locations, evidence, provenance, suggested edits, and specification references. |
| Out of scope      | Reclassifying confidence/provenance/gating or independently deriving diagnostic identities in the CLI.                                                                                                                             |
| Observable result | The CLI envelope preserves compatibility aliases while their values come directly from core. SARIF emits related locations and only emits fixes for exact core edits marked `safe`.                                                |
| Uncertainty       | A diagnostic without a safe exact edit produces no SARIF fix. Review-required edits never become auto-fixes.                                                                                                                       |
| Authority         | Core diagnostic v1 contract and SARIF 2.1.0 transport policy.                                                                                                                                                                      |
| Classification    | Gating for contract fidelity; suggested fixes are advisory until explicitly safe.                                                                                                                                                  |

## Machine-contract traceability

| Criterion             | Tests                                                         | Implementation                                    | Contract/schema authority                          |
| --------------------- | ------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------- |
| AC-CLI-CONTRACT-001   | `test/schema-contracts.test.ts`, `test/cli-process.test.ts`   | `src/schema-validation.ts`, file-boundary parsers | `contracts/*.schema.json`                          |
| AC-CLI-PLAN-003       | `test/adoption-workflows.test.ts`, `test/cli-process.test.ts` | `src/adoption.ts`, `src/cli.ts`                   | `contracts/cli-registration-plan-v1.schema.json`   |
| AC-CLI-DIAGNOSTIC-001 | `test/adoption-workflows.test.ts`                             | `src/adoption.ts`                                 | `contracts/diagnostic-v1.schema.json`, SARIF 2.1.0 |

## AC-CLI-PRIVACY-001 — Deep source redaction

```gherkin
Scenario: Redacted machine and HTML reports contain no authored source data
  Given hostile sentinel values occur in registrations, assignments, fallbacks, diagnostics, evidence, messages, and suggested edits
  When `--redact-source` produces JSON or standalone HTML
  Then no sentinel occurs anywhere in the serialized payload
  And source-derived snippets, actual values, evidence, edit replacements, edit fingerprints, source fingerprints, candidates, inventories, conflicts, cycles, and opportunities are absent or empty
  And diagnostic messages and related-location messages use deterministic generic redaction text
  And the remaining payload is structurally valid and deterministic
```

Safe retained metadata is limited to permanent diagnostic codes/reasons, accepted file paths and
locations, phase/severity/basis/gating, confidence level, provenance, specification references,
configuration, counts, coverage, entry-point paths, tool/specification profiles, and explicit
uncertainty skips. Confidence reasons are replaced with generic redaction text. Required diagnostic
fingerprints are recomputed only from safe retained metadata; source-content fingerprints are
removed. Because registration candidates and exact edits necessarily contain authored identifiers
or values, redacted output cannot produce an applicable registration patch. This is a privacy
boundary, not a change to core semantics. Classification: gating security invariant.

| Criterion/scenario | Fixtures/tests                                      | Implementation                              | Authority                     |
| ------------------ | --------------------------------------------------- | ------------------------------------------- | ----------------------------- |
| AC-CLI-PRIVACY-001 | `test/adoption-workflows.test.ts` hostile sentinels | `src/adoption.ts` deep redaction projection | Explicit CLI privacy decision |

## AC-CLI-PRIVACY-002 — Redacted audit metadata is internally consistent

```gherkin
Scenario: A consumer parses contradictory redaction metadata
  Given an audit declares `sourceRedacted: true`
  And the audit contains one or more source fingerprints
  When the runtime parser or published JSON Schema validates the audit
  Then validation fails closed
  And the runtime parser reports `CPTV_CLI_INVALID_AUDIT`
```

- **In scope:** Runtime and Draft 2020-12 schema validation reject source fingerprints when an
  audit declares that source-derived data was redacted.
- **Out of scope:** Inferring whether an unredacted audit omitted expected fingerprints, recovering
  stripped source data, or changing what `createAudit` redacts.
- **Preconditions:** The document otherwise satisfies the v1 CLI audit contract.
- **Observable result:** Contradictory hand-authored or older audit files fail before they can be
  consumed as valid redacted reports.
- **Conservative uncertainty:** The validator does not guess which field is authoritative; it
  rejects the inconsistent document and requires regeneration or human repair.
- **Provenance:** Versioned CLI privacy and machine-contract policy; no CSS semantic claim is made.
- **Classification:** Gating security and contract invariant.

| Criterion/scenario | Fixtures/tests                                                     | Implementation                                          | Authority                              |
| ------------------ | ------------------------------------------------------------------ | ------------------------------------------------------- | -------------------------------------- |
| AC-CLI-PRIVACY-002 | `test/adoption-workflows.test.ts`; `test/schema-contracts.test.ts` | `src/adoption.ts`; `contracts/cli-audit-v1.schema.json` | Explicit CLI privacy/contract decision |
