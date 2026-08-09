# Specification provenance policy

CSS Property Type Validator treats official W3C specification text as the sole authority for
semantic claims about `@property`. Library behavior, MDN, Web Platform Tests, and browser behavior
can reveal implementation differences, but cannot independently define a validator rule.

The active baseline is the W3C Working Draft of **CSS Properties and Values API Level 1 published
26 March 2024**. Catalog references use its dated URL so a core result remains auditable if the
latest published document later changes.

Provenance classifications mean:

- `normative`: the diagnostic reports behavior required by cited normative specification text.
- `tool-policy`: the behavior is a conservative project decision built on cited CSS semantics,
  but the specification does not require the validator's conclusion.
- `advisory`: the result describes an opportunity or review prompt and must not be presented as a
  conformance failure.

Every diagnostic reason and generator policy must have a catalog entry before its implementation
can merge. A new or changed semantic rule starts by reading the official specification, recording
the exact dated anchor, defining an acceptance criterion, and adding a test that traces to it.

The generator remains experimental. Its current `inherits: true` output and selection of the first
observed computationally independent initial value are legacy tool policies, not deductions from
CSS. Their catalog entries make that limitation explicit until conservative planning replaces
implicit generation.

When the specification does not support a definite conclusion—or the validator lacks enough
cascade, DOM, or import context—the implementation must skip the case or return a review item. It
must not promote uncertainty to a normative error.
