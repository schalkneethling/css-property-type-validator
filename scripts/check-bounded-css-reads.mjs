import { relative, resolve } from "node:path";

import {
  fail,
  listFiles,
  parseRootArgument,
  pathExists,
  readTextBounded,
} from "./lib/guardrail-utils.mjs";

const root = parseRootArgument(process.argv.slice(2));
const packageDirectory = resolve(root, "packages");
const boundedReader = resolve(root, "packages/project-context/src/bounded-reader.ts");
const readerCall = /\b(?:readFile|readFileSync|createReadStream)\s*\(/g;
const errors = [];
const files = await listFiles(packageDirectory, (filePath) =>
  /\/src\/.*\.(?:[cm]?ts|[cm]?js)$/.test(filePath),
);

if (!(await pathExists(boundedReader))) {
  errors.push(`Missing mandatory bounded reader: ${relative(root, boundedReader)}.`);
} else {
  const boundedReaderSource = await readTextBounded(boundedReader);
  for (const requiredCall of ["lstat", "stat", "readFile"]) {
    if (!new RegExp(`\\b${requiredCall}\\s*\\(`).test(boundedReaderSource)) {
      errors.push(
        `${relative(root, boundedReader)} must call ${requiredCall} as part of bounded reading.`,
      );
    }
  }
  if (!/byteLength|Buffer\.byteLength/.test(boundedReaderSource)) {
    errors.push(`${relative(root, boundedReader)} must check bytes after reading.`);
  }
}

for (const filePath of files) {
  if (filePath === boundedReader) {
    continue;
  }
  const text = await readTextBounded(filePath);
  for (const match of text.matchAll(readerCall)) {
    const line = text.slice(0, match.index).split("\n").length;
    errors.push(
      `${relative(root, filePath)}:${line} directly reads a file; use the project-context bounded reader.`,
    );
  }
}

if (errors.length > 0) {
  fail(errors);
} else {
  process.stdout.write(
    "All production package file reads use the bounded project-context reader.\n",
  );
}
