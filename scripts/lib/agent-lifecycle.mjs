import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptsDirectory = fileURLToPath(new URL("..", import.meta.url));

export function run(command, args) {
  const result = spawnSync(command, args, { cwd: process.cwd(), stdio: "inherit" });
  if (result.error) {
    throw result.error;
  }
  if (typeof result.status === "number" && result.status !== 0) {
    process.exitCode = result.status;
    return false;
  }
  return true;
}

export function runExpectedFailure(command, args) {
  const result = spawnSync(command, args, { cwd: process.cwd(), stdio: "inherit" });
  if (result.error) {
    throw result.error;
  }
  if (result.status === 0) {
    process.stderr.write(
      "RED evidence command passed; it did not prove the selected unmet criterion.\n",
    );
    process.exitCode = 1;
    return false;
  }
  return true;
}

export function runGuardrails() {
  const scripts = [
    "check-acceptance-traceability.mjs",
    "check-core-browser-boundary.mjs",
    "check-bounded-css-reads.mjs",
    "check-diagnostic-code-contract.mjs",
    "check-generated-contracts.mjs",
  ];
  return scripts.every((script) => run(process.execPath, [`${scriptsDirectory}/${script}`]));
}

export function usage(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 2;
}
