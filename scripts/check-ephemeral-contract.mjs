import { readFile } from "node:fs/promises";
import process from "node:process";

const manifestUrl = new URL("../compatibility/ephemeral-pages.json", import.meta.url);
const manifestStat = await (await import("node:fs/promises")).lstat(manifestUrl);
if (!manifestStat.isFile() || manifestStat.size > 64 * 1024) {
  throw new Error("Ephemeral compatibility manifest must be a regular file no larger than 64 KiB.");
}
const manifestBytes = await readFile(manifestUrl);
if (manifestBytes.byteLength > 64 * 1024) {
  throw new Error("Ephemeral compatibility manifest exceeded the post-read byte limit.");
}
const contract = JSON.parse(manifestBytes.toString("utf8"));

const failures = [];
if (!/^[a-f0-9]{40}$/u.test(contract.upstream?.commit ?? ""))
  failures.push("full upstream commit SHA");
if (contract.delivery?.viewerIframeSandbox !== "allow-scripts") failures.push("viewer sandbox");
for (const directive of [
  "sandbox allow-scripts",
  "default-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
]) {
  if (!contract.delivery?.httpCsp?.includes(directive))
    failures.push(`HTTP CSP directive ${directive}`);
}
if (/(^|;)\s*connect-src\s+/u.test(contract.delivery?.httpCsp ?? ""))
  failures.push("absence of an explicit service connect-src override");
if (contract.delivery?.responseHeaders?.["X-Content-Type-Options"] !== "nosniff")
  failures.push("nosniff header");
if (
  !(contract.delivery?.requiredAuthoredElements ?? []).some(
    (name) => name === "html" || name === "head",
  )
)
  failures.push("authored html/head requirement");
if (
  !(contract.delivery?.uploadLimits?.rawHtmlBytes > 0) ||
  !(contract.delivery?.uploadLimits?.brotliCompressedHtmlBytes > 0)
)
  failures.push("positive derived upload limits");

if (failures.length > 0) {
  console.error(`Ephemeral contract check failed: ${failures.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log(
    `Ephemeral contract ${contract.compatibilityVersion} pins ${contract.upstream.commit}.`,
  );
}
