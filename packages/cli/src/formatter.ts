import type { ValidationDiagnostic, ValidationResult } from "@css-property-type-validator/core";

type OutputFormat = "human" | "json";

function formatLocation(diagnostic: ValidationDiagnostic): string {
  if (!diagnostic.loc) {
    return diagnostic.filePath;
  }

  return `${diagnostic.filePath}:${diagnostic.loc.start.line}:${diagnostic.loc.start.column}`;
}

function formatHuman(diagnostics: ValidationDiagnostic[]): string {
  if (diagnostics.length === 0) {
    return "No validation issues found.";
  }

  return diagnostics
    .map((diagnostic) => {
      const location = formatLocation(diagnostic);
      const details = [`${location} ${diagnostic.code}`, diagnostic.message];

      if (diagnostic.snippet) {
        details.push(`  ${diagnostic.snippet}`);
      }

      return details.join("\n");
    })
    .join("\n\n");
}

export function formatValidationResult(result: ValidationResult, format: OutputFormat): string {
  return format === "json" ? JSON.stringify(result, null, 2) : formatHuman(result.diagnostics);
}
