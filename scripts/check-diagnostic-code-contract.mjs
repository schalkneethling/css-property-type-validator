import { relative, resolve } from "node:path";

import {
  fail,
  hasFlag,
  listFiles,
  parseRootArgument,
  pathExists,
  readTextBounded,
} from "./lib/guardrail-utils.mjs";

const root = parseRootArgument(process.argv.slice(2));
const requireRegistry = hasFlag(process.argv.slice(2), "--require");
const registryPath = resolve(root, "contracts/diagnostic-codes.json");

if (!(await pathExists(registryPath))) {
  if (requireRegistry) {
    fail([`Missing required diagnostic-code registry: ${relative(root, registryPath)}.`]);
  } else {
    process.stdout.write(
      "Diagnostic-code contract inactive: registry has not been accepted yet.\n",
    );
  }
} else {
  const registry = JSON.parse(await readTextBounded(registryPath));
  const codes = registry.codes;
  const errors = [];
  if (!Array.isArray(codes)) {
    errors.push(`${relative(root, registryPath)}: codes must be an array.`);
  } else {
    const seen = new Set();
    for (const entry of codes) {
      if (!entry || typeof entry.code !== "string" || !/^CPTV_[A-Z0-9_]+$/.test(entry.code)) {
        errors.push(`${relative(root, registryPath)}: every code must match CPTV_[A-Z0-9_]+.`);
        continue;
      }
      if (seen.has(entry.code)) {
        errors.push(`${relative(root, registryPath)}: duplicate code ${entry.code}.`);
      }
      seen.add(entry.code);
    }

    const coreFiles = await listFiles(resolve(root, "packages/core/src"), (filePath) =>
      filePath.endsWith(".ts"),
    );
    const used = new Set();
    for (const filePath of coreFiles) {
      const source = await readTextBounded(filePath);
      for (const match of source.matchAll(/\bCPTV_[A-Z0-9_]+\b/g)) {
        used.add(match[0]);
      }
    }
    for (const code of used) {
      if (!seen.has(code)) {
        errors.push(`Core uses ${code}, but it is missing from ${relative(root, registryPath)}.`);
      }
    }
  }
  if (errors.length > 0) {
    fail(errors);
  } else {
    process.stdout.write(`Diagnostic-code contract is current (${codes.length} code(s)).\n`);
  }
}
