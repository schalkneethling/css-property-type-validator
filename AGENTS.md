# Repository Agent Guidance

## Acceptance before implementation

Define stable acceptance criteria before adding a failing test. Use Given/When/Then for observable workflows and contract tables for low-level invariants. Tag every test with its criterion ID and assert public behavior, normative CSS behavior, or a documented safety/compatibility invariant.

RED proves exactly one accepted outcome for the intended reason. GREEN implements only that criterion. Refactoring must not broaden it. Complete criterion → test → implementation → documentation/specification traceability before closing work.

## Specification authority

Before changing any `@property` semantic behavior, read the exact normative section in the official W3C specification and record its stable anchor. Libraries, MDN, Webref, WPT, examples, and browsers are supporting evidence only. When normative behavior is ambiguous, skip or require review.

## Package boundaries

- Keep core filesystem-free and browser-safe.
- Put Node project discovery and bounded reads in the private project-context package.
- Keep Stylelint a focused adapter; do not run repository audits per file.
- Do not let web consume workspace-only or unpublished core APIs.
- Treat the pinned Ephemeral Pages contract as authoritative for public report compatibility.

## Filesystem safety

Stat and reject oversized/non-regular/out-of-root inputs before reading. Retain a post-read byte check. Use the shared project-context reader for every direct or imported CSS file.

## Verification

Run targeted tests after RED and GREEN, then formatting, linting, type checking, all tests, builds, supported-syntax checks, package boundary checks, and relevant browser/report tests. Review snapshot and generated-contract changes semantically.
