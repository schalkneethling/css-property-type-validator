// CSS Properties and Values API Level 1 §5.1 defines the supported syntax component
// names that can appear as data type names inside a syntax string:
// https://www.w3.org/TR/css-properties-values-api-1/#supported-names
// This frozen list is intentionally maintained from the published spec and checked by
// tests and the advisory verification script instead of being discovered dynamically.
export const SUPPORTED_SYNTAX_COMPONENT_NAMES = Object.freeze([
  "<length>",
  "<number>",
  "<percentage>",
  "<length-percentage>",
  "<color>",
  "<image>",
  "<url>",
  "<integer>",
  "<angle>",
  "<time>",
  "<resolution>",
  "<transform-function>",
  "<custom-ident>",
  "<transform-list>",
] as const);

const SUPPORTED_SYNTAX_COMPONENT_NAME_LOOKUP = Object.freeze(
  Object.fromEntries(SUPPORTED_SYNTAX_COMPONENT_NAMES.map((name) => [name, true] as const)),
);

function validateNode(node: any): string | null {
  if (!node) {
    return null;
  }

  switch (node.type) {
    case "Group":
      for (const term of node.terms ?? []) {
        const unsupportedName = validateNode(term);

        if (unsupportedName) {
          return unsupportedName;
        }
      }

      return null;

    case "Multiplier":
      return validateNode(node.term);

    case "Type": {
      const supportedName = `<${node.name}>`;
      return Object.hasOwn(SUPPORTED_SYNTAX_COMPONENT_NAME_LOOKUP, supportedName)
        ? null
        : supportedName;
    }

    case "Keyword":
      return null;

    default:
      return null;
  }
}

export function getFirstUnsupportedSyntaxComponentName(syntaxAst: any): string | null {
  return validateNode(syntaxAst);
}
