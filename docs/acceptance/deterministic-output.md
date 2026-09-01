# Deterministic output ordering acceptance boundaries

Audit JSON and every other canonical output surface are documented as deterministic. Ordering
is part of that contract, so the comparators that produce it must not depend on the host
environment.

## AC-ORDER-001 — Canonical output ordering is locale-independent

- **In scope:** Every sort comparator in published package sources (`packages/*/src`) orders by
  plain code-unit comparison; `localeCompare`, whose order varies with the host locale and ICU
  data, does not appear in product code.
- **Out of scope:** Changing which key a surface sorts by, user-facing collation choices in the
  web interface, and Unicode-normalization equivalence between differently encoded names.
- **Preconditions:** The `guardrails:determinism` gate (AC-GUARD-008) scans product package
  sources in addition to `scripts/`.
- **Observable result:** `check-determinism-rules` fails on any `localeCompare` comparator in
  `packages/*/src`, naming the file, line, and rule; identical inputs produce byte-identical
  ordering on every machine regardless of locale.
- **Uncertainty:** Code-unit ordering places all uppercase letters before lowercase; this is
  accepted as the canonical order because stability across environments outweighs
  natural-language collation in machine-readable output.
- **Provenance:** Product decision: audit JSON is deterministic and versioned; determinant PR #3
  review surfaced `localeCompare` as a recurring determinism defect.
- **Outcome:** Gating output-determinism contract.

## Traceability

| Criterion/scenario | Fixtures/tests                                      | Implementation                                                 | Documentation/specification |
| ------------------ | --------------------------------------------------- | -------------------------------------------------------------- | --------------------------- |
| AC-ORDER-001       | `guardrails:determinism` scan over `packages/*/src` | Sort comparators in `packages/{cli,core,report,stylelint}/src` | This document               |
