import * as cssTree from "css-tree";

import { buildRepresentativeSamples } from "./syntax-samples.js";
import { collectRegistry } from "./registry.js";

import type {
  RegisteredProperty,
  ResolveImport,
  ValidationDiagnostic,
  ValidationInput,
  ValidationResult,
} from "./types.js";

export interface ValidateFilesOptions {
  registryInputs?: ValidationInput[];
  resolveImport?: ResolveImport;
}

function toLocation(loc: any): ValidationDiagnostic["loc"] {
  return loc
    ? {
        source: loc.source,
        start: { ...loc.start },
        end: { ...loc.end },
      }
    : null;
}

function registryMap(registry: RegisteredProperty[]): Map<string, RegisteredProperty> {
  return new Map(registry.map((entry) => [entry.name, entry]));
}

function isCustomPropertyName(propertyName: string): boolean {
  return propertyName.startsWith("--");
}

function collectVarFunctions(value: any): any[] {
  const functions: any[] = [];

  cssTree.walk(value, {
    visit: "Function",
    enter(node: any) {
      if (node.name === "var") {
        functions.push(node);
      }
    },
  });

  return functions;
}

function getDeclarationValueForValidation(declaration: any): any | null {
  if (isCustomPropertyName(declaration.property)) {
    return parseValue(cssTree.generate(declaration.value));
  }

  return declaration.value;
}

function getVarPropertyName(node: any): string | undefined {
  const firstNode = node.children?.first ?? node.children?.[0];
  return firstNode?.type === "Identifier" ? firstNode.name : undefined;
}

function parseValue(value: string): any | null {
  try {
    return cssTree.parse(value, { context: "value" });
  } catch {
    return null;
  }
}

function matchRegisteredSyntax(registration: RegisteredProperty, value: any): boolean {
  if (registration.syntax === "*") {
    return true;
  }

  const match = cssTree.lexer.match(registration.syntax, value);
  return Boolean(match?.matched);
}

function collectVarOccurrences(
  valueSource: string,
  varNodes: any[],
): Array<{ end: number; start: number; varNode: any }> | null {
  const occurrences = [];
  let searchStart = 0;

  for (const varNode of varNodes) {
    const replacementTarget = cssTree.generate(varNode);
    const start = valueSource.indexOf(replacementTarget, searchStart);

    if (start === -1) {
      return null;
    }

    const end = start + replacementTarget.length;

    occurrences.push({ start, end, varNode });
    searchStart = end;
  }

  return occurrences;
}

function renderValueWithReplacements(
  valueSource: string,
  occurrences: Array<{ end: number; start: number; varNode: any }>,
  replacements: Array<string | null>,
): string {
  let rendered = "";
  let cursor = 0;

  for (const [index, occurrence] of occurrences.entries()) {
    rendered += valueSource.slice(cursor, occurrence.start);
    rendered += replacements[index] ?? "";
    cursor = occurrence.end;
  }

  rendered += valueSource.slice(cursor);

  return rendered.trim();
}

function valueMatchesRenderedSource(
  renderedSource: string,
  matcher: (candidateValue: any) => boolean,
): boolean {
  const replacedAst = parseValue(renderedSource);

  if (!replacedAst) {
    return false;
  }

  return matcher(replacedAst);
}

function valueMatchesSamples(
  valueSource: string,
  occurrences: Array<{ end: number; start: number; varNode: any }>,
  substitutions: Array<{ sample: string; varNode: any }>,
  matcher: (candidateValue: any) => boolean,
): boolean {
  const replacementMap = new Map(substitutions.map((substitution) => [substitution.varNode, substitution.sample]));
  const renderedSource = renderValueWithReplacements(
    valueSource,
    occurrences,
    occurrences.map((occurrence) => replacementMap.get(occurrence.varNode) ?? null),
  );

  return valueMatchesRenderedSource(renderedSource, matcher);
}

function toVarDiagnostic(
  filePath: string,
  declaration: any,
  registrations: RegisteredProperty[],
  varNodes: any[],
): ValidationDiagnostic {
  if (registrations.length === 1) {
    const [registration] = registrations;
    const [varNode] = varNodes;

    return {
      code: "incompatible-var-usage",
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
    filePath,
    loc: toLocation(declaration.value.loc),
    message: `Registered properties ${registeredNames} are jointly incompatible with ${declaration.property} at this declaration value.`,
    expectedProperty: declaration.property,
    snippet: cssTree.generate(declaration),
  };
}

function toPossibleVarDiagnostic(
  filePath: string,
  declaration: any,
  registrations: RegisteredProperty[],
): ValidationDiagnostic {
  const uniqueNames = [...new Set(registrations.map((registration) => registration.name))];
  const message =
    uniqueNames.length === 1
      ? `One or more var() usages of registered property ${uniqueNames[0]} may be incompatible with ${declaration.property} at this declaration value.`
      : `Registered properties ${uniqueNames.join(", ")} may be incompatible with ${declaration.property} at this declaration value.`;

  return {
    code: "incompatible-var-usage",
    filePath,
    loc: toLocation(declaration.value.loc),
    message,
    expectedProperty: declaration.property,
    snippet: cssTree.generate(declaration),
  };
}

function toAssignmentDiagnostic(
  filePath: string,
  declaration: any,
  registration: RegisteredProperty,
): ValidationDiagnostic {
  return {
    code: "incompatible-custom-property-assignment",
    filePath,
    loc: toLocation(declaration.value.loc ?? declaration.loc),
    message: `Assigned value for registered property ${registration.name} does not match its syntax "${registration.syntax}".`,
    propertyName: registration.name,
    registeredSyntax: registration.syntax,
    snippet: cssTree.generate(declaration),
  };
}

function isCompatibleWithSubstitutions(
  valueSource: string,
  occurrences: Array<{ end: number; start: number; varNode: any }>,
  substitutionOptions: Array<{ samples: string[]; varNode: any }>,
  matcher: (candidateValue: any) => boolean,
  index = 0,
  activeSubstitutions: Array<{ sample: string; varNode: any }> = [],
): boolean {
  if (index === substitutionOptions.length) {
    return valueMatchesSamples(valueSource, occurrences, activeSubstitutions, matcher);
  }

  const option = substitutionOptions[index];

  return option.samples.some((sample) =>
    isCompatibleWithSubstitutions(valueSource, occurrences, substitutionOptions, matcher, index + 1, [
      ...activeSubstitutions,
      { sample, varNode: option.varNode },
    ]),
  );
}

function canDeclarationMatchWithoutOccurrence(
  valueSource: string,
  occurrences: Array<{ end: number; start: number; varNode: any }>,
  substitutionOptions: Array<{ index: number; samples: string[]; varNode: any }>,
  matcher: (candidateValue: any) => boolean,
  removedIndex: number,
  optionIndex = 0,
  replacements: Array<string | null> = Array.from({ length: occurrences.length }, () => null),
): boolean {
  if (optionIndex === substitutionOptions.length) {
    const renderedSource = renderValueWithReplacements(valueSource, occurrences, replacements);
    return valueMatchesRenderedSource(renderedSource, matcher);
  }

  const option = substitutionOptions[optionIndex];

  if (option.index === removedIndex) {
    return canDeclarationMatchWithoutOccurrence(
      valueSource,
      occurrences,
      substitutionOptions,
      matcher,
      removedIndex,
      optionIndex + 1,
      replacements,
    );
  }

  return option.samples.some((sample) => {
    const nextReplacements = [...replacements];
    nextReplacements[option.index] = sample;

    return canDeclarationMatchWithoutOccurrence(
      valueSource,
      occurrences,
      substitutionOptions,
      matcher,
      removedIndex,
      optionIndex + 1,
      nextReplacements,
    );
  });
}

function toPreciseMultiVarDiagnostic(
  filePath: string,
  declaration: any,
  registeredEntries: Array<{ index: number; registration: RegisteredProperty; varNode: any }>,
  valueSource: string,
  occurrences: Array<{ end: number; start: number; varNode: any }>,
  substitutionOptions: Array<{ index: number; samples: string[]; varNode: any }>,
  matcher: (candidateValue: any) => boolean,
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
  declaration: any,
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
      registration: propertyName ? registry.get(propertyName) ?? null : null,
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
      varNode: any;
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

  const valueSource = cssTree.generate(valueToValidate);
  const occurrences = collectVarOccurrences(valueSource, registeredEntries.map((entry) => entry.varNode));

  if (!occurrences) {
    return { diagnostics, skipped: 1, validated: 0 };
  }

  const substitutionOptions = [];

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
    ? (candidateValue: any) =>
        matchRegisteredSyntax(registry.get(declaration.property) as RegisteredProperty, candidateValue)
    : (candidateValue: any) => {
        const match = cssTree.lexer.matchProperty(declaration.property, candidateValue);
        return Boolean(match?.matched);
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
        toAssignmentDiagnostic(filePath, declaration, registry.get(declaration.property) as RegisteredProperty),
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
    resolveImport: options.resolveImport,
  });
  const diagnostics = [...registryResult.diagnostics];
  const registry = registryMap(registryResult.registry);
  let skippedDeclarations = 0;
  let validatedDeclarations = 0;

  for (const input of inputs) {
    let ast: any;

    try {
      ast = cssTree.parse(input.css, {
        filename: input.path,
        positions: true,
      });
    } catch {
      continue;
    }

    cssTree.walk(ast, {
      visit: "Declaration",
      enter(node: any) {
        const result = validateDeclaration(input.path, node, registry);
        diagnostics.push(...result.diagnostics);
        skippedDeclarations += result.skipped;
        validatedDeclarations += result.validated;
      },
    });
  }

  return {
    diagnostics,
    registry: registryResult.registry,
    skippedDeclarations,
    validatedDeclarations,
  };
}
