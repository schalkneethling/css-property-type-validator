import { describe, expect, it } from "vitest";

import diagnosticCodeContract from "../../../contracts/diagnostic-codes.json";
import diagnosticSchema from "../../../contracts/diagnostic-v1.schema.json";
import {
  DIAGNOSTIC_CONTRACTS,
  analyzeInputs,
  validateFiles,
  type ValidationDiagnostic,
} from "../src/index.js";

function firstDiagnostic(css: string): ValidationDiagnostic {
  const diagnostic = validateFiles([{ path: "/project/input.css", css }]).diagnostics[0];

  expect(diagnostic).toBeDefined();
  return diagnostic as ValidationDiagnostic;
}

describe("machine-readable diagnostic contract", () => {
  it("AC-DIAG-001 assigns permanent unique IDs while preserving legacy fields", () => {
    const diagnostic = firstDiagnostic(
      '@property --brand { syntax: "<color>"; initial-value: red; }',
    );

    expect(diagnostic).toMatchObject({
      code: "invalid-property-registration",
      id: "CPTV_REG_005",
      reason: "missing-inherits-descriptor",
    });

    const ids = DIAGNOSTIC_CONTRACTS.map((entry) => entry.code);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^CPTV_[A-Z0-9_]+$/.test(id))).toBe(true);
  });

  it("AC-DIAG-002 states UTF-16 and 1-based location units and relates registrations", () => {
    const registrationCss =
      '/*😀*/\n@property --brand { syntax: "<color>"; inherits: false; initial-value: red; }';
    const registrationDiagnostic = firstDiagnostic(
      '/*😀*/\n@property --brand { syntax: "<color>"; initial-value: red; }',
    );

    expect(registrationDiagnostic.location).toMatchObject({
      columnBase: 1,
      lineBase: 1,
      offsetEncoding: "utf-16-code-units",
      start: {
        column: 1,
        line: 2,
        offset: registrationCss.indexOf("@property"),
      },
    });

    const assignmentDiagnostic = validateFiles([
      { path: "/project/registration.css", css: registrationCss },
      { path: "/project/usage.css", css: ":root { --brand: 10px; }" },
    ]).diagnostics.find((entry) => entry.reason === "incompatible-assignment-value");

    expect(assignmentDiagnostic?.relatedLocations).toEqual([
      expect.objectContaining({
        message: "Registration for --brand.",
        location: expect.objectContaining({ offsetEncoding: "utf-16-code-units" }),
      }),
    ]);
    expect(assignmentDiagnostic?.evidence.length).toBeGreaterThan(0);
  });

  it("AC-DIAG-003 gates only high-confidence normative diagnostics by default", () => {
    const normative = firstDiagnostic(
      '@property --brand { syntax: "<color>"; initial-value: red; }',
    );
    const toolPolicy = validateFiles([
      {
        path: "/project/input.css",
        css: [
          '@property --brand { syntax: "<color>"; inherits: false; initial-value: red; }',
          ".example { width: var(--brand); }",
        ].join("\n"),
      },
    ]).diagnostics.find((entry) => entry.reason === "incompatible-var-substitution");

    expect(normative.provenance.classification).toBe("normative");
    expect(normative.confidence.level).toBe("high");
    expect(normative.gating).toBe("gating");

    const directAssignment = validateFiles([
      {
        path: "/project/input.css",
        css: [
          '@property --brand { syntax: "<color>"; inherits: false; initial-value: red; }',
          ":root { --brand: 10px; }",
        ].join("\n"),
      },
    ]).diagnostics.find((entry) => entry.reason === "incompatible-assignment-value");

    expect(directAssignment).toMatchObject({
      basis: "direct",
      confidence: { level: "high" },
      gating: "gating",
      id: "CPTV_ASSIGN_001",
      provenance: { classification: "normative" },
    });

    expect(toolPolicy).toMatchObject({
      basis: "representative-var-substitution",
      confidence: { level: "medium" },
      gating: "review-required",
      provenance: { classification: "tool-policy" },
    });

    const representativeAssignment = validateFiles([
      {
        path: "/project/input.css",
        css: [
          '@property --brand { syntax: "<color>"; inherits: false; initial-value: red; }',
          '@property --space { syntax: "<length>"; inherits: false; initial-value: 0px; }',
          ":root { --brand: var(--space); }",
        ].join("\n"),
      },
    ]).diagnostics.find((entry) => entry.reason === "incompatible-assignment-value");

    expect(representativeAssignment).toMatchObject({
      basis: "representative-var-substitution",
      confidence: { level: "medium" },
      gating: "review-required",
      id: "CPTV_ASSIGN_002",
      provenance: { classification: "tool-policy" },
      reason: "incompatible-assignment-value",
    });

    const fallback = validateFiles([
      {
        path: "/project/input.css",
        css: [
          '@property --brand { syntax: "<color>"; inherits: false; initial-value: red; }',
          ".example { color: var(--brand, 10px); }",
        ].join("\n"),
      },
    ]).diagnostics.find((entry) => entry.reason === "incompatible-var-fallback");

    expect(fallback).toMatchObject({
      confidence: { level: "high" },
      gating: "gating",
      id: "CPTV_USAGE_002",
      provenance: { classification: "normative" },
    });
  });

  it("AC-DIAG-004 is deterministic and does not invent unsafe edits", () => {
    const inputs = [
      {
        path: "/project/input.css",
        css: '@property --brand { syntax: "<color>"; initial-value: red; }',
      },
    ];

    const first = analyzeInputs(inputs).diagnostics[0];
    const second = analyzeInputs(inputs).diagnostics[0];

    expect(second).toEqual(first);
    expect(first?.baselineFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first?.suggestedEdits).toEqual([]);
    expect(first?.specReferences.length).toBeGreaterThan(0);
    expect(first?.provenance.ruleId).toBe(first?.id);
  });

  it("AC-DIAG-005 keeps the committed registry source-equivalent", () => {
    const diagnosticEntries = diagnosticCodeContract.codes.filter(
      (entry) => entry.category === "diagnostic",
    );

    expect(diagnosticEntries).toEqual(DIAGNOSTIC_CONTRACTS);
    expect(diagnosticSchema.$defs.diagnosticId.enum).toEqual(
      DIAGNOSTIC_CONTRACTS.map((entry) => entry.code),
    );
    expect(diagnosticSchema.required).toEqual(
      expect.arrayContaining([
        "baselineFingerprint",
        "basis",
        "confidence",
        "evidence",
        "gating",
        "id",
        "location",
        "provenance",
        "relatedLocations",
        "specReferences",
        "suggestedEdits",
      ]),
    );
  });
});
