import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptsDirectory = fileURLToPath(new URL(".", import.meta.url));
const repositoryRoot = resolve(scriptsDirectory, "..");
const configPath = resolve(scriptsDirectory, "determinism-rules/sgconfig.yml");
const astGrepBinary = resolve(repositoryRoot, "node_modules/.bin/ast-grep");

const targets = process.argv.slice(2);
if (targets.length === 0) {
  process.stderr.write("Usage: check-determinism-rules.mjs <path> [path ...]\n");
  process.exitCode = 2;
} else {
  const scan = spawnSync(
    astGrepBinary,
    ["scan", "--config", configPath, "--json=compact", ...targets],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  if (scan.error) {
    throw scan.error;
  }
  if (typeof scan.status !== "number" || (scan.status !== 0 && !scan.stdout.trim())) {
    throw new Error(`ast-grep scan failed: ${scan.stderr}`);
  }

  const findings = JSON.parse(scan.stdout);
  if (findings.length > 0) {
    for (const finding of findings) {
      process.stderr.write(
        `${finding.file}:${finding.range.start.line + 1} [${finding.ruleId}] ${finding.message}\n`,
      );
    }
    process.exitCode = 1;
  } else {
    process.stdout.write(`Determinism rules passed for ${targets.join(", ")}.\n`);
  }
}
