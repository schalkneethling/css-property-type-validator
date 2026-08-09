# CLI adoption workflow acceptance boundaries

## AC-CLI-AUDIT-001 — Deterministic audit contract

```gherkin
Scenario: A repository audit is emitted for machine consumption
  Given bounded CSS inputs inside the configured project root
  When `audit --format json` runs twice with unchanged inputs
  Then both outputs are byte-for-byte identical
  And every diagnostic has a permanent provenance ID, exact available location, confidence, specification references, and a stable fingerprint
  And unavailable repository inventories remain explicit uncertainty skips
```

In scope: the additive `AnalysisResultV1` information currently exposed by core, deterministic
CLI metadata, source fingerprints, core-provided repository inventories, and conservative skips.
Out of scope: inventing import edges, suggested edits, or whole-document cascade facts that core
does not expose.
Precondition: all input and import reads satisfy project-context containment and size limits.
Observable result: versioned JSON, human, standalone HTML, or SARIF 2.1.0 output. Uncertainty is
non-gating. Normative authority is carried from core's pinned official W3C provenance catalog.
Product authorities: machine-readable contract and bounded-read decisions. Classification: gating
only for high-confidence diagnostics whose provenance classification is `normative`.

## AC-CLI-AUDIT-002 — Incremental gates and stable exits

```gherkin
Scenario: A baseline admits existing normative errors but rejects a new one
  Given a versioned baseline created from an earlier audit
  And `--new-only` is enabled
  When a new high-confidence normative diagnostic appears
  Then the CLI exits 1
  And an unchanged baseline diagnostic does not contribute to that gate
```

```gherkin
Scenario: A workflow input is invalid or stale
  Given an invalid baseline, decisions document, plan, configuration, path, or I/O operation
  When the command runs
  Then the CLI exits 2
  And does not emit or apply a partial result
```

Exit 0 means all accepted gates pass; exit 1 means an accepted diagnostic or coverage gate fails;
exit 2 means usage, configuration, bounded I/O, incompatible schema, or stale-plan failure. Coverage
is `validated / (validated + skipped)`; a zero denominator is unknown and fails a requested minimum
conservatively. Advisory and uncertain findings never become failures. Baseline membership uses only
stable diagnostic fingerprints, not messages or incidental formatting. Classification: gating.

## AC-CLI-PLAN-001 — Explicit review decisions

```gherkin
Scenario: Registration planning refuses implicit descriptor decisions
  Given an analysis candidate and no complete accepted decision
  When `plan` runs
  Then no registration edit is produced for that candidate
  And the result contains a review-required skip
```

An accepted decision must explicitly supply `syntax` and `inherits`; it must also supply
`initialValue` unless the syntax is the universal `*` syntax. The CLI delegates registration
validity to core, whose provenance pins CSS Properties and Values API Level 1 §3–§3.3 and §5.
Suggestions remain evidence and are never promoted to decisions. Out of scope: inferring inheritance,
choosing an initial value, or overriding core's conservative skips. Classification: review-required.

## AC-CLI-PLAN-002 — Exact, stale-safe application

```gherkin
Scenario: A reviewed create-file plan is applied to unchanged sources
  Given a plan with explicit decisions, exact generated content, and SHA-256 source fingerprints
  And every source is unchanged and the explicit target does not exist
  When `apply --plan` runs
  Then the target is created with exactly the reviewed bytes
  And the CLI exits 0
```

```gherkin
Scenario: A plan source changed after review
  Given any source fingerprint differs from the reviewed plan
  When `apply --plan` runs
  Then no edit is applied
  And the CLI exits 2 with a stale-plan failure
```

Only an explicit, project-contained, absent target may be created in this slice. Replacing files,
fuzzy patching, partial application, and automatic conflict resolution are out of scope. The plan
file and all fingerprinted sources are bounded before allocation. Classification: gating safety
contract; it adds no CSS semantics.

## AC-CLI-REPORT-001 — Published standalone report boundary

| Boundary          | Contract                                                                                                                                        |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| In scope          | Render audit/plan JSON through the private report package using the pinned Ephemeral contract.                                                  |
| Observable result | A self-contained HTML document with selectable decision JSON and patch text whose actual raw and Brotli-compressed bytes fit the pinned limits. |
| Out of scope      | Network, storage, forms, downloads, or runtime private-package dependencies.                                                                    |
| Uncertainty       | Report contract or size failure exits 2 and emits no partial HTML.                                                                              |
| Authority         | Pinned Ephemeral Pages compatibility manifest and report package.                                                                               |
| Classification    | Gating compatibility invariant.                                                                                                                 |

## AC-CLI-SARIF-001 — SARIF 2.1.0 interoperability

| Boundary          | Contract                                                                                        |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| In scope          | Stable rule IDs, exact available regions, specification help URLs, and diagnostic fingerprints. |
| Observable result | Deterministically sorted SARIF 2.1.0 JSON accepted as an audit output.                          |
| Out of scope      | Suggested fixes when core exposes no exact safe edit.                                           |
| Uncertainty       | Missing locations omit regions rather than guessing.                                            |
| Authority         | SARIF 2.1.0 output decision; diagnostic semantics remain W3C-provenance-backed.                 |
| Classification    | Machine-interface contract.                                                                     |

## AC-CLI-PKG-001 — Private dependencies are bundled

The built CLI must contain project-context and report behavior while its runtime manifest and
generated JavaScript contain no imports of either private workspace package. Core and Commander
remain public runtime dependencies. A private-package reference fails the package-boundary check.

## Traceability

| Criterion/scenario | Fixtures/tests                                   | Implementation                  | Documentation/specification                  |
| ------------------ | ------------------------------------------------ | ------------------------------- | -------------------------------------------- |
| AC-CLI-AUDIT-001   | `test/adoption-workflows.test.ts`                | `src/adoption.ts`, `src/cli.ts` | This document; core provenance catalog       |
| AC-CLI-AUDIT-002   | `test/adoption-workflows.test.ts`                | `src/adoption.ts`, `src/cli.ts` | This document                                |
| AC-CLI-PLAN-001    | `test/adoption-workflows.test.ts`                | `src/adoption.ts`, core planner | This document; core specification references |
| AC-CLI-PLAN-002    | `test/adoption-workflows.test.ts`                | `src/adoption.ts`, `src/cli.ts` | This document; filesystem safety decision    |
| AC-CLI-REPORT-001  | `test/adoption-workflows.test.ts`; package check | `src/adoption.ts`               | This document; pinned Ephemeral contract     |
| AC-CLI-SARIF-001   | `test/adoption-workflows.test.ts`                | `src/adoption.ts`               | This document; SARIF 2.1.0                   |
| AC-CLI-PKG-001     | `scripts/check-private-bundle.mjs`               | `vite.config.ts`                | This document                                |
