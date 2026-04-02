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

function declarationMatchesSamples(
  declaration: any,
  substitutions: Array<{ sample: string; varNode: any }>,
): boolean {
  const valueSource = cssTree.generate(declaration.value);
  const replacedSource = substitutions.reduce((source, substitution) => {
    const replacementTarget = cssTree.generate(substitution.varNode);
    return source.replace(replacementTarget, substitution.sample);
  }, valueSource);
  const replacedAst = parseValue(replacedSource);

  if (!replacedAst) {
    return false;
  }

  const match = cssTree.lexer.matchProperty(declaration.property, replacedAst);
  return Boolean(match?.matched);
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

function isCompatibleWithSubstitutions(
  declaration: any,
  substitutionOptions: Array<{ samples: string[]; varNode: any }>,
  index = 0,
  activeSubstitutions: Array<{ sample: string; varNode: any }> = [],
): boolean {
  if (index === substitutionOptions.length) {
    return declarationMatchesSamples(declaration, activeSubstitutions);
  }

  const option = substitutionOptions[index];

  return option.samples.some((sample) =>
    isCompatibleWithSubstitutions(declaration, substitutionOptions, index + 1, [
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
  const varFunctions = collectVarFunctions(declaration.value);

  // v1 only validates var() consumption sites, not authored values assigned to custom properties.
  if (varFunctions.length === 0 || declaration.property.startsWith("--")) {
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

  // The declaration passes if all registered var() usages can be substituted
  // with one compatible combination of representative sample values.
  const isCompatible = isCompatibleWithSubstitutions(declaration, substitutionOptions);

  if (!isCompatible) {
    diagnostics.push(
      toVarDiagnostic(
        filePath,
        declaration,
        registeredEntries.map((entry) => entry.registration),
        registeredEntries.map((entry) => entry.varNode),
      ),
    );
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
