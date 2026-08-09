import { describe, expect, it } from "vitest";

import {
  CSS_PROPERTIES_VALUES_SPECIFICATION,
  DIAGNOSTIC_RULE_PROVENANCE,
  GENERATOR_POLICY_PROVENANCE,
  generatePropertyRegistrations,
  getDiagnosticSpecificationReferences,
  validateFiles,
} from "../src/index.js";

const DIAGNOSTIC_REASONS = [
  "missing-property-name",
  "missing-syntax-descriptor",
  "invalid-syntax-descriptor",
  "unsupported-syntax-component",
  "missing-inherits-descriptor",
  "invalid-inherits-descriptor",
  "missing-initial-value-descriptor",
  "invalid-initial-value",
  "incompatible-assignment-value",
  "incompatible-var-substitution",
  "incompatible-var-fallback",
  "unresolved-var-reference",
  "unresolved-import",
  "unparseable-css",
] as const;

const GENERATOR_POLICY_IDS = [
  "CPTV-GEN-001-existing-registration-review",
  "CPTV-GEN-002-exact-var-alias-resolution",
  "CPTV-GEN-003-common-supported-syntax",
  "CPTV-GEN-004-independent-initial-value",
  "CPTV-GEN-005-first-valid-initial-value",
  "CPTV-GEN-006-legacy-inherits-true",
  "CPTV-GEN-007-self-validation",
] as const;

function expectOfficialAnchors(references: readonly { url: string }[], criterionId: string): void {
  expect(references.length, `${criterionId}: at least one reference`).toBeGreaterThan(0);

  for (const reference of references) {
    const url = new URL(reference.url);
    expect(url.protocol, `${criterionId}: official HTTPS reference`).toBe("https:");
    expect(url.hostname, `${criterionId}: official W3C reference`).toBe("www.w3.org");
    expect(url.hash.length, `${criterionId}: exact section anchor`).toBeGreaterThan(1);
  }
}

describe("specification provenance", () => {
  it("AC-SPEC-001 catalogs every diagnostic reason once with official anchors", () => {
    expect(Object.keys(DIAGNOSTIC_RULE_PROVENANCE).sort()).toEqual([...DIAGNOSTIC_REASONS].sort());

    const ids = new Set<string>();

    for (const reason of DIAGNOSTIC_REASONS) {
      const entry = DIAGNOSTIC_RULE_PROVENANCE[reason];
      expect(entry.subject).toEqual({ kind: "diagnostic", reason });
      expect(ids.has(entry.id), `${entry.id}: unique provenance ID`).toBe(false);
      ids.add(entry.id);
      expectOfficialAnchors(entry.specReferences, "AC-SPEC-001");
    }

    expect(DIAGNOSTIC_RULE_PROVENANCE["incompatible-var-substitution"].classification).toBe(
      "tool-policy",
    );
    expect(DIAGNOSTIC_RULE_PROVENANCE["unresolved-var-reference"].classification).toBe(
      "tool-policy",
    );
  });

  it("AC-SPEC-002 includes catalog references in validation and generation diagnostics", () => {
    const validationResult = validateFiles([
      {
        path: "/tmp/invalid.css",
        css: '@property --brand { syntax: "<color>"; initial-value: red; }',
      },
    ]);
    const validationDiagnostic = validationResult.diagnostics[0];

    expect(validationDiagnostic?.reason).toBe("missing-inherits-descriptor");
    expect(validationDiagnostic?.specReferences).toEqual(
      getDiagnosticSpecificationReferences("missing-inherits-descriptor"),
    );

    const generationResult = generatePropertyRegistrations([
      { path: "/tmp/invalid.css", css: null as unknown as string },
    ]);
    const generationDiagnostic = generationResult.diagnostics[0];

    expect(generationDiagnostic?.reason).toBe("unparseable-css");
    expect(generationDiagnostic?.specReferences).toEqual(
      getDiagnosticSpecificationReferences("unparseable-css"),
    );
  });

  it("AC-SPEC-003 catalogs current generator policies without presenting heuristics as CSS", () => {
    expect(GENERATOR_POLICY_PROVENANCE.map((entry) => entry.id).sort()).toEqual(
      [...GENERATOR_POLICY_IDS].sort(),
    );

    for (const entry of GENERATOR_POLICY_PROVENANCE) {
      expect(entry.subject.kind).toBe("generator-policy");
      expectOfficialAnchors(entry.specReferences, "AC-SPEC-003");
    }

    const inheritsPolicy = GENERATOR_POLICY_PROVENANCE.find(
      (entry) => entry.id === "CPTV-GEN-006-legacy-inherits-true",
    );
    const initialValuePolicy = GENERATOR_POLICY_PROVENANCE.find(
      (entry) => entry.id === "CPTV-GEN-005-first-valid-initial-value",
    );

    expect(inheritsPolicy?.classification).toBe("tool-policy");
    expect(inheritsPolicy?.knownDivergences.join(" ")).toContain("cannot infer author intent");
    expect(initialValuePolicy?.classification).toBe("tool-policy");
    expect(initialValuePolicy?.knownDivergences.join(" ")).toContain("cannot infer author intent");

    const generatedCandidate = generatePropertyRegistrations([
      { path: "/tmp/tokens.css", css: ":root { --brand: red; }" },
    ]).candidates[0];

    expect(generatedCandidate?.policyIds).toEqual([
      "CPTV-GEN-003-common-supported-syntax",
      "CPTV-GEN-004-independent-initial-value",
      "CPTV-GEN-005-first-valid-initial-value",
      "CPTV-GEN-006-legacy-inherits-true",
      "CPTV-GEN-007-self-validation",
    ]);
    expectOfficialAnchors(generatedCandidate?.specReferences ?? [], "AC-SPEC-003");
  });

  it("AC-SPEC-004 exports the pinned W3C specification profile", () => {
    expect(CSS_PROPERTIES_VALUES_SPECIFICATION).toEqual({
      editorsDraftUrl: "https://drafts.css-houdini.org/css-properties-values-api-1/",
      latestPublishedUrl: "https://www.w3.org/TR/css-properties-values-api-1/",
      publicationDate: "2024-03-26",
      snapshotUrl: "https://www.w3.org/TR/2024/WD-css-properties-values-api-1-20240326/",
      title: "CSS Properties and Values API Level 1",
    });
  });
});
