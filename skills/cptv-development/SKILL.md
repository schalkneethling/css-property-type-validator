---
name: cptv-development
description: Implement, review, or plan CSS Property Type Validator changes involving @property semantics, diagnostics, repository audits, generation, CLI/Stylelint/web behavior, reports, package releases, or agent workflows. Use for every change in this repository that can affect validation behavior, public contracts, filesystem inputs, published-consumer compatibility, or Ephemeral report delivery.
---

# CPTV Development

Follow an acceptance-first, specification-grounded workflow. Read [references/workflow.md](references/workflow.md) before changing behavior or public contracts.

## Workflow

1. Read `GOAL.md`, the relevant phase in `ROADMAP.md`, and the linked issue.
2. Define stable acceptance IDs before tests. State scope, non-scope, preconditions, observable result, uncertainty behavior, provenance, and gate status.
3. Read the exact official W3C normative section before changing `@property` semantics. Record the stable anchor. Treat libraries, MDN, Webref, WPT, and browsers only as supporting evidence.
4. Use Given/When/Then for workflows and a contract table for low-level invariants.
5. Add the smallest RED test for one accepted outcome. Confirm it fails for the intended reason.
6. Implement only that criterion. Keep ambiguous behavior skipped or review-required.
7. Refactor without broadening scope. Run compatible and uncertainty cases plus deterministic replay.
8. Complete criterion → test → implementation → documentation/specification traceability.
9. Run targeted checks, then the repository verification appropriate to the changed surfaces.

## Boundaries

- Keep core filesystem-free and browser-safe.
- Read project CSS only through the bounded project-context reader.
- Keep Stylelint a focused adapter; do not audit the repository per linted file.
- Do not expose web behavior from an unpublished core version.
- Treat the pinned Ephemeral Pages contract as public-report compatibility authority.
- Never infer `inherits` or `initial-value` without explicit policy or human review.
- Never turn advisory or uncertain evidence into a default failure.

## Review

Reject assumptions absent from official specifications or accepted product policy, private AST/layout coupling, unsupported cascade/DOM claims, workspace-only release proof, and report behavior that requires network, storage, forms, clipboard, or downloads.
