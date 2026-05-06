import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const coreRequire = createRequire(join(packageRoot, "../core/package.json"));
const cssTreePackageJsonPath = coreRequire.resolve("css-tree/package.json");
const cssTreeRoot = dirname(cssTreePackageJsonPath);

await mkdir(join(packageRoot, "data"), { recursive: true });
const patchData = JSON.parse(await readFile(join(cssTreeRoot, "data/patch.json"), "utf8"));
await writeFile(join(packageRoot, "data/patch.json"), `${JSON.stringify(patchData, null, 2)}\n`);
