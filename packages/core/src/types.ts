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

export type PermanentDiagnosticId =
  | "CPTV_REG_001"
  | "CPTV_REG_002"
  | "CPTV_REG_003"
  | "CPTV_REG_004"
  | "CPTV_REG_005"
  | "CPTV_REG_006"
  | "CPTV_REG_007"
  | "CPTV_REG_008"
  | "CPTV_ASSIGN_001"
  | "CPTV_ASSIGN_002"
  | "CPTV_USAGE_001"
  | "CPTV_USAGE_002"
  | "CPTV_USAGE_003"
  | "CPTV_IMPORT_001"
  | "CPTV_PARSE_001";

export type DiagnosticConfidenceLevel = "high" | "medium" | "low";
export type DiagnosticBasis = "direct" | "representative-var-substitution";

export interface DiagnosticConfidence {
  level: DiagnosticConfidenceLevel;
  reasons: string[];
}

export type DiagnosticGating = "gating" | "review-required" | "advisory";

export interface DiagnosticLocation {
  /** JavaScript string indexes and css-tree offsets count UTF-16 code units. */
  offsetEncoding: "utf-16-code-units";
  /** Lines and columns in this contract are one-based. */
  lineBase: 1;
  columnBase: 1;
  source?: string;
  start: SourcePosition;
  end: SourcePosition;
}

export interface DiagnosticRelatedLocation {
  location: DiagnosticLocation;
  message: string;
}

export interface DiagnosticEvidence {
  kind:
    | "actual-value"
    | "expected-property"
    | "import-specifier"
    | "property-name"
    | "registered-syntax"
    | "snippet";
  value: string;
}

export type DiagnosticProvenanceClassification = "normative" | "tool-policy" | "advisory";

export interface DiagnosticProvenance {
  classification: DiagnosticProvenanceClassification;
  ruleId: PermanentDiagnosticId;
}

export type SuggestedEditApplicability = "safe" | "review-required";

export interface DiagnosticSuggestedEdit {
  applicability: SuggestedEditApplicability;
  endOffset: number;
  filePath: string;
  replacement: string;
  sourceFingerprint: `sha256:${string}`;
  startOffset: number;
}

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
  | "unresolved-var-reference"
  | "unresolved-import"
  | "unparseable-css";

export interface SpecificationReference {
  normative: boolean;
  publicationDate: string;
  section: string;
  specification: string;
  url: string;
}

export interface ValidationDiagnosticBase {
  /** Optional only while an internal diagnostic is being constructed. */
  basis?: DiagnosticBasis;
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

/** Canonical, versioned diagnostic emitted from all public core workflows. */
export interface ValidationDiagnostic extends ValidationDiagnosticBase {
  baselineFingerprint: `sha256:${string}`;
  basis: DiagnosticBasis;
  confidence: DiagnosticConfidence;
  evidence: DiagnosticEvidence[];
  gating: DiagnosticGating;
  id: PermanentDiagnosticId;
  location: DiagnosticLocation | null;
  provenance: DiagnosticProvenance;
  relatedLocations: DiagnosticRelatedLocation[];
  /** Exact official specification sections that establish this diagnostic's semantic basis. */
  specReferences: readonly SpecificationReference[];
  suggestedEdits: DiagnosticSuggestedEdit[];
}

/** Internal construction shape. It is decorated before crossing a public API boundary. */
export type ValidationDiagnosticInput = ValidationDiagnosticBase &
  Partial<
    Pick<
      ValidationDiagnostic,
      | "baselineFingerprint"
      | "confidence"
      | "evidence"
      | "gating"
      | "id"
      | "location"
      | "provenance"
      | "relatedLocations"
      | "specReferences"
      | "suggestedEdits"
    >
  >;

export interface ValidationResult {
  diagnostics: ValidationDiagnostic[];
  registry: RegisteredProperty[];
  skippedDeclarations: number;
  validatedDeclarations: number;
}
