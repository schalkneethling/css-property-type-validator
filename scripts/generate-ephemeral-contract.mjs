import { lstat, readFile, writeFile } from "node:fs/promises";
import process from "node:process";

const manifestUrl = new URL("../compatibility/ephemeral-pages.json", import.meta.url);
const outputUrl = new URL("../packages/cli/src/ephemeral-contract.generated.ts", import.meta.url);

async function readBounded(fileUrl, limit) {
  const stat = await lstat(fileUrl);
  if (!stat.isFile() || stat.size > limit)
    throw new Error(`Refusing unbounded generated-contract input: ${fileUrl.pathname}`);
  const bytes = await readFile(fileUrl);
  if (bytes.byteLength > limit)
    throw new Error(`Generated-contract input exceeded its post-read limit: ${fileUrl.pathname}`);
  return bytes.toString("utf8");
}

const contract = JSON.parse(await readBounded(manifestUrl, 64 * 1024));
const expected = [
  "// @generated from compatibility/ephemeral-pages.json by scripts/generate-ephemeral-contract.mjs.",
  'import type { EphemeralPagesContract } from "@schalkneethling/css-property-type-validator-report";',
  "",
  `export const EPHEMERAL_PAGES_CONTRACT = ${JSON.stringify(contract, null, 2)} as const satisfies EphemeralPagesContract;`,
  "",
].join("\n");

if (process.argv.includes("--write")) {
  await writeFile(outputUrl, expected, "utf8");
  console.log(
    `Updated ${outputUrl.pathname}. Review the compatibility change before committing it.`,
  );
} else {
  const actual = await readBounded(outputUrl, 256 * 1024);
  if (actual !== expected) {
    console.error(
      "Generated Ephemeral contract is stale. Run ephemeral:contract:generate and review the result.",
    );
    process.exitCode = 1;
  } else {
    console.log("Generated Ephemeral contract matches the pinned manifest.");
  }
}
