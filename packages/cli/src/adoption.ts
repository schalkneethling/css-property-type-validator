import { createHash, randomUUID } from "node:crypto";
import { link, lstat, open, realpath, unlink } from "node:fs/promises";
import path from "node:path";
import { brotliCompressSync } from "node:zlib";

import {
  ANALYSIS_RESULT_SCHEMA_VERSION,
  CORE_TOOL_NAME,
  CORE_TOOL_VERSION,
  CSS_PROPERTIES_VALUES_SPECIFICATION,
  REGISTRATION_PLAN_SCHEMA_VERSION,
  analyzeInputs,
  planPropertyRegistrations,
  type AnalysisResultV1,
  type AnalyzeInputsOptions,
  type DiagnosticBasis,
  type DiagnosticConfidence,
  type DiagnosticEvidence,
  type DiagnosticGating,
  type DiagnosticLocation,
  type DiagnosticProvenance,
  type DiagnosticRelatedLocation,
  type DiagnosticSuggestedEdit,
  type PermanentDiagnosticId,
  type RegistrationDecisionV1,
  type RegistrationCandidateV1,
  type SpecificationReference,
  type ValidationDiagnostic,
  type ValidationInput,
} from "@schalkneethling/css-property-type-validator-core";
import {
  renderStandaloneReport,
  validateCompressedReportForEphemeral,
  validateReportForEphemeral,
  type JsonValue,
} from "@schalkneethling/css-property-type-validator-report";

import { EPHEMERAL_PAGES_CONTRACT } from "./ephemeral-contract.generated.js";
import type { CliProjectContext } from "./project-context.js";

export const CLI_AUDIT_SCHEMA_VERSION = "1.0.0" as const;
export const CLI_BASELINE_SCHEMA_VERSION = "1.0.0" as const;
export const CLI_PLAN_SCHEMA_VERSION = "1.0.0" as const;

export type AdoptionOutputFormat = "html" | "human" | "json" | "sarif";

export interface SourceFingerprintV1 {
  path: string;
  sha256: `sha256:${string}`;
}

export interface CliDiagnosticV1 {
  actualValue?: string;
  baselineFingerprint: `sha256:${string}`;
  basis: DiagnosticBasis;
  /** Compatibility alias for `id`. */
  code: PermanentDiagnosticId;
  confidence: DiagnosticConfidence;
  evidence: DiagnosticEvidence[];
  filePath: string;
  /** Compatibility alias for `baselineFingerprint`. */
  fingerprint: `sha256:${string}`;
  gating: DiagnosticGating;
  id: PermanentDiagnosticId;
  legacyCode: ValidationDiagnostic["code"];
  location: DiagnosticLocation | null;
  message: string;
  phase: ValidationDiagnostic["phase"];
  propertyName?: string;
  provenance: DiagnosticProvenance;
  reason: ValidationDiagnostic["reason"];
  relatedLocations: DiagnosticRelatedLocation[];
  severity: ValidationDiagnostic["severity"];
  snippet?: string;
  specReferences: readonly SpecificationReference[];
  suggestedEdits: DiagnosticSuggestedEdit[];
}

export interface CliAuditV1 {
  analysis: AnalysisResultV1;
  coverage: {
    percentage: number | null;
    skipped: number;
    validated: number;
  };
  diagnostics: CliDiagnosticV1[];
  gateEvaluation: GateEvaluationV1 | null;
  kind: "cptv-audit";
  schemaVersion: typeof CLI_AUDIT_SCHEMA_VERSION;
  sourceFingerprints: SourceFingerprintV1[];
  sourceRedacted: boolean;
}

export interface CliBaselineV1 {
  coverageCategories?: CoverageBaselineV1;
  diagnosticFingerprints: Array<`sha256:${string}`>;
  kind: "cptv-baseline";
  schemaVersion: typeof CLI_BASELINE_SCHEMA_VERSION;
}

export interface GateEvaluationV1 {
  baseline: {
    matchedFingerprints: Array<`sha256:${string}`>;
    newFingerprints: Array<`sha256:${string}`>;
    staleFingerprints: Array<`sha256:${string}`>;
  } | null;
  coverageFailed: boolean;
  coverageRegressions: CoverageRegressionV1[];
  diagnosticFailures: CliDiagnosticV1[];
  passed: boolean;
}

type CoverageCategoryNameV1 = keyof AnalysisResultV1["coverage"]["categories"];

interface CoverageBaselineCategoryV1 {
  analyzed: number;
  percentage: number | null;
  skipped: number;
  total: number;
}

interface RegistrationReviewPayloadV1 {
  candidates: Array<Record<string, JsonValue | readonly string[] | undefined>>;
  schemaVersion: "cptv-registration-review/v1";
}

type CoverageBaselineV1 = Record<CoverageCategoryNameV1, CoverageBaselineCategoryV1>;

export interface CoverageRegressionV1 {
  baselinePercentage: number;
  category: CoverageCategoryNameV1;
  currentPercentage: number | null;
}

export interface CliRegistrationPlanV1 {
  candidates: RegistrationCandidateV1[];
  decisions: RegistrationDecisionV1[];
  edit: {
    content: string;
    contentSha256: `sha256:${string}`;
    kind: "create-file";
    path: string;
  } | null;
  kind: "cptv-registration-plan";
  patch: string;
  registrationPlan: ReturnType<typeof planPropertyRegistrations>;
  reviewedDigest: `sha256:${string}`;
  schemaVersion: typeof CLI_PLAN_SCHEMA_VERSION;
  sourceFingerprints: SourceFingerprintV1[];
}

export class CliWorkflowError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "CliWorkflowError";
    this.code = code;
  }
}

type JsonRecord = Record<string, unknown>;

const SHA256_PATTERN = /^sha256:[a-f\d]{64}$/u;
const COVERAGE_CATEGORIES = [
  "assignments",
  "consumers",
  "fallbacks",
  "references",
  "registrationRules",
] as const satisfies readonly CoverageCategoryNameV1[];

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertRecord(
  value: unknown,
  code: string,
  label: string,
  required: readonly string[],
  optional: readonly string[] = [],
): asserts value is JsonRecord {
  if (!isRecord(value)) {
    throw new CliWorkflowError(code, `${label} must be an object.`);
  }
  const allowed = new Set([...required, ...optional]);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  const missing = required.filter((key) => !(key in value));
  if (unknown.length > 0 || missing.length > 0) {
    throw new CliWorkflowError(
      code,
      `${label} has ${unknown.length > 0 ? `unknown field(s): ${unknown.sort(compareText).join(", ")}` : `missing field(s): ${missing.join(", ")}`}.`,
    );
  }
}

function assertSha256(
  value: unknown,
  code: string,
  label: string,
): asserts value is `sha256:${string}` {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw new CliWorkflowError(code, `${label} must be a canonical sha256: fingerprint.`);
  }
}

function assertUniqueBy(
  values: readonly unknown[],
  selector: (value: unknown) => unknown,
  code: string,
  label: string,
): void {
  const selected = values.map(selector);
  if (new Set(selected).size !== selected.length) {
    throw new CliWorkflowError(code, `${label} must not contain duplicates.`);
  }
}

function assertRecordArray(
  value: unknown,
  code: string,
  label: string,
  required: readonly string[],
  optional: readonly string[] = [],
): asserts value is JsonRecord[] {
  if (!Array.isArray(value)) {
    throw new CliWorkflowError(code, `${label} must be an array.`);
  }
  value.forEach((entry) => assertRecord(entry, code, label, required, optional));
}

function validateSpecificationProfile(value: unknown, code: string): void {
  assertRecord(value, code, "Specification profile", [
    "editorsDraftUrl",
    "latestPublishedUrl",
    "publicationDate",
    "snapshotUrl",
    "title",
  ]);
  for (const [key, expected] of Object.entries(CSS_PROPERTIES_VALUES_SPECIFICATION)) {
    if (value[key] !== expected) {
      throw new CliWorkflowError(code, `Specification profile field ${key} is incompatible.`);
    }
  }
}

function validateToolProfile(value: unknown, code: string): void {
  assertRecord(value, code, "Tool profile", ["name", "version"]);
  if (value.name !== CORE_TOOL_NAME || value.version !== CORE_TOOL_VERSION) {
    throw new CliWorkflowError(
      code,
      `Tool profile must be ${CORE_TOOL_NAME}@${CORE_TOOL_VERSION}.`,
    );
  }
}

function validateSourceFingerprints(value: unknown, code: string): SourceFingerprintV1[] {
  if (!Array.isArray(value)) {
    throw new CliWorkflowError(code, "sourceFingerprints must be an array.");
  }
  for (const fingerprint of value) {
    assertRecord(fingerprint, code, "Source fingerprint", ["path", "sha256"]);
    if (typeof fingerprint.path !== "string" || fingerprint.path.length === 0) {
      throw new CliWorkflowError(code, "Source fingerprint path must be a non-empty string.");
    }
    assertSha256(fingerprint.sha256, code, "Source fingerprint sha256");
  }
  assertUniqueBy(value, (entry) => (entry as JsonRecord).path, code, "sourceFingerprints paths");
  return value as SourceFingerprintV1[];
}

function coverageBaseline(
  categories: AnalysisResultV1["coverage"]["categories"],
): CoverageBaselineV1 {
  return Object.fromEntries(
    COVERAGE_CATEGORIES.map((category) => {
      const value = categories[category];
      return [
        category,
        {
          analyzed: value.analyzed,
          percentage: value.total === 0 ? null : value.analyzed / value.total,
          skipped: value.skipped,
          total: value.total,
        },
      ];
    }),
  ) as CoverageBaselineV1;
}

function validateCoverageBaseline(value: unknown, code: string): CoverageBaselineV1 {
  assertRecord(value, code, "Baseline coverage categories", COVERAGE_CATEGORIES);
  for (const category of COVERAGE_CATEGORIES) {
    const entry = value[category];
    assertRecord(entry, code, `Baseline coverage category ${category}`, [
      "analyzed",
      "percentage",
      "skipped",
      "total",
    ]);
    for (const field of ["analyzed", "skipped", "total"] as const) {
      if (!Number.isSafeInteger(entry[field]) || Number(entry[field]) < 0) {
        throw new CliWorkflowError(code, `Baseline coverage ${category}.${field} is invalid.`);
      }
    }
    if (Number(entry.analyzed) + Number(entry.skipped) !== Number(entry.total)) {
      throw new CliWorkflowError(code, `Baseline coverage ${category} totals are inconsistent.`);
    }
    const expected =
      Number(entry.total) === 0 ? null : Number(entry.analyzed) / Number(entry.total);
    if (entry.percentage !== expected) {
      throw new CliWorkflowError(code, `Baseline coverage ${category}.percentage is inconsistent.`);
    }
  }
  return value as unknown as CoverageBaselineV1;
}

function validateGateEvaluation(value: unknown, code: string): void {
  assertRecord(value, code, "Gate evaluation", [
    "baseline",
    "coverageFailed",
    "coverageRegressions",
    "diagnosticFailures",
    "passed",
  ]);
  if (
    typeof value.coverageFailed !== "boolean" ||
    typeof value.passed !== "boolean" ||
    !Array.isArray(value.coverageRegressions) ||
    !Array.isArray(value.diagnosticFailures)
  ) {
    throw new CliWorkflowError(code, "Gate evaluation collections are malformed.");
  }
  value.diagnosticFailures.forEach((diagnostic) => validateCliDiagnostic(diagnostic, code));
  for (const regression of value.coverageRegressions) {
    assertRecord(regression, code, "Coverage regression", [
      "baselinePercentage",
      "category",
      "currentPercentage",
    ]);
    if (
      !COVERAGE_CATEGORIES.includes(regression.category as CoverageCategoryNameV1) ||
      typeof regression.baselinePercentage !== "number" ||
      regression.baselinePercentage < 0 ||
      regression.baselinePercentage > 1 ||
      (regression.currentPercentage !== null &&
        (typeof regression.currentPercentage !== "number" ||
          regression.currentPercentage < 0 ||
          regression.currentPercentage > 1))
    ) {
      throw new CliWorkflowError(code, "Coverage regression is malformed.");
    }
  }
  if (value.baseline !== null) {
    assertRecord(value.baseline, code, "Gate baseline recovery", [
      "matchedFingerprints",
      "newFingerprints",
      "staleFingerprints",
    ]);
    for (const key of ["matchedFingerprints", "newFingerprints", "staleFingerprints"] as const) {
      const fingerprints = value.baseline[key];
      if (!Array.isArray(fingerprints)) {
        throw new CliWorkflowError(code, `Gate baseline ${key} must be an array.`);
      }
      fingerprints.forEach((fingerprint) =>
        assertSha256(fingerprint, code, `Gate baseline ${key} fingerprint`),
      );
    }
  }
}

function validateAnalysisEnvelope(value: unknown, code: string): asserts value is AnalysisResultV1 {
  assertRecord(value, code, "Analysis", [
    "aliasCycles",
    "candidates",
    "configuration",
    "conflicts",
    "coverage",
    "diagnostics",
    "entryPoints",
    "inputs",
    "inventory",
    "opportunities",
    "schemaVersion",
    "skips",
    "specification",
    "tool",
  ]);
  if (value.schemaVersion !== ANALYSIS_RESULT_SCHEMA_VERSION) {
    throw new CliWorkflowError(code, `Analysis schema must be ${ANALYSIS_RESULT_SCHEMA_VERSION}.`);
  }
  validateSpecificationProfile(value.specification, code);
  validateToolProfile(value.tool, code);
  assertRecord(value.inventory, code, "Analysis inventory", [
    "aliases",
    "assignments",
    "consumers",
    "fallbacks",
    "imports",
    "references",
    "registrationOccurrences",
    "registrations",
  ]);
  for (const [key, entries] of Object.entries(value.inventory)) {
    if (!Array.isArray(entries)) {
      throw new CliWorkflowError(code, `Analysis inventory ${key} must be an array.`);
    }
  }
  const occurrence = ["entryPoints", "filePath", "id", "loc", "specReferences"];
  assertRecordArray(value.inventory.aliases, code, "Alias occurrence", [
    ...occurrence,
    "name",
    "target",
  ]);
  assertRecordArray(value.inventory.assignments, code, "Assignment occurrence", [
    ...occurrence,
    "name",
    "value",
  ]);
  assertRecordArray(value.inventory.consumers, code, "Consumer occurrence", [
    ...occurrence,
    "property",
    "referenceIds",
  ]);
  assertRecordArray(value.inventory.fallbacks, code, "Fallback occurrence", [
    ...occurrence,
    "referenceId",
    "value",
  ]);
  assertRecordArray(
    value.inventory.imports,
    code,
    "Import occurrence",
    [...occurrence, "conditional", "fromPath", "order", "resolution", "specifier"],
    ["toPath"],
  );
  assertRecordArray(
    value.inventory.references,
    code,
    "Reference occurrence",
    [...occurrence, "consumerProperty", "name"],
    ["assignmentName", "fallbackId"],
  );
  assertRecordArray(
    value.inventory.registrationOccurrences,
    code,
    "Registration occurrence",
    [...occurrence, "name", "status"],
    ["inherits", "initialValue", "syntax"],
  );
  assertRecordArray(
    value.inventory.registrations,
    code,
    "Registered property",
    ["filePath", "loc", "name", "syntax"],
    ["inherits", "initialValue"],
  );
  assertRecord(value.configuration, code, "Analysis configuration", [
    "checkUnresolvedCustomProperties",
    "knownCustomPropertyInputCount",
    "registryInputCount",
    "resolveImportEnabled",
  ]);
  assertRecord(value.coverage, code, "Analysis coverage", [
    "categories",
    "skippedDeclarations",
    "validatedDeclarations",
  ]);
  assertRecord(value.coverage.categories, code, "Analysis coverage categories", [
    "assignments",
    "consumers",
    "fallbacks",
    "references",
    "registrationRules",
  ]);
  for (const category of Object.values(value.coverage.categories)) {
    assertRecord(category, code, "Analysis coverage category", ["analyzed", "skipped", "total"]);
  }
  assertRecordArray(value.inputs, code, "Analysis input", ["path", "sourceBytes"]);
  assertRecordArray(value.entryPoints, code, "Analysis entry point", [
    "path",
    "reachableInputs",
    "status",
  ]);
  assertRecordArray(
    value.conflicts,
    code,
    "Registration conflict",
    ["entryPoints", "kind", "name", "occurrenceIds", "ordering", "specReferences", "status"],
    ["effectiveEntryPoint", "effectiveRegistrationId"],
  );
  assertRecordArray(value.aliasCycles, code, "Alias cycle", [
    "aliasIds",
    "entryPoints",
    "names",
    "specReferences",
    "status",
  ]);
  assertRecordArray(value.skips, code, "Analysis skip", ["code", "reason", "status", "subject"]);
  assertRecordArray(
    value.candidates,
    code,
    "Registration candidate",
    [
      "confidence",
      "evidence",
      "id",
      "legacyGeneratorStatus",
      "name",
      "policyIds",
      "reason",
      "specReferences",
      "status",
    ],
    ["suggestedInitialValue", "suggestedSyntax"],
  );
  assertUniqueBy(
    value.candidates,
    (candidate) => (candidate as JsonRecord).id,
    code,
    "Plan registration candidates",
  );
  if (!Array.isArray(value.diagnostics)) {
    throw new CliWorkflowError(code, "Analysis diagnostics must be an array.");
  }
  assertRecord(value.opportunities, code, "Analysis opportunities", ["animations"]);
  assertRecordArray(value.opportunities.animations, code, "Animation opportunity", [
    "confidence",
    "entryPoints",
    "evidence",
    "id",
    "name",
    "registrationStatus",
    "specReferences",
    "status",
  ]);
}

function validateCliDiagnostic(value: unknown, code: string): asserts value is CliDiagnosticV1 {
  assertRecord(
    value,
    code,
    "CLI diagnostic",
    [
      "baselineFingerprint",
      "basis",
      "code",
      "confidence",
      "evidence",
      "filePath",
      "fingerprint",
      "gating",
      "id",
      "legacyCode",
      "location",
      "message",
      "phase",
      "provenance",
      "reason",
      "relatedLocations",
      "severity",
      "specReferences",
      "suggestedEdits",
    ],
    ["actualValue", "propertyName", "snippet"],
  );
  assertSha256(value.baselineFingerprint, code, "Diagnostic baselineFingerprint");
  assertSha256(value.fingerprint, code, "Diagnostic fingerprint");
  if (value.fingerprint !== value.baselineFingerprint || value.code !== value.id) {
    throw new CliWorkflowError(code, "Diagnostic compatibility aliases do not match core fields.");
  }
  if (value.basis !== "direct" && value.basis !== "representative-var-substitution") {
    throw new CliWorkflowError(code, "Diagnostic basis is incompatible.");
  }
  if (!["gating", "review-required", "advisory"].includes(String(value.gating))) {
    throw new CliWorkflowError(code, "Diagnostic gating disposition is incompatible.");
  }
  assertRecord(value.confidence, code, "Diagnostic confidence", ["level", "reasons"]);
  if (
    !["high", "medium", "low"].includes(String(value.confidence.level)) ||
    !Array.isArray(value.confidence.reasons)
  ) {
    throw new CliWorkflowError(code, "Diagnostic confidence is malformed.");
  }
  assertRecord(value.provenance, code, "Diagnostic provenance", ["classification", "ruleId"]);
  assertRecordArray(value.evidence, code, "Diagnostic evidence", ["kind", "value"]);
  assertRecordArray(value.relatedLocations, code, "Diagnostic related location", [
    "location",
    "message",
  ]);
  assertRecordArray(value.suggestedEdits, code, "Diagnostic suggested edit", [
    "applicability",
    "endOffset",
    "filePath",
    "replacement",
    "sourceFingerprint",
    "startOffset",
  ]);
  for (const edit of value.suggestedEdits) {
    assertSha256(edit.sourceFingerprint, code, "Suggested edit sourceFingerprint");
  }
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value), null, 2);
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value as Record<string, unknown>)
      .sort(compareText)
      .map((key) => [key, sortJson((value as Record<string, unknown>)[key])]),
  );
}

export function sha256(value: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function sourceFingerprints(inputs: readonly ValidationInput[]): SourceFingerprintV1[] {
  const ordered = [...inputs].sort(
    (left, right) => compareText(left.path, right.path) || compareText(left.css, right.css),
  );
  return [...new Map(ordered.map((input) => [input.path, input])).values()]
    .map((input) => ({ path: input.path, sha256: sha256(input.css) }))
    .sort((left, right) => compareText(left.path, right.path));
}

function redactedDiagnosticFingerprint(diagnostic: ValidationDiagnostic): `sha256:${string}` {
  return sha256(
    stableJson({
      filePath: diagnostic.filePath,
      id: diagnostic.id,
      location: diagnostic.location,
      phase: diagnostic.phase,
      reason: diagnostic.reason,
    }),
  );
}

function redactValidationDiagnostic(diagnostic: ValidationDiagnostic): ValidationDiagnostic {
  const baselineFingerprint = redactedDiagnosticFingerprint(diagnostic);
  return {
    baselineFingerprint,
    basis: diagnostic.basis,
    code: diagnostic.code,
    confidence: {
      level: diagnostic.confidence.level,
      reasons: ["Source-bearing confidence rationale redacted by CLI privacy policy."],
    },
    evidence: [],
    filePath: diagnostic.filePath,
    gating: diagnostic.gating,
    id: diagnostic.id,
    loc: diagnostic.loc,
    location: diagnostic.location,
    message: `Source-bearing diagnostic details redacted for ${diagnostic.id}.`,
    phase: diagnostic.phase,
    provenance: diagnostic.provenance,
    reason: diagnostic.reason,
    relatedLocations: diagnostic.relatedLocations.map((related) => ({
      location: related.location,
      message: "Source-bearing related-location details redacted by CLI privacy policy.",
    })),
    severity: diagnostic.severity,
    specReferences: diagnostic.specReferences,
    suggestedEdits: [],
  };
}

function toCliDiagnostic(diagnostic: ValidationDiagnostic, redactSource: boolean): CliDiagnosticV1 {
  const projected = redactSource ? redactValidationDiagnostic(diagnostic) : diagnostic;
  return {
    baselineFingerprint: projected.baselineFingerprint,
    basis: projected.basis,
    code: projected.id,
    confidence: projected.confidence,
    evidence: projected.evidence,
    filePath: projected.filePath,
    fingerprint: projected.baselineFingerprint,
    gating: projected.gating,
    id: projected.id,
    legacyCode: projected.code,
    location: projected.location,
    message: projected.message,
    phase: projected.phase,
    provenance: projected.provenance,
    reason: projected.reason,
    relatedLocations: projected.relatedLocations,
    severity: projected.severity,
    specReferences: projected.specReferences,
    suggestedEdits: projected.suggestedEdits,
    ...(projected.propertyName === undefined ? {} : { propertyName: projected.propertyName }),
    ...(projected.actualValue === undefined ? {} : { actualValue: projected.actualValue }),
    ...(projected.snippet === undefined ? {} : { snippet: projected.snippet }),
  };
}

function redactAnalysis(analysis: AnalysisResultV1): AnalysisResultV1 {
  return {
    ...analysis,
    aliasCycles: [],
    candidates: [],
    conflicts: [],
    diagnostics: analysis.diagnostics.map(redactValidationDiagnostic),
    inventory: {
      aliases: [],
      assignments: [],
      consumers: [],
      fallbacks: [],
      imports: [],
      references: [],
      registrationOccurrences: [],
      registrations: [],
    },
    opportunities: { animations: [] },
  } as AnalysisResultV1;
}

export function createAudit(
  inputs: readonly ValidationInput[],
  options: AnalyzeInputsOptions & {
    fingerprintInputs?: readonly ValidationInput[];
    redactSource?: boolean;
  } = {},
): CliAuditV1 {
  const { fingerprintInputs = [], redactSource = false, ...analysisOptions } = options;
  const rawAnalysis = analyzeInputs(inputs, analysisOptions);
  const denominator =
    rawAnalysis.coverage.validatedDeclarations + rawAnalysis.coverage.skippedDeclarations;
  const diagnostics = rawAnalysis.diagnostics
    .map((diagnostic) => toCliDiagnostic(diagnostic, redactSource))
    .sort(
      (left, right) =>
        compareText(left.filePath, right.filePath) ||
        (left.location?.start.offset ?? -1) - (right.location?.start.offset ?? -1) ||
        compareText(left.code, right.code),
    );

  return {
    analysis: redactSource ? redactAnalysis(rawAnalysis) : rawAnalysis,
    coverage: {
      percentage:
        denominator === 0 ? null : rawAnalysis.coverage.validatedDeclarations / denominator,
      skipped: rawAnalysis.coverage.skippedDeclarations,
      validated: rawAnalysis.coverage.validatedDeclarations,
    },
    diagnostics,
    gateEvaluation: null,
    kind: "cptv-audit",
    schemaVersion: CLI_AUDIT_SCHEMA_VERSION,
    sourceFingerprints: redactSource
      ? []
      : sourceFingerprints([
          ...inputs,
          ...fingerprintInputs,
          ...(analysisOptions.registryInputs ?? []),
          ...(analysisOptions.knownCustomPropertyInputs ?? []),
        ]),
    sourceRedacted: redactSource,
  };
}

export function parseAudit(value: unknown): CliAuditV1 {
  const code = "CPTV_CLI_INVALID_AUDIT";
  assertRecord(value, code, "CLI audit", [
    "analysis",
    "coverage",
    "diagnostics",
    "gateEvaluation",
    "kind",
    "schemaVersion",
    "sourceFingerprints",
    "sourceRedacted",
  ]);
  if (value.kind !== "cptv-audit" || value.schemaVersion !== CLI_AUDIT_SCHEMA_VERSION) {
    throw new CliWorkflowError(code, `Audit must use schema ${CLI_AUDIT_SCHEMA_VERSION}.`);
  }
  validateAnalysisEnvelope(value.analysis, code);
  assertRecord(value.coverage, code, "CLI audit coverage", ["percentage", "skipped", "validated"]);
  if (!Array.isArray(value.diagnostics)) {
    throw new CliWorkflowError(code, "Audit diagnostics must be an array.");
  }
  value.diagnostics.forEach((diagnostic) => validateCliDiagnostic(diagnostic, code));
  if (value.gateEvaluation !== null) validateGateEvaluation(value.gateEvaluation, code);
  validateSourceFingerprints(value.sourceFingerprints, code);
  if (typeof value.sourceRedacted !== "boolean") {
    throw new CliWorkflowError(code, "Audit sourceRedacted must be a boolean.");
  }
  return value as unknown as CliAuditV1;
}

export function createBaseline(audit: CliAuditV1): CliBaselineV1 {
  return {
    coverageCategories: coverageBaseline(audit.analysis.coverage.categories),
    diagnosticFingerprints: audit.diagnostics
      .filter((diagnostic) => diagnostic.gating === "gating")
      .map((diagnostic) => diagnostic.fingerprint)
      .sort(compareText),
    kind: "cptv-baseline",
    schemaVersion: CLI_BASELINE_SCHEMA_VERSION,
  };
}

export function parseBaseline(value: unknown): CliBaselineV1 {
  const code = "CPTV_CLI_INVALID_BASELINE";
  assertRecord(
    value,
    code,
    "Baseline",
    ["diagnosticFingerprints", "kind", "schemaVersion"],
    ["coverageCategories"],
  );
  if (
    value.kind !== "cptv-baseline" ||
    value.schemaVersion !== CLI_BASELINE_SCHEMA_VERSION ||
    !Array.isArray(value.diagnosticFingerprints)
  ) {
    throw new CliWorkflowError(code, `Baseline must use schema ${CLI_BASELINE_SCHEMA_VERSION}.`);
  }
  value.diagnosticFingerprints.forEach((fingerprint) =>
    assertSha256(fingerprint, code, "Baseline diagnostic fingerprint"),
  );
  assertUniqueBy(
    value.diagnosticFingerprints,
    (fingerprint) => fingerprint,
    code,
    "Baseline diagnostic fingerprints",
  );
  const coverageCategories =
    value.coverageCategories === undefined
      ? undefined
      : validateCoverageBaseline(value.coverageCategories, code);
  return {
    ...(coverageCategories === undefined ? {} : { coverageCategories }),
    diagnosticFingerprints: [...value.diagnosticFingerprints].sort(
      compareText,
    ) as Array<`sha256:${string}`>,
    kind: "cptv-baseline",
    schemaVersion: CLI_BASELINE_SCHEMA_VERSION,
  };
}

export function evaluateGates(
  audit: CliAuditV1,
  options: {
    baseline?: CliBaselineV1;
    coverageRegression?: boolean;
    minCoverage?: number;
    newOnly?: boolean;
  } = {},
): GateEvaluationV1 {
  if (options.newOnly && !options.baseline) {
    throw new CliWorkflowError(
      "CPTV_CLI_BASELINE_REQUIRED",
      "--new-only requires --baseline <file>.",
    );
  }
  if (
    options.minCoverage !== undefined &&
    (!Number.isFinite(options.minCoverage) || options.minCoverage < 0 || options.minCoverage > 1)
  ) {
    throw new CliWorkflowError(
      "CPTV_CLI_INVALID_COVERAGE",
      "Minimum coverage must be a percentage from 0 through 100.",
    );
  }

  const baseline = new Set(options.baseline?.diagnosticFingerprints ?? []);
  const currentGating = audit.diagnostics.filter((diagnostic) => diagnostic.gating === "gating");
  const currentFingerprints = new Set(currentGating.map((diagnostic) => diagnostic.fingerprint));
  const diagnosticFailures = audit.diagnostics.filter(
    (diagnostic) =>
      diagnostic.gating === "gating" && (!options.newOnly || !baseline.has(diagnostic.fingerprint)),
  );
  if (options.coverageRegression && !options.baseline?.coverageCategories) {
    throw new CliWorkflowError(
      "CPTV_CLI_COVERAGE_BASELINE_REQUIRED",
      "Coverage regression requires a category-aware baseline; regenerate it with --write-baseline.",
    );
  }
  const currentCoverage = coverageBaseline(audit.analysis.coverage.categories);
  const coverageRegressions: CoverageRegressionV1[] = options.coverageRegression
    ? COVERAGE_CATEGORIES.flatMap((category) => {
        const previous = options.baseline!.coverageCategories![category].percentage;
        const current = currentCoverage[category].percentage;
        return previous !== null && (current === null || current < previous)
          ? [{ baselinePercentage: previous, category, currentPercentage: current }]
          : [];
      })
    : [];
  const minimumCoverageFailed =
    options.minCoverage !== undefined &&
    (audit.coverage.percentage === null || audit.coverage.percentage < options.minCoverage);
  const coverageFailed = minimumCoverageFailed || coverageRegressions.length > 0;
  return {
    baseline: options.baseline
      ? {
          matchedFingerprints: [...currentFingerprints]
            .filter((fingerprint) => baseline.has(fingerprint))
            .sort(compareText),
          newFingerprints: [...currentFingerprints]
            .filter((fingerprint) => !baseline.has(fingerprint))
            .sort(compareText),
          staleFingerprints: [...baseline]
            .filter((fingerprint) => !currentFingerprints.has(fingerprint))
            .sort(compareText),
        }
      : null,
    coverageFailed,
    coverageRegressions,
    diagnosticFailures,
    passed: diagnosticFailures.length === 0 && !coverageFailed,
  };
}

function asJsonValue(value: unknown): JsonValue {
  return JSON.parse(stableJson(value)) as JsonValue;
}

function safeRegistrationPatchTemplate(candidate: RegistrationCandidateV1): string | undefined {
  if (
    candidate.status !== "review-required" ||
    !candidate.suggestedSyntax ||
    candidate.suggestedSyntax === "*" ||
    /["\\\r\n]/u.test(candidate.suggestedSyntax) ||
    !/^--[-_a-zA-Z0-9]+$/u.test(candidate.name)
  ) {
    return undefined;
  }
  return [
    `@property ${candidate.name} {`,
    '  syntax: "{syntax}";',
    "  inherits: {inherits};",
    "  {initialValueDeclaration}",
    "}",
  ].join("\n");
}

function registrationReview(
  candidates: readonly RegistrationCandidateV1[],
): RegistrationReviewPayloadV1 {
  return {
    candidates: candidates.map((candidate) => {
      const patchTemplate = safeRegistrationPatchTemplate(candidate);
      return {
        confidence: asJsonValue(candidate.confidence),
        evidence: asJsonValue(candidate.evidence),
        id: candidate.id,
        propertyName: candidate.name,
        requiresInherits: true,
        requiresInitialValue: true,
        specReferences: candidate.specReferences.map((reference) => reference.url),
        syntaxAlternatives:
          candidate.suggestedSyntax === undefined
            ? []
            : [
                {
                  confidence: asJsonValue(candidate.confidence),
                  evidence: asJsonValue(candidate.evidence),
                  id: `${candidate.id}:suggested-syntax`,
                  isUniversalSyntax: candidate.suggestedSyntax === "*",
                  specReferences: candidate.specReferences.map((reference) => reference.url),
                  syntax: candidate.suggestedSyntax,
                },
              ],
        title: candidate.reason,
        ...(patchTemplate === undefined ? {} : { patchTemplate }),
      };
    }),
    schemaVersion: "cptv-registration-review/v1",
  };
}

function assertReportDeliveryCompatibility(html: string): void {
  const validation = validateReportForEphemeral(html, EPHEMERAL_PAGES_CONTRACT);
  if (!validation.ok) {
    throw new CliWorkflowError("CPTV_CLI_REPORT_INCOMPATIBLE", validation.problems.join(" "));
  }
  const compressedValidation = validateCompressedReportForEphemeral(
    html,
    brotliCompressSync(Buffer.from(html, "utf8")).byteLength,
    EPHEMERAL_PAGES_CONTRACT,
  );
  if (!compressedValidation.ok) {
    throw new CliWorkflowError(
      "CPTV_CLI_REPORT_INCOMPATIBLE",
      compressedValidation.problems.join(" "),
    );
  }
}

function sarifLevel(diagnostic: CliDiagnosticV1): "error" | "note" | "warning" {
  return diagnostic.gating === "gating" ? "error" : "warning";
}

export function formatSarif(audit: CliAuditV1): string {
  const rules = [...new Set(audit.diagnostics.map((diagnostic) => diagnostic.code))]
    .sort(compareText)
    .map((code) => {
      const diagnostic = audit.diagnostics.find((candidate) => candidate.code === code)!;
      return {
        helpUri: diagnostic.specReferences[0]?.url,
        id: code,
        name: diagnostic.reason,
        properties: {
          confidence: diagnostic.confidence.level,
          gating: diagnostic.gating,
          specReferences: diagnostic.specReferences.map((reference) => reference.url),
        },
        shortDescription: { text: diagnostic.message },
      };
    });
  const results = audit.diagnostics.map((diagnostic) => {
    const safeEdits = diagnostic.suggestedEdits.filter(
      (edit) =>
        edit.applicability === "safe" &&
        edit.startOffset >= 0 &&
        edit.endOffset >= edit.startOffset &&
        /^sha256:[a-f\d]{64}$/u.test(edit.sourceFingerprint),
    );
    return {
      fingerprints: { "cptv/v1": diagnostic.fingerprint },
      ...(safeEdits.length === 0
        ? {}
        : {
            fixes: safeEdits.map((edit) => ({
              artifactChanges: [
                {
                  artifactLocation: { uri: edit.filePath },
                  replacements: [
                    {
                      deletedRegion: {
                        charLength: edit.endOffset - edit.startOffset,
                        charOffset: edit.startOffset,
                      },
                      insertedContent: { text: edit.replacement },
                    },
                  ],
                },
              ],
              description: { text: `Apply exact safe edit for ${diagnostic.id}.` },
              properties: { sourceFingerprint: edit.sourceFingerprint },
            })),
          }),
      level: sarifLevel(diagnostic),
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: diagnostic.filePath },
            ...(diagnostic.location === null
              ? {}
              : {
                  region: {
                    charLength: Math.max(
                      0,
                      diagnostic.location.end.offset - diagnostic.location.start.offset,
                    ),
                    endColumn: diagnostic.location.end.column,
                    endLine: diagnostic.location.end.line,
                    startColumn: diagnostic.location.start.column,
                    startLine: diagnostic.location.start.line,
                  },
                }),
          },
        },
      ],
      message: { text: diagnostic.message },
      ...(diagnostic.relatedLocations.length === 0
        ? {}
        : {
            relatedLocations: diagnostic.relatedLocations.map((related, index) => ({
              id: index + 1,
              message: { text: related.message },
              physicalLocation: {
                artifactLocation: {
                  uri: related.location.source ?? diagnostic.filePath,
                },
                region: {
                  charLength: Math.max(
                    0,
                    related.location.end.offset - related.location.start.offset,
                  ),
                  endColumn: related.location.end.column,
                  endLine: related.location.end.line,
                  startColumn: related.location.start.column,
                  startLine: related.location.start.line,
                },
              },
            })),
          }),
      ruleId: diagnostic.code,
    };
  });
  return stableJson({
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    runs: [
      {
        results,
        tool: {
          driver: {
            informationUri: "https://github.com/schalkneethling/css-property-type-validator",
            name: "CSS Property Type Validator",
            rules,
            version: audit.analysis.tool.version,
          },
        },
      },
    ],
    version: "2.1.0",
  });
}

export function formatAudit(audit: CliAuditV1, format: AdoptionOutputFormat): string {
  if (format === "json") return stableJson(audit);
  if (format === "sarif") return formatSarif(audit);
  if (format === "html") {
    const report = renderStandaloneReport(
      {
        analysis: asJsonValue(audit),
        registrationReview: registrationReview(audit.analysis.candidates),
        title: "CSS Property Type Validator audit",
      } as never,
      EPHEMERAL_PAGES_CONTRACT,
    );
    assertReportDeliveryCompatibility(report.html);
    return report.html;
  }

  const coverage =
    audit.coverage.percentage === null
      ? "unknown"
      : `${(audit.coverage.percentage * 100).toFixed(1)}%`;
  const lines = [
    `Audit: ${audit.diagnostics.length} diagnostic${audit.diagnostics.length === 1 ? "" : "s"}; coverage ${coverage}.`,
  ];
  for (const diagnostic of audit.diagnostics) {
    const location = diagnostic.location
      ? `${diagnostic.filePath}:${diagnostic.location.start.line}:${diagnostic.location.start.column}`
      : diagnostic.filePath;
    lines.push(
      `${diagnostic.gating === "gating" ? "error" : "review"} ${diagnostic.code} ${location} ${diagnostic.message}`,
    );
  }
  for (const skip of audit.analysis.skips) lines.push(`uncertain ${skip.code} ${skip.reason}`);
  if (audit.gateEvaluation?.baseline?.staleFingerprints.length) {
    lines.push(
      `baseline-recovery ${audit.gateEvaluation.baseline.staleFingerprints.length} stale fingerprint${audit.gateEvaluation.baseline.staleFingerprints.length === 1 ? "" : "s"}; regenerate the baseline after review.`,
    );
  }
  for (const regression of audit.gateEvaluation?.coverageRegressions ?? []) {
    lines.push(
      `coverage-regression ${regression.category} ${(regression.baselinePercentage * 100).toFixed(1)}% -> ${regression.currentPercentage === null ? "unknown" : `${(regression.currentPercentage * 100).toFixed(1)}%`}`,
    );
  }
  return lines.join("\n");
}

function normalizeDecisions(value: unknown): RegistrationDecisionV1[] {
  const code = "CPTV_CLI_INVALID_DECISIONS";
  let decisions: unknown[] | null = null;
  if (Array.isArray(value)) {
    decisions = value;
  } else if (isRecord(value)) {
    const canonical = "kind" in value || "schemaVersion" in value;
    assertRecord(
      value,
      code,
      "Decisions document",
      canonical ? ["decisions", "kind", "schemaVersion"] : ["decisions"],
    );
    if (
      canonical &&
      (value.kind !== "cptv-registration-decisions" || value.schemaVersion !== "1.0.0")
    ) {
      throw new CliWorkflowError(code, "Decisions document must use schema 1.0.0.");
    }
    decisions = Array.isArray(value.decisions) ? value.decisions : null;
  }
  if (!decisions) {
    throw new CliWorkflowError(
      code,
      "Decisions must be a JSON array or an object with a decisions array.",
    );
  }
  for (const decision of decisions) {
    assertRecord(
      decision,
      code,
      "Registration decision",
      ["action", "candidateId"],
      ["inherits", "initialValue", "syntax"],
    );
    if (typeof decision.candidateId !== "string" || decision.candidateId.length === 0) {
      throw new CliWorkflowError(code, "Each decision must identify a non-empty candidate.");
    }
    if (decision.action !== "accept" && decision.action !== "reject") {
      throw new CliWorkflowError(code, "Each decision action must be accept or reject.");
    }
    if (decision.inherits !== undefined && typeof decision.inherits !== "boolean") {
      throw new CliWorkflowError(code, "Decision inherits must be a boolean when present.");
    }
    for (const field of ["initialValue", "syntax"] as const) {
      if (decision[field] !== undefined && typeof decision[field] !== "string") {
        throw new CliWorkflowError(code, `Decision ${field} must be a string when present.`);
      }
    }
  }
  assertUniqueBy(decisions, (decision) => (decision as JsonRecord).candidateId, code, "Decisions");
  return decisions as RegistrationDecisionV1[];
}

export function parseDecisions(value: unknown): RegistrationDecisionV1[] {
  return normalizeDecisions(value);
}

async function containedAbsentTarget(projectRoot: string, target: string): Promise<string> {
  const canonicalRoot = await realpath(projectRoot);
  const absoluteTarget = path.isAbsolute(target)
    ? path.normalize(target)
    : path.resolve(projectRoot, target);
  const canonicalParent = await realpath(path.dirname(absoluteTarget));
  const relative = path.relative(canonicalRoot, path.join(canonicalParent, path.basename(target)));
  if (relative === "" || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new CliWorkflowError(
      "CPTV_CLI_TARGET_OUTSIDE_ROOT",
      `Plan target is outside the project root: ${target}`,
    );
  }
  try {
    await lstat(absoluteTarget);
    throw new CliWorkflowError(
      "CPTV_CLI_TARGET_EXISTS",
      `Plan target already exists; replacement edits are not supported: ${absoluteTarget}`,
    );
  } catch (error) {
    if (error instanceof CliWorkflowError) throw error;
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  return path.join(canonicalParent, path.basename(target));
}

function createFilePatch(target: string, content: string): string {
  const relativeTarget = target.replaceAll("\\", "/");
  const additions = content.split("\n").map((line) => `+${line}`);
  return [
    "--- /dev/null",
    `+++ b/${relativeTarget}`,
    "@@ -0,0 +1," + additions.length + " @@",
    ...additions,
  ].join("\n");
}

type UnsignedRegistrationPlanV1 = Omit<CliRegistrationPlanV1, "reviewedDigest">;

function reviewedPlanDigest(plan: UnsignedRegistrationPlanV1): `sha256:${string}` {
  return sha256(
    stableJson({
      candidates: plan.candidates,
      decisions: plan.decisions,
      edit:
        plan.edit === null
          ? null
          : {
              contentSha256: plan.edit.contentSha256,
              kind: plan.edit.kind,
              path: plan.edit.path,
            },
      kind: plan.kind,
      patch: plan.patch,
      registrationPlan: plan.registrationPlan,
      schemaVersion: plan.schemaVersion,
      sourceFingerprints: plan.sourceFingerprints,
    }),
  );
}

function validateCoreRegistrationPlan(
  value: unknown,
  code: string,
): asserts value is ReturnType<typeof planPropertyRegistrations> {
  assertRecord(value, code, "Core registration plan", [
    "analysisSchemaVersion",
    "css",
    "diagnostics",
    "registrations",
    "schemaVersion",
    "skips",
    "specification",
    "tool",
  ]);
  if (
    value.analysisSchemaVersion !== ANALYSIS_RESULT_SCHEMA_VERSION ||
    value.schemaVersion !== REGISTRATION_PLAN_SCHEMA_VERSION
  ) {
    throw new CliWorkflowError(
      code,
      "Nested analysis or registration-plan schema is incompatible.",
    );
  }
  validateSpecificationProfile(value.specification, code);
  validateToolProfile(value.tool, code);
  if (
    typeof value.css !== "string" ||
    !Array.isArray(value.diagnostics) ||
    !Array.isArray(value.registrations) ||
    !Array.isArray(value.skips)
  ) {
    throw new CliWorkflowError(code, "Core registration-plan collections are malformed.");
  }
  for (const registration of value.registrations) {
    assertRecord(
      registration,
      code,
      "Planned registration",
      ["candidateId", "css", "inherits", "name", "specReferences", "syntax"],
      ["initialValue"],
    );
  }
  assertUniqueBy(
    value.registrations,
    (entry) => (entry as JsonRecord).candidateId,
    code,
    "Planned registrations",
  );
  for (const skip of value.skips) {
    assertRecord(
      skip,
      code,
      "Registration-plan skip",
      ["candidateId", "code", "reason", "status"],
      ["evidence"],
    );
  }
}

export async function createRegistrationPlan(
  audit: CliAuditV1,
  decisionsValue: unknown,
  target: string,
  projectRoot: string,
): Promise<CliRegistrationPlanV1> {
  if (audit.analysis.schemaVersion !== ANALYSIS_RESULT_SCHEMA_VERSION) {
    throw new CliWorkflowError(
      "CPTV_CLI_INCOMPATIBLE_ANALYSIS",
      `Analysis schema must be ${ANALYSIS_RESULT_SCHEMA_VERSION}.`,
    );
  }
  const decisions = normalizeDecisions(decisionsValue);
  const registrationPlan = planPropertyRegistrations(audit.analysis, decisions);
  let edit: CliRegistrationPlanV1["edit"] = null;
  let patch = "";
  if (registrationPlan.registrations.length > 0) {
    const absoluteTarget = await containedAbsentTarget(projectRoot, target);
    const content = `${registrationPlan.css}\n`;
    edit = {
      content,
      contentSha256: sha256(content),
      kind: "create-file",
      path: absoluteTarget,
    };
    patch = createFilePatch(path.relative(projectRoot, absoluteTarget), content);
  }
  const unsignedPlan: UnsignedRegistrationPlanV1 = {
    candidates: audit.analysis.candidates,
    decisions,
    edit,
    kind: "cptv-registration-plan",
    patch,
    registrationPlan,
    schemaVersion: CLI_PLAN_SCHEMA_VERSION,
    sourceFingerprints: audit.sourceFingerprints,
  };
  return { ...unsignedPlan, reviewedDigest: reviewedPlanDigest(unsignedPlan) };
}

export function parseRegistrationPlan(value: unknown): CliRegistrationPlanV1 {
  const code = "CPTV_CLI_INVALID_PLAN";
  assertRecord(value, code, "CLI registration plan", [
    "candidates",
    "decisions",
    "edit",
    "kind",
    "patch",
    "registrationPlan",
    "reviewedDigest",
    "schemaVersion",
    "sourceFingerprints",
  ]);
  if (value.kind !== "cptv-registration-plan" || value.schemaVersion !== CLI_PLAN_SCHEMA_VERSION) {
    throw new CliWorkflowError(
      "CPTV_CLI_INCOMPATIBLE_PLAN",
      `Plan must use schema ${CLI_PLAN_SCHEMA_VERSION}.`,
    );
  }
  if (
    typeof value.patch !== "string" ||
    !Array.isArray(value.candidates) ||
    !Array.isArray(value.decisions)
  ) {
    throw new CliWorkflowError(code, "Plan patch and decisions are malformed.");
  }
  assertRecordArray(
    value.candidates,
    code,
    "Plan registration candidate",
    [
      "confidence",
      "evidence",
      "id",
      "legacyGeneratorStatus",
      "name",
      "policyIds",
      "reason",
      "specReferences",
      "status",
    ],
    ["suggestedInitialValue", "suggestedSyntax"],
  );
  let decisions: RegistrationDecisionV1[];
  try {
    decisions = normalizeDecisions(value.decisions);
  } catch (error) {
    if (error instanceof CliWorkflowError) {
      throw new CliWorkflowError(code, `Plan decisions are invalid: ${error.message}`);
    }
    throw error;
  }
  const sourceFingerprints = validateSourceFingerprints(value.sourceFingerprints, code);
  validateCoreRegistrationPlan(value.registrationPlan, "CPTV_CLI_INCOMPATIBLE_PLAN");
  assertSha256(value.reviewedDigest, code, "Plan reviewedDigest");

  if (value.edit !== null) {
    assertRecord(value.edit, code, "Plan edit", ["content", "contentSha256", "kind", "path"]);
    if (
      value.edit.kind !== "create-file" ||
      typeof value.edit.path !== "string" ||
      value.edit.path.length === 0 ||
      typeof value.edit.content !== "string"
    ) {
      throw new CliWorkflowError(code, "Only one explicit create-file edit is supported.");
    }
    assertSha256(value.edit.contentSha256, code, "Plan contentSha256");
    if (sha256(value.edit.content) !== value.edit.contentSha256) {
      throw new CliWorkflowError(
        "CPTV_CLI_PLAN_CONTENT_MISMATCH",
        "The plan content does not match its reviewed fingerprint.",
      );
    }
    if (
      value.registrationPlan.registrations.length === 0 ||
      value.edit.content !== `${value.registrationPlan.css}\n`
    ) {
      throw new CliWorkflowError(
        code,
        "Plan edit content is inconsistent with its registration plan.",
      );
    }
  } else if (value.patch !== "" || value.registrationPlan.registrations.length !== 0) {
    throw new CliWorkflowError(
      code,
      "A plan without an edit cannot contain a patch or registrations.",
    );
  }

  const plan = {
    ...value,
    candidates: value.candidates,
    decisions,
    sourceFingerprints,
  } as unknown as CliRegistrationPlanV1;
  const { reviewedDigest, ...unsignedPlan } = plan;
  if (reviewedPlanDigest(unsignedPlan) !== reviewedDigest) {
    throw new CliWorkflowError(
      "CPTV_CLI_PLAN_DIGEST_MISMATCH",
      "The plan does not match its reviewed digest; run plan again and review the new output.",
    );
  }
  return plan;
}

export async function applyRegistrationPlan(
  context: CliProjectContext,
  planValue: unknown,
): Promise<{ applied: string }> {
  const plan = parseRegistrationPlan(planValue);
  if (!plan.edit) {
    throw new CliWorkflowError(
      "CPTV_CLI_PLAN_HAS_NO_EDIT",
      "The reviewed plan contains no applicable edit.",
    );
  }
  for (const fingerprint of [...plan.sourceFingerprints].sort((left, right) =>
    compareText(left.path, right.path),
  )) {
    const current = await context.reader.readCssFile(fingerprint.path);
    if (sha256(current.content) !== fingerprint.sha256) {
      throw new CliWorkflowError(
        "CPTV_CLI_STALE_PLAN",
        `Source changed since plan review: ${fingerprint.path}`,
      );
    }
  }

  const target = await containedAbsentTarget(context.projectRoot, plan.edit.path);
  const expectedPatch = createFilePatch(
    path.relative(context.projectRoot, target),
    plan.edit.content,
  );
  if (plan.patch !== expectedPatch) {
    throw new CliWorkflowError(
      "CPTV_CLI_PLAN_PATCH_MISMATCH",
      "The reviewed patch, target path, and content are inconsistent.",
    );
  }
  const temporary = path.join(path.dirname(target), `.cptv-${randomUUID()}.tmp`);
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(plan.edit.content, "utf8");
    await handle.sync();
    await handle.close();
    await link(temporary, target);
  } catch (error) {
    await handle.close().catch(() => undefined);
    throw error;
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
  return { applied: target };
}

export function formatRegistrationPlan(
  plan: CliRegistrationPlanV1,
  format: AdoptionOutputFormat,
): string {
  if (format === "json") return stableJson(plan);
  if (format === "sarif") {
    const auditLike: CliAuditV1 = {
      analysis: {
        ...plan.registrationPlan,
        aliasCycles: [],
        candidates: [],
        configuration: {
          checkUnresolvedCustomProperties: false,
          knownCustomPropertyInputCount: 0,
          registryInputCount: 0,
          resolveImportEnabled: false,
        },
        conflicts: [],
        coverage: {
          categories: {
            assignments: { analyzed: 0, skipped: 0, total: 0 },
            consumers: { analyzed: 0, skipped: 0, total: 0 },
            fallbacks: { analyzed: 0, skipped: 0, total: 0 },
            references: { analyzed: 0, skipped: 0, total: 0 },
            registrationRules: { analyzed: 0, skipped: 0, total: 0 },
          },
          skippedDeclarations: 0,
          validatedDeclarations: 0,
        },
        entryPoints: [],
        inputs: [],
        inventory: {
          aliases: [],
          assignments: [],
          consumers: [],
          fallbacks: [],
          imports: [],
          references: [],
          registrationOccurrences: [],
          registrations: [],
        },
        opportunities: { animations: [] },
        schemaVersion: ANALYSIS_RESULT_SCHEMA_VERSION,
        skips: [],
      } as AnalysisResultV1,
      coverage: { percentage: null, skipped: 0, validated: 0 },
      diagnostics: plan.registrationPlan.diagnostics.map((diagnostic) =>
        toCliDiagnostic(diagnostic, false),
      ),
      gateEvaluation: null,
      kind: "cptv-audit",
      schemaVersion: CLI_AUDIT_SCHEMA_VERSION,
      sourceFingerprints: plan.sourceFingerprints,
      sourceRedacted: false,
    };
    return formatSarif(auditLike);
  }
  if (format === "html") {
    const report = renderStandaloneReport(
      {
        analysis: asJsonValue(plan.registrationPlan),
        registrationReview: registrationReview(plan.candidates),
        title: "CSS Property Type Validator registration plan",
      } as never,
      EPHEMERAL_PAGES_CONTRACT,
    );
    assertReportDeliveryCompatibility(report.html);
    return report.html;
  }
  return [
    `Plan: ${plan.registrationPlan.registrations.length} registration${plan.registrationPlan.registrations.length === 1 ? "" : "s"}; ${plan.registrationPlan.skips.length} review item${plan.registrationPlan.skips.length === 1 ? "" : "s"}.`,
    ...(plan.edit ? [`Create ${plan.edit.path}`] : ["No edit will be applied."]),
  ].join("\n");
}
