---
name: Adoption platform slice
about: Define an acceptance-driven implementation slice
title: ""
labels: enhancement
assignees: ""
---

## Outcome

Describe the real product or feature outcome.

## Acceptance criteria

| ID          | In scope | Out of scope | Preconditions | Observable result | Uncertainty behavior | Provenance | Gate |
| ----------- | -------- | ------------ | ------------- | ----------------- | -------------------- | ---------- | ---- |
| AC-AREA-001 |          |              |               |                   |                      |            |      |

## Scenarios

Use Given/When/Then for workflows, configuration/state, CLI/CI outcomes, report interaction, and recovery. Use a concise contract table for low-level invariants.

## RED evidence

Record the one unmet criterion, targeted command, and intended failure reason.

## GREEN evidence

Record the narrow implementation and targeted passing command.

## Overreach review

- [ ] No assumption absent from official specifications or an explicit product decision.
- [ ] No unsupported global cascade/DOM behavior.
- [ ] No private AST/layout coupling.
- [ ] Advisory or uncertain findings remain non-gating.
- [ ] No unpublished package or blocked sandbox capability is assumed.

## Traceability

| Criterion/scenario | Fixtures/tests | Implementation | Documentation/specification |
| ------------------ | -------------- | -------------- | --------------------------- |
|                    |                |                |                             |

## Closure

- [ ] All criteria and scenarios pass.
- [ ] Compatible and conservative uncertainty cases pass.
- [ ] Traceability is complete.
- [ ] Documentation, migration, and provenance are current.
- [ ] Full relevant verification passes.
