# CSS Property Type Validator Adoption Platform

## Summary

Reposition the project around:

**audit → review → generate → validate → gate**

Retain the browser-safe `css-tree` core, add a private Node project-context package, make versioned JSON the canonical agent contract, generate standalone interactive HTML reports, and support incremental CI adoption. Stylelint remains maintained; `packages/vscode` is retired.

Store the approved plan verbatim at:

`plans/typed-custom-property-adoption.md`

Three hard invariants govern the work:

1. **Specification authority:** every semantic claim about `@property` cites the exact official specification section.
2. **Published-consumer integrity:** web cannot expose a core capability until the required core version is published and independently installable.
3. **Ephemeral compatibility authority:** public report behavior is tested against a pinned Ephemeral Pages delivery contract.

When normative behavior, static evidence, package availability, or delivery compatibility is uncertain, fail closed or emit structured uncertainty instead of guessing.

## Acceptance-driven red/green TDD

### Define boundaries before tests

Before adding a RED test, every issue or independently deliverable slice must define defensible acceptance criteria tied to real product outcomes.

Each criterion receives a stable ID such as `AC-AUDIT-001` and records:

- In-scope outcome.
- Explicit out-of-scope behavior.
- Preconditions and required configuration/state.
- User- or consumer-observable result.
- Conservative uncertainty behavior.
- Relevant official specification provenance.
- Applicable product, security, release, or compatibility decision.
- Whether the result is gating, advisory, or review-required.

No implementation or RED test begins until these boundaries are reviewed.

### Scenario format

Use Gherkin when behavior spans:

- User actions.
- Configuration or repository state.
- CLI input/output and exit codes.
- CI gates and baselines.
- Report interaction.
- Package publication/consumption.
- Failure and recovery.
- Ephemeral sandbox behavior.

Example:

```gherkin
Scenario: Web hides a capability whose core version is unpublished
  Given the web feature requires core version 0.13.0
  And npm does not contain that exact core version
  When the published-consumer check runs
  Then the deployable web build fails closed
  And no deployable artifact is produced
```

Use concise contract tables instead of Gherkin for low-level invariants such as:

- Diagnostic-code uniqueness.
- Schema field requirements.
- Sorting keys.
- Byte limits.
- Allowed import boundaries.
- Specification catalog completeness.

Do not force narrative syntax where a table communicates the contract more precisely.

### RED

Replace “add the smallest failing contract/fixture” with:

> Define acceptance boundaries, then add the smallest failing test that proves one accepted outcome.

RED requirements:

- One test or tightly related fixture set proves exactly one unmet criterion.
- Failure occurs for the intended reason.
- The failure is captured in issue/PR evidence.
- The assertion targets externally meaningful behavior, a normative `@property` requirement, or a documented safety/compatibility invariant.
- Every test carries its criterion/scenario ID.
- RED must not encode the intended internal implementation.

### GREEN

- Implement only the behavior required by that criterion.
- Do not opportunistically satisfy adjacent unapproved behavior.
- Do not broaden severity, confidence, supported syntax, cascade assumptions, or generated edits.
- Record any newly discovered adjacent requirement as a later criterion or issue.

### Refactor/prove

- Refactor without broadening the accepted behavior.
- Replay the targeted scenario and all related compatible/skip cases.
- Run deterministic output twice where applicable.
- Run package-level and complete relevant checks.
- Independently review specification conformance, false positives, release boundaries, and security.
- Snapshot changes require semantic review.

### Overreach review

Reject tests that:

- Encode assumptions absent from the official specification or an explicit product decision.
- Require unsupported global cascade/DOM behavior.
- Couple to private AST shapes, internal map layout, incidental formatting, or file organization.
- Treat a library’s behavior as normative.
- Turn advisory, medium/low-confidence, or uncertain findings into failures.
- Require web behavior from an unpublished package.
- Assume browser capabilities blocked by the Ephemeral sandbox.
- Assert an implementation technique when multiple compliant techniques are valid.

### Traceability and closure

Every phase issue maintains:

| Criterion/scenario | Fixtures/tests | Implementation | Documentation/specification |
|---|---|---|---|

Issue closure requires:

- Every criterion/scenario passing.
- Compatible and conservative-uncertainty cases passing.
- Traceability table complete.
- Documentation and migration notes merged.
- Specification and compatibility references current.
- No unreviewed scope expansion.
- Full relevant verification green.

## Specification authority

Use the official published [CSS Properties and Values API Level 1](https://www.w3.org/TR/css-properties-values-api-1/) as the normative baseline.

Policy:

- Pin specification URL and publication date.
- Use its normative references where required.
- Monitor the Editor’s Draft without adopting changes silently.
- Treat libraries, MDN, Webref, WPT, and browsers as supporting evidence only.
- Do not derive rules solely from examples or informative notes.
- Return a skip/review item when normative behavior is ambiguous.

Create a provenance catalog for every diagnostic, validation branch, generation constraint, inference policy, edit, coverage category, and animation opportunity.

Each entry records:

- Permanent rule/policy ID.
- `normative`, `tool-policy`, or `advisory`.
- Exact official URL and anchor.
- Specification profile.
- Paraphrased rationale.
- Normative/informative status.
- Acceptance criteria and tests.
- Known divergences.

Add `specReferences` to diagnostics, evidence, candidates, and edits.

Repository checks:

- `spec:check`
- `spec:links`
- `spec:drift`
- `spec:coverage`

## Core and project architecture

### Core

Add:

- `analyzeInputs(inputs, options): AnalysisResultV1`
- `planPropertyRegistrations(analysis, decisions?): RegistrationPlanV1`

Retain `validateFiles` as a compatibility wrapper and generation as deprecated compatibility behavior until the next major release.

Core remains filesystem-free and receives content, entry-point identities, and resolved import edges.

`AnalysisResultV1` includes:

- Schema/tool/specification versions.
- Configuration and inputs.
- Registrations, assignments, aliases, references, fallbacks, consumers, and imports.
- Diagnostics, skips, coverage, candidates, opportunities, and edits.
- Deterministic ordering.

Diagnostics gain:

- Permanent `CPTV_*` IDs.
- UTF-16 and line/column locations.
- Related locations and evidence.
- Confidence with reasons.
- Specification/tool-policy provenance.
- Suggested edits with applicability and source fingerprint.
- Stable SHA-256 baseline fingerprint.

Only high-confidence, normatively supported errors gate by default.

### Private Node project context

Create:

`@schalkneethling/css-property-type-validator-project-context`

It:

- Serves CLI and Stylelint, never core/web.
- Loads `css-property-type-validator.config.json`.
- Applies CLI → nearest config → defaults.
- Owns globs, roots, imports, paths, caches, and fingerprints.
- Defaults to 5 MiB/file, 10,000 files, and 100 MiB aggregate.
- Performs pre-allocation `lstat`/`stat`, containment and regular-file checks, followed by post-read byte checks.
- Preserves import occurrences, ordering, ranges, resolution, and conditions.

### CLI

Add:

- `audit`
- `plan`
- `apply --plan <file>`
- `--format human|json|html|sarif`
- `--redact-source`
- Baseline/new-only/coverage gates
- Exit `0` pass, `1` gate failure, `2` usage/configuration/I/O/stale-plan failure

### Stylelint and web

- Stylelint validates only Stylelint-owned content.
- It does not audit, generate, apply, or scan the repository per file.
- Web consumes only published-compatible browser-safe APIs.
- External editor integrations remain ecosystem work.

## Published producer/consumer boundary

Remove web’s `workspace:*` dependency and direct TypeScript source mapping.

### Future-integration lane

- Tests proposed workspace behavior.
- Never produces deployable output.

### Published-consumer lane

- Pins an exact published core version.
- Installs outside the workspace.
- Rejects source aliases, workspace links, overrides, and deep imports.
- Fails closed on registry errors or unavailable versions.
- Builds/tests only declared published exports.
- Records version and integrity.
- Is the only deployable artifact source.

### Release order

1. Merge core without web consumption.
2. Publish core.
3. Verify exact-version availability and clean installation.
4. Open web consumer PR pinned to that version.
5. Pass isolated build and Playwright.
6. Deploy.

Add:

- `release:pack-check`
- `release:consume-local`
- `web:check-published-core`
- `web:assert-release-boundary`
- `release:verify-publication`
- `release:rehearse`

## Standalone HTML and Ephemeral Pages

### Pinned compatibility authority

Target a pinned contract from:

- [Uploaded content security model](https://github.com/schalkneethling/ephemeral-pages#uploaded-content-security-model)
- [Effective CSP implementation](https://github.com/schalkneethling/ephemeral-pages/blob/main/src/csp.ts)
- Upstream HTML validator and upload limits

Create `compatibility/ephemeral-pages.json` with:

- Repository and tested commit SHA.
- Check date and source blob SHAs.
- Effective HTTP CSP.
- Viewer sandbox.
- Required authored elements.
- Derived raw/compressed upload limits.
- Security headers.
- Test TTL and compatibility version.

Seed from commit `5bee37aaed30985a1bb4c7ebc62d6acecd772002`. Limits are consumed from this manifest, not duplicated as literals.

### Delivery environment

Test against:

- `sandbox allow-scripts`.
- `default-src 'none'`.
- No effective `connect-src`.
- Inline-only assets.
- `object-src 'none'`.
- `base-uri 'none'`.
- `form-action 'none'`.
- Sandboxed viewer iframe.
- No same-origin assumptions, forms, popups, navigation, storage, or downloads.
- Source-authored `<html>` or `<head>`.
- UTF-8 and pinned upload limits.

The local meta CSP is generated from the pinned contract and must be equal to or stricter than the service policy. HTTP CSP remains authoritative.

### Sandboxed exports

Reports always render decision JSON and patches into readonly selectable text.

Progressive enhancement order:

1. Selectable output is always present.
2. “Select all” works without permissions.
3. Clipboard is attempted; rejection selects the output.
4. Download is optional and non-essential.
5. Review never depends on clipboard, download, filesystem, form, popup, or navigation.

Reports use no network APIs, service workers, external assets, forms, `<base>`, objects, or persistent storage.

### Security and compatibility checks

Assert:

- Effective HTTP CSP.
- `X-Content-Type-Options: nosniff`.
- Sandboxed iframe behavior.
- No network requests.
- `noindex,nofollow,noarchive`.
- Authored document elements.
- UTF-8 and derived size limits.
- Injection resistance.
- Offline behavior.
- Decision controls under sandbox.
- Selectable export fallback.
- Absence of prohibited elements/assets.

Add:

- `ephemeral:contract:check`
- `ephemeral:contract:update`
- `ephemeral:drift`
- `ephemeral:canary`

The canary uploads synthetic non-sensitive HTML only. Drift never updates automatically.

## Implementation phases

### Phase 0 — Specification, governance, parser, release boundary, and retirement

Define acceptance boundaries for:

- Rule provenance.
- Parser correctness/portability.
- Published web consumption.
- VS Code retirement.

Then:

- Save plan and update goals/roadmap.
- Create GitHub hierarchy.
- Build provenance catalog and checks.
- Build parser corpus and benchmark `css-tree`, PostCSS plus value tooling, and Lightning CSS.
- Retain `css-tree` behind a facade if criteria pass.
- Remove web source alias/workspace-only consumption.
- Deprecate and remove `packages/vscode`.
- Preserve unrelated `github-issue-triage-report.html`.

### Phase 1 — Contracts, configuration, and safe I/O

Acceptance criteria cover:

- Schema compatibility.
- Provenance completeness.
- Configuration precedence.
- Deterministic output.
- Path containment and bounded reads.
- Package export behavior.

Implement `AnalysisResultV1`, schemas, config, project-context, dedicated CLI tests, shared loaders, and package checks.

### Phase 2 — Graph, conflicts, and coverage

Acceptance criteria cover:

- Inventory relationships.
- Alias/cycle behavior.
- Duplicate/conflict classification.
- Ordering certainty.
- Exact evidence.
- Coverage denominators.
- Conservative uncertainty.

Implement graph-per-entry-point and canonical audit JSON.

### Phase 3 — HTML and Ephemeral compatibility

Gherkin scenarios cover:

- Loading and interacting under the service CSP/sandbox.
- Blocked clipboard/download with selectable fallback.
- Blocked network/storage/forms.
- Injection attempts.
- Authored-document rejection.
- Upload-limit failure.
- Drift detection and recovery.

Implement the renderer, pinned contract, local harness, drift check, live canary, sanitized CI artifact, and optional Ephemeral publication.

### Phase 4 — Registration planning

Acceptance criteria cover:

- Syntax alternatives.
- Evidence and confidence.
- Tool-policy labelling.
- Required human `inherits`/`initial-value` decisions.
- Stale plan rejection.
- Sandboxed review/export.

Implement conservative plan/apply behavior without implicit semantic decisions.

### Phase 5 — Deeper validation

Create separate acceptance-driven slices for:

- Aliased assignments.
- Assignment fallbacks.
- Nested fallbacks.
- Consumer compatibility.
- Conflict selection.
- Animation opportunities.

Each requires normative provenance plus compatible, diagnostic, and conservative-skip scenarios.

### Phase 6 — Baselines and SARIF

Gherkin scenarios cover:

- Exit-code outcomes.
- New-only gates.
- Stale baseline recovery.
- Coverage regression.
- SARIF consumption/fixes.

Implement versioned baselines and SARIF 2.1.0.

### Phase 7 — Integration and release

Gherkin scenarios cover:

- Stylelint/CLI parity.
- Published package consumption.
- Registry failure.
- Web deployment order.
- Ephemeral drift.
- Partial release recovery.

Stabilize Stylelint, add release verification, update docs, publish in order, and verify exact versions.

Performance criterion: 1,000 files/10 MiB under 10 seconds and 512 MiB RSS on `ubuntu-latest`/Node 22.

## Repository safeguards and agent guidance

Implement:

- `spec-citation-contract`
- `acceptance-traceability-contract`
- `no-unbounded-css-read`
- `core-browser-boundary`
- `diagnostic-code-contract`
- `generated-contracts-current`
- `web-published-consumer-contract`
- `no-cross-boundary-web-feature`
- `release-workflow-order`
- `ephemeral-report-contract-current`
- `report-no-network-dependencies`

Add:

- Acceptance-criteria and Gherkin templates.
- Traceability-table validation.
- Specification fixtures.
- Temp-project/import-graph builders.
- JSON, SARIF, HTML, package, registry, CSP, and sandbox fixtures.
- `agent:preflight`, `agent:verify:red`, `agent:verify:changed`, and `agent:handoff`.
- Root guidance requiring acceptance boundaries before RED.
- Repo-local `cptv-development` skill with:
  1. define criteria;
  2. fetch official specification/upstream contract;
  3. choose Gherkin or contract table;
  4. add one criterion-linked RED test;
  5. implement only that criterion;
  6. review overreach;
  7. complete traceability before closure.

Add further rules/hooks only for demonstrated recurring or correctness/security needs.

## Agent and model allocation

Maximum four slots:

- **Coordinator — `gpt-5.6-sol`, xhigh:** criteria approval, issues, contracts, release sequencing, Ephemeral pinning, GitHub mutations, final traceability.
- **Specification/RED/reviewer — `gpt-5.6-sol`, xhigh:** normative research, acceptance scenarios, parser ADR, CSP/sandbox cases, overreach review.
- **Core/CLI GREEN — `gpt-5.6-sol`, high:** analysis, project-context, CLI, baselines, SARIF, package checks.
- **UX/integration GREEN — `gpt-5.6-terra`, high:** HTML, sandbox interaction, accessibility, Playwright, web integration, workflows/docs, VS Code retirement.

No GREEN work starts until acceptance boundaries and the targeted RED failure are approved. Shared schemas/workflows change serially. Only the coordinator mutates GitHub/release state.

## GitHub issue lifecycle

### Create

Create umbrella:

- **Typed custom property adoption: audit → review → generate → validate → gate**

Create linked issues:

1. Establish official specification provenance.
2. Define versioned schema and diagnostics.
3. Enforce published core compatibility for web.
4. Model registration conflicts and ordering uncertainty.
5. Add audit HTML and pinned Ephemeral compatibility.
6. Add baselines, gates, and SARIF.
7. Retire `packages/vscode`.
8. Report animation opportunities.
9. Establish contributor/agent guardrails.

Each issue contains:

- Acceptance criteria with IDs.
- Gherkin scenarios or contract tables.
- Scope/non-scope.
- Specification/compatibility provenance.
- RED/GREEN evidence.
- Traceability table.
- Closure commands/evidence.

### Update

- #86: parser/dependency ADR; absorb #3.
- #87: JSON config/load roots; absorb #19.
- #123: conservative plans, sandbox-compatible HTML, decisions, apply.
- #129: evidence lookup API.
- #82: safe suggested edits.
- #22, #28, #32, #33, #80, #84, #106: add provenance and acceptance boundaries.
- #99/#100: common renderer, published-core boundary, Ephemeral contract.
- #2: horizon research only.

### Close with replacements

- #55, #88: maintained editor/adapters out of scope.
- #79, #81, #83, #85: Stylelint remains focused validation.
- #19: superseded by #87.
- #3: superseded by #86.
- #98: superseded by #123 and audit/report work.

The umbrella closes only after all linked traceability tables and release evidence are complete.

## Acceptance defaults

- Re-establish the current 123-test baseline before RED work.
- Define acceptance boundaries before tests.
- Every test traces to a criterion/scenario ID.
- Gherkin is used for observable workflows; contract tables for low-level invariants.
- Tests assert outcomes and contracts, not private implementation.
- Official W3C text is the sole semantic authority.
- Ephemeral’s pinned effective contract is the public-report authority.
- Selectable JSON/patch is the guaranteed export.
- Upload limits come from the pinned contract.
- Workspace builds never justify web deployment.
- Registry, specification, and compatibility uncertainty fail closed or remain review-only.
- Issue closure requires passing criteria, traceability, citations, docs, migration, and release verification.
