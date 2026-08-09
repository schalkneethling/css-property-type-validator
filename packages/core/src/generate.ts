import { withDiagnosticContract } from "./diagnostics.js";
import {
  generateCss,
  matchesSyntax,
  parseStylesheet,
  parseValue as parseCssValue,
  walkCss,
} from "./parser.js";
import { validateInitialValueAgainstSyntax } from "./registry.js";
import { getGeneratorPolicySpecificationReferences } from "./specification.js";
import { SUPPORTED_SYNTAX_COMPONENT_NAMES } from "./supported-syntax.js";
import { validateFiles } from "./validate.js";

import type { CssAtruleNode } from "./imports.js";
import type { GeneratorPolicyId } from "./specification.js";
import type {
  SourceLocation,
  SpecificationReference,
  ValidationDiagnostic,
  ValidationDiagnosticInput,
  ValidationInput,
} from "./types.js";

export type GeneratedPropertyStatus =
  | "generated"
  | "existing"
  | "conflict"
  | "unsupported"
  | "invalid-generated";

export interface GeneratedPropertyCandidate {
  initialValue?: string;
  loc: SourceLocation | null;
  name: string;
  observedValues: string[];
  policyIds?: readonly GeneratorPolicyId[];
  reason?: string;
  sources: string[];
  status: GeneratedPropertyStatus;
  syntax?: string;
  specReferences?: readonly SpecificationReference[];
}

export interface GeneratePropertyRegistrationsResult {
  candidates: GeneratedPropertyCandidate[];
  css: string;
  diagnostics: ValidationDiagnostic[];
  generatedCount: number;
  reviewCount: number;
}

interface CssLocation {
  source?: string;
  start: SourceLocation["start"];
  end: SourceLocation["end"];
}

interface CssDeclarationNode {
  loc?: unknown;
  property: string;
  value?: unknown;
}

interface CssFunctionNode {
  children?: ArrayLike<unknown> & { toArray?: () => CssValueNode[] };
  name?: string;
  type?: string;
}

interface CssPropertyNameNode {
  name?: string;
}

interface ParsedStylesheet {
  children?: ArrayLike<unknown>;
}

interface CssValueNode {
  name?: string;
  type?: string;
  value?: string;
}

interface ObservedProperty {
  loc: SourceLocation | null;
  sources: Set<string>;
  values: Set<string>;
}

interface ResolvedValues {
  unresolvedAliases: string[];
  values: string[];
}

function generatorProvenance(policyIds: readonly GeneratorPolicyId[]): {
  policyIds: readonly GeneratorPolicyId[];
  specReferences: readonly SpecificationReference[];
} {
  return {
    policyIds,
    specReferences: getGeneratorPolicySpecificationReferences(policyIds),
  };
}

function toLocation(loc: unknown): SourceLocation | null {
  if (!loc) {
    return null;
  }

  const typedLoc = loc as CssLocation;

  return {
    source: typedLoc.source,
    start: { ...typedLoc.start },
    end: { ...typedLoc.end },
  };
}

function parseValue(value: string): unknown | null {
  try {
    return parseCssValue(value);
  } catch {
    return null;
  }
}

function matchSyntax(syntax: string, value: unknown): boolean {
  return matchesSyntax(syntax, value);
}

function valueChildren(value: unknown): CssValueNode[] {
  const children = (value as { children?: ArrayLike<unknown> & { toArray?: () => CssValueNode[] } })
    .children;

  if (!children) {
    return [];
  }

  return children.toArray?.() ?? (Array.from(children) as CssValueNode[]);
}

function functionChildren(node: CssFunctionNode): CssValueNode[] {
  const children = node.children;

  if (!children) {
    return [];
  }

  return children.toArray?.() ?? (Array.from(children) as CssValueNode[]);
}

function exactVarReference(value: string): string | null {
  const parsedValue = parseValue(value);

  if (!parsedValue) {
    return null;
  }

  const nodes = valueChildren(parsedValue);
  const [node] = nodes as CssFunctionNode[];

  if (nodes.length !== 1 || !node || node.type !== "Function" || node.name !== "var") {
    return null;
  }

  const children = functionChildren(node);
  const [firstChild] = children;
  const hasFallback = children.some((child) => child.type === "Operator" && child.value === ",");

  return !hasFallback && firstChild?.type === "Identifier" ? (firstChild.name ?? null) : null;
}

function resolveObservedValues(
  propertyName: string,
  observed: Map<string, ObservedProperty>,
  activeProperties = new Set<string>(),
): ResolvedValues {
  if (activeProperties.has(propertyName)) {
    return { unresolvedAliases: [propertyName], values: [] };
  }

  const entry = observed.get(propertyName);

  if (!entry) {
    return { unresolvedAliases: [propertyName], values: [] };
  }

  activeProperties.add(propertyName);

  const unresolvedAliases = new Set<string>();
  const values = new Set<string>();

  for (const value of entry.values) {
    const referencedProperty = exactVarReference(value);

    if (!referencedProperty) {
      values.add(value);
      continue;
    }

    const resolved = resolveObservedValues(referencedProperty, observed, activeProperties);

    for (const resolvedValue of resolved.values) {
      values.add(resolvedValue);
    }

    for (const unresolvedAlias of resolved.unresolvedAliases) {
      unresolvedAliases.add(unresolvedAlias);
    }
  }

  activeProperties.delete(propertyName);

  return {
    unresolvedAliases: [...unresolvedAliases],
    values: [...values],
  };
}

function inferSyntax(values: string[]): string | null {
  if (values.length === 0) {
    return null;
  }

  const parsedValues = values.map(parseValue);

  if (parsedValues.some((value) => !value)) {
    return null;
  }

  return (
    SUPPORTED_SYNTAX_COMPONENT_NAMES.find((syntax) =>
      parsedValues.every((value) => matchSyntax(syntax, value)),
    ) ?? null
  );
}

function firstValidInitialValue(values: string[], syntax: string): string | null {
  for (const value of values) {
    if (validateInitialValueAgainstSyntax("--generated", syntax, value) === null) {
      return value;
    }
  }

  return null;
}

function propertyRuleName(node: CssAtruleNode): string | null {
  const [propertyName] = Array.from(node.prelude?.children ?? []) as CssPropertyNameNode[];
  return propertyName?.name ?? null;
}

function collectInput(
  input: ValidationInput,
  observed: Map<string, ObservedProperty>,
  existing: Set<string>,
  diagnostics: ValidationDiagnosticInput[],
): void {
  let ast: ParsedStylesheet;

  try {
    ast = parseStylesheet(input.css, {
      filename: input.path,
      positions: true,
    }) as ParsedStylesheet;
  } catch (error) {
    diagnostics.push({
      code: "unparseable-stylesheet",
      filePath: input.path,
      loc: null,
      message: `Could not parse ${input.path}: ${(error as Error).message}`,
      phase: "parse",
      reason: "unparseable-css",
      severity: "error",
    });
    return;
  }

  for (const node of Array.from(ast.children ?? []) as CssAtruleNode[]) {
    if (node.type === "Atrule" && node.name === "property") {
      const name = propertyRuleName(node);

      if (name) {
        existing.add(name);
      }
    }
  }

  walkCss(ast, {
    visit: "Declaration",
    enter(node: CssDeclarationNode) {
      if (!node.property.startsWith("--") || !node.value) {
        return;
      }

      const value = generateCss(node.value).trim();
      const entry =
        observed.get(node.property) ??
        ({
          loc: toLocation(node.loc),
          sources: new Set<string>(),
          values: new Set<string>(),
        } satisfies ObservedProperty);

      entry.sources.add(input.path);
      entry.values.add(value);

      observed.set(node.property, entry);
    },
  });
}

function formatPropertyRule(candidate: GeneratedPropertyCandidate): string {
  return [
    `@property ${candidate.name} {`,
    `  syntax: "${candidate.syntax}";`,
    "  inherits: true;",
    `  initial-value: ${candidate.initialValue};`,
    "}",
  ].join("\n");
}

/**
 * Generates conservative `@property` registration candidates from authored custom property
 * declarations. Existing registrations are reported but left unchanged, ready candidates are
 * validated with the same registry checks used by the validator, and ambiguous or unsafe values
 * are returned as review items instead of being emitted in the generated CSS.
 */
export function generatePropertyRegistrations(
  inputs: ValidationInput[],
  options: { outFile?: string } = {},
): GeneratePropertyRegistrationsResult {
  const diagnostics: ValidationDiagnosticInput[] = [];
  const existing = new Set<string>();
  const observed = new Map<string, ObservedProperty>();
  const candidates: GeneratedPropertyCandidate[] = [];

  for (const input of inputs) {
    collectInput(input, observed, existing, diagnostics);
  }

  const sortedObservedEntries = [...observed.entries()].toSorted(([left], [right]) =>
    left.localeCompare(right),
  );

  for (const [name, entry] of sortedObservedEntries) {
    const observedValues = [...entry.values];
    const resolvedValues = resolveObservedValues(name, observed);
    const baseCandidate = {
      loc: entry.loc,
      name,
      observedValues,
      sources: [...entry.sources].sort(),
    };

    if (existing.has(name)) {
      candidates.push({
        ...baseCandidate,
        ...generatorProvenance(["CPTV-GEN-001-existing-registration-review"]),
        reason: "Existing @property rule found in the input.",
        status: "existing",
      });
      continue;
    }

    if (resolvedValues.unresolvedAliases.length > 0) {
      const unresolvedAliases = resolvedValues.unresolvedAliases.join(", ");
      candidates.push({
        ...baseCandidate,
        ...generatorProvenance(["CPTV-GEN-002-exact-var-alias-resolution"]),
        reason: `Observed values include aliases through var(). Include declarations for ${unresolvedAliases} so the generator can infer a complete concrete syntax.`,
        status: "conflict",
      });
      continue;
    }

    const syntax = inferSyntax(resolvedValues.values);

    if (!syntax) {
      const unresolvedAliases = resolvedValues.unresolvedAliases.join(", ");
      candidates.push({
        ...baseCandidate,
        ...generatorProvenance(["CPTV-GEN-003-common-supported-syntax"]),
        reason:
          unresolvedAliases.length > 0
            ? `Observed values are aliases through var(). Include declarations for ${unresolvedAliases} so the generator can infer a concrete syntax.`
            : "Observed values do not share one supported syntax.",
        status: "conflict",
      });
      continue;
    }

    const initialValue = firstValidInitialValue(resolvedValues.values, syntax);

    if (!initialValue) {
      candidates.push({
        ...baseCandidate,
        ...generatorProvenance([
          "CPTV-GEN-003-common-supported-syntax",
          "CPTV-GEN-004-independent-initial-value",
        ]),
        reason: "No observed value is valid as a computationally independent initial-value.",
        status: "unsupported",
        syntax,
      });
      continue;
    }

    candidates.push({
      ...baseCandidate,
      ...generatorProvenance([
        "CPTV-GEN-003-common-supported-syntax",
        "CPTV-GEN-004-independent-initial-value",
        "CPTV-GEN-005-first-valid-initial-value",
        "CPTV-GEN-006-legacy-inherits-true",
        "CPTV-GEN-007-self-validation",
      ]),
      initialValue,
      status: "generated",
      syntax,
    });
  }

  const generatedRules = candidates.filter(
    (
      candidate,
    ): candidate is GeneratedPropertyCandidate & { initialValue: string; syntax: string } =>
      candidate.status === "generated",
  );
  const generatedCss = generatedRules.map(formatPropertyRule).join("\n\n");
  const validationResult =
    generatedCss.length > 0
      ? validateFiles([{ path: options.outFile ?? "properties.css", css: generatedCss }], {
          registryInputs: [],
        })
      : { diagnostics: [] };

  if (validationResult.diagnostics.length > 0) {
    diagnostics.push(...validationResult.diagnostics);

    const invalidPropertyNames = new Set(
      validationResult.diagnostics
        .map((diagnostic) => diagnostic.propertyName)
        .filter((propertyName): propertyName is string => Boolean(propertyName)),
    );

    for (const candidate of generatedRules) {
      if (!invalidPropertyNames.has(candidate.name)) {
        continue;
      }

      candidate.status = "invalid-generated";
      candidate.reason = "Generated registration failed validation.";
    }
  }

  const readyCss = candidates
    .filter((candidate) => candidate.status === "generated")
    .map(formatPropertyRule)
    .join("\n\n");

  return {
    candidates,
    css: readyCss.length > 0 ? `${readyCss}\n` : "",
    diagnostics: diagnostics.map(withDiagnosticContract),
    generatedCount: candidates.filter((candidate) => candidate.status === "generated").length,
    reviewCount: candidates.filter((candidate) => candidate.status !== "generated").length,
  };
}
