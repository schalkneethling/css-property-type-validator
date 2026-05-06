import type { SourceLocation, ValidationDiagnostic } from "@schalkneethling/css-property-type-validator-core";

export interface PlainPosition {
  character: number;
  line: number;
}

export interface PlainRange {
  end: PlainPosition;
  start: PlainPosition;
}

function toZeroBasedPosition(position: SourceLocation["start"]): PlainPosition {
  return {
    character: Math.max(0, position.column - 1),
    line: Math.max(0, position.line - 1),
  };
}

export function toPlainRange(location: SourceLocation | null): PlainRange {
  if (!location) {
    return {
      end: { character: 0, line: 0 },
      start: { character: 0, line: 0 },
    };
  }

  return {
    end: toZeroBasedPosition(location.end),
    start: toZeroBasedPosition(location.start),
  };
}

export function getDiagnosticCode(diagnostic: ValidationDiagnostic): string {
  return diagnostic.reason;
}
