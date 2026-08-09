# Release-boundary acceptance criteria

## AC-RELEASE-001 — Packed public packages are independently installable

- **In scope:** Pack core, CLI, and Stylelint into a temporary directory; reject workspace protocols, private runtime packages, missing declared entry points, or undeclared packed files.
- **Out of scope:** Publishing packages or proving npm registry availability.
- **Preconditions:** All packages have been built from the reviewed source tree.
- **Observable result:** `release:pack-check` succeeds only for self-contained publishable tarballs and records their names.
- **Uncertainty:** Any unreadable manifest or ambiguous runtime dependency fails closed.
- **Provenance:** Product release decision; no CSS semantic claim.
- **Outcome:** Gating.

## AC-RELEASE-002 — A clean consumer can execute packed exports

- **In scope:** Install locally packed artifacts in a temporary project and import public library/plugin exports and execute CLI help.
- **Out of scope:** Treating a workspace build as evidence that a web feature may deploy.
- **Preconditions:** `AC-RELEASE-001` passes.
- **Observable result:** `release:consume-local` proves declared exports without workspace resolution.
- **Uncertainty:** Installation or execution failure fails closed with exit code 2.
- **Provenance:** Published-consumer integrity product decision.
- **Outcome:** Gating.

## AC-RELEASE-003 — Web deployment uses an exact published core

- **In scope:** Reject workspace ranges, source aliases, deep imports, registry errors, and unavailable exact core versions; build from an isolated install.
- **Out of scope:** Deploying a future-integration workspace artifact.
- **Preconditions:** The required core version has been published.
- **Observable result:** Only `web:check-published-core` produces deployment evidence.
- **Uncertainty:** Registry uncertainty fails closed and produces no deployable artifact.
- **Provenance:** Published-consumer integrity product decision.
- **Outcome:** Gating.

## AC-RELEASE-004 — Public audit publication is optional and sanitized

- **In scope:** CI always creates a source-redacted standalone HTML audit artifact; a separate
  same-repository pull-request workflow may publish that exact artifact through a commit-pinned
  Ephemeral Pages action only when the repository opt-in variable is enabled.
- **Out of scope:** Publishing source-bearing reports, publishing reports from forked pull
  requests, or making Ephemeral Pages availability a prerequisite for audit generation.
- **Preconditions:** Public report output passes the pinned Ephemeral compatibility contract and
  the CLI's `--redact-source` contract.
- **Observable result:** ordinary CI retains a private downloadable artifact; the optional public
  workflow builds the same sanitized report before upload and cannot run for forks or without the
  explicit opt-in.
- **Uncertainty:** report generation, compatibility validation, or action availability failure
  produces no public report; it never falls back to an unredacted document.
- **Provenance:** Product privacy and delivery decision; pinned Ephemeral Pages compatibility
  manifest and action commit.
- **Outcome:** Gating privacy/release contract for the optional workflow.

## Gherkin scenarios

```gherkin
Scenario: Private project context is absent from a packed runtime dependency graph
  Given the CLI and Stylelint use project-context source while developing
  When their publishable tarballs are inspected and installed outside the workspace
  Then neither package requires an unpublished project-context package
  And their declared entry points execute successfully
```

```gherkin
Scenario: Web requires an unpublished core capability
  Given web pins an exact core version unavailable from npm
  When the published-consumer check runs
  Then the check fails closed
  And no deployable artifact is produced
```

```gherkin
Scenario: A pull request has not opted into public audit publication
  Given CI generated a source-redacted standalone audit artifact
  And the Ephemeral publication repository variable is not enabled
  When the pull-request workflows run
  Then the ordinary CI artifact remains available
  And no report is uploaded to a public service
```

## Traceability

| Criterion/scenario | Fixtures/tests                                  | Implementation                                                                   | Documentation/specification              |
| ------------------ | ----------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------- |
| AC-RELEASE-001     | Temporary packed tarball inspection             | `scripts/check-packed-packages.mjs`                                              | This document; `RELEASING.md`            |
| AC-RELEASE-002     | Temporary clean consumer                        | `scripts/check-packed-packages.mjs --consume`                                    | This document; `RELEASING.md`            |
| AC-RELEASE-003     | Exact/unavailable/source-alias checks           | `scripts/check-web-published-core.mjs`, `scripts/check-web-release-boundary.mjs` | This document; `RELEASING.md`            |
| AC-RELEASE-004     | `scripts/test/release-report-workflow.test.mjs` | `scripts/create-ci-audit-report.mjs`, CI and optional Ephemeral workflow         | This document; pinned Ephemeral contract |
