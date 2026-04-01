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

function declarationMatchesSample(declaration: any, varNode: any, sample: string): boolean {
  const valueSource = cssTree.generate(declaration.value);
  const replacementTarget = cssTree.generate(varNode);
  const replacedSource = valueSource.replace(replacementTarget, sample);
  const replacedAst = parseValue(replacedSource);

  if (!replacedAst) {
    return false;
  }

  const match = cssTree.lexer.matchProperty(declaration.property, replacedAst);
  return Boolean(match?.matched);
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

  // Multiple var() usages need coordinated substitution, so we track them as skipped for now.
  if (varFunctions.length > 1) {
    return { diagnostics, skipped: 1, validated: 0 };
  }

  const varNode = varFunctions[0];
  const propertyName = getVarPropertyName(varNode);

  // If the first var() argument is not a custom property name, we cannot resolve it reliably.
  if (!propertyName) {
    return { diagnostics, skipped: 1, validated: 0 };
  }

  const registration = registry.get(propertyName);

  // Unregistered custom properties are intentionally ignored in this first version.
  if (!registration) {
    return { diagnostics, skipped: 0, validated: 0 };
  }

  let samples: string[];

  try {
    samples = buildRepresentativeSamples(registration.syntax, cssTree.definitionSyntax);
  } catch {
    return { diagnostics, skipped: 1, validated: 0 };
  }

  // If we cannot materialize any valid sample values for the registered syntax,
  // we skip the check.
  if (samples.length === 0) {
    return { diagnostics, skipped: 1, validated: 0 };
  }

  // A declaration is considered compatible if at least one representative
  // sample fits the consumer property.
  const isCompatible = samples.some((sample) =>
    declarationMatchesSample(declaration, varNode, sample),
  );

  if (!isCompatible) {
    diagnostics.push({
      code: "incompatible-var-usage",
      filePath,
      loc: toLocation(varNode.loc),
      message: `Registered property ${propertyName} uses syntax "${registration.syntax}" which is incompatible with ${declaration.property} at this var() usage.`,
      propertyName,
      registeredSyntax: registration.syntax,
      expectedProperty: declaration.property,
      snippet: cssTree.generate(declaration),
    });
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
