import type { DiagnosticReason, PermanentDiagnosticId, SpecificationReference } from "./types.js";

export const CSS_PROPERTIES_VALUES_SPECIFICATION = Object.freeze({
  editorsDraftUrl: "https://drafts.css-houdini.org/css-properties-values-api-1/",
  latestPublishedUrl: "https://www.w3.org/TR/css-properties-values-api-1/",
  publicationDate: "2024-03-26",
  snapshotUrl: "https://www.w3.org/TR/2024/WD-css-properties-values-api-1-20240326/",
  title: "CSS Properties and Values API Level 1",
});

export type ProvenanceClassification = "normative" | "tool-policy" | "advisory";

export type GeneratorPolicyId =
  | "CPTV-GEN-001-existing-registration-review"
  | "CPTV-GEN-002-exact-var-alias-resolution"
  | "CPTV-GEN-003-common-supported-syntax"
  | "CPTV-GEN-004-independent-initial-value"
  | "CPTV-GEN-005-first-valid-initial-value"
  | "CPTV-GEN-006-legacy-inherits-true"
  | "CPTV-GEN-007-self-validation";

export type AuditPolicyId =
  | "CPTV-AUDIT-001-source-inventory"
  | "CPTV-AUDIT-002-exact-alias"
  | "CPTV-AUDIT-003-registration-conflict"
  | "CPTV-AUDIT-004-ordering-certainty"
  | "CPTV-AUDIT-005-alias-cycle"
  | "CPTV-AUDIT-006-coverage"
  | "CPTV-AUDIT-007-registered-alias-assignment"
  | "CPTV-AUDIT-008-nested-fallback-proof"
  | "CPTV-AUDIT-009-consuming-property-compatibility"
  | "CPTV-AUDIT-010-stylesheet-registration-selection"
  | "CPTV-AUDIT-011-animation-opportunity";

export interface DiagnosticRuleProvenance {
  acceptanceCriteria: readonly string[];
  classification: ProvenanceClassification;
  id: PermanentDiagnosticId;
  knownDivergences: readonly string[];
  rationale: string;
  specReferences: readonly SpecificationReference[];
  subject: { kind: "diagnostic"; reason: DiagnosticReason };
}

export interface GeneratorPolicyProvenance {
  acceptanceCriteria: readonly string[];
  classification: ProvenanceClassification;
  id: GeneratorPolicyId;
  knownDivergences: readonly string[];
  rationale: string;
  specReferences: readonly SpecificationReference[];
  subject: { kind: "generator-policy" };
}

export interface AuditPolicyProvenance {
  acceptanceCriteria: readonly string[];
  classification: ProvenanceClassification;
  id: AuditPolicyId;
  knownDivergences: readonly string[];
  rationale: string;
  specReferences: readonly SpecificationReference[];
  subject: { kind: "audit-policy" };
}

function reference(
  specification: string,
  publicationDate: string,
  snapshotUrl: string,
  section: string,
  anchor: string,
): SpecificationReference {
  return Object.freeze({
    normative: true,
    publicationDate,
    section,
    specification,
    url: `${snapshotUrl}${anchor}`,
  });
}

const PROPERTIES_VALUES_BASE = CSS_PROPERTIES_VALUES_SPECIFICATION.snapshotUrl;
const VARIABLES_BASE = "https://www.w3.org/TR/2022/CR-css-variables-1-20220616/";
const CASCADE_BASE = "https://www.w3.org/TR/2022/CR-css-cascade-5-20220113/";
const SYNTAX_BASE = "https://www.w3.org/TR/2021/CRD-css-syntax-3-20211224/";

const AT_PROPERTY = reference(
  CSS_PROPERTIES_VALUES_SPECIFICATION.title,
  CSS_PROPERTIES_VALUES_SPECIFICATION.publicationDate,
  PROPERTIES_VALUES_BASE,
  "3 The @property Rule",
  "#at-property-rule",
);
const SYNTAX_DESCRIPTOR = reference(
  CSS_PROPERTIES_VALUES_SPECIFICATION.title,
  CSS_PROPERTIES_VALUES_SPECIFICATION.publicationDate,
  PROPERTIES_VALUES_BASE,
  "3.1 The syntax Descriptor",
  "#syntax-descriptor",
);
const INHERITS_DESCRIPTOR = reference(
  CSS_PROPERTIES_VALUES_SPECIFICATION.title,
  CSS_PROPERTIES_VALUES_SPECIFICATION.publicationDate,
  PROPERTIES_VALUES_BASE,
  "3.2 The inherits Descriptor",
  "#inherits-descriptor",
);
const INITIAL_VALUE_DESCRIPTOR = reference(
  CSS_PROPERTIES_VALUES_SPECIFICATION.title,
  CSS_PROPERTIES_VALUES_SPECIFICATION.publicationDate,
  PROPERTIES_VALUES_BASE,
  "3.3 The initial-value Descriptor",
  "#initial-value-descriptor",
);
const REGISTER_PROPERTY = reference(
  CSS_PROPERTIES_VALUES_SPECIFICATION.title,
  CSS_PROPERTIES_VALUES_SPECIFICATION.publicationDate,
  PROPERTIES_VALUES_BASE,
  "4.1 The registerProperty() Function",
  "#register-property",
);
const SUPPORTED_NAMES = reference(
  CSS_PROPERTIES_VALUES_SPECIFICATION.title,
  CSS_PROPERTIES_VALUES_SPECIFICATION.publicationDate,
  PROPERTIES_VALUES_BASE,
  "5.1 Supported Names",
  "#supported-names",
);
const CONSUME_DATA_TYPE_NAME = reference(
  CSS_PROPERTIES_VALUES_SPECIFICATION.title,
  CSS_PROPERTIES_VALUES_SPECIFICATION.publicationDate,
  PROPERTIES_VALUES_BASE,
  "5.4.4 Consume a Data Type Name",
  "#consume-data-type-name",
);
const SYNTAX_STRINGS = reference(
  CSS_PROPERTIES_VALUES_SPECIFICATION.title,
  CSS_PROPERTIES_VALUES_SPECIFICATION.publicationDate,
  PROPERTIES_VALUES_BASE,
  "5 Syntax Strings",
  "#syntax-strings",
);
const COMPUTED_VALUE = reference(
  CSS_PROPERTIES_VALUES_SPECIFICATION.title,
  CSS_PROPERTIES_VALUES_SPECIFICATION.publicationDate,
  PROPERTIES_VALUES_BASE,
  "2.4 Computed Value-Time Behavior",
  "#computed-value",
);
const SUBSTITUTION = reference(
  CSS_PROPERTIES_VALUES_SPECIFICATION.title,
  CSS_PROPERTIES_VALUES_SPECIFICATION.publicationDate,
  PROPERTIES_VALUES_BASE,
  "2.7 Substitution via var()",
  "#substitution",
);
const REGISTERED_FALLBACKS = reference(
  CSS_PROPERTIES_VALUES_SPECIFICATION.title,
  CSS_PROPERTIES_VALUES_SPECIFICATION.publicationDate,
  PROPERTIES_VALUES_BASE,
  "2.7.1 Fallbacks In var() References",
  "#fallbacks-in-var-references",
);
const ANIMATION_BEHAVIOR = reference(
  CSS_PROPERTIES_VALUES_SPECIFICATION.title,
  CSS_PROPERTIES_VALUES_SPECIFICATION.publicationDate,
  PROPERTIES_VALUES_BASE,
  "2.5 Animation Behavior",
  "#animation-behavior",
);
const DETERMINING_REGISTRATION = reference(
  CSS_PROPERTIES_VALUES_SPECIFICATION.title,
  CSS_PROPERTIES_VALUES_SPECIFICATION.publicationDate,
  PROPERTIES_VALUES_BASE,
  "2.1 Determining the Registration",
  "#determining-the-registration",
);
const USING_VARIABLES = reference(
  "CSS Custom Properties for Cascading Variables Module Level 1",
  "2022-06-16",
  VARIABLES_BASE,
  "3 Using Cascading Variables: the var() notation",
  "#using-variables",
);
const INVALID_VARIABLES = reference(
  "CSS Custom Properties for Cascading Variables Module Level 1",
  "2022-06-16",
  VARIABLES_BASE,
  "3.1 Invalid Variables",
  "#invalid-variables",
);
const AT_IMPORT = reference(
  "CSS Cascading and Inheritance Level 5",
  "2022-01-13",
  CASCADE_BASE,
  "2.1 Layout of Style Sheets: the @import rule",
  "#at-import",
);
const PARSE_ERROR = reference(
  "CSS Syntax Module Level 3",
  "2021-12-24",
  SYNTAX_BASE,
  "3 Tokenizing and Parsing CSS",
  "#parse-error",
);

function diagnosticEntry(
  id: PermanentDiagnosticId,
  reason: DiagnosticReason,
  classification: ProvenanceClassification,
  rationale: string,
  specReferences: readonly SpecificationReference[],
  knownDivergences: readonly string[] = [],
  acceptanceCriteria: readonly string[] = [],
): DiagnosticRuleProvenance {
  return Object.freeze({
    acceptanceCriteria: Object.freeze(["AC-SPEC-001", "AC-SPEC-002", ...acceptanceCriteria]),
    classification,
    id,
    knownDivergences: Object.freeze([...knownDivergences]),
    rationale,
    specReferences: Object.freeze([...specReferences]),
    subject: Object.freeze({ kind: "diagnostic" as const, reason }),
  });
}

export const DIAGNOSTIC_RULE_PROVENANCE = Object.freeze({
  "missing-property-name": diagnosticEntry(
    "CPTV_REG_001",
    "missing-property-name",
    "normative",
    "An @property prelude must contain a custom property name.",
    [AT_PROPERTY],
  ),
  "missing-syntax-descriptor": diagnosticEntry(
    "CPTV_REG_002",
    "missing-syntax-descriptor",
    "normative",
    "The syntax descriptor is required for a valid @property rule.",
    [AT_PROPERTY, SYNTAX_DESCRIPTOR],
  ),
  "invalid-syntax-descriptor": diagnosticEntry(
    "CPTV_REG_003",
    "invalid-syntax-descriptor",
    "normative",
    "The syntax descriptor must be a string that parses as a syntax definition.",
    [SYNTAX_DESCRIPTOR, SYNTAX_STRINGS],
  ),
  "unsupported-syntax-component": diagnosticEntry(
    "CPTV_REG_004",
    "unsupported-syntax-component",
    "normative",
    "A data type name in a syntax string must be one of the specification's supported names.",
    [SUPPORTED_NAMES, CONSUME_DATA_TYPE_NAME],
  ),
  "missing-inherits-descriptor": diagnosticEntry(
    "CPTV_REG_005",
    "missing-inherits-descriptor",
    "normative",
    "The inherits descriptor is required for a valid @property rule.",
    [AT_PROPERTY, INHERITS_DESCRIPTOR],
  ),
  "invalid-inherits-descriptor": diagnosticEntry(
    "CPTV_REG_006",
    "invalid-inherits-descriptor",
    "normative",
    "The inherits descriptor grammar accepts only true or false.",
    [INHERITS_DESCRIPTOR],
  ),
  "missing-initial-value-descriptor": diagnosticEntry(
    "CPTV_REG_007",
    "missing-initial-value-descriptor",
    "normative",
    "A non-universal syntax requires an initial-value descriptor.",
    [AT_PROPERTY, INITIAL_VALUE_DESCRIPTOR],
  ),
  "invalid-initial-value": diagnosticEntry(
    "CPTV_REG_008",
    "invalid-initial-value",
    "normative",
    "A non-universal initial value must match the syntax and be computationally independent.",
    [INITIAL_VALUE_DESCRIPTOR, REGISTER_PROPERTY],
  ),
  "incompatible-assignment-value": diagnosticEntry(
    "CPTV_ASSIGN_001",
    "incompatible-assignment-value",
    "normative",
    "A registered custom property value that does not parse against its non-universal syntax is invalid at computed-value time.",
    [COMPUTED_VALUE],
  ),
  "incompatible-var-substitution": diagnosticEntry(
    "CPTV_USAGE_001",
    "incompatible-var-substitution",
    "tool-policy",
    "The validator conservatively checks whether representative computed values from a registered syntax can leave the consuming declaration valid.",
    [SUBSTITUTION, USING_VARIABLES, INVALID_VARIABLES],
    [
      "The specifications define substitution and computed-value validity, but do not define static type-compatibility inference; representative sampling cannot reproduce every document computed value.",
    ],
  ),
  "incompatible-var-fallback": diagnosticEntry(
    "CPTV_USAGE_002",
    "incompatible-var-fallback",
    "normative",
    "A concrete fallback on a var() reference to a registered custom property must match that property's syntax even when the fallback is not used.",
    [REGISTERED_FALLBACKS],
    [
      "Nested substitution is accepted only for an acyclic exact alias whose registrations have identical non-universal syntax; all other nested cases are explicit uncertainty.",
    ],
    ["AC-DEEP-002", "AC-DEEP-003"],
  ),
  "unresolved-var-reference": diagnosticEntry(
    "CPTV_USAGE_003",
    "unresolved-var-reference",
    "tool-policy",
    "The opt-in unresolved-reference check reports names absent from the validator's configured static inputs.",
    [USING_VARIABLES, INVALID_VARIABLES],
    [
      "Static file inputs are not a full document cascade, so absence from the configured inputs does not prove absence at computed-value time.",
    ],
  ),
  "unresolved-import": diagnosticEntry(
    "CPTV_IMPORT_001",
    "unresolved-import",
    "tool-policy",
    "The validator requires configured local imports to resolve so its registry input boundary is explicit.",
    [AT_IMPORT],
    ["Import resolution failure is a validator input failure, not an @property conformance rule."],
  ),
  "unparseable-css": diagnosticEntry(
    "CPTV_PARSE_001",
    "unparseable-css",
    "tool-policy",
    "The validator reports when its parser cannot construct the stylesheet input needed for analysis.",
    [PARSE_ERROR],
    [
      "CSS defines error recovery; aborting analysis is the validator's conservative parser policy rather than a browser conformance conclusion.",
    ],
  ),
} satisfies Readonly<Record<DiagnosticReason, DiagnosticRuleProvenance>>);

function generatorEntry(
  id: GeneratorPolicyId,
  classification: ProvenanceClassification,
  rationale: string,
  specReferences: readonly SpecificationReference[],
  knownDivergences: readonly string[] = [],
): GeneratorPolicyProvenance {
  return Object.freeze({
    acceptanceCriteria: Object.freeze(["AC-SPEC-003"]),
    classification,
    id,
    knownDivergences: Object.freeze([...knownDivergences]),
    rationale,
    specReferences: Object.freeze([...specReferences]),
    subject: Object.freeze({ kind: "generator-policy" as const }),
  });
}

export const GENERATOR_POLICY_PROVENANCE = Object.freeze([
  generatorEntry(
    "CPTV-GEN-001-existing-registration-review",
    "tool-policy",
    "Existing @property rules are preserved and returned for review instead of being regenerated.",
    [DETERMINING_REGISTRATION, AT_PROPERTY],
  ),
  generatorEntry(
    "CPTV-GEN-002-exact-var-alias-resolution",
    "tool-policy",
    "Only exact var() aliases without a fallback are recursively resolved as generation evidence.",
    [SUBSTITUTION, USING_VARIABLES],
    ["The specification permits more complex values; exact-alias-only resolution is conservative."],
  ),
  generatorEntry(
    "CPTV-GEN-003-common-supported-syntax",
    "tool-policy",
    "The first supported syntax in the project's fixed order that matches every observed concrete value is selected.",
    [SYNTAX_STRINGS, SUPPORTED_NAMES],
    [
      "The specification defines valid syntax strings but does not define syntax inference or preference order.",
    ],
  ),
  generatorEntry(
    "CPTV-GEN-004-independent-initial-value",
    "normative",
    "Generated non-universal registrations require a matching, computationally independent initial value.",
    [INITIAL_VALUE_DESCRIPTOR, REGISTER_PROPERTY],
  ),
  generatorEntry(
    "CPTV-GEN-005-first-valid-initial-value",
    "tool-policy",
    "The first observed value satisfying registration validity is used by the legacy generator.",
    [INITIAL_VALUE_DESCRIPTOR, REGISTER_PROPERTY],
    [
      "Static observation cannot infer author intent for initial-value; conservative planning must require policy or human acceptance.",
    ],
  ),
  generatorEntry(
    "CPTV-GEN-006-legacy-inherits-true",
    "tool-policy",
    "The legacy generator emits inherits: true for generated registrations.",
    [INHERITS_DESCRIPTOR],
    [
      "Static observation cannot infer author intent for inherits; conservative planning must require policy or human acceptance.",
    ],
  ),
  generatorEntry(
    "CPTV-GEN-007-self-validation",
    "tool-policy",
    "Generated rules are passed through the validator before they are returned as ready CSS.",
    [AT_PROPERTY, SYNTAX_DESCRIPTOR, INHERITS_DESCRIPTOR, INITIAL_VALUE_DESCRIPTOR],
  ),
] as const satisfies readonly GeneratorPolicyProvenance[]);

function auditEntry(
  id: AuditPolicyId,
  classification: ProvenanceClassification,
  rationale: string,
  specReferences: readonly SpecificationReference[],
  knownDivergences: readonly string[] = [],
  acceptanceCriteria: readonly string[] = [],
): AuditPolicyProvenance {
  return Object.freeze({
    acceptanceCriteria: Object.freeze([
      "AC-AUDIT-001",
      "AC-AUDIT-002",
      "AC-AUDIT-003",
      ...acceptanceCriteria,
    ]),
    classification,
    id,
    knownDivergences: Object.freeze([...knownDivergences]),
    rationale,
    specReferences: Object.freeze([...specReferences]),
    subject: Object.freeze({ kind: "audit-policy" as const }),
  });
}

export const AUDIT_POLICY_PROVENANCE = Object.freeze([
  auditEntry(
    "CPTV-AUDIT-001-source-inventory",
    "tool-policy",
    "The audit records source-authored registrations and var() occurrences without claiming runtime use.",
    [AT_PROPERTY, DETERMINING_REGISTRATION, USING_VARIABLES],
  ),
  auditEntry(
    "CPTV-AUDIT-002-exact-alias",
    "tool-policy",
    "Only a custom-property value consisting of one var() reference without a fallback is classified as an exact alias.",
    [SUBSTITUTION, USING_VARIABLES],
    ["CSS permits arbitrary token streams; exact-alias classification is deliberately narrower."],
  ),
  auditEntry(
    "CPTV-AUDIT-003-registration-conflict",
    "tool-policy",
    "Repeated valid registrations are compared by their three normalized descriptors before document context is considered.",
    [DETERMINING_REGISTRATION, SYNTAX_DESCRIPTOR, INHERITS_DESCRIPTOR, INITIAL_VALUE_DESCRIPTOR],
  ),
  auditEntry(
    "CPTV-AUDIT-004-ordering-certainty",
    "tool-policy",
    "Source order is considered certain only within one fully evidenced unconditional entry-point graph.",
    [DETERMINING_REGISTRATION, AT_IMPORT],
    [
      "A repository graph is not a document and cannot establish which stylesheets a browser loads.",
    ],
  ),
  auditEntry(
    "CPTV-AUDIT-005-alias-cycle",
    "advisory",
    "Cycles among exact aliases are surfaced for review rather than treated as a browser-effective failure.",
    [SUBSTITUTION, USING_VARIABLES, INVALID_VARIABLES],
  ),
  auditEntry(
    "CPTV-AUDIT-006-coverage",
    "tool-policy",
    "Coverage counts source structures the audit could and could not analyze; it does not measure runtime document coverage.",
    [AT_PROPERTY, USING_VARIABLES],
  ),
  auditEntry(
    "CPTV-AUDIT-007-registered-alias-assignment",
    "tool-policy",
    "Exact aliases between registered non-universal syntaxes are checked with representative computed-value evidence and never gate.",
    [COMPUTED_VALUE, SUBSTITUTION],
    ["Representative values do not establish every possible runtime computed value."],
    ["AC-DEEP-001"],
  ),
  auditEntry(
    "CPTV-AUDIT-008-nested-fallback-proof",
    "tool-policy",
    "A nested fallback is considered statically compatible only when it is an acyclic exact var() alias between identical non-universal registered syntaxes.",
    [REGISTERED_FALLBACKS, USING_VARIABLES],
    ["Mixed-token and differing-syntax fallback substitution requires runtime computed values."],
    ["AC-DEEP-003"],
  ),
  auditEntry(
    "CPTV-AUDIT-009-consuming-property-compatibility",
    "tool-policy",
    "Consuming-property compatibility uses representative registered computed values and remains non-gating.",
    [SUBSTITUTION, USING_VARIABLES, INVALID_VARIABLES],
    ["The validator is not a computed-style or cascade engine."],
    ["AC-DEEP-004"],
  ),
  auditEntry(
    "CPTV-AUDIT-010-stylesheet-registration-selection",
    "tool-policy",
    "The last rule is selected only within one complete supplied unconditional stylesheet order.",
    [DETERMINING_REGISTRATION],
    [
      "The selected stylesheet rule does not establish the absence of a runtime CSS.registerProperty() registration, which would take precedence.",
    ],
    ["AC-DEEP-005"],
  ),
  auditEntry(
    "CPTV-AUDIT-011-animation-opportunity",
    "advisory",
    "Source-authored keyframe assignments and explicit transition-property references are evidence that typed interpolation may be valuable.",
    [ANIMATION_BEHAVIOR],
    [
      "Static source evidence does not prove that an animation runs, that endpoints interpolate successfully, or that registration is desirable.",
    ],
    ["AC-DEEP-006"],
  ),
] as const satisfies readonly AuditPolicyProvenance[]);

export function getDiagnosticSpecificationReferences(
  reason: DiagnosticReason,
): readonly SpecificationReference[] {
  return DIAGNOSTIC_RULE_PROVENANCE[reason].specReferences;
}

export function getGeneratorPolicySpecificationReferences(
  policyIds: readonly GeneratorPolicyId[],
): readonly SpecificationReference[] {
  const references = new Map<string, SpecificationReference>();

  for (const policyId of policyIds) {
    const policy = GENERATOR_POLICY_PROVENANCE.find((entry) => entry.id === policyId);

    if (!policy) {
      continue;
    }

    for (const specReference of policy.specReferences) {
      references.set(specReference.url, specReference);
    }
  }

  return Object.freeze([...references.values()]);
}

export function getAuditPolicySpecificationReferences(
  policyIds: readonly AuditPolicyId[],
): readonly SpecificationReference[] {
  const references = new Map<string, SpecificationReference>();

  for (const policyId of policyIds) {
    const policy = AUDIT_POLICY_PROVENANCE.find((entry) => entry.id === policyId);

    if (!policy) {
      continue;
    }

    for (const specReference of policy.specReferences) {
      references.set(specReference.url, specReference);
    }
  }

  return Object.freeze([...references.values()]);
}
