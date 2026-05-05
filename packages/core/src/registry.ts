import * as cssTree from "css-tree";

import { getFirstUnsupportedSyntaxComponentName } from "./supported-syntax.js";

import type {
  RegisteredProperty,
  ResolveImport,
  ValidationDiagnostic,
  ValidationInput,
} from "./types.js";

interface CssNodeWithLoc {
  loc?: unknown;
}

interface CssValueNode extends CssNodeWithLoc {
  children?: ArrayLike<unknown>;
}

interface CssDeclarationNode extends CssNodeWithLoc {
  property?: string;
  value?: CssValueNode;
}

interface CssPreludeNode extends CssNodeWithLoc {
  children?: ArrayLike<unknown>;
}

interface CssBlockNode extends CssNodeWithLoc {
  children?: ArrayLike<unknown>;
}

interface CssAtruleNode extends CssNodeWithLoc {
  name?: string;
  type?: string;
  prelude?: CssPreludeNode;
  block?: CssBlockNode | null;
}

interface CssStringNode {
  type: "String";
  value?: string;
}

interface CssUrlNode {
  type: "Url";
  value?: string;
}

interface CssPropertyNameNode {
  name?: string;
}

interface CssStylesheet {
  children?: ArrayLike<unknown>;
}

interface CssLocation {
  end: RegisteredProperty["loc"] extends infer T
    ? T extends { end: infer End }
      ? End
      : never
    : never;
  source?: string;
  start: RegisteredProperty["loc"] extends infer T
    ? T extends { start: infer Start }
      ? Start
      : never
    : never;
}

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

function toLocation(loc: unknown): RegisteredProperty["loc"] {
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

function descriptorMap(block: CssBlockNode | null | undefined): Map<string, CssDeclarationNode> {
  const descriptors = new Map<string, CssDeclarationNode>();

  for (const declaration of Array.from(block?.children ?? []) as CssDeclarationNode[]) {
    if (declaration.property) {
      descriptors.set(declaration.property, declaration);
    }
  }

  return descriptors;
}

function parseValue(value: string): unknown | null {
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

function getComputationalIndependenceFailureReason(value: unknown): string | null {
  let failure: string | null = null;

  cssTree.walk(value, {
    enter(node: { name?: string; type?: string; unit?: string; value?: string }) {
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
          failure = `uses the relative or context-dependent unit "${node.unit}", which makes the registration invalid because initial-value must be computationally independent`;
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

  const independenceFailureReason = getComputationalIndependenceFailureReason(parsedValue);

  if (independenceFailureReason) {
    return `@property ${propertyName} has an initial-value "${initialValue}" that ${independenceFailureReason}.`;
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

function getStringDescriptor(declaration: CssDeclarationNode | undefined): string | undefined {
  const valueChildren = declaration?.value?.children;
  const firstNode = valueChildren
    ? (Array.from(valueChildren)[0] as CssStringNode | undefined)
    : undefined;

  if (firstNode?.type === "String") {
    return firstNode.value;
  }

  return undefined;
}

function getRawDescriptor(declaration: CssDeclarationNode | undefined): string | undefined {
  if (!declaration?.value) {
    return undefined;
  }

  return cssTree.generate(declaration.value).trim();
}

function getImportSpecifier(importRule: CssAtruleNode): string | null {
  const preludeChildren = Array.from(importRule.prelude?.children ?? []) as Array<
    CssStringNode | CssUrlNode
  >;

  if (preludeChildren.length !== 1) {
    return null;
  }

  const firstPreludeNode = preludeChildren[0];

  if (firstPreludeNode?.type === "String" || firstPreludeNode?.type === "Url") {
    return String(firstPreludeNode.value ?? "");
  }

  return null;
}

function isAbsoluteImportUrl(importSpecifier: string): boolean {
  try {
    new URL(importSpecifier);
    return true;
  } catch {
    return false;
  }
}

function processPropertyRule(
  input: ValidationInput,
  node: CssAtruleNode,
  diagnostics: ValidationDiagnostic[],
  registry: Map<string, RegisteredProperty>,
): void {
  const propertyName = (Array.from(node.prelude?.children ?? []) as CssPropertyNameNode[])[0]?.name;

  if (!propertyName) {
    diagnostics.push({
      code: "invalid-property-registration",
      phase: "registry",
      reason: "missing-property-name",
      severity: "error",
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
      phase: "registry",
      reason: "missing-syntax-descriptor",
      severity: "error",
      filePath: input.path,
      loc: toLocation(node.loc),
      message: `@property ${propertyName} is missing a valid string-valued syntax descriptor.`,
      descriptorName: "syntax",
      propertyName,
    });
    return;
  }

  let syntaxAst: unknown;

  try {
    if (syntax !== "*") {
      syntaxAst = cssTree.definitionSyntax.parse(syntax);
    }
  } catch (error) {
    diagnostics.push({
      code: "invalid-property-registration",
      phase: "registry",
      reason: "invalid-syntax-descriptor",
      severity: "error",
      filePath: input.path,
      loc: toLocation(node.loc),
      message: `@property ${propertyName} has an invalid syntax descriptor "${syntax}": ${(error as Error).message}`,
      descriptorName: "syntax",
      propertyName,
      registeredSyntax: syntax,
    });
    return;
  }

  if (syntax !== "*") {
    // CSS Properties and Values API Level 1 §5.4.4 only accepts supported syntax
    // component names from §5.1:
    // https://www.w3.org/TR/css-properties-values-api-1/#supported-names
    const unsupportedName = getFirstUnsupportedSyntaxComponentName(syntaxAst);

    if (unsupportedName) {
      diagnostics.push({
        code: "invalid-property-registration",
        phase: "registry",
        reason: "unsupported-syntax-component",
        severity: "error",
        filePath: input.path,
        loc: toLocation(node.loc),
        message: `@property ${propertyName} uses the unsupported syntax component name "${unsupportedName}".`,
        descriptorName: "syntax",
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
      phase: "registry",
      reason: "missing-inherits-descriptor",
      severity: "error",
      filePath: input.path,
      loc: toLocation(node.loc),
      message: `@property ${propertyName} is missing the required inherits descriptor.`,
      descriptorName: "inherits",
      propertyName,
      registeredSyntax: syntax,
    });
    return;
  }

  if (inherits === undefined) {
    diagnostics.push({
      code: "invalid-property-registration",
      phase: "registry",
      reason: "invalid-inherits-descriptor",
      severity: "error",
      filePath: input.path,
      loc: toLocation(node.loc),
      message: `@property ${propertyName} must set inherits to true or false.`,
      actualValue: inheritsRaw,
      descriptorName: "inherits",
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
      phase: "registry",
      reason: "missing-initial-value-descriptor",
      severity: "error",
      filePath: input.path,
      loc: toLocation(node.loc),
      message: `@property ${propertyName} is missing the required initial-value descriptor for non-universal syntax "${syntax}".`,
      descriptorName: "initial-value",
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
        phase: "registry",
        reason: "invalid-initial-value",
        severity: "error",
        filePath: input.path,
        loc: toLocation(node.loc),
        message: initialValueFailure,
        actualValue: initialValue,
        descriptorName: "initial-value",
        propertyName,
        registeredSyntax: syntax,
      });
      return;
    }
  }

  // CSS Cascading and Inheritance Level 5 §2 says imported stylesheets behave as
  // if their contents were written at the point of the @import:
  // https://www.w3.org/TR/css-cascade-5/#at-import
  // CSS Properties and Values API Level 1 §2.1 says the last valid registration in
  // document order wins. Invalid later rules must not displace an earlier valid one:
  // https://www.w3.org/TR/css-properties-values-api-1/#determining-the-registration
  registry.set(propertyName, {
    filePath: input.path,
    inherits,
    initialValue,
    loc: toLocation(node.loc),
    name: propertyName,
    syntax,
  });
}

export function collectRegistry(
  inputs: ValidationInput[],
  options: { failFast?: boolean; resolveImport?: ResolveImport } = {},
): {
  diagnostics: ValidationDiagnostic[];
  registry: RegisteredProperty[];
} {
  const diagnostics: ValidationDiagnostic[] = [];
  const registry = new Map<string, RegisteredProperty>();
  const expandedPaths = new Set<string>();
  const activePaths = new Set<string>();

  function processInput(input: ValidationInput): void {
    if (activePaths.has(input.path) || expandedPaths.has(input.path)) {
      return;
    }

    // CSS files can import each other cyclically. Since each stylesheet is parsed
    // independently, the parser itself is fine; this guard prevents our traversal
    // from recursing forever while expanding the import graph for registry assembly.
    activePaths.add(input.path);

    let ast: CssStylesheet;

    try {
      ast = cssTree.parse(input.css, {
        filename: input.path,
        positions: true,
      }) as CssStylesheet;
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
      activePaths.delete(input.path);
      expandedPaths.add(input.path);
      return;
    }

    for (const node of Array.from(ast.children ?? []) as CssAtruleNode[]) {
      if (node.type !== "Atrule") {
        continue;
      }

      if (node.name === "import") {
        const importSpecifier = getImportSpecifier(node);

        if (!importSpecifier || isAbsoluteImportUrl(importSpecifier) || !options.resolveImport) {
          continue;
        }

        const resolvedImport = options.resolveImport(importSpecifier, input.path);

        if (!resolvedImport) {
          diagnostics.push({
            code: "unresolved-import",
            phase: "import",
            reason: "unresolved-import",
            severity: "error",
            filePath: input.path,
            loc: toLocation(node.loc),
            message: `Could not resolve imported stylesheet "${importSpecifier}" from ${input.path}.`,
            importSpecifier,
            snippet: cssTree.generate(node),
          });
          if (options.failFast) {
            break;
          }
          continue;
        }

        processInput(resolvedImport);
        if (options.failFast && diagnostics.length > 0) {
          break;
        }
        continue;
      }

      if (node.name === "property") {
        processPropertyRule(input, node, diagnostics, registry);
        if (options.failFast && diagnostics.length > 0) {
          break;
        }
      }
    }

    activePaths.delete(input.path);
    expandedPaths.add(input.path);
  }

  for (const input of inputs) {
    processInput(input);
    if (options.failFast && diagnostics.length > 0) {
      break;
    }
  }

  return {
    diagnostics,
    registry: [...registry.values()],
  };
}
