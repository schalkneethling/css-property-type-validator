import {
  ANALYSIS_RESULT_SCHEMA_VERSION,
  CORE_TOOL_NAME,
  CORE_TOOL_VERSION,
  REGISTRATION_PLAN_SCHEMA_VERSION,
} from "./contracts.js";
import { buildAuditGraph } from "./audit-graph.js";
import { generatePropertyRegistrations } from "./generate.js";
import {
  CSS_PROPERTIES_VALUES_SPECIFICATION,
  getGeneratorPolicySpecificationReferences,
} from "./specification.js";
import { validateFiles, type ValidateFilesOptions } from "./validate.js";

import type {
  AnalysisImportEdgeInputV1,
  AnalysisResultV1,
  ContractSpecificationProfileV1,
  ContractToolVersionV1,
  PlannedRegistrationV1,
  RegistrationCandidateV1,
  RegistrationDecisionV1,
  RegistrationPlanSkipV1,
  RegistrationPlanV1,
} from "./contracts.js";
import type { GeneratorPolicyId } from "./specification.js";
import type {
  RegisteredProperty,
  ValidationDiagnostic,
  ValidationInput,
  ValidationResult,
} from "./types.js";

export type AnalyzeInputsOptions = Omit<ValidateFilesOptions, "failFast"> & {
  entryPoints?: readonly string[];
  importEdges?: readonly AnalysisImportEdgeInputV1[];
};

const TOOL: ContractToolVersionV1 = Object.freeze({
  name: CORE_TOOL_NAME,
  version: CORE_TOOL_VERSION,
});

const SPECIFICATION: ContractSpecificationProfileV1 = Object.freeze({
  ...CSS_PROPERTIES_VALUES_SPECIFICATION,
});

const REGISTRATION_DESCRIPTOR_SPEC_REFERENCES = getGeneratorPolicySpecificationReferences([
  "CPTV-GEN-003-common-supported-syntax",
  "CPTV-GEN-004-independent-initial-value",
  "CPTV-GEN-006-legacy-inherits-true",
  "CPTV-GEN-007-self-validation",
]);

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortedInputs(inputs: readonly ValidationInput[]): ValidationInput[] {
  return [...inputs].sort(
    (left, right) =>
      compareText(left.path, right.path) || compareText(String(left.css), String(right.css)),
  );
}

function sourceBytes(css: unknown): number {
  return typeof css === "string" ? new TextEncoder().encode(css).byteLength : 0;
}

function diagnosticSortKey(diagnostic: ValidationDiagnostic): string {
  const offset = diagnostic.loc?.start.offset ?? -1;
  return [
    diagnostic.filePath,
    String(offset).padStart(12, "0"),
    diagnostic.reason,
    diagnostic.message,
  ].join("\u0000");
}

function sortDiagnostics(diagnostics: readonly ValidationDiagnostic[]): ValidationDiagnostic[] {
  return [...diagnostics].sort((left, right) =>
    compareText(diagnosticSortKey(left), diagnosticSortKey(right)),
  );
}

function sortRegistrations(registrations: readonly RegisteredProperty[]): RegisteredProperty[] {
  return [...registrations].sort(
    (left, right) =>
      compareText(left.name, right.name) ||
      compareText(left.filePath, right.filePath) ||
      (left.loc?.start.offset ?? -1) - (right.loc?.start.offset ?? -1),
  );
}

function diagnosticIdentity(diagnostic: ValidationDiagnostic): string {
  return diagnostic.baselineFingerprint;
}

function orderedEntryPointInputs(
  root: string,
  inputsByPath: ReadonlyMap<string, ValidationInput>,
  edges: readonly AnalysisImportEdgeInputV1[],
): ValidationInput[] {
  const outgoing = new Map<string, AnalysisImportEdgeInputV1[]>();
  for (const edge of edges) {
    const values = outgoing.get(edge.fromPath) ?? [];
    values.push(edge);
    outgoing.set(edge.fromPath, values);
  }
  for (const values of outgoing.values()) {
    values.sort(
      (left, right) =>
        left.order - right.order ||
        compareText(left.specifier, right.specifier) ||
        compareText(left.toPath, right.toPath),
    );
  }

  const ordered: ValidationInput[] = [];
  const active = new Set<string>();
  const expanded = new Set<string>();

  function visit(path: string): void {
    if (active.has(path) || expanded.has(path)) return;
    const input = inputsByPath.get(path);
    if (!input) return;
    active.add(path);
    for (const edge of outgoing.get(path) ?? []) {
      if (!edge.conditional) visit(edge.toPath);
    }
    active.delete(path);
    expanded.add(path);
    ordered.push(input);
  }

  visit(root);
  return ordered;
}

/**
 * `validateFiles()` intentionally retains its original flat-input compatibility
 * semantics. The versioned repository analysis contract is stricter: cross-file
 * registrations participate only inside one completely evidenced entry-point graph.
 */
function validateAnalysisContexts(
  inputs: readonly ValidationInput[],
  options: AnalyzeInputsOptions,
  entryPoints: AnalysisResultV1["entryPoints"],
  compatibilityRegistry: readonly RegisteredProperty[],
): ValidationResult {
  const inputsByPath = new Map(inputs.map((input) => [input.path, input]));
  const diagnostics = new Map<string, ValidationDiagnostic>();
  const validatedPaths = new Set<string>();
  const uncertainPaths = new Set(
    entryPoints
      .filter((entryPoint) => entryPoint.status === "uncertain")
      .flatMap((entryPoint) => entryPoint.reachableInputs),
  );
  let skippedDeclarations = 0;
  let validatedDeclarations = 0;
  const validationOptions: ValidateFilesOptions = {
    checkUnresolvedCustomProperties: options.checkUnresolvedCustomProperties,
    knownCustomPropertyInputs: [...(options.knownCustomPropertyInputs ?? [])],
    registryInputs: [...(options.registryInputs ?? [])],
  };

  function merge(
    result: ValidationResult,
    diagnosticAllowed: (diagnostic: ValidationDiagnostic) => boolean = () => true,
  ): void {
    skippedDeclarations += result.skippedDeclarations;
    validatedDeclarations += result.validatedDeclarations;
    for (const diagnostic of result.diagnostics) {
      if (!diagnosticAllowed(diagnostic)) continue;
      diagnostics.set(diagnosticIdentity(diagnostic), diagnostic);
    }
  }

  for (const entryPoint of entryPoints) {
    if (entryPoint.status !== "complete") continue;
    const contextInputs = orderedEntryPointInputs(
      entryPoint.path,
      inputsByPath,
      options.importEdges ?? [],
    );
    if (contextInputs.length === 0) continue;
    merge(
      validateFiles(contextInputs, validationOptions),
      (diagnostic) => !uncertainPaths.has(diagnostic.filePath),
    );
    for (const input of contextInputs) {
      if (!uncertainPaths.has(input.path)) validatedPaths.add(input.path);
    }
  }

  // An incomplete graph cannot establish a cross-file registration. Files not
  // already validated through a complete graph are therefore checked in isolation;
  // explicit registryInputs remain caller-authored shared evidence.
  for (const input of inputs) {
    if (validatedPaths.has(input.path)) continue;
    merge(validateFiles([input], validationOptions));
  }

  return {
    diagnostics: [...diagnostics.values()],
    registry: [...compatibilityRegistry],
    skippedDeclarations,
    validatedDeclarations,
  };
}

function evidencePolicyIds(
  policyIds: readonly GeneratorPolicyId[] | undefined,
): GeneratorPolicyId[] {
  return (policyIds ?? []).filter((policyId) => policyId !== "CPTV-GEN-006-legacy-inherits-true");
}

function toCandidate(
  candidate: ReturnType<typeof generatePropertyRegistrations>["candidates"][number],
): RegistrationCandidateV1 {
  const policyIds = evidencePolicyIds(candidate.policyIds);
  const status =
    candidate.status === "generated"
      ? "review-required"
      : candidate.status === "existing"
        ? "existing"
        : "blocked";

  return {
    confidence: {
      level: status === "review-required" ? "medium" : "low",
      reasons:
        status === "review-required"
          ? [
              "Observed values share a supported syntax, but inherits and initial-value remain explicit human decisions.",
            ]
          : [
              candidate.reason ??
                "The available static evidence is insufficient for a registration plan.",
            ],
    },
    evidence: {
      loc: candidate.loc,
      observedValues: [...candidate.observedValues].sort(compareText),
      sources: [...candidate.sources].sort(compareText),
    },
    id: `registration:${candidate.name}`,
    legacyGeneratorStatus: candidate.status,
    name: candidate.name,
    policyIds,
    reason:
      status === "review-required"
        ? "Syntax and initial-value suggestions are evidence only; an explicit descriptor decision is required."
        : (candidate.reason ?? "Review is required."),
    specReferences: getGeneratorPolicySpecificationReferences(policyIds),
    status,
    ...(candidate.initialValue === undefined
      ? {}
      : { suggestedInitialValue: candidate.initialValue }),
    ...(candidate.syntax === undefined ? {} : { suggestedSyntax: candidate.syntax }),
  };
}

/**
 * Produces the versioned, browser-safe Phase 1 analysis contract from caller-owned CSS content.
 * Unsupported repository-wide inventories are explicit uncertainty records rather than guessed facts.
 */
export function analyzeInputs(
  inputs: readonly ValidationInput[],
  options: AnalyzeInputsOptions = {},
): AnalysisResultV1 {
  const orderedInputs = sortedInputs(inputs);
  const registryInputs = sortedInputs(options.registryInputs ?? []);
  const knownCustomPropertyInputs = sortedInputs(options.knownCustomPropertyInputs ?? []);
  const compatibilityValidation = validateFiles(orderedInputs, {
    ...options,
    knownCustomPropertyInputs,
    registryInputs,
  });
  const preliminaryAudit = buildAuditGraph(orderedInputs, compatibilityValidation.diagnostics, {
    entryPoints: options.entryPoints,
    importEdges: options.importEdges,
  });
  const validation = validateAnalysisContexts(
    orderedInputs,
    {
      ...options,
      knownCustomPropertyInputs,
      registryInputs,
    },
    preliminaryAudit.entryPoints,
    compatibilityValidation.registry,
  );
  const generated = generatePropertyRegistrations(orderedInputs);
  const audit = buildAuditGraph(orderedInputs, validation.diagnostics, {
    entryPoints: options.entryPoints,
    importEdges: options.importEdges,
  });

  return {
    aliasCycles: audit.aliasCycles,
    candidates: generated.candidates
      .map(toCandidate)
      .sort((left, right) => compareText(left.name, right.name)),
    configuration: {
      checkUnresolvedCustomProperties: options.checkUnresolvedCustomProperties ?? false,
      knownCustomPropertyInputCount: knownCustomPropertyInputs.length,
      registryInputCount: registryInputs.length,
      resolveImportEnabled: options.resolveImport !== undefined,
    },
    coverage: {
      categories: audit.coverage,
      skippedDeclarations: validation.skippedDeclarations,
      validatedDeclarations: validation.validatedDeclarations,
    },
    conflicts: audit.conflicts,
    diagnostics: sortDiagnostics(validation.diagnostics),
    inputs: orderedInputs.map((input) => ({
      path: input.path,
      sourceBytes: sourceBytes(input.css),
    })),
    entryPoints: audit.entryPoints,
    inventory: {
      ...audit.inventory,
      registrations: sortRegistrations(validation.registry),
    },
    opportunities: audit.opportunities,
    schemaVersion: ANALYSIS_RESULT_SCHEMA_VERSION,
    skips: audit.skips,
    specification: { ...SPECIFICATION },
    tool: { ...TOOL },
  };
}

function formatRegistration(
  name: string,
  syntax: string,
  inherits: boolean,
  initialValue: string | undefined,
): string {
  return [
    `@property ${name} {`,
    `  syntax: ${JSON.stringify(syntax)};`,
    `  inherits: ${String(inherits)};`,
    ...(initialValue === undefined ? [] : [`  initial-value: ${initialValue};`]),
    "}",
  ].join("\n");
}

function reviewSkip(
  candidate: RegistrationCandidateV1 | undefined,
  candidateId: string,
  code: RegistrationPlanSkipV1["code"],
  reason: string,
): RegistrationPlanSkipV1 {
  return {
    candidateId,
    code,
    ...(candidate === undefined ? {} : { evidence: candidate.evidence }),
    reason,
    status: "review-required",
  };
}

/**
 * Converts explicit descriptor decisions into a deterministic, self-validated registration plan.
 * Candidate suggestions are never used as implicit decisions.
 */
export function planPropertyRegistrations(
  analysis: AnalysisResultV1,
  decisions: readonly RegistrationDecisionV1[] = [],
): RegistrationPlanV1 {
  const candidates = new Map(analysis.candidates.map((candidate) => [candidate.id, candidate]));
  const decisionsByCandidate = new Map<string, RegistrationDecisionV1[]>();

  for (const decision of decisions) {
    const entries = decisionsByCandidate.get(decision.candidateId) ?? [];
    entries.push(decision);
    decisionsByCandidate.set(decision.candidateId, entries);
  }

  const diagnostics: ValidationDiagnostic[] = [];
  const registrations: PlannedRegistrationV1[] = [];
  const skips: RegistrationPlanSkipV1[] = [];

  for (const candidate of analysis.candidates) {
    const candidateDecisions = decisionsByCandidate.get(candidate.id) ?? [];
    if (candidate.status === "existing") {
      skips.push(
        reviewSkip(
          candidate,
          candidate.id,
          "CPTV_SKIP_EXISTING_REGISTRATION",
          "An existing @property registration was observed; this additive planner does not emit a duplicate.",
        ),
      );
      continue;
    }

    if (candidateDecisions.length === 0) {
      skips.push(
        reviewSkip(
          candidate,
          candidate.id,
          "CPTV_SKIP_DECISION_REQUIRED",
          "No explicit registration descriptor decision was supplied.",
        ),
      );
      continue;
    }

    if (candidateDecisions.length > 1) {
      skips.push(
        reviewSkip(
          candidate,
          candidate.id,
          "CPTV_SKIP_AMBIGUOUS_DECISION",
          "Multiple decisions target this candidate; no decision was selected.",
        ),
      );
      continue;
    }

    const decision = candidateDecisions[0];
    if (!decision || decision.action === "reject") {
      skips.push(
        reviewSkip(
          candidate,
          candidate.id,
          "CPTV_SKIP_DECISION_REJECTED",
          "The caller rejected this candidate.",
        ),
      );
      continue;
    }

    const complete =
      typeof decision.syntax === "string" &&
      decision.syntax.length > 0 &&
      typeof decision.inherits === "boolean" &&
      (decision.syntax === "*" || typeof decision.initialValue === "string");
    if (!complete) {
      skips.push(
        reviewSkip(
          candidate,
          candidate.id,
          "CPTV_SKIP_DECISION_REQUIRED",
          "Accepted decisions must explicitly supply syntax, inherits, and initial-value unless syntax is universal.",
        ),
      );
      continue;
    }

    const css = formatRegistration(
      candidate.name,
      decision.syntax as string,
      decision.inherits as boolean,
      decision.initialValue,
    );
    const validation = validateFiles([{ path: "cptv-registration-plan.css", css }]);
    if (validation.diagnostics.length > 0) {
      diagnostics.push(...validation.diagnostics);
      skips.push(
        reviewSkip(
          candidate,
          candidate.id,
          "CPTV_SKIP_INVALID_DECISION",
          "The explicit descriptor decision did not pass normative registration validation.",
        ),
      );
      continue;
    }

    registrations.push({
      candidateId: candidate.id,
      css,
      inherits: decision.inherits as boolean,
      ...(decision.initialValue === undefined ? {} : { initialValue: decision.initialValue }),
      name: candidate.name,
      specReferences: REGISTRATION_DESCRIPTOR_SPEC_REFERENCES,
      syntax: decision.syntax as string,
    });
  }

  for (const candidateId of [...decisionsByCandidate.keys()].sort(compareText)) {
    if (!candidates.has(candidateId)) {
      skips.push(
        reviewSkip(
          undefined,
          candidateId,
          "CPTV_SKIP_UNKNOWN_CANDIDATE",
          "The decision does not target a candidate in this analysis result.",
        ),
      );
    }
  }

  registrations.sort((left, right) => compareText(left.name, right.name));
  skips.sort(
    (left, right) =>
      compareText(left.candidateId, right.candidateId) || compareText(left.code, right.code),
  );

  return {
    analysisSchemaVersion: analysis.schemaVersion,
    css: registrations.map((registration) => registration.css).join("\n\n"),
    diagnostics: sortDiagnostics(diagnostics),
    registrations,
    schemaVersion: REGISTRATION_PLAN_SCHEMA_VERSION,
    skips,
    specification: { ...SPECIFICATION },
    tool: { ...TOOL },
  };
}
