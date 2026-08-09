# Development Workflow Reference

## Acceptance record

For each criterion capture:

| Field             | Required content                                                    |
| ----------------- | ------------------------------------------------------------------- |
| ID                | Stable `AC-AREA-NNN` identifier                                     |
| In scope          | One externally meaningful outcome                                   |
| Out of scope      | Adjacent behavior this slice will not implement                     |
| Preconditions     | Inputs, configuration, state, and published versions                |
| Observable result | Output, diagnostic, report behavior, exit code, or safe failure     |
| Uncertainty       | Skip or review behavior when proof is insufficient                  |
| Provenance        | Official specification anchor or accepted product/security contract |
| Gate              | Gating, advisory, or review-required                                |

## Verification order

1. Run the targeted RED test and record the intended failure.
2. Run the targeted GREEN test.
3. Run the package test and typecheck/build.
4. Run deterministic serializers twice where applicable.
5. Run `pnpm run format:check`, `pnpm run lint`, `pnpm run typecheck`, `pnpm test`, and `pnpm run build`.
6. Run supported-syntax, published-web, report-contract, Playwright, package, or release checks when their surfaces changed.

## Specification record

Use the published CSS Properties and Values API Level 1 as the default profile. Cite exact anchors such as `#at-property-rule`, `#syntax-descriptor`, `#inherits-descriptor`, `#initial-value-descriptor`, and `#supported-syntax-strings`. If the normative text does not establish the claimed behavior, do not implement a definitive diagnostic.

## Handoff

Report acceptance IDs completed, tests run, schema/public changes, specification references, uncertain cases preserved, package/report boundaries checked, and any follow-up criterion opened rather than silently included.
