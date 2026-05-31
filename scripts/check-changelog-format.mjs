import { readFile } from "node:fs/promises";

const changelogPaths = [
  "packages/core/CHANGELOG.md",
  "packages/cli/CHANGELOG.md",
  "packages/stylelint/CHANGELOG.md",
];

let hasError = false;

function report(path, message) {
  hasError = true;
  console.error(`${path}: ${message}`);
}

for (const path of changelogPaths) {
  let content;

  try {
    content = await readFile(path, "utf8");
  } catch {
    continue;
  }

  if (!content.startsWith("# Changelog\n\n")) {
    report(path, "must start with '# Changelog' followed by one blank line.");
  }

  const lines = content.split("\n");

  let insideBumpyEntry = false;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const lineNumber = index + 1;

    if (line.startsWith("## ")) {
      insideBumpyEntry = /^## \d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)? \(\d{4}-\d{2}-\d{2}\)$/.test(line);
    }

    if (!insideBumpyEntry) {
      continue;
    }

    if (line.startsWith("* ")) {
      report(path, `line ${lineNumber} uses '*' bullet; use '-' bullets.`);
    }

    if (line === "" && lines[index + 1] === "" && lines[index + 2] === "") {
      report(path, `line ${lineNumber} has more than one blank line.`);
    }
  }
}

if (hasError) {
  process.exit(1);
}
