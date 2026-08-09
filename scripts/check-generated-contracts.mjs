import { relative, resolve } from "node:path";

import {
  fail,
  hasFlag,
  listFiles,
  parseRootArgument,
  pathExists,
  readTextBounded,
  sha256,
} from "./lib/guardrail-utils.mjs";

const root = parseRootArgument(process.argv.slice(2));
const requireManifest = hasFlag(process.argv.slice(2), "--require");
const manifestPath = resolve(root, "contracts/generated-contracts.json");

if (!(await pathExists(manifestPath))) {
  if (requireManifest) {
    fail([`Missing required generated-contract manifest: ${relative(root, manifestPath)}.`]);
  } else {
    process.stdout.write(
      "Generated-contract check inactive: manifest has not been accepted yet.\n",
    );
  }
} else {
  const manifest = JSON.parse(await readTextBounded(manifestPath));
  const entries = manifest.contracts;
  const errors = [];
  if (!Array.isArray(entries)) {
    errors.push(`${relative(root, manifestPath)}: contracts must be an array.`);
  } else {
    const listed = new Set();
    for (const entry of entries) {
      if (!entry || typeof entry.path !== "string" || typeof entry.sha256 !== "string") {
        errors.push(`${relative(root, manifestPath)}: each contract requires path and sha256.`);
        continue;
      }
      if (listed.has(entry.path)) {
        errors.push(
          `${relative(root, manifestPath)}: duplicate generated contract path ${entry.path}.`,
        );
        continue;
      }
      listed.add(entry.path);
      const outputPath = resolve(root, entry.path);
      if (!(await pathExists(outputPath))) {
        errors.push(`Generated contract is missing: ${entry.path}.`);
        continue;
      }
      const actual = sha256(await readTextBounded(outputPath));
      if (actual !== entry.sha256) {
        errors.push(`Generated contract is stale: ${entry.path}.`);
      }
    }

    const sourceRoots = ["packages", "web", "scripts", "docs", "compatibility", "contracts"].map(
      (directory) => resolve(root, directory),
    );
    const allSources = [];
    for (const sourceRoot of sourceRoots) {
      allSources.push(
        ...(await listFiles(sourceRoot, (filePath) => /\.(?:[cm]?[jt]s|json|md)$/.test(filePath))),
      );
    }
    for (const sourcePath of allSources) {
      const source = await readTextBounded(sourcePath);
      const markedGenerated = /^\s*(?:\/\/|\/\*|\*)\s*@generated\b/mu.test(source);
      if (markedGenerated && !listed.has(relative(root, sourcePath))) {
        errors.push(
          `Generated source is not listed in ${relative(root, manifestPath)}: ${relative(root, sourcePath)}.`,
        );
      }
    }
  }
  if (errors.length > 0) {
    fail(errors);
  } else {
    process.stdout.write(`Generated-contract manifest is current (${entries.length} file(s)).\n`);
  }
}
