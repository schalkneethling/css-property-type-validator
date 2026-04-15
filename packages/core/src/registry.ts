import * as cssTree from "css-tree";

import { getUnsupportedSyntaxComponentName } from "./supported-syntax.js";

import type { RegisteredProperty, ValidationDiagnostic, ValidationInput } from "./types.js";

const COMPUTATION_INDEPENDENT_DIMENSION_UNITS = Object.freeze([
  "cm",
  "deg",
  "dpcm",
  "dpi",
  "dppx",
  "grad",
  "in",
  "ms",
  "mm",
  "pc",
  "pt",
  "px",
  "q",
  "rad",
  "s",
  "turn",
  "x",
]);

const COMPUTATION_DEPENDENT_FUNCTIONS = Object.freeze(["attr", "env", "var"]);

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

function parseValue(value: string): any | null {
  try {
    return cssTree.parse(value, { context: "value" });
  } catch {
    return null;
  }
}

function isAbsoluteUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

function getComputationalIndependenceFailureReason(value: any): string | null {
  let failure: string | null = null;

  cssTree.walk(value, {
    enter(node: any) {
      if (failure) {
        return;
      }

      if (node.type === "Function") {
        const functionName = String(node.name ?? "").toLowerCase();

        // CSS Properties and Values API Level 1 §3.3 requires non-universal initial-value
        // descriptors to be computationally independent:
        // https://www.w3.org/TR/css-properties-values-api-1/#initial-value-descriptor
        // Values that depend on later substitution, such as var(), are not computationally
        // independent. CSS Properties and Values API Level 1 §2.7 defines var() substitution:
        // https://www.w3.org/TR/css-properties-values-api-1/#substitution
        if (COMPUTATION_DEPENDENT_FUNCTIONS.includes(functionName)) {
          failure =
            functionName === "var"
              ? "uses var(), which makes the registration invalid because initial-value must be computationally independent"
              : `uses ${functionName}(), which makes the registration invalid because initial-value must be computationally independent`;
        }

        return;
      }

      if (node.type === "Dimension") {
        const unit = String(node.unit ?? "").toLowerCase();

        if (!COMPUTATION_INDEPENDENT_DIMENSION_UNITS.includes(unit)) {
          failure =
            `uses the relative or context-dependent unit "${node.unit}", which makes the registration invalid because initial-value must be computationally independent`;
        }

        return;
      }

      if (node.type === "Url" && !isAbsoluteUrl(String(node.value ?? ""))) {
        failure =
          "uses a relative URL, which makes the registration invalid because initial-value must be computationally independent";
      }
    },
  });

  return failure;
}

function validateInitialValueAgainstSyntax(
  propertyName: string,
  syntax: string,
  initialValue: string,
): string | null {
  const parsedValue = parseValue(initialValue);

  if (!parsedValue) {
    return `@property ${propertyName} has an initial-value that could not be parsed as a CSS value.`;
  }

  const independenceFailure = getComputationalIndependenceFailureReason(parsedValue);

  if (independenceFailure) {
    return `@property ${propertyName} has an initial-value "${initialValue}" that ${independenceFailure}.`;
  }

  const match = cssTree.lexer.match(syntax, parsedValue);

  // CSS Properties and Values API Level 1 §3.3 requires non-universal initial-value
  // values to parse according to the declared syntax:
  // https://www.w3.org/TR/css-properties-values-api-1/#initial-value-descriptor
  if (!match?.matched) {
    return `@property ${propertyName} has an initial-value "${initialValue}" that does not match its syntax descriptor "${syntax}".`;
  }

  return null;
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
        const inheritsDescriptor = descriptors.get("inherits");
        const inheritsRaw = getRawDescriptor(inheritsDescriptor);
        const inherits = toBoolean(inheritsRaw);
        const initialValue = getRawDescriptor(descriptors.get("initial-value"));

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

        let syntaxAst: any;

        try {
          if (syntax !== "*") {
            syntaxAst = cssTree.definitionSyntax.parse(syntax);
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

        if (syntax !== "*") {
          // CSS Properties and Values API Level 1 §5.4.4 only accepts supported syntax
          // component names from §5.1:
          // https://www.w3.org/TR/css-properties-values-api-1/#supported-names
          const unsupportedName = getUnsupportedSyntaxComponentName(syntaxAst);

          if (unsupportedName) {
            diagnostics.push({
              code: "invalid-property-registration",
              filePath: input.path,
              loc: toLocation(node.loc),
              message: `@property ${propertyName} uses the unsupported syntax component name "${unsupportedName}".`,
              propertyName,
              registeredSyntax: syntax,
            });
            return;
          }
        }

        // Unknown descriptors are intentionally ignored and do not invalidate the
        // @property rule. We only validate the known descriptors defined by the spec.
        // CSS Properties and Values API Level 1 §3:
        // https://www.w3.org/TR/css-properties-values-api-1/#at-property-rule

        if (!inheritsDescriptor) {
          diagnostics.push({
            code: "invalid-property-registration",
            filePath: input.path,
            loc: toLocation(node.loc),
            message: `@property ${propertyName} is missing the required inherits descriptor.`,
            propertyName,
            registeredSyntax: syntax,
          });
          return;
        }

        if (inherits === undefined) {
          diagnostics.push({
            code: "invalid-property-registration",
            filePath: input.path,
            loc: toLocation(node.loc),
            message: `@property ${propertyName} must set inherits to true or false.`,
            propertyName,
            registeredSyntax: syntax,
          });
          return;
        }

        // CSS Properties and Values API Level 1 §3.3 only allows omitted initial-value
        // when the syntax is the universal syntax definition:
        // https://www.w3.org/TR/css-properties-values-api-1/#initial-value-descriptor
        if (syntax !== "*" && !initialValue) {
          diagnostics.push({
            code: "invalid-property-registration",
            filePath: input.path,
            loc: toLocation(node.loc),
            message: `@property ${propertyName} is missing the required initial-value descriptor for non-universal syntax "${syntax}".`,
            propertyName,
            registeredSyntax: syntax,
          });
          return;
        }

        if (syntax !== "*" && initialValue) {
          const initialValueFailure = validateInitialValueAgainstSyntax(
            propertyName,
            syntax,
            initialValue,
          );

          if (initialValueFailure) {
            diagnostics.push({
              code: "invalid-property-registration",
              filePath: input.path,
              loc: toLocation(node.loc),
              message: initialValueFailure,
              propertyName,
              registeredSyntax: syntax,
            });
            return;
          }
        }

        // CSS Properties and Values API Level 1 §2.1 says the last valid registration in
        // document order wins. Invalid later rules must not displace an earlier valid one:
        // https://www.w3.org/TR/css-properties-values-api-1/#determining-registration
        registry.set(propertyName, {
          filePath: input.path,
          inherits,
          initialValue,
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
