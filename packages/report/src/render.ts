import { assertEphemeralContract, buildReportMetaCsp } from "./contract.js";

import type {
  EphemeralPagesContract,
  JsonValue,
  RegistrationReviewCandidate,
  ReportContractValidation,
  StandaloneReport,
  StandaloneReportInput,
} from "./types.js";

const REPORT_STYLE = `
:root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, sans-serif; }
body { margin: 0; background: Canvas; color: CanvasText; }
main { max-width: 76rem; margin: auto; padding: 2rem 1rem 4rem; }
h1 { margin-bottom: .25rem; } .meta { color: GrayText; margin-top: 0; }
section { border: 1px solid color-mix(in srgb, CanvasText 20%, transparent); border-radius: .5rem; margin: 1rem 0; padding: 1rem; }
details > summary { cursor: pointer; font-weight: 700; }
pre, textarea, input, select { box-sizing: border-box; width: 100%; background: color-mix(in srgb, CanvasText 6%, Canvas); border: 1px solid color-mix(in srgb, CanvasText 22%, transparent); border-radius: .25rem; color: inherit; font: .875rem/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; padding: .75rem; white-space: pre-wrap; }
textarea { min-height: 12rem; resize: vertical; } button { font: inherit; padding: .4rem .7rem; } .actions { display: flex; flex-wrap: wrap; gap: .5rem; margin: .5rem 0; }
fieldset { border: 0; margin: 1rem 0; padding: 0; } legend, label { display: block; font-weight: 700; margin-bottom: .35rem; } .candidate { border-left: .35rem solid color-mix(in srgb, CanvasText 36%, transparent); } .candidate h3 { margin-top: 0; } .choice[aria-pressed="true"] { outline: .2rem solid Highlight; outline-offset: .1rem; } .status { font-weight: 700; } .status[data-state="ready"] { color: color-mix(in srgb, CanvasText 88%, Highlight); } .status[data-state="review-required"] { color: color-mix(in srgb, CanvasText 75%, orange); } .hint { color: GrayText; } code { overflow-wrap: anywhere; }
`;

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!isJsonObject(value)) return value;

  return Object.fromEntries(
    Object.keys(value)
      .sort((left, right) => left.localeCompare(right))
      .map((key) => [key, sortJson(value[key]!)]),
  );
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value), null, 2) ?? "null";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeJsonForScript(value: string): string {
  return value
    .replaceAll("<", "\\u003C")
    .replaceAll(">", "\\u003E")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

function renderJsonEvidence(value: JsonValue | undefined): string {
  if (value === undefined) return "";
  return `<pre>${escapeHtml(stableJson(value))}</pre>`;
}

function renderCandidate(candidate: RegistrationReviewCandidate, index: number): string {
  const title =
    candidate.title?.trim() || candidate.propertyName?.trim() || `Candidate ${index + 1}`;
  const alternatives = candidate.syntaxAlternatives
    .map(
      (alternative, alternativeIndex) =>
        `<option value="${alternativeIndex}">${escapeHtml(alternative.syntax)}</option>`,
    )
    .join("");
  const customSyntax = candidate.allowCustomSyntax
    ? '<option value="custom">Enter a different syntax…</option>'
    : "";
  const references = candidate.specReferences?.length
    ? `<details><summary>Specification provenance</summary><ul>${candidate.specReferences
        .map((reference) => `<li><code>${escapeHtml(reference)}</code></li>`)
        .join("")}</ul></details>`
    : "";
  const evidence =
    candidate.evidence === undefined
      ? ""
      : `<details><summary>Evidence</summary>${renderJsonEvidence(candidate.evidence)}</details>`;
  const confidence =
    candidate.confidence === undefined
      ? ""
      : `<details><summary>Confidence</summary>${renderJsonEvidence(candidate.confidence)}</details>`;

  return [
    `  <section class="candidate" data-cptv-candidate="${index}">`,
    `    <h3>${escapeHtml(title)}</h3>`,
    candidate.propertyName ? `    <p><code>${escapeHtml(candidate.propertyName)}</code></p>` : "",
    '    <fieldset><legend>Decision</legend><div class="actions">',
    '      <button type="button" class="choice" data-cptv-decision="accept" aria-pressed="false">Accept</button>',
    '      <button type="button" class="choice" data-cptv-decision="reject" aria-pressed="false">Reject</button>',
    '      <button type="button" class="choice" data-cptv-decision="review" aria-pressed="true">Review required</button>',
    "    </div></fieldset>",
    `    <label for="cptv-syntax-${index}">Syntax</label>`,
    `    <select id="cptv-syntax-${index}" data-cptv-syntax><option value="">Choose a syntax…</option>${alternatives}${customSyntax}</select>`,
    candidate.allowCustomSyntax
      ? `    <label for="cptv-custom-syntax-${index}">Custom syntax</label><input id="cptv-custom-syntax-${index}" data-cptv-custom-syntax type="text" autocomplete="off" disabled>`
      : "",
    candidate.requiresInherits
      ? [
          '    <fieldset><legend>Inherits</legend><div class="actions">',
          '      <button type="button" class="choice" data-cptv-inherits="true" aria-pressed="false">True</button>',
          '      <button type="button" class="choice" data-cptv-inherits="false" aria-pressed="false">False</button>',
          "    </div></fieldset>",
        ].join("\n")
      : '    <p class="hint">No explicit inherits decision is required by this candidate.</p>',
    candidate.requiresInitialValue
      ? `    <label for="cptv-initial-value-${index}">Initial value</label><input id="cptv-initial-value-${index}" data-cptv-initial-value type="text" autocomplete="off"><p class="hint" data-cptv-initial-hint>An initial value is required until a producer-declared universal syntax is selected.</p>`
      : '    <p class="hint">No initial value is required by this candidate.</p>',
    `    <p class="status" data-cptv-status data-state="review-required" aria-live="polite">Review required.</p>`,
    evidence,
    confidence,
    references,
    "  </section>",
  ]
    .filter(Boolean)
    .join("\n");
}

function reportScript(): string {
  return `
(() => {
  const dataElement = document.getElementById("cptv-report-data");
  const payload = dataElement ? JSON.parse(dataElement.textContent || "{}") : {};
  const review = payload.registrationReview;

  const sortJson = (value) => {
    if (Array.isArray(value)) return value.map(sortJson);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortJson(value[key])]));
    }
    return value;
  };
  const stableJson = (value) => JSON.stringify(sortJson(value), null, 2);

  const selectOutput = (id) => {
    const output = document.getElementById(id);
    if (!output) return;
    output.focus();
    output.select();
  };

  const copyOutput = async (id) => {
    const output = document.getElementById(id);
    if (!output) return;
    selectOutput(id);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(output.value);
      }
    } catch (_) {
      selectOutput(id);
    }
  };

  const setPressedChoice = (container, selector, button) => {
    container.querySelectorAll(selector).forEach((candidate) => candidate.setAttribute("aria-pressed", "false"));
    button.setAttribute("aria-pressed", "true");
  };

  const selectedPressedValue = (container, selector, attribute) => {
    const selected = container.querySelector(selector + '[aria-pressed="true"]');
    return selected ? selected.getAttribute(attribute) : null;
  };

  const renderTemplate = (template, decision) => template
    .replaceAll("{syntax}", decision.syntax ? decision.syntax.value : "")
    .replaceAll("{inherits}", decision.inherits === null ? "" : String(decision.inherits))
    .replaceAll("{initialValue}", decision.initialValue || "")
    .replaceAll("{initialValueDeclaration}", decision.initialValue ? "initial-value: " + decision.initialValue + ";" : "");

  const readCandidate = (element, model, index) => {
    const decision = selectedPressedValue(element, "[data-cptv-decision]", "data-cptv-decision") || "review";
    const select = element.querySelector("[data-cptv-syntax]");
    const customInput = element.querySelector("[data-cptv-custom-syntax]");
    const selectedAlternative = select && select.value !== "" && select.value !== "custom"
      ? model.syntaxAlternatives[Number(select.value)]
      : null;
    const customSyntax = select && select.value === "custom" && customInput ? customInput.value.trim() : "";
    const syntax = selectedAlternative
      ? { alternativeId: selectedAlternative.id, source: "alternative", value: selectedAlternative.syntax }
      : customSyntax ? { alternativeId: null, source: "custom", value: customSyntax } : null;
    const inheritsValue = selectedPressedValue(element, "[data-cptv-inherits]", "data-cptv-inherits");
    const inherits = inheritsValue === "true" ? true : inheritsValue === "false" ? false : null;
    const initialInput = element.querySelector("[data-cptv-initial-value]");
    const initialValue = initialInput && !initialInput.disabled && initialInput.value.trim()
      ? initialInput.value.trim()
      : null;
    const initialRequired = Boolean(model.requiresInitialValue) && !Boolean(selectedAlternative && selectedAlternative.isUniversalSyntax);
    const missing = [];
    if (decision === "accept") {
      if (!syntax) missing.push("syntax");
      if (model.requiresInherits && inherits === null) missing.push("inherits");
      if (initialRequired && !initialValue) missing.push("initial-value");
    }
    const status = decision === "review" || (decision === "accept" && missing.length > 0)
      ? "review-required"
      : "ready";
    const result = {
      decision,
      id: model.id,
      inherits,
      initialValue,
      missing,
      status,
      syntax,
    };
    const statusElement = element.querySelector("[data-cptv-status]");
    if (statusElement) {
      statusElement.setAttribute("data-state", status);
      statusElement.textContent = status === "review-required"
        ? "Review required: explicitly choose " + missing.join(", ") + "."
        : decision === "accept" ? "Ready for reviewable patch generation." : "Recorded without a patch.";
    }
    return result;
  };

  const updateReview = () => {
    if (!review || !Array.isArray(review.candidates)) return;
    const decisions = Array.from(document.querySelectorAll("[data-cptv-candidate]")).map((element) => {
      const index = Number(element.getAttribute("data-cptv-candidate"));
      return readCandidate(element, review.candidates[index], index);
    });
    const decisionOutput = document.getElementById("cptv-decision-json");
    if (decisionOutput) {
      decisionOutput.value = stableJson({ candidates: decisions, schemaVersion: review.schemaVersion });
    }
    const patches = decisions.map((decision, index) => {
      const model = review.candidates[index];
      return decision.decision === "accept" && decision.status === "ready" && model.patchTemplate
        ? renderTemplate(model.patchTemplate, decision)
        : "";
    }).filter(Boolean);
    const patchOutput = document.getElementById("cptv-patch");
    if (patchOutput) patchOutput.value = patches.join("\\n\\n");
  };

  document.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const candidate = target.closest("[data-cptv-candidate]");
    if (!candidate) return;
    if (target.matches("[data-cptv-syntax]")) {
      const customInput = candidate.querySelector("[data-cptv-custom-syntax]");
      if (customInput) customInput.disabled = target.value !== "custom";
      const index = Number(candidate.getAttribute("data-cptv-candidate"));
      const alternative = target.value !== "" && target.value !== "custom"
        ? review.candidates[index].syntaxAlternatives[Number(target.value)]
        : null;
      const initialInput = candidate.querySelector("[data-cptv-initial-value]");
      const initialHint = candidate.querySelector("[data-cptv-initial-hint]");
      if (initialInput) initialInput.disabled = Boolean(alternative && alternative.isUniversalSyntax);
      if (initialHint) initialHint.textContent = alternative && alternative.isUniversalSyntax
        ? "A producer-declared universal syntax does not require an initial value."
        : "An initial value is required until a producer-declared universal syntax is selected.";
    }
    updateReview();
  });

  document.addEventListener("input", (event) => {
    const target = event.target;
    if (target instanceof Element && target.closest("[data-cptv-candidate]")) updateReview();
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const candidate = target.closest("[data-cptv-candidate]");
    const decisionButton = target.closest("[data-cptv-decision]");
    if (candidate && decisionButton) {
      setPressedChoice(candidate, "[data-cptv-decision]", decisionButton);
      updateReview();
      return;
    }
    const inheritsButton = target.closest("[data-cptv-inherits]");
    if (candidate && inheritsButton) {
      setPressedChoice(candidate, "[data-cptv-inherits]", inheritsButton);
      updateReview();
      return;
    }
    const selected = target.closest("[data-cptv-select]");
    if (selected) selectOutput(selected.getAttribute("data-cptv-select"));
    const copied = target.closest("[data-cptv-copy]");
    if (copied) void copyOutput(copied.getAttribute("data-cptv-copy"));
  });

  updateReview();
})();`;
}

/**
 * Renders a fully self-contained report. It has no filesystem, network, storage, or unpublished
 * core dependency; callers supply generic JSON plus the pinned Ephemeral contract.
 */
export function renderStandaloneReport(
  input: StandaloneReportInput,
  contract: EphemeralPagesContract,
): StandaloneReport {
  assertEphemeralContract(contract);

  const title = input.title?.trim() || "CSS Property Type Validator audit";
  const analysis = stableJson(input.analysis);
  const decisions = stableJson(
    input.registrationReview
      ? {
          candidates: input.registrationReview.candidates.map((candidate) => ({
            decision: "review",
            id: candidate.id,
            inherits: null,
            initialValue: null,
            missing: [],
            status: "review-required",
            syntax: null,
          })),
          schemaVersion: input.registrationReview.schemaVersion,
        }
      : (input.decisionJson ?? {}),
  );
  const patch = input.registrationReview ? "" : (input.patch ?? "");
  const metaCsp = buildReportMetaCsp(contract);
  const candidateSections =
    input.registrationReview?.candidates.map(renderCandidate).join("\n") ?? "";

  const html = [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    '  <meta name="robots" content="noindex,nofollow,noarchive">',
    `  <meta http-equiv="Content-Security-Policy" content="${escapeHtml(metaCsp)}">`,
    `  <meta name="cptv-ephemeral-contract" content="${escapeHtml(`${contract.compatibilityVersion}:${contract.upstream.commit}`)}">`,
    `  <title>${escapeHtml(title)}</title>`,
    `  <style>${REPORT_STYLE}</style>`,
    "</head>",
    "<body>",
    "<main>",
    `  <h1>${escapeHtml(title)}</h1>`,
    `  <p class="meta">Offline report · Ephemeral Pages contract ${escapeHtml(contract.compatibilityVersion)}</p>`,
    "  <section>",
    "    <h2>Review decisions</h2>",
    "    <p>Copying and downloading are optional. The editable-looking fields below are readonly and always selectable.</p>",
    '    <div class="actions"><button type="button" data-cptv-select="cptv-decision-json">Select decision JSON</button><button type="button" data-cptv-copy="cptv-decision-json">Copy decision JSON</button></div>',
    `    <textarea id="cptv-decision-json" readonly aria-label="Decision JSON">${escapeHtml(decisions)}</textarea>`,
    '    <div class="actions"><button type="button" data-cptv-select="cptv-patch">Select patch</button><button type="button" data-cptv-copy="cptv-patch">Copy patch</button></div>',
    `    <textarea id="cptv-patch" readonly aria-label="Unified patch">${escapeHtml(patch)}</textarea>`,
    "  </section>",
    candidateSections
      ? [
          "  <section>",
          "    <h2>Registration candidates</h2>",
          "    <p>Accepting a candidate never changes files. A complete decision produces only reviewable patch text.</p>",
          candidateSections,
          "  </section>",
        ].join("\n")
      : "",
    "  <section>",
    "    <details open>",
    "      <summary>Analysis JSON</summary>",
    `      <pre>${escapeHtml(analysis)}</pre>`,
    "    </details>",
    "  </section>",
    "</main>",
    `<script id="cptv-report-data" type="application/json">${escapeJsonForScript(stableJson({ analysis: input.analysis, decisions: input.decisionJson ?? {}, patch, registrationReview: input.registrationReview ?? null }))}</script>`,
    `<script>${reportScript()}</script>`,
    "</body>",
    "</html>",
  ].join("\n");

  const rawBytes = new TextEncoder().encode(html).byteLength;
  if (rawBytes > contract.delivery.uploadLimits.rawHtmlBytes) {
    throw new Error(
      `Report is ${rawBytes} bytes, exceeding the pinned Ephemeral raw HTML limit of ${contract.delivery.uploadLimits.rawHtmlBytes} bytes.`,
    );
  }

  return {
    html,
    metaCsp,
    rawBytes,
    contract: {
      compatibilityVersion: contract.compatibilityVersion,
      upstream: contract.upstream,
    },
  };
}

/** A lightweight structural preflight; the caller performs Brotli validation before upload. */
export function validateReportForEphemeral(
  html: string,
  contract: EphemeralPagesContract,
): ReportContractValidation {
  assertEphemeralContract(contract);
  const problems: string[] = [];
  const rawBytes = new TextEncoder().encode(html).byteLength;

  if (!/^<!doctype html>\s*<html\b/i.test(html)) {
    problems.push("Report must contain a source-authored doctype and html element.");
  }
  if (!/<head\b/i.test(html)) {
    problems.push("Report must contain a source-authored head element.");
  }
  if (!/<meta\s+name=["']robots["']\s+content=["']noindex,nofollow,noarchive["']/i.test(html)) {
    problems.push("Report must opt out of indexing.");
  }
  if (/<(?:form|base|object|embed|iframe)\b/i.test(html)) {
    problems.push("Report contains an element prohibited by the Ephemeral delivery contract.");
  }
  if (/<(?:script|link|img|audio|video|source)\b[^>]*(?:src|href)\s*=/i.test(html)) {
    problems.push("Report contains an external or URL-bearing asset.");
  }
  if (rawBytes > contract.delivery.uploadLimits.rawHtmlBytes) {
    problems.push("Report exceeds the pinned Ephemeral raw HTML upload limit.");
  }

  const metaCsp = buildReportMetaCsp(contract);
  if (!html.includes(`Content-Security-Policy" content="${metaCsp}`)) {
    problems.push("Report meta CSP is missing or does not match the pinned strict policy.");
  }

  return {
    ok: problems.length === 0,
    problems,
    rawBytes,
    rawLimitBytes: contract.delivery.uploadLimits.rawHtmlBytes,
  };
}

/**
 * Checks an upload caller's actual Brotli measurement against the pinned contract. Compression is
 * intentionally outside this browser-safe package: a report must not rely on a Node codec, nor
 * guess what the delivery service will receive.
 */
export function validateCompressedReportForEphemeral(
  html: string,
  brotliCompressedBytes: number,
  contract: EphemeralPagesContract,
): ReportContractValidation {
  const validation = validateReportForEphemeral(html, contract);
  const problems = [...validation.problems];

  if (!Number.isSafeInteger(brotliCompressedBytes) || brotliCompressedBytes < 0) {
    problems.push("Report Brotli-compressed byte count must be a non-negative safe integer.");
  } else if (brotliCompressedBytes > contract.delivery.uploadLimits.brotliCompressedHtmlBytes) {
    problems.push("Report exceeds the pinned Ephemeral Brotli-compressed HTML upload limit.");
  }

  return {
    ...validation,
    ok: problems.length === 0,
    problems,
    brotliCompressedBytes,
    brotliCompressedLimitBytes: contract.delivery.uploadLimits.brotliCompressedHtmlBytes,
  };
}
