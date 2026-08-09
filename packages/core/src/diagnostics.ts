import { DIAGNOSTIC_RULE_PROVENANCE } from "./specification.js";
import { sha256 } from "./sha256.js";

import type {
  DiagnosticCode,
  DiagnosticBasis,
  DiagnosticConfidence,
  DiagnosticConfidenceLevel,
  DiagnosticEvidence,
  DiagnosticGating,
  DiagnosticLocation,
  DiagnosticReason,
  DiagnosticRelatedLocation,
  PermanentDiagnosticId,
  SourceLocation,
  ValidationDiagnostic,
  ValidationDiagnosticInput,
} from "./types.js";
import type { ProvenanceClassification } from "./specification.js";

export interface DiagnosticContractEntry {
  basis: DiagnosticBasis;
  category: "diagnostic";
  code: PermanentDiagnosticId;
  confidence: DiagnosticConfidenceLevel;
  gating: DiagnosticGating;
  legacyCode: DiagnosticCode;
  provenance: ProvenanceClassification;
  reason: DiagnosticReason;
}

export const DIAGNOSTIC_CONTRACTS = Object.freeze([
  {
    basis: "direct",
    category: "diagnostic",
    code: "CPTV_REG_001",
    confidence: "high",
    gating: "gating",
    legacyCode: "invalid-property-registration",
    provenance: "normative",
    reason: "missing-property-name",
  },
  {
    basis: "direct",
    category: "diagnostic",
    code: "CPTV_REG_002",
    confidence: "high",
    gating: "gating",
    legacyCode: "invalid-property-registration",
    provenance: "normative",
    reason: "missing-syntax-descriptor",
  },
  {
    basis: "direct",
    category: "diagnostic",
    code: "CPTV_REG_003",
    confidence: "high",
    gating: "gating",
    legacyCode: "invalid-property-registration",
    provenance: "normative",
    reason: "invalid-syntax-descriptor",
  },
  {
    basis: "direct",
    category: "diagnostic",
    code: "CPTV_REG_004",
    confidence: "high",
    gating: "gating",
    legacyCode: "invalid-property-registration",
    provenance: "normative",
    reason: "unsupported-syntax-component",
  },
  {
    basis: "direct",
    category: "diagnostic",
    code: "CPTV_REG_005",
    confidence: "high",
    gating: "gating",
    legacyCode: "invalid-property-registration",
    provenance: "normative",
    reason: "missing-inherits-descriptor",
  },
  {
    basis: "direct",
    category: "diagnostic",
    code: "CPTV_REG_006",
    confidence: "high",
    gating: "gating",
    legacyCode: "invalid-property-registration",
    provenance: "normative",
    reason: "invalid-inherits-descriptor",
  },
  {
    basis: "direct",
    category: "diagnostic",
    code: "CPTV_REG_007",
    confidence: "high",
    gating: "gating",
    legacyCode: "invalid-property-registration",
    provenance: "normative",
    reason: "missing-initial-value-descriptor",
  },
  {
    basis: "direct",
    category: "diagnostic",
    code: "CPTV_REG_008",
    confidence: "high",
    gating: "gating",
    legacyCode: "invalid-property-registration",
    provenance: "normative",
    reason: "invalid-initial-value",
  },
  {
    basis: "direct",
    category: "diagnostic",
    code: "CPTV_ASSIGN_001",
    confidence: "high",
    gating: "gating",
    legacyCode: "incompatible-custom-property-assignment",
    provenance: "normative",
    reason: "incompatible-assignment-value",
  },
  {
    basis: "representative-var-substitution",
    category: "diagnostic",
    code: "CPTV_ASSIGN_002",
    confidence: "medium",
    gating: "review-required",
    legacyCode: "incompatible-custom-property-assignment",
    provenance: "tool-policy",
    reason: "incompatible-assignment-value",
  },
  {
    basis: "representative-var-substitution",
    category: "diagnostic",
    code: "CPTV_USAGE_001",
    confidence: "medium",
    gating: "review-required",
    legacyCode: "incompatible-var-usage",
    provenance: "tool-policy",
    reason: "incompatible-var-substitution",
  },
  {
    basis: "direct",
    category: "diagnostic",
    code: "CPTV_USAGE_002",
    confidence: "high",
    gating: "gating",
    legacyCode: "incompatible-var-usage",
    provenance: "normative",
    reason: "incompatible-var-fallback",
  },
  {
    basis: "direct",
    category: "diagnostic",
    code: "CPTV_USAGE_003",
    confidence: "low",
    gating: "review-required",
    legacyCode: "incompatible-var-usage",
    provenance: "tool-policy",
    reason: "unresolved-var-reference",
  },
  {
    basis: "direct",
    category: "diagnostic",
    code: "CPTV_IMPORT_001",
    confidence: "high",
    gating: "review-required",
    legacyCode: "unresolved-import",
    provenance: "tool-policy",
    reason: "unresolved-import",
  },
  {
    basis: "direct",
    category: "diagnostic",
    code: "CPTV_PARSE_001",
    confidence: "high",
    gating: "review-required",
    legacyCode: "unparseable-stylesheet",
    provenance: "tool-policy",
    reason: "unparseable-css",
  },
] as const satisfies readonly DiagnosticContractEntry[]);

const CONTRACT_BY_BRANCH = new Map<string, DiagnosticContractEntry>(
  DIAGNOSTIC_CONTRACTS.map((entry) => [`${entry.reason}\u0000${entry.basis}`, entry]),
);

const CONFIDENCE_REASONS: Record<DiagnosticConfidenceLevel, string> = Object.freeze({
  high: "The reported condition is directly observed in the supplied source and supported by the cited rule or explicit tool boundary.",
  medium:
    "The reported condition uses conservative static inference that cannot model every browser computed value.",
  low: "The configured static inputs are incomplete evidence of browser-effective document state.",
});

export function toDiagnosticLocation(location: SourceLocation | null): DiagnosticLocation | null {
  if (!location) {
    return null;
  }

  return {
    columnBase: 1,
    lineBase: 1,
    offsetEncoding: "utf-16-code-units",
    ...(location.source === undefined ? {} : { source: location.source }),
    start: { ...location.start },
    end: { ...location.end },
  };
}

function defaultEvidence(diagnostic: ValidationDiagnosticInput): DiagnosticEvidence[] {
  const entries: Array<[DiagnosticEvidence["kind"], string | undefined]> = [
    ["property-name", diagnostic.propertyName],
    ["registered-syntax", diagnostic.registeredSyntax],
    ["expected-property", diagnostic.expectedProperty],
    ["actual-value", diagnostic.actualValue],
    ["import-specifier", diagnostic.importSpecifier],
    ["snippet", diagnostic.snippet],
  ];

  return entries
    .filter((entry): entry is [DiagnosticEvidence["kind"], string] => entry[1] !== undefined)
    .map(([kind, value]) => ({ kind, value }));
}

function compareRelatedLocations(
  left: DiagnosticRelatedLocation,
  right: DiagnosticRelatedLocation,
): number {
  const leftKey = `${left.location.source ?? ""}\u0000${String(left.location.start.offset).padStart(12, "0")}\u0000${left.message}`;
  const rightKey = `${right.location.source ?? ""}\u0000${String(right.location.start.offset).padStart(12, "0")}\u0000${right.message}`;
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
}

function baselineIdentity(
  diagnostic: ValidationDiagnosticInput,
  id: PermanentDiagnosticId,
  location: DiagnosticLocation | null,
): string {
  return JSON.stringify({
    actualValue: diagnostic.actualValue ?? null,
    basis: diagnostic.basis ?? "direct",
    descriptorName: diagnostic.descriptorName ?? null,
    endOffset: location?.end.offset ?? null,
    expectedProperty: diagnostic.expectedProperty ?? null,
    filePath: diagnostic.filePath,
    id,
    importSpecifier: diagnostic.importSpecifier ?? null,
    propertyName: diagnostic.propertyName ?? null,
    registeredSyntax: diagnostic.registeredSyntax ?? null,
    startOffset: location?.start.offset ?? null,
    version: 1,
  });
}

export function withDiagnosticContract(
  diagnostic: ValidationDiagnosticInput,
): ValidationDiagnostic {
  const basis = diagnostic.basis ?? "direct";
  const contract = CONTRACT_BY_BRANCH.get(`${diagnostic.reason}\u0000${basis}`);

  if (!contract) {
    throw new Error(`Missing diagnostic contract for ${diagnostic.reason}.`);
  }

  const provenance = DIAGNOSTIC_RULE_PROVENANCE[diagnostic.reason];
  const isRepresentativeAssignment =
    diagnostic.reason === "incompatible-assignment-value" &&
    basis === "representative-var-substitution";

  if (
    contract.legacyCode !== diagnostic.code ||
    (!isRepresentativeAssignment &&
      (contract.provenance !== provenance.classification || contract.code !== provenance.id))
  ) {
    throw new Error(`Diagnostic contract drift for ${diagnostic.reason}.`);
  }

  const location = toDiagnosticLocation(diagnostic.loc);
  const confidence: DiagnosticConfidence = {
    level: contract.confidence,
    reasons: [CONFIDENCE_REASONS[contract.confidence]],
  };
  const relatedLocations = [...(diagnostic.relatedLocations ?? [])].sort(compareRelatedLocations);

  return {
    ...diagnostic,
    baselineFingerprint: `sha256:${sha256(baselineIdentity(diagnostic, contract.code, location))}`,
    basis,
    confidence,
    evidence: diagnostic.evidence ? [...diagnostic.evidence] : defaultEvidence(diagnostic),
    gating: contract.gating,
    id: contract.code,
    location,
    provenance: {
      classification: contract.provenance,
      ruleId: contract.code,
    },
    relatedLocations,
    specReferences: provenance.specReferences,
    suggestedEdits: [...(diagnostic.suggestedEdits ?? [])],
  };
}

/** Compatibility name for the original provenance-only decorator. */
export const withDiagnosticSpecificationReferences = withDiagnosticContract;
