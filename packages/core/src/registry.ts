import * as cssTree from "css-tree";

import type { RegisteredProperty, ValidationDiagnostic, ValidationInput } from "./types.js";

function toBoolean(value: string | undefined): boolean | undefined {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return undefined;
}

function toLocation(loc: any): RegisteredProperty["loc"] {
  return loc
    ? {
        source: loc.source,
        start: { ...loc.start },
        end: { ...loc.end },
      }
    : null;
}

function descriptorMap(block: any): Map<string, any> {
  const descriptors = new Map<string, any>();

  for (const declaration of block?.children ?? []) {
    descriptors.set(declaration.property, declaration);
  }

  return descriptors;
}

function getStringDescriptor(declaration: any): string | undefined {
  const firstNode = declaration?.value?.children?.first ?? declaration?.value?.children?.[0];

  if (firstNode?.type === "String") {
    return firstNode.value;
  }

  return undefined;
}

function getRawDescriptor(declaration: any): string | undefined {
  if (!declaration?.value) {
    return undefined;
  }

  return cssTree.generate(declaration.value).trim();
}

export function collectRegistry(inputs: ValidationInput[]): {
  diagnostics: ValidationDiagnostic[];
  registry: RegisteredProperty[];
} {
  const diagnostics: ValidationDiagnostic[] = [];
  const registry = new Map<string, RegisteredProperty>();

  for (const input of inputs) {
    let ast: any;

    try {
      ast = cssTree.parse(input.css, {
        filename: input.path,
        positions: true,
      });
    } catch (error) {
      diagnostics.push({
        code: "unparseable-stylesheet",
        filePath: input.path,
        loc: null,
        message: `Could not parse stylesheet: ${(error as Error).message}`,
      });
      continue;
    }

    cssTree.walk(ast, {
      visit: "Atrule",
      enter(node: any) {
        if (node.name !== "property") {
          return;
        }

        const propertyName =
          node.prelude?.children?.first?.name ?? node.prelude?.children?.[0]?.name;

        if (!propertyName) {
          diagnostics.push({
            code: "invalid-property-registration",
            filePath: input.path,
            loc: toLocation(node.loc),
            message: "Found an @property rule without a custom property name.",
          });
          return;
        }

        const descriptors = descriptorMap(node.block);
        const syntaxDeclaration = descriptors.get("syntax");
        const syntax = getStringDescriptor(syntaxDeclaration);

        if (!syntax) {
          diagnostics.push({
            code: "invalid-property-registration",
            filePath: input.path,
            loc: toLocation(node.loc),
            message: `@property ${propertyName} is missing a valid string-valued syntax descriptor.`,
            propertyName,
          });
          return;
        }

        try {
          if (syntax !== "*") {
            cssTree.definitionSyntax.parse(syntax);
          }
        } catch (error) {
          diagnostics.push({
            code: "invalid-property-registration",
            filePath: input.path,
            loc: toLocation(node.loc),
            message: `@property ${propertyName} has an invalid syntax descriptor "${syntax}": ${(error as Error).message}`,
            propertyName,
            registeredSyntax: syntax,
          });
          return;
        }

        registry.set(propertyName, {
          filePath: input.path,
          inherits: toBoolean(getRawDescriptor(descriptors.get("inherits"))),
          initialValue: getRawDescriptor(descriptors.get("initial-value")),
          loc: toLocation(node.loc),
          name: propertyName,
          syntax,
        });
      },
    });
  }

  return {
    diagnostics,
    registry: [...registry.values()],
  };
}
