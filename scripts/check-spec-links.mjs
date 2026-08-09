import { lstat, readFile } from "node:fs/promises";
import process from "node:process";

const sourceUrl = new URL("../packages/core/src/specification.ts", import.meta.url);
const stat = await lstat(sourceUrl);
if (!stat.isFile() || stat.size > 256 * 1024)
  throw new Error("Specification catalog must be a regular file no larger than 256 KiB.");
const bytes = await readFile(sourceUrl);
if (bytes.byteLength > 256 * 1024)
  throw new Error("Specification catalog exceeded its post-read byte limit.");
const urls = [
  ...new Set(bytes.toString("utf8").match(/https:\/\/www\.w3\.org\/[^"'\s)]+/gu) ?? []),
];
const pages = new Map();
for (const value of urls) {
  const url = new URL(value);
  const fragment = url.hash.slice(1);
  url.hash = "";
  const key = url.href;
  if (!pages.has(key)) pages.set(key, new Set());
  if (fragment) pages.get(key).add(decodeURIComponent(fragment));
}

const failures = [];
for (const [page, fragments] of pages) {
  const response = await fetch(page, {
    headers: { "User-Agent": "css-property-type-validator-spec-links" },
  });
  if (!response.ok) {
    failures.push(`${page}: ${response.status}`);
    continue;
  }
  const text = await response.text();
  if (Buffer.byteLength(text) > 8 * 1024 * 1024) {
    failures.push(`${page}: response exceeded 8 MiB`);
    continue;
  }
  for (const fragment of fragments) {
    const escaped = fragment.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    if (!new RegExp(`(?:id|name)=["']${escaped}["']`, "u").test(text))
      failures.push(`${page}#${fragment}: anchor not found`);
  }
}

if (failures.length > 0) {
  console.error(`Specification link check failed:\n${failures.join("\n")}`);
  process.exitCode = 1;
} else {
  console.log(`Verified ${urls.length} official W3C specification references.`);
}
