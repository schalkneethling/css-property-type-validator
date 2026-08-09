import path from "node:path";

export type UnsupportedImportReason =
  | "empty"
  | "fragment"
  | "non-css"
  | "remote"
  | "root-relative-disabled";

export type LocalImportPathResult =
  | { kind: "local"; path: string }
  | { kind: "unsupported"; reason: UnsupportedImportReason };

const SCHEME_PATTERN = /^[a-z][a-z\d+.-]*:/i;

export function resolveLocalCssImportPath(
  specifier: string,
  fromPath: string,
  options: { projectRoot: string; rootRelativeImports?: boolean },
): LocalImportPathResult {
  const normalizedSpecifier = specifier.trim();
  if (!normalizedSpecifier) return { kind: "unsupported", reason: "empty" };
  if (normalizedSpecifier.startsWith("#")) {
    return { kind: "unsupported", reason: "fragment" };
  }
  if (normalizedSpecifier.startsWith("//") || SCHEME_PATTERN.test(normalizedSpecifier)) {
    return { kind: "unsupported", reason: "remote" };
  }

  const pathPart = normalizedSpecifier.split(/[?#]/u, 1)[0] ?? "";
  if (path.extname(pathPart).toLowerCase() !== ".css") {
    return { kind: "unsupported", reason: "non-css" };
  }

  if (pathPart.startsWith("/")) {
    if (options.rootRelativeImports === false) {
      return { kind: "unsupported", reason: "root-relative-disabled" };
    }
    return { kind: "local", path: path.resolve(options.projectRoot, `.${pathPart}`) };
  }

  return { kind: "local", path: path.resolve(path.dirname(fromPath), pathPart) };
}
