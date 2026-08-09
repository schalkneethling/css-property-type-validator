import { relative, resolve } from "node:path";

import { fail, listFiles, parseRootArgument, readTextBounded } from "./lib/guardrail-utils.mjs";

const root = parseRootArgument(process.argv.slice(2));
const coreDirectory = resolve(root, "packages/core/src");
const files = await listFiles(coreDirectory, (filePath) => /\.(?:[cm]?ts|[cm]?js)$/.test(filePath));
const forbidden = [
  {
    description: "a Node built-in import",
    pattern: /(?:from\s*["']node:|import\s*\(\s*["']node:|require\(\s*["']node:)/,
  },
  {
    description: "a private project-context dependency",
    pattern: /["']@schalkneethling\/css-property-type-validator-project-context(?:["'/])/,
  },
  { description: "the Node process global", pattern: /\bprocess\s*\./ },
];
const errors = [];

if (files.length === 0) {
  errors.push(`No core source files found in ${coreDirectory}.`);
}

for (const filePath of files) {
  const text = await readTextBounded(filePath);
  for (const rule of forbidden) {
    const match = text.match(rule.pattern);
    if (match) {
      const line = text.slice(0, match.index).split("\n").length;
      errors.push(`${relative(root, filePath)}:${line} imports or uses ${rule.description}.`);
    }
  }
}

if (errors.length > 0) {
  fail(errors);
} else {
  process.stdout.write(`Core browser boundary holds for ${files.length} source file(s).\n`);
}
