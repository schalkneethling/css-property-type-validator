import { toDiagnosticLocation, withDiagnosticContract } from "./diagnostics.js";
import { getImportSpecifier, isAbsoluteImportUrl, type CssAtruleNode } from "./imports.js";
import {
  generateCss,
  matchesProperty,
  matchesSyntax,
  parseDefinitionSyntax,
  parseStylesheet as parseCssStylesheet,
  parseValue as parseCssValue,
  walkCss,
} from "./parser.js";
import { buildRepresentativeSamples } from "./syntax-samples.js";
import { collectRegistry } from "./registry.js";
import {
  canDeclarationMatchWithoutOccurrence,
  collectVarOccurrences,
  isCompatibleWithSubstitutions,
} from "./var-substitution.js";

import type {
  RegisteredProperty,
  ResolveImport,
  SourceLocation,
  ValidationDiagnostic,
  ValidationDiagnosticInput,
  ValidationInput,
  ValidationResult,
} from "./types.js";
import type {
  CssNodeWithLoc,
  CssValueAst,
  Matcher,
  SubstitutionOption,
  VarFunctionNode,
  VarOccurrence,
} from "./var-substitution.js";

export interface ValidateFilesOptions {
  checkUnresolvedCustomProperties?: boolean;
  failFast?: boolean;
  knownCustomPropertyInputs?: ValidationInput[];
  registryInputs?: ValidationInput[];
  resolveImport?: ResolveImport;
}

interface CssDeclarationNode {
  loc?: unknown;
  property: string;
  value: CssValueAst & { loc?: unknown };
}

interface CssWalkNode {
  type?: string;
}

type CssLocation = NonNullable<ValidationDiagnostic["loc"]>;

function validationResult(
  diagnostics: ValidationDiagnosticInput[],
  registry: RegisteredProperty[],
  skippedDeclarations: number,
  validatedDeclarations: number,
): ValidationResult {
  return {
    diagnostics: diagnostics.map(withDiagnosticContract),
    registry,
    skippedDeclarations,
    validatedDeclarations,
  };
}

const PROPERTY_RULE_DESCRIPTOR_NAMES = Object.freeze(["syntax", "inherits", "initial-value"]);

type ParsedStylesheet = CssValueAst & { children?: ArrayLike<unknown> };

type ParsedStylesheetResult =
  | {
      ast: ParsedStylesheet;
      error: null;
    }
  | {
      ast: null;
      error: Error;
    };

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

function customPropertySet(properties: Iterable<string>): Set<string> {
  return new Set([...properties].filter(isCustomPropertyName));
}

function isCustomPropertyName(propertyName: string): boolean {
  return propertyName.startsWith("--");
}

function isPropertyRuleDescriptorName(propertyName: string): boolean {
  return PROPERTY_RULE_DESCRIPTOR_NAMES.includes(propertyName);
}

function mergeInto(target: Set<string>, source: Iterable<string>): void {
  for (const value of source) {
    target.add(value);
  }
}

function parseStylesheet(
  input: ValidationInput,
  parsedAstByPath: Map<string, ParsedStylesheetResult>,
): ParsedStylesheetResult {
  const cached = parsedAstByPath.get(input.path);

  if (cached) {
    return cached;
  }

  let result: ParsedStylesheetResult;

  try {
    result = {
      ast: parseCssStylesheet(input.css, {
        filename: input.path,
        positions: true,
      }) as ParsedStylesheet,
      error: null,
    };
  } catch (error) {
    result = {
      ast: null,
      error: error as Error,
    };
  }

  parsedAstByPath.set(input.path, result);
  return result;
}

function collectKnownCustomProperties(
  inputs: ValidationInput[],
  knownCustomPropertyInputs: ValidationInput[],
  registryInputs: ValidationInput[],
  registry: Map<string, RegisteredProperty>,
  diagnostics: ValidationDiagnosticInput[],
  parsedAstByPath: Map<string, ParsedStylesheetResult>,
  resolveImport?: ResolveImport,
): Map<string, Set<string>> {
  const byPath = new Map<string, Set<string>>();
  const reportedKnownInputParsePaths = new Set<string>();

  function reportKnownInputParseFailure(input: ValidationInput, error: Error): void {
    if (reportedKnownInputParsePaths.has(input.path)) {
      return;
    }

    reportedKnownInputParsePaths.add(input.path);
    diagnostics.push({
      code: "unparseable-stylesheet",
      phase: "parse",
      reason: "unparseable-css",
      severity: "error",
      filePath: input.path,
      loc: null,
      message: `Could not parse known custom property input ${input.path}: ${error.message}`,
    });
  }

  function collectForInput(
    input: ValidationInput,
    activePaths = new Set<string>(),
    reportParseFailures = false,
  ): Set<string> {
    const cached = byPath.get(input.path);

    if (cached) {
      return cached;
    }

    const known = new Set<string>();
    byPath.set(input.path, known);

    if (activePaths.has(input.path)) {
      return known;
    }

    activePaths.add(input.path);

    const parsed = parseStylesheet(input, parsedAstByPath);

    if (!parsed.ast) {
      if (reportParseFailures) {
        reportKnownInputParseFailure(input, parsed.error);
      }

      activePaths.delete(input.path);
      return known;
    }

    walkCss(parsed.ast, {
      visit: "Declaration",
      enter(node: CssWalkNode) {
        const declaration = node as CssDeclarationNode;

        if (isCustomPropertyName(declaration.property)) {
          known.add(declaration.property);
        }
      },
    });

    for (const node of Array.from(parsed.ast.children ?? []) as CssAtruleNode[]) {
      if (node.type !== "Atrule" || node.name !== "import") {
        continue;
      }

      const importSpecifier = getImportSpecifier(node);

      if (!importSpecifier || isAbsoluteImportUrl(importSpecifier) || !resolveImport) {
        continue;
      }

      const importedInput = resolveImport(importSpecifier, input.path);

      if (!importedInput) {
        continue;
      }

      mergeInto(known, collectForInput(importedInput, activePaths, reportParseFailures));
    }

    activePaths.delete(input.path);
    return known;
  }

  const globalCustomProperties = customPropertySet(registry.keys());

  for (const input of knownCustomPropertyInputs) {
    mergeInto(globalCustomProperties, collectForInput(input, new Set<string>(), true));
  }

  for (const input of registryInputs) {
    mergeInto(globalCustomProperties, collectForInput(input));
  }

  for (const input of inputs) {
    const visibleProperties = new Set(globalCustomProperties);
    mergeInto(visibleProperties, collectForInput(input));
    byPath.set(input.path, visibleProperties);
  }

  return byPath;
}

function collectVarFunctions(value: CssValueAst, outermostOnly = false): VarFunctionNode[] {
  const functions: VarFunctionNode[] = [];
  let varDepth = 0;

  walkCss(value, {
    visit: "Function",
    enter(node: VarFunctionNode) {
      if (node.name?.toLowerCase() === "var") {
        if (!outermostOnly || varDepth === 0) {
          functions.push(node);
        }
        varDepth += 1;
      }
    },
    leave(node: VarFunctionNode) {
      if (node.name?.toLowerCase() === "var") {
        varDepth -= 1;
      }
    },
  });

  // css-tree deliberately preserves var() fallback tokens as Raw nodes. Parse
  // those token streams recursively so the specification's nested-fallback
  // requirements are not hidden by the parser representation.
  if (!outermostOnly) {
    const parsedFunctions = functions.slice();
    for (const varNode of parsedFunctions) {
      const fallbackSource = getVarFallbackSource(varNode);
      const fallbackValue =
        fallbackSource === null
          ? null
          : parseValue(fallbackSource, getVarFallbackLocation(varNode));
      if (fallbackValue) functions.push(...collectVarFunctions(fallbackValue));
    }
  }

  return functions;
}

function getDeclarationValueForValidation(declaration: CssDeclarationNode): CssValueAst | null {
  if (isCustomPropertyName(declaration.property)) {
    return parseValue(generateCss(declaration.value), toLocation(declaration.value.loc));
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
    .map((child) => generateCss(child))
    .join("")
    .trim();

  return fallbackSource.length > 0 ? fallbackSource : null;
}

function getVarFallbackLocation(node: VarFunctionNode): SourceLocation | null {
  const children = getVarChildren(node);
  const fallbackStartIndex = children.findIndex(
    (child) => child.type === "Operator" && child.value === ",",
  );
  const fallbackChildren = fallbackStartIndex === -1 ? [] : children.slice(fallbackStartIndex + 1);
  const first = fallbackChildren[0]?.loc;
  const last = fallbackChildren.at(-1)?.loc;

  if (!first || !last) return null;
  const rawSource = fallbackChildren.map((child) => generateCss(child)).join("");
  const leadingWhitespace = rawSource.slice(0, rawSource.length - rawSource.trimStart().length);
  const start = { ...first.start };
  for (const character of leadingWhitespace) {
    start.offset += character.length;
    if (character === "\n") {
      start.line += 1;
      start.column = 1;
    } else {
      start.column += character.length;
    }
  }
  return {
    ...(first.source === undefined ? {} : { source: first.source }),
    start,
    end: { ...last.end },
  };
}

function translateParsedLocations(value: CssValueAst, baseLocation: SourceLocation): void {
  walkCss(value, {
    enter(rawNode: unknown) {
      const node = rawNode as { loc?: SourceLocation | null };
      if (!node.loc) return;

      for (const position of [node.loc.start, node.loc.end]) {
        position.offset += baseLocation.start.offset;
        if (position.line === 1) position.column += baseLocation.start.column - 1;
        position.line += baseLocation.start.line - 1;
      }
      node.loc.source = baseLocation.source;
    },
  });
}

function parseValue(value: string, baseLocation: SourceLocation | null = null): CssValueAst | null {
  try {
    const parsed = parseCssValue<CssValueAst>(value, {
      ...(baseLocation?.source === undefined ? {} : { filename: baseLocation.source }),
      positions: true,
    });
    if (baseLocation) translateParsedLocations(parsed, baseLocation);
    return parsed;
  } catch {
    return null;
  }
}

function matchRegisteredSyntax(registration: RegisteredProperty, value: CssValueAst): boolean {
  if (registration.syntax === "*") {
    return true;
  }

  return matchesSyntax(registration.syntax, value);
}

function exactVarFunction(value: CssValueAst): VarFunctionNode | null {
  const children = getVarChildren(value as VarFunctionNode);
  const first = children[0] as VarFunctionNode | undefined;

  return children.length === 1 && first?.type === "Function" && first.name?.toLowerCase() === "var"
    ? first
    : null;
}

/**
 * Proves only the narrow nested case whose substitution type is invariant:
 * an acyclic exact var() alias between identical non-universal registrations.
 */
function isProvenNestedFallback(
  outerRegistration: RegisteredProperty,
  fallbackValue: CssValueAst,
  registry: ReadonlyMap<string, RegisteredProperty>,
  activeNames = new Set<string>([outerRegistration.name]),
): boolean {
  const exactVar = exactVarFunction(fallbackValue);
  const targetName = exactVar ? getVarPropertyName(exactVar) : undefined;
  const targetRegistration = targetName ? registry.get(targetName) : undefined;

  if (
    !exactVar ||
    !targetName ||
    !targetRegistration ||
    targetRegistration.syntax === "*" ||
    outerRegistration.syntax === "*" ||
    targetRegistration.syntax !== outerRegistration.syntax ||
    activeNames.has(targetName)
  ) {
    return false;
  }

  const targetFallbackSource = getVarFallbackSource(exactVar);
  if (targetFallbackSource === null) {
    return true;
  }

  const targetFallback = parseValue(targetFallbackSource, getVarFallbackLocation(exactVar));
  if (!targetFallback) {
    return false;
  }

  if (collectVarFunctions(targetFallback).length === 0) {
    return matchRegisteredSyntax(targetRegistration, targetFallback);
  }

  return isProvenNestedFallback(
    targetRegistration,
    targetFallback,
    registry,
    new Set([...activeNames, targetName]),
  );
}

interface RegisteredVarEntry {
  propertyName: string;
  registration: RegisteredProperty;
  varNode: VarFunctionNode;
}

function validateRegisteredFallbacks(
  filePath: string,
  declaration: CssDeclarationNode,
  entries: readonly RegisteredVarEntry[],
  registry: ReadonlyMap<string, RegisteredProperty>,
): { diagnostics: ValidationDiagnosticInput[]; nestedUnproven: boolean } {
  const diagnostics: ValidationDiagnosticInput[] = [];
  let nestedUnproven = false;

  for (const entry of entries) {
    const fallbackSource = getVarFallbackSource(entry.varNode);
    if (fallbackSource === null || entry.registration.syntax === "*") {
      continue;
    }

    const fallbackValue = parseValue(fallbackSource, getVarFallbackLocation(entry.varNode));
    if (!fallbackValue) {
      nestedUnproven = true;
      continue;
    }

    if (collectVarFunctions(fallbackValue).length > 0) {
      if (!isProvenNestedFallback(entry.registration, fallbackValue, registry)) {
        nestedUnproven = true;
      }
      continue;
    }

    if (!matchRegisteredSyntax(entry.registration, fallbackValue)) {
      diagnostics.push(
        toFallbackDiagnostic(filePath, declaration, entry.registration, entry.varNode),
      );
    }
  }

  return { diagnostics, nestedUnproven };
}

function registrationRelatedLocations(
  registrations: readonly RegisteredProperty[],
): NonNullable<ValidationDiagnosticInput["relatedLocations"]> {
  const seen = new Set<string>();
  const relatedLocations: NonNullable<ValidationDiagnosticInput["relatedLocations"]> = [];

  for (const registration of registrations) {
    const location = toDiagnosticLocation(registration.loc);
    const key = `${registration.name}\u0000${registration.filePath}\u0000${location?.start.offset ?? -1}`;

    if (!location || seen.has(key)) {
      continue;
    }

    seen.add(key);
    relatedLocations.push({
      location,
      message: `Registration for ${registration.name}.`,
    });
  }

  return relatedLocations;
}

function toVarDiagnostic(
  filePath: string,
  declaration: CssDeclarationNode,
  registrations: RegisteredProperty[],
  varNodes: VarFunctionNode[],
): ValidationDiagnosticInput {
  if (registrations.length === 1) {
    const [registration] = registrations;
    const [varNode] = varNodes;

    return {
      basis: "representative-var-substitution",
      code: "incompatible-var-usage",
      phase: "usage",
      reason: "incompatible-var-substitution",
      severity: "error",
      filePath,
      loc: toLocation(varNode.loc),
      message: `Registered property ${registration.name} uses syntax "${registration.syntax}" which is incompatible with ${declaration.property} at this var() usage.`,
      propertyName: registration.name,
      registeredSyntax: registration.syntax,
      relatedLocations: registrationRelatedLocations([registration]),
      expectedProperty: declaration.property,
      snippet: generateCss(declaration),
    };
  }

  const registeredNames = [...new Set(registrations.map((registration) => registration.name))].join(
    ", ",
  );

  return {
    basis: "representative-var-substitution",
    code: "incompatible-var-usage",
    phase: "usage",
    reason: "incompatible-var-substitution",
    severity: "error",
    filePath,
    loc: toLocation(declaration.value.loc),
    message: `Registered properties ${registeredNames} are jointly incompatible with ${declaration.property} at this declaration value.`,
    expectedProperty: declaration.property,
    relatedLocations: registrationRelatedLocations(registrations),
    snippet: generateCss(declaration),
  };
}

function toPossibleVarDiagnostic(
  filePath: string,
  declaration: CssDeclarationNode,
  registrations: RegisteredProperty[],
): ValidationDiagnosticInput {
  const uniqueNames = [...new Set(registrations.map((registration) => registration.name))];
  const message =
    uniqueNames.length === 1
      ? `One or more var() usages of registered property ${uniqueNames[0]} may be incompatible with ${declaration.property} at this declaration value.`
      : `Registered properties ${uniqueNames.join(", ")} may be incompatible with ${declaration.property} at this declaration value.`;

  return {
    basis: "representative-var-substitution",
    code: "incompatible-var-usage",
    phase: "usage",
    reason: "incompatible-var-substitution",
    severity: "error",
    filePath,
    loc: toLocation(declaration.value.loc),
    message,
    expectedProperty: declaration.property,
    relatedLocations: registrationRelatedLocations(registrations),
    snippet: generateCss(declaration),
  };
}

function toAssignmentDiagnostic(
  filePath: string,
  declaration: CssDeclarationNode,
  registration: RegisteredProperty,
  basis: ValidationDiagnosticInput["basis"] = "direct",
): ValidationDiagnosticInput {
  return {
    basis,
    code: "incompatible-custom-property-assignment",
    phase: "assignment",
    reason: "incompatible-assignment-value",
    severity: "error",
    filePath,
    loc: toLocation(declaration.value.loc ?? declaration.loc),
    message: `Assigned value for registered property ${registration.name} does not match its syntax "${registration.syntax}".`,
    actualValue: generateCss(declaration.value).trim(),
    propertyName: registration.name,
    registeredSyntax: registration.syntax,
    relatedLocations: registrationRelatedLocations([registration]),
    snippet: generateCss(declaration),
  };
}

function toFallbackDiagnostic(
  filePath: string,
  declaration: CssDeclarationNode,
  registration: RegisteredProperty,
  varNode: VarFunctionNode,
): ValidationDiagnosticInput {
  return {
    basis: "direct",
    code: "incompatible-var-usage",
    phase: "usage",
    reason: "incompatible-var-fallback",
    severity: "error",
    filePath,
    loc: toLocation(varNode.loc),
    message: `Fallback value in var() for registered property ${registration.name} does not match its syntax "${registration.syntax}".`,
    actualValue: getVarFallbackSource(varNode) ?? undefined,
    propertyName: registration.name,
    registeredSyntax: registration.syntax,
    expectedProperty: declaration.property,
    relatedLocations: registrationRelatedLocations([registration]),
    snippet: generateCss(declaration),
  };
}

function toUnresolvedVarDiagnostic(
  filePath: string,
  declaration: CssDeclarationNode,
  propertyName: string,
  varNode: VarFunctionNode,
  knownSourceDescription: string,
): ValidationDiagnosticInput {
  return {
    code: "incompatible-var-usage",
    phase: "usage",
    reason: "unresolved-var-reference",
    severity: "error",
    filePath,
    loc: toLocation(varNode.loc),
    message: `Custom property ${propertyName} is not defined in the ${knownSourceDescription} for this file, and no fallback was provided. This is a static check of the CSS files and imports available to the validator, not a full browser cascade evaluation.`,
    propertyName,
    expectedProperty: declaration.property,
    snippet: generateCss(declaration),
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
): ValidationDiagnosticInput {
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
  knownCustomProperties: Set<string>,
  options: {
    checkUnresolvedCustomProperties: boolean;
    knownSourceDescription: string;
  },
): { diagnostics: ValidationDiagnosticInput[]; skipped: number; validated: number } {
  const diagnostics: ValidationDiagnosticInput[] = [];

  if (isPropertyRuleDescriptorName(declaration.property)) {
    return { diagnostics, skipped: 0, validated: 0 };
  }

  const valueToValidate = getDeclarationValueForValidation(declaration);

  if (!valueToValidate) {
    return isCustomPropertyName(declaration.property)
      ? { diagnostics, skipped: 1, validated: 0 }
      : { diagnostics, skipped: 0, validated: 0 };
  }

  const allVarFunctions = collectVarFunctions(valueToValidate);
  const outermostVarFunctions = collectVarFunctions(valueToValidate, true);
  const assignmentRegistration = isCustomPropertyName(declaration.property)
    ? registry.get(declaration.property)
    : undefined;

  if (isCustomPropertyName(declaration.property)) {
    const authoredValue = generateCss(declaration.value).trim();

    if (authoredValue.length === 0) {
      return { diagnostics, skipped: 1, validated: 0 };
    }

    if (allVarFunctions.length === 0) {
      if (
        assignmentRegistration &&
        !matchRegisteredSyntax(assignmentRegistration, valueToValidate)
      ) {
        diagnostics.push(toAssignmentDiagnostic(filePath, declaration, assignmentRegistration));
      }

      return {
        diagnostics,
        skipped: 0,
        validated: assignmentRegistration ? 1 : 0,
      };
    }
  }

  if (allVarFunctions.length === 0) {
    return { diagnostics, skipped: 0, validated: 0 };
  }

  const allVarMetadata = allVarFunctions.map((varNode) => {
    const propertyName = getVarPropertyName(varNode);

    return {
      propertyName,
      registration: propertyName ? (registry.get(propertyName) ?? null) : null,
      varNode,
    };
  });

  // If any var() reference cannot be resolved to a custom property name, we cannot validate safely.
  if (allVarMetadata.some((entry) => !entry.propertyName)) {
    return { diagnostics, skipped: 1, validated: 0 };
  }

  for (const entry of allVarMetadata) {
    if (
      options.checkUnresolvedCustomProperties &&
      entry.propertyName &&
      !knownCustomProperties.has(entry.propertyName) &&
      getVarFallbackSource(entry.varNode) === null
    ) {
      diagnostics.push(
        toUnresolvedVarDiagnostic(
          filePath,
          declaration,
          entry.propertyName,
          entry.varNode,
          options.knownSourceDescription,
        ),
      );
    }
  }

  const allRegisteredEntries = allVarMetadata.filter((entry): entry is RegisteredVarEntry =>
    Boolean(entry.registration),
  );
  const fallbackValidation = validateRegisteredFallbacks(
    filePath,
    declaration,
    allRegisteredEntries,
    registry,
  );
  diagnostics.push(...fallbackValidation.diagnostics);

  const outermostMetadata = outermostVarFunctions.map((varNode) => {
    const propertyName = getVarPropertyName(varNode);

    return {
      propertyName,
      registration: propertyName ? (registry.get(propertyName) ?? null) : null,
      varNode,
    };
  });
  const registeredEntries = outermostMetadata.filter((entry): entry is RegisteredVarEntry =>
    Boolean(entry.registration),
  );

  if (isCustomPropertyName(declaration.property)) {
    if (!assignmentRegistration || registeredEntries.length !== outermostMetadata.length) {
      return {
        diagnostics,
        skipped: fallbackValidation.nestedUnproven || diagnostics.length === 0 ? 1 : 0,
        validated: 0,
      };
    }
  }

  // Unregistered custom properties are intentionally ignored when no registered inputs participate.
  if (registeredEntries.length === 0) {
    return { diagnostics, skipped: 0, validated: 0 };
  }

  // Mixed registered and unregistered var() usages still leave unresolved values in the declaration.
  if (registeredEntries.length !== outermostMetadata.length) {
    return {
      diagnostics,
      skipped: fallbackValidation.nestedUnproven || diagnostics.length === 0 ? 1 : 0,
      validated: 0,
    };
  }

  // Universal-syntax registrations compute like unregistered custom properties,
  // and we do not currently model authored custom-property values at computed value time.
  // Skipping avoids false positives such as flagging `var(--token)` in places
  // where the actual substituted value could still be valid.
  if (registeredEntries.some((entry) => entry.registration.syntax === "*")) {
    return { diagnostics, skipped: 1, validated: 0 };
  }

  const valueSource = generateCss(valueToValidate);
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
      samples = buildRepresentativeSamples(entry.registration.syntax, parseDefinitionSyntax);
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
        return matchesProperty(declaration.property, candidateValue);
      };

  // The declaration passes if all registered var() usages can be substituted
  // with one compatible combination of representative sample values.
  const isCompatible = isCompatibleWithSubstitutions(
    valueSource,
    occurrences,
    substitutionOptions,
    matcher,
  );
  if (!isCompatible) {
    if (isCustomPropertyName(declaration.property)) {
      diagnostics.push(
        toAssignmentDiagnostic(
          filePath,
          declaration,
          registry.get(declaration.property) as RegisteredProperty,
          "representative-var-substitution",
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

  return {
    diagnostics,
    skipped: fallbackValidation.nestedUnproven ? 1 : 0,
    validated: fallbackValidation.nestedUnproven ? 0 : 1,
  };
}

export function validateFiles(
  inputs: ValidationInput[],
  options: ValidateFilesOptions = {},
): ValidationResult {
  const registryInputs = options.registryInputs ?? [];
  const knownCustomPropertyInputs = options.knownCustomPropertyInputs ?? [];
  const checkUnresolvedCustomProperties = options.checkUnresolvedCustomProperties ?? false;
  const knownSourceDescription =
    knownCustomPropertyInputs.length > 0
      ? "configured known custom property inputs"
      : "known CSS inputs";
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
    return validationResult(
      diagnostics,
      registryResult.registry,
      skippedDeclarations,
      validatedDeclarations,
    );
  }

  const parsedAstByPath = new Map<string, ParsedStylesheetResult>();
  const knownCustomPropertiesByPath = checkUnresolvedCustomProperties
    ? collectKnownCustomProperties(
        inputs,
        knownCustomPropertyInputs,
        registryInputs,
        registry,
        diagnostics,
        parsedAstByPath,
        options.resolveImport,
      )
    : new Map<string, Set<string>>();

  if (options.failFast && diagnostics.length > 0) {
    return validationResult(
      diagnostics,
      registryResult.registry,
      skippedDeclarations,
      validatedDeclarations,
    );
  }

  for (const input of inputs) {
    const parsed = parseStylesheet(input, parsedAstByPath);

    if (!parsed.ast) {
      diagnostics.push({
        code: "unparseable-stylesheet",
        phase: "parse",
        reason: "unparseable-css",
        severity: "error",
        filePath: input.path,
        loc: null,
        message: `Could not parse stylesheet: ${parsed.error.message}`,
      });

      if (options.failFast) {
        break;
      }
      continue;
    }

    walkCss(parsed.ast, {
      visit: "Declaration",
      enter(node: CssWalkNode) {
        if (options.failFast && diagnostics.length > 0) {
          return;
        }

        const knownCustomProperties =
          knownCustomPropertiesByPath.get(input.path) ?? customPropertySet(registry.keys());
        const result = validateDeclaration(
          input.path,
          node as CssDeclarationNode,
          registry,
          knownCustomProperties,
          {
            checkUnresolvedCustomProperties,
            knownSourceDescription,
          },
        );
        diagnostics.push(...result.diagnostics);
        skippedDeclarations += result.skipped;
        validatedDeclarations += result.validated;
      },
    });

    if (options.failFast && diagnostics.length > 0) {
      break;
    }
  }

  return validationResult(
    diagnostics,
    registryResult.registry,
    skippedDeclarations,
    validatedDeclarations,
  );
}
