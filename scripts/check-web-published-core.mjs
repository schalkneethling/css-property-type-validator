import { execFile } from "node:child_process";
import { cp, lstat, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webRoot = path.join(repositoryRoot, "web");
async function readJsonBounded(filePath, limit = 256 * 1024) {
  const stat = await lstat(filePath);
  if (!stat.isFile() || stat.size > limit)
    throw new Error(`Refusing unbounded manifest: ${filePath}`);
  const bytes = await readFile(filePath);
  if (bytes.byteLength > limit)
    throw new Error(`Manifest exceeded its post-read limit: ${filePath}`);
  return JSON.parse(bytes.toString("utf8"));
}

const packageJson = await readJsonBounded(path.join(webRoot, "package.json"));
const packageName = "@schalkneethling/css-property-type-validator-core";
const version = packageJson.dependencies?.[packageName];

if (typeof version !== "string" || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`web must declare an exact ${packageName} version.`);
}

let registryMetadata;
try {
  const result = await execFileAsync("npm", [
    "view",
    `${packageName}@${version}`,
    "version",
    "dist.integrity",
    "--json",
  ]);
  registryMetadata = JSON.parse(result.stdout);
} catch (error) {
  throw new Error(
    `Could not verify ${packageName}@${version} from npm. Registry failures fail closed.`,
    { cause: error },
  );
}

if (
  registryMetadata.version !== version ||
  typeof registryMetadata["dist.integrity"] !== "string" ||
  !registryMetadata["dist.integrity"].startsWith("sha512-")
) {
  throw new Error(
    `npm did not return the required exact version and SHA-512 integrity for ${packageName}@${version}.`,
  );
}

const fixtureRoot = await mkdtemp(path.join(tmpdir(), "cptv-web-published-"));
const fixtureWeb = path.join(fixtureRoot, "web");
try {
  await cp(webRoot, fixtureWeb, {
    recursive: true,
    filter(source) {
      return !source.includes(`${path.sep}node_modules`) && !source.includes(`${path.sep}dist`);
    },
  });
  await cp(
    path.join(repositoryRoot, "tsconfig.base.json"),
    path.join(fixtureRoot, "tsconfig.base.json"),
  );
  await execFileAsync(
    "pnpm",
    ["install", "--ignore-workspace", "--ignore-scripts", "--lockfile=false"],
    { cwd: fixtureWeb },
  );
  await execFileAsync("pnpm", ["run", "build"], { cwd: fixtureWeb });
  await execFileAsync("pnpm", ["run", "test:e2e"], { cwd: fixtureWeb });
  await writeFile(
    path.join(fixtureWeb, "dist", "published-core.json"),
    `${JSON.stringify({ name: packageName, version, integrity: registryMetadata["dist.integrity"] }, null, 2)}\n`,
    "utf8",
  );

  if (process.env.CPTV_WEB_ARTIFACT_DIR) {
    const artifactDirectory = path.resolve(repositoryRoot, process.env.CPTV_WEB_ARTIFACT_DIR);
    const relative = path.relative(repositoryRoot, artifactDirectory);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(
        "CPTV_WEB_ARTIFACT_DIR must identify a dedicated directory inside the repository.",
      );
    }
    await rm(artifactDirectory, { recursive: true, force: true });
    await cp(path.join(fixtureWeb, "dist"), artifactDirectory, { recursive: true });
  }
} finally {
  await rm(fixtureRoot, { recursive: true, force: true });
}

process.stdout.write(
  `web builds against published ${packageName}@${version} (${registryMetadata["dist.integrity"]}).\n`,
);
