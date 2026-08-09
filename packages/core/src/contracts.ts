import type { GeneratedPropertyStatus } from "./generate.js";
import type { GeneratorPolicyId } from "./specification.js";
import type {
  RegisteredProperty,
  SourceLocation,
  SpecificationReference,
  ValidationDiagnostic,
} from "./types.js";

export const ANALYSIS_RESULT_SCHEMA_VERSION = "1.0.0" as const;
export const REGISTRATION_PLAN_SCHEMA_VERSION = "1.0.0" as const;
export const CORE_TOOL_VERSION = "0.12.0" as const;
export const CORE_TOOL_NAME = "@schalkneethling/css-property-type-validator-core" as const;

export interface ContractToolVersionV1 {
  name: typeof CORE_TOOL_NAME;
  version: typeof CORE_TOOL_VERSION;
}

export interface ContractSpecificationProfileV1 {
  editorsDraftUrl: string;
  latestPublishedUrl: string;
  publicationDate: string;
  snapshotUrl: string;
  title: string;
}

export interface AnalysisInputV1 {
  path: string;
  sourceBytes: number;
}

export interface AnalysisImportEdgeInputV1 {
  conditional?: boolean;
  fromPath: string;
  /** Zero-based order among @import occurrences in the source stylesheet. */
  order: number;
  specifier: string;
  toPath: string;
}

export interface AnalysisConfigurationV1 {
  checkUnresolvedCustomProperties: boolean;
  knownCustomPropertyInputCount: number;
  registryInputCount: number;
  resolveImportEnabled: boolean;
}

export type AnalysisCandidateStatusV1 = "blocked" | "existing" | "review-required";

export interface AnalysisConfidenceV1 {
  level: "low" | "medium";
  reasons: string[];
}

export interface RegistrationCandidateV1 {
  confidence: AnalysisConfidenceV1;
  evidence: {
    loc: SourceLocation | null;
    observedValues: string[];
    sources: string[];
  };
  id: string;
  legacyGeneratorStatus: GeneratedPropertyStatus;
  name: string;
  policyIds: readonly GeneratorPolicyId[];
  reason: string;
  specReferences: readonly SpecificationReference[];
  status: AnalysisCandidateStatusV1;
  suggestedInitialValue?: string;
  suggestedSyntax?: string;
}

export type AnalysisSkipCodeV1 =
  | "CPTV_SKIP_ALIASES_UNAVAILABLE"
  | "CPTV_SKIP_ASSIGNMENTS_UNAVAILABLE"
  | "CPTV_SKIP_CONSUMERS_UNAVAILABLE"
  | "CPTV_SKIP_FALLBACKS_UNAVAILABLE"
  | "CPTV_SKIP_IMPORTS_UNAVAILABLE"
  | "CPTV_SKIP_REFERENCES_UNAVAILABLE"
  | "CPTV_SKIP_INPUT_INVENTORY_UNAVAILABLE"
  | "CPTV_SKIP_NESTED_FALLBACK_UNPROVEN"
  | "CPTV_SKIP_REPOSITORY_CONTEXT_UNAVAILABLE"
  | "CPTV_SKIP_REPOSITORY_ORDER_UNCERTAIN";

export interface AnalysisSkipV1 {
  code: AnalysisSkipCodeV1;
  reason: string;
  status: "uncertain";
  subject:
    | "aliases"
    | "assignments"
    | "consumers"
    | "fallbacks"
    | "imports"
    | "inventory"
    | "ordering"
    | "references"
    | "repository-context";
}

export interface AuditOccurrenceV1 {
  entryPoints: string[];
  filePath: string;
  id: string;
  loc: SourceLocation | null;
  specReferences: readonly SpecificationReference[];
}

export interface RegistrationOccurrenceV1 extends AuditOccurrenceV1 {
  inherits?: boolean;
  initialValue?: string;
  name: string;
  status: "invalid" | "valid";
  syntax?: string;
}

export interface AssignmentOccurrenceV1 extends AuditOccurrenceV1 {
  name: string;
  value: string;
}

export interface AliasOccurrenceV1 extends AuditOccurrenceV1 {
  name: string;
  target: string;
}

export interface ReferenceOccurrenceV1 extends AuditOccurrenceV1 {
  assignmentName?: string;
  consumerProperty: string;
  fallbackId?: string;
  name: string;
}

export interface FallbackOccurrenceV1 extends AuditOccurrenceV1 {
  referenceId: string;
  value: string;
}

export interface ConsumerOccurrenceV1 extends AuditOccurrenceV1 {
  property: string;
  referenceIds: string[];
}

export interface ImportOccurrenceV1 extends AuditOccurrenceV1 {
  conditional: boolean;
  fromPath: string;
  order: number;
  resolution: "external" | "resolved" | "unresolved";
  specifier: string;
  toPath?: string;
}

export interface AnalysisEntryPointV1 {
  path: string;
  reachableInputs: string[];
  status: "complete" | "uncertain";
}

export interface RegistrationConflictV1 {
  entryPoints: string[];
  kind: "conflicting" | "identical";
  name: string;
  occurrenceIds: string[];
  ordering: "repository-order-uncertain" | "source-order-certain";
  specReferences: readonly SpecificationReference[];
  status: "review-required";
  /**
   * The last valid stylesheet rule in one complete supplied entry-point order.
   * This does not claim that runtime CSS.registerProperty() calls are absent.
   */
  effectiveRegistrationId?: string;
  effectiveEntryPoint?: string;
}

export interface AliasCycleV1 {
  aliasIds: string[];
  entryPoints: string[];
  names: string[];
  specReferences: readonly SpecificationReference[];
  status: "review-required";
}

export interface CoverageCategoryV1 {
  analyzed: number;
  skipped: number;
  total: number;
}

export type AnimationEvidenceKindV1 = "keyframes-assignment" | "transition-property-reference";

export interface AnimationOpportunityEvidenceV1 extends AuditOccurrenceV1 {
  kind: AnimationEvidenceKindV1;
}

export interface AnimationOpportunityV1 {
  confidence: AnalysisConfidenceV1;
  entryPoints: string[];
  evidence: AnimationOpportunityEvidenceV1[];
  id: string;
  name: string;
  registrationStatus: "not-observed" | "registered-in-supplied-graph" | "uncertain";
  specReferences: readonly SpecificationReference[];
  status: "advisory";
}

export interface AnalysisResultV1 {
  candidates: RegistrationCandidateV1[];
  configuration: AnalysisConfigurationV1;
  coverage: {
    categories: {
      assignments: CoverageCategoryV1;
      consumers: CoverageCategoryV1;
      fallbacks: CoverageCategoryV1;
      references: CoverageCategoryV1;
      registrationRules: CoverageCategoryV1;
    };
    skippedDeclarations: number;
    validatedDeclarations: number;
  };
  aliasCycles: AliasCycleV1[];
  conflicts: RegistrationConflictV1[];
  diagnostics: ValidationDiagnostic[];
  inputs: AnalysisInputV1[];
  inventory: {
    aliases: AliasOccurrenceV1[];
    assignments: AssignmentOccurrenceV1[];
    consumers: ConsumerOccurrenceV1[];
    fallbacks: FallbackOccurrenceV1[];
    imports: ImportOccurrenceV1[];
    references: ReferenceOccurrenceV1[];
    registrationOccurrences: RegistrationOccurrenceV1[];
    registrations: RegisteredProperty[];
  };
  opportunities: {
    animations: AnimationOpportunityV1[];
  };
  entryPoints: AnalysisEntryPointV1[];
  schemaVersion: typeof ANALYSIS_RESULT_SCHEMA_VERSION;
  skips: AnalysisSkipV1[];
  specification: ContractSpecificationProfileV1;
  tool: ContractToolVersionV1;
}

export interface RegistrationDecisionV1 {
  action: "accept" | "reject";
  candidateId: string;
  inherits?: boolean;
  initialValue?: string;
  syntax?: string;
}

export interface PlannedRegistrationV1 {
  candidateId: string;
  css: string;
  inherits: boolean;
  initialValue?: string;
  name: string;
  specReferences: readonly SpecificationReference[];
  syntax: string;
}

export type RegistrationPlanSkipCodeV1 =
  | "CPTV_SKIP_AMBIGUOUS_DECISION"
  | "CPTV_SKIP_DECISION_REJECTED"
  | "CPTV_SKIP_DECISION_REQUIRED"
  | "CPTV_SKIP_EXISTING_REGISTRATION"
  | "CPTV_SKIP_INVALID_DECISION"
  | "CPTV_SKIP_UNKNOWN_CANDIDATE";

export interface RegistrationPlanSkipV1 {
  candidateId: string;
  code: RegistrationPlanSkipCodeV1;
  evidence?: RegistrationCandidateV1["evidence"];
  reason: string;
  status: "review-required";
}

export interface RegistrationPlanV1 {
  analysisSchemaVersion: typeof ANALYSIS_RESULT_SCHEMA_VERSION;
  css: string;
  diagnostics: ValidationDiagnostic[];
  registrations: PlannedRegistrationV1[];
  schemaVersion: typeof REGISTRATION_PLAN_SCHEMA_VERSION;
  skips: RegistrationPlanSkipV1[];
  specification: ContractSpecificationProfileV1;
  tool: ContractToolVersionV1;
}
