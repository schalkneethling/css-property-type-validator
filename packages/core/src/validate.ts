import * as cssTree from "css-tree";

import { buildRepresentativeSamples } from "./syntax-samples.js";
import { collectRegistry } from "./registry.js";
import {
  canDeclarationMatchWithoutOccurrence,
  canDeclarationMatchWithOccurrenceReplacement,
  collectVarOccurrences,
  isCompatibleWithSubstitutions,
} from "./var-substitution.js";

import type {
  RegisteredProperty,
  ResolveImport,
  ValidationDiagnostic,
  ValidationInput,
  ValidationResult,
} from "./types.js";
import type {
  CssNodeWithLoc,
  CssValueAst,
  Matcher,
  ReplacementCheckContext,
  SubstitutionOption,
  VarFunctionNode,
  VarOccurrence,
} from "./var-substitution.js";

export interface ValidateFilesOptions {
  failFast?: boolean;
  registryInputs?: ValidationInput[];
  resolveImport?: ResolveImport;
}

type FallbackEntry = {
  fallbackSource: string;
  index: number;
  registration: RegisteredProperty;
  varNode: VarFunctionNode;
};

interface CssDeclarationNode {
  loc?: unknown;
  property: string;
  value: CssValueAst & { loc?: unknown };
}

interface CssWalkNode {
  type?: string;
}

type CssLocation = NonNullable<ValidationDiagnostic["loc"]>;

function toLocation(loc: unknown): ValidationDiagnostic["loc"] {
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

function registryMap(registry: RegisteredProperty[]): Map<string, RegisteredProperty> {
  return new Map(registry.map((entry) => [entry.name, entry]));
}

function isCustomPropertyName(propertyName: string): boolean {
  return propertyName.startsWith("--");
}

function collectVarFunctions(value: CssValueAst): VarFunctionNode[] {
  const functions: VarFunctionNode[] = [];

  cssTree.walk(value, {
    visit: "Function",
    enter(node: VarFunctionNode) {
      if (node.name === "var") {
        functions.push(node);
      }
    },
  });

  return functions;
}

function getDeclarationValueForValidation(declaration: CssDeclarationNode): CssValueAst | null {
  if (isCustomPropertyName(declaration.property)) {
    return parseValue(cssTree.generate(declaration.value));
  }

  return declaration.value;
}

function getVarChildren(node: VarFunctionNode): CssNodeWithLoc[] {
  if (Array.isArray(node.children)) {
    return node.children;
  }

  return node.children?.toArray?.() ?? [];
}

function getVarPropertyName(node: VarFunctionNode): string | undefined {
  const firstNode = Array.isArray(node.children) ? node.children[0] : node.children?.first;
  return firstNode?.type === "Identifier" ? firstNode.name : undefined;
}

function getVarFallbackSource(node: VarFunctionNode): string | null {
  const children = getVarChildren(node);
  const fallbackStartIndex = children.findIndex(
    (child) => child.type === "Operator" && child.value === ",",
  );

  if (fallbackStartIndex === -1) {
    return null;
  }

  const fallbackSource = children
    .slice(fallbackStartIndex + 1)
    .map((child) => cssTree.generate(child))
    .join("")
    .trim();

  return fallbackSource.length > 0 ? fallbackSource : null;
}

function parseValue(value: string): CssValueAst | null {
  try {
    return cssTree.parse(value, { context: "value" }) as CssValueAst;
  } catch {
    return null;
  }
}

function matchRegisteredSyntax(registration: RegisteredProperty, value: CssValueAst): boolean {
  if (registration.syntax === "*") {
    return true;
  }

  const match = cssTree.lexer.match(registration.syntax, value);
  return Boolean(match?.matched);
}

function toVarDiagnostic(
  filePath: string,
  declaration: CssDeclarationNode,
  registrations: RegisteredProperty[],
  varNodes: VarFunctionNode[],
): ValidationDiagnostic {
  if (registrations.length === 1) {
    const [registration] = registrations;
    const [varNode] = varNodes;

    return {
      code: "incompatible-var-usage",
      phase: "usage",
      reason: "incompatible-var-substitution",
      severity: "error",
      filePath,
      loc: toLocation(varNode.loc),
      message: `Registered property ${registration.name} uses syntax "${registration.syntax}" which is incompatible with ${declaration.property} at this var() usage.`,
      propertyName: registration.name,
      registeredSyntax: registration.syntax,
      expectedProperty: declaration.property,
      snippet: cssTree.generate(declaration),
    };
  }

  const registeredNames = [...new Set(registrations.map((registration) => registration.name))].join(
    ", ",
  );

  return {
    code: "incompatible-var-usage",
    phase: "usage",
    reason: "incompatible-var-substitution",
    severity: "error",
    filePath,
    loc: toLocation(declaration.value.loc),
    message: `Registered properties ${registeredNames} are jointly incompatible with ${declaration.property} at this declaration value.`,
    expectedProperty: declaration.property,
    snippet: cssTree.generate(declaration),
  };
}

function toPossibleVarDiagnostic(
  filePath: string,
  declaration: CssDeclarationNode,
  registrations: RegisteredProperty[],
): ValidationDiagnostic {
  const uniqueNames = [...new Set(registrations.map((registration) => registration.name))];
  const message =
    uniqueNames.length === 1
      ? `One or more var() usages of registered property ${uniqueNames[0]} may be incompatible with ${declaration.property} at this declaration value.`
      : `Registered properties ${uniqueNames.join(", ")} may be incompatible with ${declaration.property} at this declaration value.`;

  return {
    code: "incompatible-var-usage",
    phase: "usage",
    reason: "incompatible-var-substitution",
    severity: "error",
    filePath,
    loc: toLocation(declaration.value.loc),
    message,
    expectedProperty: declaration.property,
    snippet: cssTree.generate(declaration),
  };
}

function toAssignmentDiagnostic(
  filePath: string,
  declaration: CssDeclarationNode,
  registration: RegisteredProperty,
): ValidationDiagnostic {
  return {
    code: "incompatible-custom-property-assignment",
    phase: "assignment",
    reason: "incompatible-assignment-value",
    severity: "error",
    filePath,
    loc: toLocation(declaration.value.loc ?? declaration.loc),
    message: `Assigned value for registered property ${registration.name} does not match its syntax "${registration.syntax}".`,
    actualValue: cssTree.generate(declaration.value).trim(),
    propertyName: registration.name,
    registeredSyntax: registration.syntax,
    snippet: cssTree.generate(declaration),
  };
}

function toFallbackDiagnostic(
  filePath: string,
  declaration: CssDeclarationNode,
  registration: RegisteredProperty,
  varNode: VarFunctionNode,
): ValidationDiagnostic {
  return {
    code: "incompatible-var-usage",
    phase: "usage",
    reason: "incompatible-var-fallback",
    severity: "error",
    filePath,
    loc: toLocation(varNode.loc),
    message: `Fallback value in var() for registered property ${registration.name} is incompatible with ${declaration.property} at this var() usage.`,
    propertyName: registration.name,
    registeredSyntax: registration.syntax,
    expectedProperty: declaration.property,
    snippet: cssTree.generate(declaration),
  };
}

function toPreciseMultiVarDiagnostic(
  filePath: string,
  declaration: CssDeclarationNode,
  registeredEntries: Array<{
    index: number;
    registration: RegisteredProperty;
    varNode: VarFunctionNode;
  }>,
  valueSource: string,
  occurrences: VarOccurrence[],
  substitutionOptions: SubstitutionOption[],
  matcher: Matcher,
): ValidationDiagnostic {
  // For repeated or multi-var() values, we first ask a narrower question than
  // "does the whole declaration fail?": if we drop exactly one occurrence and
  // keep substituting representative samples for the rest, can the declaration
  // become valid? A single surviving candidate gives us a precise culprit.
  // Multiple candidates mean we should stay honest and report a possible culprit.
  const candidateIndexes = registeredEntries
    .filter((entry) =>
      canDeclarationMatchWithoutOccurrence(
        valueSource,
        occurrences,
        substitutionOptions,
        matcher,
        entry.index,
      ),
    )
    .map((entry) => entry.index);

  if (candidateIndexes.length === 1) {
    const culprit = registeredEntries.find((entry) => entry.index === candidateIndexes[0]);

    if (culprit) {
      return toVarDiagnostic(filePath, declaration, [culprit.registration], [culprit.varNode]);
    }
  }

  if (candidateIndexes.length > 1) {
    const candidates = registeredEntries
      .filter((entry) => candidateIndexes.includes(entry.index))
      .map((entry) => entry.registration);

    return toPossibleVarDiagnostic(filePath, declaration, candidates);
  }

  return toVarDiagnostic(
    filePath,
    declaration,
    registeredEntries.map((entry) => entry.registration),
    registeredEntries.map((entry) => entry.varNode),
  );
}

function validateDeclaration(
  filePath: string,
  declaration: CssDeclarationNode,
  registry: Map<string, RegisteredProperty>,
): { diagnostics: ValidationDiagnostic[]; skipped: number; validated: number } {
  const diagnostics: ValidationDiagnostic[] = [];
  const valueToValidate = getDeclarationValueForValidation(declaration);

  if (!valueToValidate) {
    return isCustomPropertyName(declaration.property)
      ? { diagnostics, skipped: 1, validated: 0 }
      : { diagnostics, skipped: 0, validated: 0 };
  }

  const varFunctions = collectVarFunctions(valueToValidate);

  if (isCustomPropertyName(declaration.property)) {
    const registration = registry.get(declaration.property);

    if (!registration) {
      return { diagnostics, skipped: 0, validated: 0 };
    }

    const authoredValue = cssTree.generate(declaration.value).trim();

    if (authoredValue.length === 0) {
      return { diagnostics, skipped: 1, validated: 0 };
    }

    if (varFunctions.length === 0) {
      if (!matchRegisteredSyntax(registration, valueToValidate)) {
        diagnostics.push(toAssignmentDiagnostic(filePath, declaration, registration));
      }

      return { diagnostics, skipped: 0, validated: 1 };
    }
  }

  if (varFunctions.length === 0) {
    return { diagnostics, skipped: 0, validated: 0 };
  }

  const varMetadata = varFunctions.map((varNode) => {
    const propertyName = getVarPropertyName(varNode);

    return {
      propertyName,
      registration: propertyName ? (registry.get(propertyName) ?? null) : null,
      varNode,
    };
  });

  // If any var() reference cannot be resolved to a custom property name, we cannot validate safely.
  if (varMetadata.some((entry) => !entry.propertyName)) {
    return { diagnostics, skipped: 1, validated: 0 };
  }

  const registeredEntries = varMetadata.filter(
    (
      entry,
    ): entry is {
      propertyName: string;
      registration: RegisteredProperty;
      varNode: VarFunctionNode;
    } => Boolean(entry.registration),
  );

  if (isCustomPropertyName(declaration.property)) {
    if (registeredEntries.length !== varMetadata.length) {
      return { diagnostics, skipped: 1, validated: 0 };
    }
  }

  // Unregistered custom properties are intentionally ignored when no registered inputs participate.
  if (registeredEntries.length === 0) {
    return { diagnostics, skipped: 0, validated: 0 };
  }

  // Mixed registered and unregistered var() usages still leave unresolved values in the declaration.
  if (registeredEntries.length !== varMetadata.length) {
    return { diagnostics, skipped: 1, validated: 0 };
  }

  // Universal-syntax registrations compute like unregistered custom properties,
  // and we do not currently model authored custom-property values at computed value time.
  // Skipping avoids false positives such as flagging `var(--token)` in places
  // where the actual substituted value could still be valid.
  if (registeredEntries.some((entry) => entry.registration.syntax === "*")) {
    return { diagnostics, skipped: 1, validated: 0 };
  }

  // Fallback handling for assignment-site var() usage is intentionally deferred.
  // For now we only validate fallback branches against ordinary consuming properties.
  if (
    isCustomPropertyName(declaration.property) &&
    registeredEntries.some((entry) => getVarFallbackSource(entry.varNode) !== null)
  ) {
    return { diagnostics, skipped: 1, validated: 0 };
  }

  const valueSource = cssTree.generate(valueToValidate);
  const occurrences = collectVarOccurrences(
    valueSource,
    registeredEntries.map((entry) => entry.varNode),
  );

  if (!occurrences) {
    return { diagnostics, skipped: 1, validated: 0 };
  }

  const substitutionOptions: SubstitutionOption[] = [];

  for (const [index, entry] of registeredEntries.entries()) {
    let samples: string[];

    try {
      samples = buildRepresentativeSamples(entry.registration.syntax, cssTree.definitionSyntax);
    } catch {
      return { diagnostics, skipped: 1, validated: 0 };
    }

    // If we cannot materialize any valid sample values for a registered syntax, we skip the check.
    if (samples.length === 0) {
      return { diagnostics, skipped: 1, validated: 0 };
    }

    substitutionOptions.push({
      index,
      samples,
      varNode: entry.varNode,
    });
  }

  const matcher = isCustomPropertyName(declaration.property)
    ? (candidateValue: CssValueAst) =>
        matchRegisteredSyntax(
          registry.get(declaration.property) as RegisteredProperty,
          candidateValue,
        )
    : (candidateValue: CssValueAst) => {
        const match = cssTree.lexer.matchProperty(declaration.property, candidateValue);
        return Boolean(match?.matched);
      };

  const fallbackEntries: FallbackEntry[] = [];

  for (const [index, entry] of registeredEntries.entries()) {
    const fallbackSource = getVarFallbackSource(entry.varNode);

    if (!fallbackSource) {
      continue;
    }

    const fallbackValue = parseValue(fallbackSource);

    if (!fallbackValue) {
      return { diagnostics, skipped: 1, validated: 0 };
    }

    // Nested var() fallback chains are valid CSS, but we skip them for now until
    // the validator can model fallback reachability without overclaiming certainty.
    if (collectVarFunctions(fallbackValue).length > 0) {
      return { diagnostics, skipped: 1, validated: 0 };
    }

    fallbackEntries.push({
      fallbackSource,
      index,
      registration: entry.registration,
      varNode: entry.varNode,
    });
  }

  // The declaration passes if all registered var() usages can be substituted
  // with one compatible combination of representative sample values.
  const isCompatible = isCompatibleWithSubstitutions(
    valueSource,
    occurrences,
    substitutionOptions,
    matcher,
  );
  const fallbackReplacementContext: ReplacementCheckContext = {
    matcher,
    occurrences,
    substitutionOptions,
    valueSource,
  };

  for (const fallbackEntry of fallbackEntries) {
    const isFallbackCompatible = canDeclarationMatchWithOccurrenceReplacement(
      fallbackReplacementContext,
      fallbackEntry.index,
      fallbackEntry.fallbackSource,
    );

    if (!isFallbackCompatible) {
      diagnostics.push(
        toFallbackDiagnostic(
          filePath,
          declaration,
          fallbackEntry.registration,
          fallbackEntry.varNode,
        ),
      );
    }
  }

  if (!isCompatible) {
    if (isCustomPropertyName(declaration.property)) {
      diagnostics.push(
        toAssignmentDiagnostic(
          filePath,
          declaration,
          registry.get(declaration.property) as RegisteredProperty,
        ),
      );
    } else {
      // When several registered var() calls participate in one declaration,
      // prefer the narrowest truthful diagnostic we can support. If removing
      // one occurrence isolates the failure, point at that occurrence; otherwise
      // fall back to a possible-culprit or declaration-level message.
      diagnostics.push(
        toPreciseMultiVarDiagnostic(
          filePath,
          declaration,
          registeredEntries.map((entry, index) => ({ ...entry, index })),
          valueSource,
          occurrences,
          substitutionOptions,
          matcher,
        ),
      );
    }
  }

  return { diagnostics, skipped: 0, validated: 1 };
}

export function validateFiles(
  inputs: ValidationInput[],
  options: ValidateFilesOptions = {},
): ValidationResult {
  const registryInputs = options.registryInputs ?? [];
  const registrySources = [...inputs];
  const seenRegistryPaths = new Set(inputs.map((input) => input.path));

  for (const input of registryInputs) {
    if (seenRegistryPaths.has(input.path)) {
      continue;
    }

    seenRegistryPaths.add(input.path);
    registrySources.push(input);
  }

  const registryResult = collectRegistry(registrySources, {
    failFast: options.failFast,
    resolveImport: options.resolveImport,
  });
  const diagnostics = [...registryResult.diagnostics];
  const registry = registryMap(registryResult.registry);
  let skippedDeclarations = 0;
  let validatedDeclarations = 0;

  if (options.failFast && diagnostics.length > 0) {
    return {
      diagnostics,
      registry: registryResult.registry,
      skippedDeclarations,
      validatedDeclarations,
    };
  }

  for (const input of inputs) {
    let ast: CssValueAst;

    try {
      ast = cssTree.parse(input.css, {
        filename: input.path,
        positions: true,
      });
    } catch (error) {
      diagnostics.push({
        code: "unparseable-stylesheet",
        phase: "parse",
        reason: "unparseable-css",
        severity: "error",
        filePath: input.path,
        loc: null,
        message: `Could not parse stylesheet: ${(error as Error).message}`,
      });

      if (options.failFast) {
        break;
      }
      continue;
    }

    cssTree.walk(ast, {
      visit: "Declaration",
      enter(node: CssWalkNode) {
        if (options.failFast && diagnostics.length > 0) {
          return;
        }

        const result = validateDeclaration(input.path, node as CssDeclarationNode, registry);
        diagnostics.push(...result.diagnostics);
        skippedDeclarations += result.skipped;
        validatedDeclarations += result.validated;
      },
    });

    if (options.failFast && diagnostics.length > 0) {
      break;
    }
  }

  return {
    diagnostics,
    registry: registryResult.registry,
    skippedDeclarations,
    validatedDeclarations,
  };
}
