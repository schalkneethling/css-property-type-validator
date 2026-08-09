import { describe, expect, it } from "vitest";

import {
  analyzeInputs,
  planPropertyRegistrations,
  validateFiles,
  type ValidationInput,
} from "../src/index.js";

const INPUTS: ValidationInput[] = [
  { path: "/project/z.css", css: ":root { --space: 4px; }" },
  {
    path: "/project/a.css",
    css: '@property --brand { syntax: "<color>"; inherits: true; initial-value: red; }',
  },
];

describe("versioned analysis contracts", () => {
  it("AC-CONTRACT-001 returns the same conservative contract for reordered inputs", () => {
    const forward = analyzeInputs(INPUTS);
    const reverse = analyzeInputs([...INPUTS].reverse());

    expect(reverse).toEqual(forward);
    expect(forward.schemaVersion).toBe("1.0.0");
    expect(forward.tool.name).toBe("@schalkneethling/css-property-type-validator-core");
    expect(forward.specification.publicationDate).toBe("2024-03-26");
    expect(forward.inputs.map((input) => input.path)).toEqual(["/project/a.css", "/project/z.css"]);
    expect(forward.inventory.registrations).toHaveLength(1);
    expect(forward.candidates[0]).toMatchObject({
      id: "registration:--space",
      name: "--space",
      status: "review-required",
      suggestedInitialValue: "4px",
      suggestedSyntax: "<length>",
    });
    expect(forward.skips.map((skip) => skip.code)).toEqual([
      "CPTV_SKIP_REPOSITORY_CONTEXT_UNAVAILABLE",
    ]);
    expect(validateFiles(INPUTS).registry).toHaveLength(1);
  });

  it("AC-CONTRACT-002 keeps inferred evidence review-only without an explicit decision", () => {
    const analysis = analyzeInputs([
      { path: "/project/tokens.css", css: ":root { --space: 4px; }" },
    ]);
    const plan = planPropertyRegistrations(analysis);

    expect(plan.css).toBe("");
    expect(plan.registrations).toEqual([]);
    expect(plan.skips[0]).toMatchObject({
      candidateId: "registration:--space",
      code: "CPTV_SKIP_DECISION_REQUIRED",
      status: "review-required",
    });
  });

  it("AC-CONTRACT-002 emits only complete explicit decisions that pass registry validation", () => {
    const analysis = analyzeInputs([
      { path: "/project/tokens.css", css: ":root { --z-space: 4px; --a-color: red; }" },
    ]);
    const plan = planPropertyRegistrations(analysis, [
      {
        action: "accept",
        candidateId: "registration:--z-space",
        inherits: false,
        initialValue: "4px",
        syntax: "<length>",
      },
      {
        action: "accept",
        candidateId: "registration:--a-color",
        inherits: true,
        initialValue: "10px",
        syntax: "<color>",
      },
    ]);

    expect(plan.registrations.map((registration) => registration.name)).toEqual(["--z-space"]);
    expect(plan.css).toContain("@property --z-space");
    expect(plan.css).not.toContain("@property --a-color");
    expect(plan.skips).toContainEqual(
      expect.objectContaining({
        candidateId: "registration:--a-color",
        code: "CPTV_SKIP_INVALID_DECISION",
      }),
    );
    expect(plan.diagnostics[0]?.reason).toBe("invalid-initial-value");
  });

  it("AC-CONTRACT-002 does not duplicate an existing registration", () => {
    const analysis = analyzeInputs([
      {
        path: "/project/tokens.css",
        css: [
          '@property --brand { syntax: "<color>"; inherits: true; initial-value: red; }',
          ":root { --brand: blue; }",
        ].join("\n"),
      },
    ]);
    const plan = planPropertyRegistrations(analysis, [
      {
        action: "accept",
        candidateId: "registration:--brand",
        inherits: true,
        initialValue: "blue",
        syntax: "<color>",
      },
    ]);

    expect(plan.css).toBe("");
    expect(plan.skips[0]?.code).toBe("CPTV_SKIP_EXISTING_REGISTRATION");
  });
});
