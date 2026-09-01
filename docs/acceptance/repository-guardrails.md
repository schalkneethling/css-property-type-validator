# Repository guardrail acceptance boundaries

These safeguards protect public contracts and safe contributor workflows. They are intentionally
static: they do not claim browser behavior or replace specification-backed semantic tests.

## AC-GUARD-001 — Traceability is complete before handoff

- **In scope:** Each acceptance document has unique stable `AC-*` headings and a traceability
  table that names every heading exactly once and names no criterion that is not declared as a
  heading in the same document.
- **Out of scope:** Deciding whether a criterion is sufficient, or parsing arbitrary Markdown
  table dialects.
- **Preconditions:** An implementation slice records its boundaries in `docs/acceptance/`.
- **Observable result:** `check-acceptance-traceability` rejects an orphan, duplicate,
  undocumented, or table-only stale criterion before handoff; the traceability table is
  isolated up to the next heading so surrounding prose cannot satisfy the count.
- **Uncertainty:** A malformed or missing table fails closed and asks for human repair.
- **Provenance:** Product decision: acceptance-driven RED/GREEN workflow.
- **Outcome:** Gating contributor contract.

## AC-GUARD-002 — Core remains browser-safe

- **In scope:** Core source cannot import Node-only modules, the private project-context package,
  or use the Node process global.
- **Out of scope:** Proving every third-party dependency works in every browser.
- **Preconditions:** Browser consumers import only declared core exports.
- **Observable result:** `check-core-browser-boundary` identifies the exact prohibited source
  location and fails.
- **Uncertainty:** A static import check is a safety boundary, not a bundle compatibility claim.
- **Provenance:** Product decision: core is filesystem-free and browser-safe.
- **Outcome:** Gating package-boundary contract.

## AC-GUARD-003 — CSS source reads are bounded centrally

- **In scope:** Production package source may only call Node file-reading APIs in the project
  context's bounded reader, which contains pre-read `lstat`/`stat` and post-read size checks.
- **Out of scope:** Replacing runtime containment tests or imposing a file-size policy on
  non-CSS output writes.
- **Preconditions:** Repository CSS loading is implemented by the private project-context
  package.
- **Observable result:** `check-bounded-css-reads` rejects direct reader calls elsewhere and
  rejects a bounded reader that lacks the mandatory checks.
- **Uncertainty:** Static detection fails closed for direct reader API calls; dynamic filesystem
  behavior remains covered by project-context tests.
- **Provenance:** Product security decision and local `AGENTS.md` bounded-read requirement.
- **Outcome:** Gating safety contract.

## AC-GUARD-004 — Permanent diagnostic-code catalog is coherent

- **In scope:** Once `contracts/diagnostic-codes.json` is introduced, each permanent `CPTV_*`
  code is unique and every code used in core source is registered.
- **Out of scope:** Requiring diagnostic codes before the versioned-diagnostics slice is accepted.
- **Preconditions:** The Phase 1 diagnostic-code registry exists; release verification uses
  `--require`.
- **Observable result:** `check-diagnostic-code-contract --require` rejects a missing,
  duplicate, malformed, or stale registry.
- **Uncertainty:** Before that accepted slice, the ordinary check reports an explicit inactive
  state instead of pretending coverage exists.
- **Provenance:** Product decision: JSON diagnostics use permanent `CPTV_*` IDs.
- **Outcome:** Release-gating contract after activation.

## AC-GUARD-005 — Generated contracts cannot silently drift

- **In scope:** Once `contracts/generated-contracts.json` is introduced, listed generated files
  match their recorded SHA-256 digests and all source files marked `@generated` are listed.
- **Out of scope:** Determining the correct generator or automatically updating generated output.
- **Preconditions:** A generated-contract manifest exists; release verification uses `--require`.
- **Observable result:** `check-generated-contracts --require` rejects an unlisted or stale
  generated contract.
- **Uncertainty:** Before a generated contract is accepted, the ordinary check reports inactive;
  it never rewrites files.
- **Provenance:** Product decision: generated schemas and contracts are reviewed artifacts.
- **Outcome:** Release-gating contract after activation.

## AC-GUARD-006 — Agent verification has explicit lifecycle stages

- **In scope:** Preflight, targeted RED verification, changed-work verification, and handoff are
  separate commands and retain their distinct failure causes.
- **Out of scope:** Automatically approving acceptance criteria, closing issues, or substituting
  a human overreach review.
- **Preconditions:** The contributor supplies a stable criterion ID that is declared as a
  heading in `docs/acceptance/` and, for RED, an explicit test command.
- **Observable result:** Lifecycle scripts validate guardrails before executing the requested
  verification and reject missing criterion/test inputs — and criteria not declared in
  `docs/acceptance/` — with usage exit status 2. Only a numeric nonzero exit is accepted as RED
  evidence: a RED command that passes or is terminated by a signal is rejected, and a
  signal-terminated guardrail or verification child is a failure, never a success.
- **Uncertainty:** A passing automation result does not make an advisory or uncertain diagnostic
  gating.
- **Provenance:** Product decision: acceptance-driven RED/GREEN workflow.
- **Outcome:** Gating contributor workflow contract.

## AC-GUARD-007 — Workflows declare least-privilege token access

- **In scope:** Every GitHub Actions workflow declares an explicit top-level `permissions` map;
  the ordinary CI workflow grants only `contents: read`.
- **Out of scope:** Proving third-party action behavior or preventing a deliberately reviewed job
  from requesting narrower or additional capabilities required by that job.
- **Preconditions:** A workflow can receive the repository `GITHUB_TOKEN`.
- **Observable result:** The workflow-permissions contract identifies the exact workflow with a
  missing top-level declaration and rejects CI permissions broader than read-only contents.
- **Uncertainty:** Unrecognized or dynamically constructed permission syntax fails closed for
  human review; the check does not infer GitHub defaults.
- **Provenance:** GitHub Actions security decision: explicitly minimize `GITHUB_TOKEN` access;
  CodeQL alert from PR #172 review 4891253884.
- **Outcome:** Gating repository security contract.

## AC-GUARD-008 — Guardrail sources use deterministic patterns

- **In scope:** Guardrail and lifecycle scripts under `scripts/` contain no locale-sensitive
  sort comparisons (`localeCompare`) and no unbounded fetch-response buffering (`.text()`,
  `.json()`, or `.arrayBuffer()` on a response, or inline on `await fetch(...)`), enforced by
  structural ast-grep rules with a pinned CLI version.
- **Out of scope:** Product package sources (their output ordering is a separate contract
  decision), semantic proof that a streamed read is correctly bounded, and receivers the
  naming-convention rule cannot see.
- **Preconditions:** `@ast-grep/cli` is installed as an exact-version dev dependency.
- **Observable result:** `check-determinism-rules` reports each violating file, line, and rule
  and fails; a clean tree passes with an explicit confirmation.
- **Uncertainty:** Structural matching is syntactic; findings are reviewed rather than
  auto-fixed, and the response rule depends on `response`/`res`/`resp` receiver naming.
- **Provenance:** Determinant PR #3 review: both patterns recurred in code distilled from this
  repository.
- **Outcome:** Gating guardrail-quality contract.

## Contract table

| Contract            | Required observable behavior                                                                                            |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Traceability        | Every `AC-*` heading appears once in the document's traceability table, and every table criterion is a declared heading |
| Core boundary       | Core has no Node-only or project-context imports and does not depend on `process`                                       |
| Bounded reads       | Direct production `readFile`, `readFileSync`, and `createReadStream` calls occur only in the bounded reader             |
| Diagnostic registry | Activated registry codes are unique, match `CPTV_*`, and cover all static uses                                          |
| Generated registry  | Activated manifest digests match bytes and lists all `@generated` source files                                          |
| Lifecycle           | RED requires one declared criterion and an explicit command that fails with a numeric nonzero exit                      |
| Workflow token      | Every workflow declares top-level permissions; CI grants only `contents: read`                                          |
| Determinism rules   | Guardrail scripts contain no locale-sensitive sorts and no unbounded fetch-response buffering                           |

## Traceability

| Criterion/scenario | Fixtures/tests                                                | Implementation                               | Documentation/specification          |
| ------------------ | ------------------------------------------------------------- | -------------------------------------------- | ------------------------------------ |
| AC-GUARD-001       | `scripts/test/guardrails.test.mjs` orphan criterion fixture   | `scripts/check-acceptance-traceability.mjs`  | This document                        |
| AC-GUARD-002       | `scripts/test/guardrails.test.mjs` Node import fixture        | `scripts/check-core-browser-boundary.mjs`    | This document; `AGENTS.md`           |
| AC-GUARD-003       | `scripts/test/guardrails.test.mjs` direct reader fixture      | `scripts/check-bounded-css-reads.mjs`        | This document; `AGENTS.md`           |
| AC-GUARD-004       | `scripts/test/guardrails.test.mjs` duplicate registry fixture | `scripts/check-diagnostic-code-contract.mjs` | This document                        |
| AC-GUARD-005       | `scripts/test/guardrails.test.mjs` stale generated fixture    | `scripts/check-generated-contracts.mjs`      | This document                        |
| AC-GUARD-006       | `scripts/test/guardrails.test.mjs` lifecycle usage fixture    | `scripts/agent-verify-red.mjs`               | This document                        |
| AC-GUARD-007       | `scripts/test/workflow-permissions.test.mjs`                  | Workflow-level permission declarations       | This document; PR #172 CodeQL review |
| AC-GUARD-008       | `scripts/test/guardrails.test.mjs` determinism-rule fixtures  | `scripts/check-determinism-rules.mjs`        | This document; determinant PR #3     |
