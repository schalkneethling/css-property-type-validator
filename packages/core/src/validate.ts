import * as cssTree from "css-tree";

import { buildRepresentativeSamples } from "./syntax-samples.js";
import { collectRegistry } from "./registry.js";

import type {
  RegisteredProperty,
  ValidationDiagnostic,
  ValidationInput,
  ValidationResult,
} from "./types.js";

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

function valueMatchesSamples(
  value: any,
  substitutions: Array<{ sample: string; varNode: any }>,
  matcher: (candidateValue: any) => boolean,
): boolean {
  const valueSource = cssTree.generate(value);
  const replacedSource = substitutions.reduce((source, substitution) => {
    const replacementTarget = cssTree.generate(substitution.varNode);
    return source.replace(replacementTarget, substitution.sample);
  }, valueSource);
  const replacedAst = parseValue(replacedSource);

  if (!replacedAst) {
    return false;
  }

  return matcher(replacedAst);
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
  value: any,
  substitutionOptions: Array<{ samples: string[]; varNode: any }>,
  matcher: (candidateValue: any) => boolean,
  index = 0,
  activeSubstitutions: Array<{ sample: string; varNode: any }> = [],
): boolean {
  if (index === substitutionOptions.length) {
    return valueMatchesSamples(value, activeSubstitutions, matcher);
  }

  const option = substitutionOptions[index];

  return option.samples.some((sample) =>
    isCompatibleWithSubstitutions(value, substitutionOptions, matcher, index + 1, [
      ...activeSubstitutions,
      { sample, varNode: option.varNode },
    ]),
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

  const substitutionOptions = [];

  for (const entry of registeredEntries) {
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
  const isCompatible = isCompatibleWithSubstitutions(valueToValidate, substitutionOptions, matcher);

  if (!isCompatible) {
    if (isCustomPropertyName(declaration.property)) {
      diagnostics.push(
        toAssignmentDiagnostic(filePath, declaration, registry.get(declaration.property) as RegisteredProperty),
      );
    } else {
      diagnostics.push(
        toVarDiagnostic(
          filePath,
          declaration,
          registeredEntries.map((entry) => entry.registration),
          registeredEntries.map((entry) => entry.varNode),
        ),
      );
    }
  }

  return { diagnostics, skipped: 0, validated: 1 };
}

export function validateFiles(inputs: ValidationInput[]): ValidationResult {
  const registryResult = collectRegistry(inputs);
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
