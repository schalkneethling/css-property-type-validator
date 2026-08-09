# Adoption platform architecture

The maintained product flow is:

**audit → review → generate → validate → gate**

## Responsibility boundaries

| Surface           | Owns                                                                                                                                              | Does not own                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Core              | Browser-safe parsing, versioned analysis, inventories, provenance, conservative plans, validation, evidence, coverage, and structured uncertainty | Filesystems, globbing, package publication checks, CI policy, editor UI, or a simulated browser cascade/DOM |
| Project context   | Private Node-only configuration discovery, roots, deterministic globs/import resolution, caches, fingerprints, and bounded reads                  | CSS semantics, public runtime installation, browser use, or repository diagnostics                          |
| CLI               | Repository orchestration, audit/report formats, reviewed plan application, baselines, coverage gates, SARIF, stable exits, and CI integration     | Inventing semantic findings, fuzzy edits, or exposing private packages at runtime                           |
| Stylelint         | Validation of the one Stylelint-owned source plus explicitly configured/imported context                                                          | Repository scans, audits, generation, application, baselines, or CI-wide coverage                           |
| Web               | Local validation and learning workflows available from its exact published core dependency                                                        | Workspace-only capabilities, deployment from an unpublished core, repository I/O, or editor integration     |
| Standalone report | Offline human review of canonical JSON, with selectable decision and patch exports under the pinned Ephemeral sandbox                             | Network access, storage, forms, downloads as a requirement, or semantic analysis                            |

JSON is the canonical machine and agent contract. Human text, SARIF (Static Analysis Results Interchange Format), and standalone HTML are delivery views of that contract. Consumers that need automation should use JSON or SARIF; consumers that need portable review may use the single-file HTML report. This avoids making a browser document the only way to exchange evidence or decisions.

## Entry points and uncertainty

Repository audits model each configured entry point independently. Exact import occurrences and supplied resolved edges establish reachability and source-order evidence. Multiple independent entry points, missing/conditional/external imports, cycles, and incomplete inputs produce structured repository uncertainty. They never authorize a claim about the registration that wins in a browser for a particular document.

## Release boundary

Workspace builds are future-integration evidence only. The deployable web artifact is built and tested in an isolated temporary project from the exact core version available on npm, records that version and its registry integrity, and rejects workspace links, aliases, deep imports, overrides, or registry uncertainty.

Private project-context and report code is bundled into the CLI/Stylelint artifacts that need it. Clean-package checks reject an unpublished private runtime dependency.
