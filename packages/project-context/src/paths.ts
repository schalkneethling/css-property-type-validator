import path from "node:path";

export function isPathWithinRoot(rootPath: string, candidatePath: string): boolean {
  const relativePath = path.relative(rootPath, candidatePath);
  return (
    relativePath === "" ||
    (!relativePath.startsWith(`..${path.sep}`) &&
      relativePath !== ".." &&
      !path.isAbsolute(relativePath))
  );
}

export function comparePaths(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
