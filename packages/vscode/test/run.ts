import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runTests } from "@vscode/test-electron";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionDevelopmentPath = path.resolve(dirname, "../..");
const extensionTestsPath = path.resolve(extensionDevelopmentPath, "out/test/suite/index.cjs");
const workspacePath = mkdtempSync(path.join(tmpdir(), "css-property-type-validator-vscode-"));
const extensionsDir = mkdtempSync(path.join(tmpdir(), "cptv-ext-"));
const userDataDir = mkdtempSync(path.join(tmpdir(), "cptv-user-"));

await runTests({
  extensionDevelopmentPath,
  extensionTestsPath,
  launchArgs: [
    workspacePath,
    "--disable-gpu",
    "--no-sandbox",
    `--extensions-dir=${extensionsDir}`,
    `--user-data-dir=${userDataDir}`,
  ],
});
