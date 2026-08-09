import { basename, resolve } from "node:path";

import { fail, listFiles, parseRootArgument, readTextBounded } from "./lib/guardrail-utils.mjs";

const root = parseRootArgument(process.argv.slice(2));
const acceptanceDirectory = resolve(root, "docs/acceptance");
const files = await listFiles(acceptanceDirectory, (filePath) => filePath.endsWith(".md"));
const headingPattern = /^##\s+(AC-[A-Z0-9]+-\d+)\b.*$/gm;
const errors = [];
const headings = new Map();

if (files.length === 0) {
  errors.push(`No acceptance documents found in ${acceptanceDirectory}.`);
}

for (const filePath of files) {
  const text = await readTextBounded(filePath);
  const ids = [...text.matchAll(headingPattern)].map((match) => match[1]);
  const traceabilityStart = text.search(/^##\s+Traceability\s*$/im);

  if (ids.length === 0) {
    errors.push(`${filePath}: no stable AC-* criterion headings found.`);
    continue;
  }
  if (traceabilityStart === -1) {
    errors.push(`${filePath}: missing a Traceability section.`);
    continue;
  }

  const traceability = text.slice(traceabilityStart);
  if (
    !/^\|\s*(Criterion|Criterion\/scenario)/im.test(traceability) ||
    !/\|\s*Implementation\s*\|/im.test(traceability)
  ) {
    errors.push(
      `${filePath}: Traceability must include Criterion/scenario and Implementation columns.`,
    );
  }

  for (const id of ids) {
    if (headings.has(id)) {
      errors.push(
        `${filePath}: duplicate criterion heading ${id}; first declared in ${headings.get(id)}.`,
      );
    } else {
      headings.set(id, basename(filePath));
    }

    const occurrences = [...traceability.matchAll(new RegExp(`\\b${id}\\b`, "g"))].length;
    if (occurrences !== 1) {
      errors.push(
        `${filePath}: ${id} must occur exactly once in its Traceability table (found ${occurrences}).`,
      );
    }
  }
}

if (errors.length > 0) {
  fail(errors);
} else {
  process.stdout.write(`Acceptance traceability is complete for ${files.length} document(s).\n`);
}
