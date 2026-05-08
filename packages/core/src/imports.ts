interface CssPreludeNode {
  children?: ArrayLike<unknown>;
}

export interface CssAtruleNode {
  name?: string;
  prelude?: CssPreludeNode;
  type?: string;
}

interface CssStringNode {
  type: "String";
  value?: string;
}

interface CssUrlNode {
  type: "Url";
  value?: string;
}

export function getImportSpecifier(importRule: CssAtruleNode): string | null {
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

export function isAbsoluteImportUrl(importSpecifier: string): boolean {
  if (importSpecifier.startsWith("//")) {
    return true;
  }

  try {
    new URL(importSpecifier);
    return true;
  } catch {
    return false;
  }
}
