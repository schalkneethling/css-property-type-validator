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

export type ResolveImport = (specifier: string, fromPath: string) => ValidationInput | null;

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
  | "unresolved-import"
  | "unparseable-stylesheet";

export type DiagnosticSeverity = "error";

export type DiagnosticPhase = "parse" | "registry" | "assignment" | "usage" | "import";

export type DiagnosticReason =
  | "missing-property-name"
  | "missing-syntax-descriptor"
  | "invalid-syntax-descriptor"
  | "unsupported-syntax-component"
  | "missing-inherits-descriptor"
  | "invalid-inherits-descriptor"
  | "missing-initial-value-descriptor"
  | "invalid-initial-value"
  | "incompatible-assignment-value"
  | "incompatible-var-substitution"
  | "incompatible-var-fallback"
  | "unresolved-import"
  | "unparseable-css";

export interface ValidationDiagnostic {
  code: DiagnosticCode;
  phase: DiagnosticPhase;
  reason: DiagnosticReason;
  severity: DiagnosticSeverity;
  filePath: string;
  loc: SourceLocation | null;
  message: string;
  descriptorName?: "syntax" | "inherits" | "initial-value";
  propertyName?: string;
  registeredSyntax?: string;
  expectedProperty?: string;
  actualValue?: string;
  importSpecifier?: string;
  snippet?: string;
}

export interface ValidationResult {
  diagnostics: ValidationDiagnostic[];
  registry: RegisteredProperty[];
  skippedDeclarations: number;
  validatedDeclarations: number;
}
