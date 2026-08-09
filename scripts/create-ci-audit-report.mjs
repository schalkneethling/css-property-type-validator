import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(root, ".artifacts");
const outputPath = path.join(outputDirectory, "cptv-audit.html");

let stdout;
try {
  ({ stdout } = await execFileAsync(
    "node",
    [
      "packages/cli/dist/cli.js",
      "audit",
      "fixtures/**/*.css",
      "web/src/**/*.css",
      "--format",
      "html",
      "--redact-source",
    ],
    { cwd: root, maxBuffer: 22 * 1024 * 1024 },
  ));
} catch (error) {
  if (error && typeof error === "object" && error.code === 1 && typeof error.stdout === "string") {
    stdout = error.stdout;
  } else {
    throw error;
  }
}

if (!stdout?.startsWith("<!doctype html>"))
  throw new Error("CLI did not produce a standalone sanitized audit report.");
await mkdir(outputDirectory, { recursive: true });
await writeFile(outputPath, stdout, "utf8");
console.log(`Created sanitized audit report at ${path.relative(root, outputPath)}.`);
