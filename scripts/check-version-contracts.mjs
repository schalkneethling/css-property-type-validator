import { lstat, readFile } from "node:fs/promises";

async function readBounded(fileUrl, limit = 256 * 1024) {
  const stat = await lstat(fileUrl);
  if (!stat.isFile() || stat.size > limit)
    throw new Error(`Version contract input is not a bounded regular file: ${fileUrl.pathname}`);
  const bytes = await readFile(fileUrl);
  if (bytes.byteLength > limit)
    throw new Error(`Version contract input exceeded its post-read limit: ${fileUrl.pathname}`);
  return bytes.toString("utf8");
}

const manifest = JSON.parse(
  await readBounded(new URL("../packages/core/package.json", import.meta.url)),
);
const contracts = await readBounded(new URL("../packages/core/src/contracts.ts", import.meta.url));
const recorded = contracts.match(/CORE_TOOL_VERSION\s*=\s*"([^"]+)"/u)?.[1];
if (recorded !== manifest.version) {
  throw new Error(
    `Core tool contract records ${String(recorded)}, but package.json is ${String(manifest.version)}.`,
  );
}
console.log(`Core tool contract version matches package.json: ${recorded}.`);
