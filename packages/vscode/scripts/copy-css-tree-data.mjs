import { cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const cssTreePackageJsonPath = require.resolve("css-tree/package.json");
const cssTreeRoot = dirname(cssTreePackageJsonPath);

await mkdir(join(packageRoot, "data"), { recursive: true });
await cp(join(cssTreeRoot, "data"), join(packageRoot, "data"), { recursive: true });
