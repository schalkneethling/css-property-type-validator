import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  buildReportMetaCsp,
  renderStandaloneReport,
  validateCompressedReportForEphemeral,
  validateReportForEphemeral,
} from "../src/index.js";

import type { EphemeralPagesContract } from "../src/index.js";

const contract = JSON.parse(
  readFileSync(new URL("../../../compatibility/ephemeral-pages.json", import.meta.url), "utf8"),
) as EphemeralPagesContract;

const input = {
  title: "Repository adoption audit",
  analysis: {
    diagnostics: [{ code: "CPTV_REG_001", message: "Registration needs review" }],
    summary: { errors: 1 },
  },
  decisionJson: { accepted: ["CPTV_REG_001"] },
  patch: "--- a/tokens.css\n+++ b/tokens.css\n",
} as const;

describe("standalone report renderer", () => {
  it("[AC-REPORT-001] renders deterministic source-authored HTML", () => {
    const first = renderStandaloneReport(input, contract);
    const second = renderStandaloneReport(input, contract);

    expect(first.html).toBe(second.html);
    expect(first.html).toMatch(/^<!doctype html>\n<html lang="en">\n<head>/);
    expect(first.contract.upstream.commit).toBe("5bee37aaed30985a1bb4c7ebc62d6acecd772002");
  });

  it("[AC-REPORT-002] keeps hostile JSON and patch text inert", () => {
    const hostile = renderStandaloneReport(
      {
        analysis: { value: "</script><script>window.pwned=true</script><textarea>" },
        decisionJson: { value: "</textarea><img src=https://example.invalid>" },
        patch: "</textarea><form action=https://example.invalid>",
      },
      contract,
    );

    expect(hostile.html).not.toContain("<img src=https://example.invalid>");
    expect(hostile.html).not.toContain("<form action=https://example.invalid>");
    expect(hostile.html).not.toContain("</script><script>window.pwned=true");
    expect(hostile.html).toContain("\\u003C/script\\u003E");
  });

  it("[AC-REPORT-003] guarantees selectable JSON and patch exports without downloads", () => {
    const report = renderStandaloneReport(input, contract);

    expect(report.html).toContain('textarea id="cptv-decision-json" readonly');
    expect(report.html).toContain('textarea id="cptv-patch" readonly');
    expect(report.html).toContain("output.focus()");
    expect(report.html).toContain("output.select()");
    expect(report.html).not.toContain("download=");
    expect(report.html).not.toMatch(/createObjectURL|showSaveFilePicker|localStorage|indexedDB/i);
  });

  it("[AC-REPORT-004] uses a strict policy and passes Ephemeral structural preflight", () => {
    const report = renderStandaloneReport(input, contract);
    const validation = validateReportForEphemeral(report.html, contract);

    expect(validation).toMatchObject({ ok: true, problems: [] });
    expect(report.metaCsp).toBe(buildReportMetaCsp(contract));
    expect(report.metaCsp).toContain("default-src 'none'");
    expect(report.metaCsp).toContain("connect-src 'none'");
    expect(report.metaCsp).not.toContain("sandbox");
    expect(report.html).toContain('name="robots" content="noindex,nofollow,noarchive"');
    expect(report.html).not.toMatch(/<(?:form|base|object|embed|iframe)\b/i);
    expect(report.html).not.toMatch(/<(?:link|img|audio|video|source)\b/i);
    expect(report.html).not.toMatch(
      /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|import\s*\(/,
    );
    expect(contract.delivery.responseHeaders["X-Content-Type-Options"]).toBe("nosniff");
    expect(contract.delivery.responseHeaders["X-Robots-Tag"]).toBe("noindex");
  });

  it("[AC-REPORT-004] rejects an upload document without a source-authored html or head", () => {
    const validation = validateReportForEphemeral(
      "<!doctype html><body>not a document</body>",
      contract,
    );

    expect(validation.ok).toBe(false);
    expect(validation.problems).toContain(
      "Report must contain a source-authored doctype and html element.",
    );
    expect(validation.problems).toContain("Report must contain a source-authored head element.");
  });

  it("[AC-REPORT-004] takes the raw upload limit from the pinned contract", () => {
    const tinyLimitContract: EphemeralPagesContract = {
      ...contract,
      delivery: {
        ...contract.delivery,
        uploadLimits: { ...contract.delivery.uploadLimits, rawHtmlBytes: 1 },
      },
    };

    expect(() => renderStandaloneReport(input, tinyLimitContract)).toThrow(
      "pinned Ephemeral raw HTML limit of 1 bytes",
    );
  });

  it("[AC-REPORT-006] reports a pinned Brotli limit without compressing in the browser-safe package", () => {
    const report = renderStandaloneReport(input, contract);
    const validation = validateCompressedReportForEphemeral(
      report.html,
      contract.delivery.uploadLimits.brotliCompressedHtmlBytes + 1,
      contract,
    );

    expect(validation.ok).toBe(false);
    expect(validation.problems).toContain(
      "Report exceeds the pinned Ephemeral Brotli-compressed HTML upload limit.",
    );
    expect(validation.brotliCompressedBytes).toBe(
      contract.delivery.uploadLimits.brotliCompressedHtmlBytes + 1,
    );
    expect(validation.brotliCompressedLimitBytes).toBe(
      contract.delivery.uploadLimits.brotliCompressedHtmlBytes,
    );
  });

  it("[AC-REPORT-007] renders generic candidate controls and keeps provenance text inert", () => {
    const report = renderStandaloneReport(
      {
        analysis: {},
        registrationReview: {
          schemaVersion: "cptv-registration-review/v1",
          candidates: [
            {
              id: "registration-1",
              propertyName: "--tone",
              syntaxAlternatives: [{ id: "color", syntax: "<color>" }],
              allowCustomSyntax: true,
              requiresInherits: true,
              requiresInitialValue: true,
              evidence: { source: "tokens.css:1" },
              confidence: { level: "high" },
              specReferences: [
                "https://www.w3.org/TR/css-properties-values-api-1/#initial-value-descriptor",
              ],
              patchTemplate:
                "@property --tone { syntax: '{syntax}'; inherits: {inherits}; initial-value: {initialValue}; }",
            },
          ],
        },
      },
      contract,
    );

    expect(report.html).toContain('data-cptv-decision="accept"');
    expect(report.html).toContain("data-cptv-syntax");
    expect(report.html).toContain('data-cptv-inherits="true"');
    expect(report.html).toContain("data-cptv-initial-value");
    expect(report.html).toContain("Specification provenance");
    expect(report.html).not.toContain("<form");
  });
});
