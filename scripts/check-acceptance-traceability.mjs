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

  const afterHeading = text.slice(traceabilityStart);
  const firstLineBreak = afterHeading.indexOf("\n");
  const sectionBody = firstLineBreak === -1 ? "" : afterHeading.slice(firstLineBreak + 1);
  const nextHeading = sectionBody.search(/^##\s+/m);
  const traceability = nextHeading === -1 ? sectionBody : sectionBody.slice(0, nextHeading);
  if (
    !/^\|\s*(Criterion|Criterion\/scenario)/im.test(traceability) ||
    !/\|\s*Implementation\s*\|/im.test(traceability)
  ) {
    errors.push(
      `${filePath}: Traceability must include Criterion/scenario and Implementation columns.`,
    );
  }

  const declared = new Set(ids);
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

  const tableIds = new Set(
    [...traceability.matchAll(/\bAC-[A-Z0-9]+-\d+\b/g)].map((match) => match[0]),
  );
  for (const id of tableIds) {
    if (!declared.has(id)) {
      errors.push(
        `${filePath}: Traceability table references undeclared criterion ${id}; remove the stale row or declare the criterion.`,
      );
    }
  }
}

if (errors.length > 0) {
  fail(errors);
} else {
  process.stdout.write(`Acceptance traceability is complete for ${files.length} document(s).\n`);
}
