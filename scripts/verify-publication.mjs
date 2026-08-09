import { execFile } from "node:child_process";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageDirectories = ["packages/core", "packages/cli", "packages/stylelint"];
const expected = [];

for (const directory of packageDirectories) {
  const manifestPath = path.join(root, directory, "package.json");
  const stat = await lstat(manifestPath);
  if (!stat.isFile() || stat.size > 256 * 1024)
    throw new Error(`Invalid package manifest: ${manifestPath}`);
  const bytes = await readFile(manifestPath);
  if (bytes.byteLength > 256 * 1024)
    throw new Error(`Package manifest exceeded its post-read limit: ${manifestPath}`);
  const manifest = JSON.parse(bytes.toString("utf8"));
  expected.push({ name: manifest.name, version: manifest.version });
}

const requested = process.argv.slice(2);
const selected =
  requested.length === 0
    ? expected
    : requested.map((specifier) => {
        const separator = specifier.lastIndexOf("@");
        const name = specifier.slice(0, separator);
        const version = specifier.slice(separator + 1);
        const declared = expected.find((entry) => entry.name === name);
        if (separator <= 0 || !name.startsWith("@") || version.length === 0 || !declared) {
          throw new Error(
            `Unknown publication target ${JSON.stringify(specifier)}; use an exact repository package name and version.`,
          );
        }
        if (declared.version !== version) {
          throw new Error(
            `${name} declares version ${declared.version}, not requested version ${version}.`,
          );
        }
        return declared;
      });

const failures = [];
for (const entry of selected) {
  try {
    const result = await execFileAsync("npm", [
      "view",
      `${entry.name}@${entry.version}`,
      "dist.integrity",
      "--json",
    ]);
    const integrity = JSON.parse(result.stdout);
    if (typeof integrity !== "string" || !integrity.startsWith("sha512-"))
      failures.push(`${entry.name}@${entry.version}: missing integrity`);
    else console.log(`${entry.name}@${entry.version} ${integrity}`);
  } catch (error) {
    failures.push(
      `${entry.name}@${entry.version}: unavailable (${error instanceof Error ? error.message : String(error)})`,
    );
  }
}

if (failures.length > 0) {
  console.error(`Publication verification failed closed:\n${failures.join("\n")}`);
  process.exitCode = 1;
}
