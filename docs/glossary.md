# Glossary

## SARIF

SARIF stands for **Static Analysis Results Interchange Format**. CSS Property Type Validator emits SARIF 2.1.0 so CI systems and code-hosting platforms can consume stable diagnostics, exact locations, related evidence, and safe suggested fixes without parsing terminal text.

SARIF is a delivery format, not a source of CSS semantics. Every semantic result retains the validator's official W3C specification provenance and confidence classification.

## Review-required

Static evidence is useful, but the project cannot make the semantic decision safely. Review-required findings never gate by default and never silently choose `inherits`, `initial-value`, cascade order, or DOM-dependent behavior.

## Tool policy

A documented validator or project decision that is not itself a normative browser rule. Tool-policy findings are labelled separately from normative diagnostics.
