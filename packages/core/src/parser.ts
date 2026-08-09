import * as cssTree from "css-tree";

export interface ParseStylesheetOptions {
  filename?: string;
  parseCustomProperty?: boolean;
  positions?: boolean;
}

export interface WalkOptions<TNode> {
  enter(node: TNode): void;
  leave?(node: TNode): void;
  visit?: string;
}

/**
 * Internal parser boundary. CSS semantics are defined by the cited
 * specifications and product policy, never by this dependency's behavior.
 */
export function parseStylesheet<TAst = unknown>(
  source: string,
  options: ParseStylesheetOptions = {},
): TAst {
  return cssTree.parse(source, options) as TAst;
}

export function parseValue<TAst = unknown>(
  source: string,
  options: Pick<ParseStylesheetOptions, "filename" | "positions"> = {},
): TAst {
  return cssTree.parse(source, { context: "value", ...options }) as TAst;
}

export function generateCss(node: unknown): string {
  return cssTree.generate(node);
}

export function walkCss<TNode = unknown>(ast: unknown, options: WalkOptions<TNode>): void {
  cssTree.walk(ast, options);
}

export function matchesSyntax(syntax: string, value: unknown): boolean {
  return Boolean(cssTree.lexer.match(syntax, value)?.matched);
}

export function matchesProperty(property: string, value: unknown): boolean {
  return Boolean(cssTree.lexer.matchProperty(property, value)?.matched);
}

export function parseDefinitionSyntax(syntax: string): unknown {
  return cssTree.definitionSyntax.parse(syntax);
}
