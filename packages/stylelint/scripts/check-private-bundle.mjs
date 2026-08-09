import { readFile, stat } from "node:fs/promises";

const MAX_MANIFEST_BYTES = 128 * 1024;
const MAX_RUNTIME_BYTES = 5 * 1024 * 1024;
const PRIVATE_PACKAGE = "@schalkneethling/css-property-type-validator-project-context";

async function readBounded(fileUrl, limit) {
  const metadata = await stat(fileUrl);
  if (!metadata.isFile() || metadata.size > limit) {
    throw new Error(`Package-boundary input is not a bounded regular file: ${fileUrl.pathname}`);
  }
  const content = await readFile(fileUrl, "utf8");
  if (Buffer.byteLength(content) > limit) {
    throw new Error(`Package-boundary input exceeded its post-read limit: ${fileUrl.pathname}`);
  }
  return content;
}

const manifest = JSON.parse(
  await readBounded(new URL("../package.json", import.meta.url), MAX_MANIFEST_BYTES),
);
if (manifest.dependencies?.[PRIVATE_PACKAGE]) {
  throw new Error(`AC-SL-PC-003: private package leaked into runtime dependencies.`);
}

const runtime = await readBounded(new URL("../dist/index.js", import.meta.url), MAX_RUNTIME_BYTES);
const importPattern = new RegExp(
  `(?:from\\s*|import\\s*\\()(["'])${PRIVATE_PACKAGE.replaceAll("/", "\\/")}\\1`,
  "u",
);
if (importPattern.test(runtime)) {
  throw new Error(`AC-SL-PC-003: private package leaked into the built runtime.`);
}
