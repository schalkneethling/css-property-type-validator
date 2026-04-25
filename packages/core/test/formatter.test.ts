import { describe, expect, it } from "vitest";

import { formatValidationResult } from "../src/formatter.js";

import type { ValidationResult } from "../src/types.js";

const PASSING_RESULT: ValidationResult = {
  diagnostics: [],
  registry: [],
  skippedDeclarations: 0,
  validatedDeclarations: 1,
};

describe("formatValidationResult", () => {
  it("formats a passing result for human output", () => {
    expect(formatValidationResult(PASSING_RESULT, "human")).toBe("No validation issues found.");
  });

  it("formats diagnostics with locations and snippets for human output", () => {
    const result: ValidationResult = {
      diagnostics: [
        {
          code: "incompatible-var-usage",
          expectedProperty: "inline-size",
          filePath: "component.css",
          loc: {
            start: { column: 3, line: 8, offset: 120 },
            end: { column: 33, line: 8, offset: 150 },
          },
          message: "Registered property --brand-color is incompatible.",
          propertyName: "--brand-color",
          registeredSyntax: "<color>",
          snippet: "inline-size:var(--brand-color)",
        },
      ],
      registry: [],
      skippedDeclarations: 0,
      validatedDeclarations: 1,
    };

    expect(formatValidationResult(result, "human")).toBe(
      [
        "component.css:8:3 incompatible-var-usage",
        "Registered property --brand-color is incompatible.",
        "  inline-size:var(--brand-color)",
      ].join("\n"),
    );
  });

  it("formats the complete result as pretty JSON", () => {
    expect(formatValidationResult(PASSING_RESULT, "json")).toBe(
      JSON.stringify(PASSING_RESULT, null, 2),
    );
  });
});
