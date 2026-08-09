import path from "node:path";

import { listFiles, readTextBounded } from "./lib/guardrail-utils.mjs";

const CORE_PACKAGE = "@schalkneethling/css-property-type-validator-core";
const repositoryRoot = path.resolve(new URL("..", import.meta.url).pathname);
const webRoot = path.join(repositoryRoot, "web");
const packagePath = path.join(webRoot, "package.json");
const packageJson = JSON.parse(await readTextBounded(packagePath));
const declaredVersion = packageJson.dependencies?.[CORE_PACKAGE];

if (
  typeof declaredVersion !== "string" ||
  !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(declaredVersion)
) {
  throw new Error(`web must pin ${CORE_PACKAGE} to one exact published version.`);
}

const overrideText = JSON.stringify({
  overrides: packageJson.overrides,
  pnpm: packageJson.pnpm,
  resolutions: packageJson.resolutions,
});
if (overrideText.includes(CORE_PACKAGE)) {
  throw new Error(`web cannot override, resolve, or substitute ${CORE_PACKAGE}.`);
}

const files = await listFiles(
  webRoot,
  (filePath) =>
    !filePath.includes(`${path.sep}node_modules${path.sep}`) &&
    !filePath.includes(`${path.sep}dist${path.sep}`) &&
    /\.(?:[cm]?[jt]s|json)$/u.test(filePath),
);

for (const filePath of files) {
  const source = await readTextBounded(filePath);
  const relative = path.relative(repositoryRoot, filePath);
  if (new RegExp(`${CORE_PACKAGE.replaceAll("/", "\\/")}/`, "u").test(source)) {
    throw new Error(`web cannot deep-import ${CORE_PACKAGE}: ${relative}`);
  }
  if (/packages\/core|packages\\core|\.\.\/core\/src|\.\.\\core\\src/u.test(source)) {
    throw new Error(`web cannot alias or import workspace core source: ${relative}`);
  }
  if (
    filePath !== packagePath &&
    /["'](?:workspace:(?:\*|\^|~)|link:|file:)/u.test(source) &&
    source.includes(CORE_PACKAGE)
  ) {
    throw new Error(`web cannot substitute a workspace or local core package: ${relative}`);
  }
}

console.log(
  `web release boundary scans ${files.length} files and uses ${CORE_PACKAGE}@${declaredVersion}.`,
);
