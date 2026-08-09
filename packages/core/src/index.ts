export { validateFiles } from "./validate.js";
export type { ValidateFilesOptions } from "./validate.js";
export { analyzeInputs, planPropertyRegistrations } from "./analysis.js";
export type { AnalyzeInputsOptions } from "./analysis.js";
export {
  ANALYSIS_RESULT_SCHEMA_VERSION,
  CORE_TOOL_NAME,
  CORE_TOOL_VERSION,
  REGISTRATION_PLAN_SCHEMA_VERSION,
} from "./contracts.js";
export type {
  AnalysisCandidateStatusV1,
  AnalysisConfidenceV1,
  AnalysisConfigurationV1,
  AnalysisEntryPointV1,
  AnalysisImportEdgeInputV1,
  AnalysisInputV1,
  AnalysisResultV1,
  AnalysisSkipCodeV1,
  AnalysisSkipV1,
  AliasCycleV1,
  AliasOccurrenceV1,
  AnimationEvidenceKindV1,
  AnimationOpportunityEvidenceV1,
  AnimationOpportunityV1,
  AssignmentOccurrenceV1,
  AuditOccurrenceV1,
  ConsumerOccurrenceV1,
  CoverageCategoryV1,
  ContractSpecificationProfileV1,
  ContractToolVersionV1,
  FallbackOccurrenceV1,
  ImportOccurrenceV1,
  PlannedRegistrationV1,
  RegistrationCandidateV1,
  RegistrationConflictV1,
  RegistrationDecisionV1,
  RegistrationPlanSkipCodeV1,
  RegistrationPlanSkipV1,
  RegistrationPlanV1,
  RegistrationOccurrenceV1,
  ReferenceOccurrenceV1,
} from "./contracts.js";
export { generatePropertyRegistrations } from "./generate.js";
export type {
  GeneratedPropertyCandidate,
  GeneratedPropertyStatus,
  GeneratePropertyRegistrationsResult,
} from "./generate.js";
export { formatValidationResult } from "./formatter.js";
export type { OutputFormat } from "./formatter.js";
export { DIAGNOSTIC_CONTRACTS } from "./diagnostics.js";
export type { DiagnosticContractEntry } from "./diagnostics.js";
export { isAbsoluteImportUrl } from "./imports.js";
export {
  AUDIT_POLICY_PROVENANCE,
  CSS_PROPERTIES_VALUES_SPECIFICATION,
  DIAGNOSTIC_RULE_PROVENANCE,
  GENERATOR_POLICY_PROVENANCE,
  getAuditPolicySpecificationReferences,
  getDiagnosticSpecificationReferences,
  getGeneratorPolicySpecificationReferences,
} from "./specification.js";
export type {
  AuditPolicyId,
  AuditPolicyProvenance,
  DiagnosticRuleProvenance,
  GeneratorPolicyId,
  GeneratorPolicyProvenance,
  ProvenanceClassification,
} from "./specification.js";

export type {
  RegisteredProperty,
  ResolveImport,
  DiagnosticBasis,
  DiagnosticConfidence,
  DiagnosticConfidenceLevel,
  DiagnosticEvidence,
  DiagnosticGating,
  DiagnosticLocation,
  DiagnosticProvenance,
  DiagnosticProvenanceClassification,
  DiagnosticRelatedLocation,
  DiagnosticSuggestedEdit,
  PermanentDiagnosticId,
  SourceLocation,
  SourcePosition,
  SpecificationReference,
  ValidationDiagnostic,
  ValidationInput,
  ValidationResult,
} from "./types.js";
