import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const vscodeRequire = createRequire(join(packageRoot, "package.json"));
const coreRequire = createRequire(join(packageRoot, "../core/package.json"));
const cssTreePackageJsonPath = coreRequire.resolve("css-tree/package.json");

let mdnDataPackageJsonPath;
try {
  mdnDataPackageJsonPath = vscodeRequire.resolve("mdn-data/package.json");
} catch {
  try {
    mdnDataPackageJsonPath = coreRequire.resolve("mdn-data/package.json");
  } catch {
    throw new Error(
      "mdn-data is not resolved. Ensure it is installed as a devDependency of packages/vscode " +
        "or as a transitive dependency of @schalkneethling/css-property-type-validator-core.",
    );
  }
}

const cssTreeRoot = dirname(cssTreePackageJsonPath);
const mdnDataRoot = dirname(mdnDataPackageJsonPath);
const generatedDataRoot = join(packageRoot, "data");
const generatedPatchPath = join(generatedDataRoot, "patch.json");
const bundledEntryPath = join(packageRoot, "dist/extension.cjs");

const mdnDataFiles = ["at-rules.json", "properties.json", "syntaxes.json"];
const mode = process.argv.includes("--write") ? "write" : "check";

function getUpdateHint(targetPath) {
  return `${targetPath} differs from its source dependency. Run \`pnpm run update:vscode-data\` to regenerate and format the checked-in snapshot.`;
}

async function syncGeneratedJson(sourcePath, targetPath) {
  const sourceData = JSON.parse(await readFile(sourcePath, "utf8"));
  const sourceDataKey = JSON.stringify(sourceData);

  try {
    const existingData = JSON.parse(await readFile(targetPath, "utf8"));

    if (JSON.stringify(existingData) === sourceDataKey) {
      return;
    }

    if (mode === "write") {
      await writeFile(targetPath, `${JSON.stringify(sourceData, null, 2)}\n`);
      return;
    }

    throw new Error(getUpdateHint(targetPath));
  } catch (error) {
    if (error instanceof Error && error.message === getUpdateHint(targetPath)) {
      throw error;
    }

    if (error?.code !== "ENOENT") {
      throw error;
    }

    if (mode === "write") {
      await writeFile(targetPath, `${JSON.stringify(sourceData, null, 2)}\n`);
      return;
    }

    throw new Error(getUpdateHint(targetPath));
  }
}

await mkdir(join(generatedDataRoot, "mdn-data/css"), { recursive: true });

// These JSON files are generated from core's css-tree/mdn-data dependencies and
// formatted by the repo formatter. Keep them stable during normal builds.
await syncGeneratedJson(join(cssTreeRoot, "data/patch.json"), generatedPatchPath);

for (const fileName of mdnDataFiles) {
  await syncGeneratedJson(
    join(mdnDataRoot, "css", fileName),
    join(generatedDataRoot, "mdn-data/css", fileName),
  );
}

try {
  await access(bundledEntryPath);
} catch {
  process.exit(0);
}

let bundledEntry = await readFile(bundledEntryPath, "utf8");

for (const fileName of mdnDataFiles) {
  bundledEntry = bundledEntry.replace(
    `"mdn-data/css/${fileName}"`,
    `"../data/mdn-data/css/${fileName}"`,
  );
}

await writeFile(bundledEntryPath, bundledEntry);
