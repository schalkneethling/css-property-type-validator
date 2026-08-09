# Roadmap

The roadmap follows an acceptance-driven red/green loop. Each slice defines stable criteria, scope, observable outcomes, uncertainty behavior, and specification provenance before its first failing test.

## Phase 0 — Foundations and Retirement

- Store the approved implementation plan and align project documentation.
- Catalog official specification provenance for every semantic rule and tool policy.
- Isolate `css-tree` behind a parser facade and publish a dependency decision record.
- Separate future workspace integration from published-package web compatibility.
- Retire `packages/vscode` and remove its active CI, dependency, and release integration.
- Establish acceptance templates, traceability, and contributor/agent guidance.

## Phase 1 — Contracts and Safe Project Context

- Add the versioned analysis envelope and stable diagnostic catalog.
- Add non-executable project configuration and entry-point/load-root inputs.
- Add a private Node project-context package with bounded reads and deterministic resolution.
- Share project loading between CLI and Stylelint without exposing it to core or web.
- Validate packed and published package boundaries.

## Phase 2 — Repository Audit

- Build an entry-point-aware graph of registrations, definitions, aliases, references, fallbacks, and consumers.
- Report identical duplicates, conflicting registrations, and ordering uncertainty.
- Report separate registration, assignment, usage, fallback, inference, and skip coverage.
- Emit canonical deterministic audit JSON.

## Phase 3 — Human Review Report

- Emit a self-contained interactive HTML report from the same JSON contract.
- Pin and test the Ephemeral Pages CSP, sandbox, validator, headers, and upload limits.
- Guarantee selectable JSON and patch exports when clipboard/download are blocked.
- Add sanitized CI artifacts, drift checks, and a synthetic live canary.

## Phase 4 — Conservative Registration Planning

- Replace implicit generation with evidence-based candidates and explicit decisions.
- Infer only spec-valid syntax and label project policy separately from normative behavior.
- Require policy or human review for `inherits` and `initial-value`.
- Apply only accepted, non-stale edits.

## Phase 5 — Deeper Assurance

- Validate aliases and assignment fallbacks where reachability can be proven.
- Improve consuming-property compatibility without broadening uncertain failures.
- Model conflicts consistently across entry points.
- Report typed custom-property animation opportunities as advisory findings.

## Phase 6 — Incremental CI

- Add stable baselines, new-only gates, stale-entry reporting, and coverage non-regression.
- Add SARIF 2.1.0 with related locations and safe fixes.
- Preserve stable exit codes: pass, gate failure, and configuration/I/O failure.

## Phase 7 — Integration and Release

- Stabilize Stylelint against the shared contracts and caches.
- Require the web application to build from an exact published core version before deployment.
- Add package consumption, report compatibility, release rehearsal, and recovery checks.
- Publish core, CLI, and Stylelint in dependency order with verified artifacts.

## Horizon

- Track future CSS mixin/function work only where it strengthens typed custom property adoption.
- Encourage external adapters and editor integrations without taking on their maintenance.
