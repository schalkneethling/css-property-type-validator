import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const coreRequire = createRequire(join(packageRoot, "../core/package.json"));
const cssTreePackageJsonPath = coreRequire.resolve("css-tree/package.json");
const cssTreeRoot = dirname(cssTreePackageJsonPath);
const generatedPatchPath = join(packageRoot, "data/patch.json");

await mkdir(join(packageRoot, "data"), { recursive: true });
const patchData = JSON.parse(await readFile(join(cssTreeRoot, "data/patch.json"), "utf8"));
const patchDataKey = JSON.stringify(patchData);

try {
  // patch.json is generated from core's css-tree dependency and formatted by
  // the repo formatter. Keep the committed file stable during normal builds.
  const existingPatchData = JSON.parse(await readFile(generatedPatchPath, "utf8"));

  if (JSON.stringify(existingPatchData) !== patchDataKey) {
    throw new Error(
      "packages/vscode/data/patch.json differs from core's css-tree data. Regenerate and format the file before building the extension.",
    );
  }
} catch (error) {
  if (error?.code !== "ENOENT") {
    throw error;
  }

  await writeFile(generatedPatchPath, `${JSON.stringify(patchData, null, 2)}\n`);
}
