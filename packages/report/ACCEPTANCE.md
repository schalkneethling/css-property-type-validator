# Standalone report acceptance criteria

The renderer has no access to project files, network services, persistent storage, or unpublished
core APIs. It receives generic JSON and the checked-in Ephemeral Pages contract.

| ID            | In scope / observable result                                                                                                                                                                                                                                               | Out of scope                                                                      | Conservative behavior                                                                                            | Provenance                                                                                                                                          |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-REPORT-001 | A caller receives a deterministic, standalone HTML document with source-authored `<!doctype html>`, `<html>`, and `<head>`.                                                                                                                                                | Browser cascade simulation and report uploads.                                    | Reject an invalid delivery contract.                                                                             | `netlify/functions/html-validation.ts` at pinned contract commit.                                                                                   |
| AC-REPORT-002 | User-supplied analysis, decisions, and patches remain text and cannot terminate a script, textarea, or inject markup.                                                                                                                                                      | Sanitizing semantic CSS diagnostics.                                              | Escape all report text; do not render it as HTML.                                                                | Ephemeral uploaded-content security model; pinned HTML validator.                                                                                   |
| AC-REPORT-003 | A reviewer can always select decision JSON and a patch even if clipboard and downloads are blocked in the sandbox.                                                                                                                                                         | Guaranteed clipboard or file-download access.                                     | Focus/select the readonly output after failed clipboard access.                                                  | Pinned CSP and `sandbox allow-scripts` contract.                                                                                                    |
| AC-REPORT-004 | The report uses only inline scripts/styles/data, has no forms/base/objects/network assets, sets noindex, and emits a meta CSP equal to or stricter than service HTTP policy.                                                                                               | Replacing the service HTTP CSP.                                                   | Reject reports that violate structural preflight or raw size limit.                                              | `src/csp.ts` and `netlify/functions/pages.ts` at pinned commit.                                                                                     |
| AC-REPORT-005 | Under the service-effective HTTP CSP and `sandbox="allow-scripts"` viewer, a synthetic report renders offline without network, storage, navigation, forms, popups, or downloads; rejected clipboard access leaves decision JSON and patches selected in readonly controls. | Making clipboard, download, persistent storage, or same-origin access available.  | Selectable readonly text is the guaranteed export; do not depend on a blocked capability.                        | Pinned `src/csp.ts`, uploaded-content security model, and viewer sandbox in `compatibility/ephemeral-pages.json`.                                   |
| AC-REPORT-006 | Upload validation reports both the pinned raw-document and caller-measured Brotli-compressed byte limits.                                                                                                                                                                  | Compressing data in this browser-safe package or silently changing upload limits. | Reject values over either pinned limit and require the upload caller to provide an actual compressed byte count. | Pinned upload limits and upload implementation in `compatibility/ephemeral-pages.json`.                                                             |
| AC-REPORT-007 | A reviewer can make an explicit accept, reject, or review-required decision for each producer-supplied registration candidate; syntax, evidence, confidence, and specification provenance are visible offline.                                                             | Inferring CSS semantics in the report or accepting an unpublished core type.      | Keep the decision `review-required` until all producer-declared required fields are explicit.                    | Product decision: reports are generic JSON consumers; `@property` semantics remain producer-owned and must cite the official specification.         |
| AC-REPORT-008 | An accepted candidate requires an explicit syntax and `inherits` choice, plus an `initial-value` except when its selected producer-declared syntax alternative is universal. Only complete accepted candidates with a producer-supplied patch template produce patch text. | Guessing `inherits`, inventing an initial value, or applying a patch.             | Mark incomplete acceptance visibly review-required and omit that candidate's patch.                              | CSS Properties and Values API Level 1, §3.2 and §3.3; producer-provided provenance is displayed rather than reinterpreted by this generic renderer. |
| AC-REPORT-009 | Under the pinned HTTP CSP and sandbox, candidate interactions deterministically regenerate readonly selectable decision JSON and reviewable patch text without network, storage, forms, downloads, popups, or navigation.                                                  | Guaranteeing clipboard access or persisting decisions.                            | On clipboard rejection, select the unchanged readonly export; no interaction depends on a blocked capability.    | Pinned `src/csp.ts`, uploaded-content security model, and viewer sandbox in `compatibility/ephemeral-pages.json`.                                   |

## Gherkin scenarios

```gherkin
@AC-REPORT-003
Scenario: Export remains possible when clipboard access is denied
  Given a report has reviewed decision JSON and a patch
  And the Ephemeral viewer runs it in sandbox allow-scripts
  When clipboard access is unavailable or rejected
  Then the decision JSON and patch remain in readonly selectable controls
  And review completion does not require a download, form, popup, or network request

@AC-REPORT-004
Scenario: Report is delivered under the pinned Ephemeral policy
  Given the pinned service policy permits only sandboxed inline execution
  When a standalone report is rendered
  Then its meta CSP is no less restrictive than the service policy
  And the report contains no URL-bearing external asset or prohibited active-content element

@AC-REPORT-005
Scenario: Sandboxed review retains a selectable export after clipboard rejection
  Given a standalone report is served with the pinned effective HTTP CSP
  And it is loaded in an iframe sandboxed with allow-scripts
  And the browser is offline and clipboard access is unavailable
  When a reviewer requests a copy of decision JSON or the patch
  Then the corresponding readonly text is selected
  And no request, storage write, download, popup, navigation, form, or external asset is required

@AC-REPORT-006
Scenario: Upload size is checked against both pinned limits
  Given an upload caller measures the report's Brotli-compressed bytes
  When either raw or compressed bytes exceed the corresponding pinned limit
  Then validation rejects the report with the relevant limit
  And the renderer does not invent or duplicate a service upload limit

@AC-REPORT-007
Scenario: A reviewer records a conservative registration decision
  Given a generic report input supplies a registration candidate with evidence and provenance
  When a reviewer chooses accept, reject, or review-required
  Then the readonly decision JSON is regenerated deterministically
  And the report does not infer a CSS registration value or call a network service

@AC-REPORT-008
Scenario: An incomplete accepted candidate cannot produce a patch
  Given a candidate requires syntax, inherits, and an initial value
  When the reviewer selects accept but leaves one required value unset
  Then its decision is visibly review-required
  And its patch template produces no patch text
  When the reviewer makes every required value explicit
  Then the decision becomes ready
  And only the producer-supplied template is rendered as reviewable patch text

@AC-REPORT-009
Scenario: Review controls work in the Ephemeral sandbox
  Given a report is loaded under the pinned HTTP CSP in sandbox allow-scripts
  When a reviewer changes a candidate decision and clipboard access is denied
  Then the readonly JSON and patch reflect the decision without a request or persistent write
  And the attempted export selects the relevant readonly output
```

## Traceability

| Criterion/scenario | Fixtures/tests                                                          | Implementation                                                            | Contract/provenance                                                   |
| ------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| AC-REPORT-001      | `render.test.ts` deterministic/authored-document checks                 | `renderStandaloneReport`, `assertEphemeralContract`                       | `compatibility/ephemeral-pages.json`                                  |
| AC-REPORT-002      | `render.test.ts` injection check                                        | `escapeHtml`, `escapeJsonForScript`                                       | Pinned `html-validation.ts`                                           |
| AC-REPORT-003      | `render.test.ts` selectable-output/script check                         | `reportScript`, readonly textareas                                        | Pinned `csp.ts`                                                       |
| AC-REPORT-004      | `render.test.ts` structural preflight check                             | `buildReportMetaCsp`, `validateReportForEphemeral`                        | Pinned `csp.ts`, `pages.ts`                                           |
| AC-REPORT-005      | `test/e2e/sandbox.e2e.ts` synthetic sandbox/CSP scenarios; `TESTING.md` | `renderStandaloneReport`, `reportScript`                                  | Pinned `csp.ts`, uploaded-content model, viewer sandbox               |
| AC-REPORT-006      | `render.test.ts`, `test/e2e/sandbox.e2e.ts` raw/Brotli cases            | `validateReportForEphemeral`                                              | Pinned upload contract                                                |
| AC-REPORT-007      | `render.test.ts`, `test/e2e/sandbox.e2e.ts` candidate decision cases    | `StandaloneRegistrationReview`, `renderStandaloneReport`, report controls | Generic JSON package boundary; displayed producer provenance          |
| AC-REPORT-008      | `test/e2e/sandbox.e2e.ts` incomplete/complete acceptance case           | review state reducer and template renderer                                | CSS Properties and Values API Level 1 §3.2, §3.3; producer provenance |
| AC-REPORT-009      | `test/e2e/sandbox.e2e.ts` sandboxed interaction/copy fallback case      | inline report script and readonly exports                                 | Pinned `csp.ts` and viewer sandbox                                    |
