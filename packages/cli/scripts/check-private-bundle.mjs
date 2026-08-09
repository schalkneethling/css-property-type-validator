import { readFile, stat } from "node:fs/promises";

const MAX_MANIFEST_BYTES = 128 * 1024;
const MAX_RUNTIME_BYTES = 5 * 1024 * 1024;
const PRIVATE_PACKAGES = [
  "@schalkneethling/css-property-type-validator-project-context",
  "@schalkneethling/css-property-type-validator-report",
];

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
const runtime = await readBounded(new URL("../dist/cli.js", import.meta.url), MAX_RUNTIME_BYTES);
for (const privatePackage of PRIVATE_PACKAGES) {
  if (manifest.dependencies?.[privatePackage]) {
    throw new Error(`AC-CLI-PKG-001: private package leaked into runtime dependencies.`);
  }
  const importPattern = new RegExp(
    `(?:from\\s*|import\\s*\\()(["'])${privatePackage.replaceAll("/", "\\/")}\\1`,
    "u",
  );
  if (importPattern.test(runtime)) {
    throw new Error(`AC-CLI-PKG-001: private package leaked into the built runtime.`);
  }
}
