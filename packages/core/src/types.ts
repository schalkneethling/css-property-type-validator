export interface SourcePosition {
  offset: number;
  line: number;
  column: number;
}

export interface SourceLocation {
  source?: string;
  start: SourcePosition;
  end: SourcePosition;
}

export interface ValidationInput {
  path: string;
  css: string;
}

export interface RegisteredProperty {
  filePath: string;
  inherits?: boolean;
  initialValue?: string;
  loc: SourceLocation | null;
  name: string;
  syntax: string;
}

export type DiagnosticCode =
  | "invalid-property-registration"
  | "incompatible-custom-property-assignment"
  | "incompatible-var-usage"
  | "unparseable-stylesheet";

export interface ValidationDiagnostic {
  code: DiagnosticCode;
  filePath: string;
  loc: SourceLocation | null;
  message: string;
  propertyName?: string;
  registeredSyntax?: string;
  expectedProperty?: string;
  snippet?: string;
}

export interface ValidationResult {
  diagnostics: ValidationDiagnostic[];
  registry: RegisteredProperty[];
  skippedDeclarations: number;
  validatedDeclarations: number;
}
