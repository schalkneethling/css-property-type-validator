import process from "node:process";

import { readBodyBounded } from "./lib/guardrail-utils.mjs";

const approvedPublication = "26 March 2024";
const approvedSnapshot = "https://www.w3.org/TR/2024/WD-css-properties-values-api-1-20240326/";
const response = await fetch("https://www.w3.org/TR/css-properties-values-api-1/", {
  headers: { "User-Agent": "css-property-type-validator-spec-drift" },
});
if (!response.ok)
  throw new Error(`Unable to inspect the official specification: ${response.status}`);
const text = await readBodyBounded(response, 8 * 1024 * 1024);
if (text === null) throw new Error("Official specification response exceeded 8 MiB.");
if (!text.includes(approvedPublication) && !text.includes(approvedSnapshot)) {
  console.error(
    `The latest published specification no longer identifies the approved ${approvedPublication} profile. Review drift; do not update semantics automatically.`,
  );
  process.exitCode = 1;
} else {
  console.log(`Approved specification profile remains identifiable: ${approvedSnapshot}`);
}
