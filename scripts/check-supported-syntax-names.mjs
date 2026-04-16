import * as cheerio from "cheerio";

import { SUPPORTED_SYNTAX_COMPONENT_NAMES } from "../packages/core/src/supported-syntax.ts";

const SPEC_URL = "https://www.w3.org/TR/css-properties-values-api-1/#supported-names";

function extractSupportedNames(documentText) {
  const $ = cheerio.load(documentText);
  const sectionHeading = $("#supported-names");

  if (sectionHeading.length === 0) {
    throw new Error("Could not find the Supported Names section in the downloaded spec.");
  }

  const names = [];
  let currentNode = sectionHeading.next();

  while (currentNode.length > 0 && currentNode.attr("id") !== "multipliers") {
    if (currentNode.is("dl")) {
      currentNode.find('dt[data-md]').each((_, element) => {
        const text = $(element).text().trim();
        const quotedNameMatch = text.match(/^"(<[\w-]+>)"$/);

        if (quotedNameMatch) {
          names.push(quotedNameMatch[1]);
        }
      });
    }

    currentNode = currentNode.next();
  }

  return [...new Set(names)];
}

function formatDiff(kind, names) {
  if (names.length === 0) {
    return "";
  }

  return `${kind}:\n${names.map((name) => `- ${name}`).join("\n")}`;
}

async function main() {
  const response = await fetch(SPEC_URL);

  if (!response.ok) {
    throw new Error(`Failed to download the supported-names section: ${response.status}`);
  }

  const documentText = await response.text();
  const specNames = extractSupportedNames(documentText).sort();
  const localNames = [...SUPPORTED_SYNTAX_COMPONENT_NAMES].sort();

  const missingLocally = specNames.filter((name) => !localNames.includes(name));
  const onlyLocal = localNames.filter((name) => !specNames.includes(name));

  if (missingLocally.length === 0 && onlyLocal.length === 0) {
    process.stdout.write("Supported syntax names match the current published spec.\n");
    return;
  }

  const parts = [
    "Supported syntax names differ from the published spec. Review the diff before updating the frozen list.",
    formatDiff("Present in spec but missing locally", missingLocally),
    formatDiff("Present locally but not in spec", onlyLocal),
  ].filter(Boolean);

  process.stderr.write(`${parts.join("\n\n")}\n`);
  process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${(error instanceof Error ? error.message : String(error))}\n`);
  process.exit(1);
});
