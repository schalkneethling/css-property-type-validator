import { execFile } from "node:child_process";
import { access, lstat, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const consume = process.argv.includes("--consume");
const publicPackages = [
  "@schalkneethling/css-property-type-validator-core",
  "@schalkneethling/css-property-type-validator-cli",
  "@schalkneethling/stylelint-plugin-css-property-type-validator",
];
const privateRuntimePackages = new Set([
  "@schalkneethling/css-property-type-validator-project-context",
  "@schalkneethling/css-property-type-validator-report",
]);
const stylelintPluginPackage = "@schalkneethling/stylelint-plugin-css-property-type-validator";
// AC-SL-PC-005: every Stylelint major the plugin's peer range claims must be installed and
// exercised below, and the peer range must claim nothing else.
const supportedStylelintMajors = [17, 18];
const expectedStylelintPeerRange = supportedStylelintMajors
  .map((major) => `^${major}.0.0`)
  .join(" || ");
// Lints an invalid @property registration through Stylelint's own plugin resolution, so the
// check fails if the plugin cannot be loaded by name or its rule stops reporting.
const consumerLintScript = `
import stylelint from "stylelint";
const result = await stylelint.lint({
  code: '@property --brand-color { syntax: "<color>"; }',
  codeFilename: "component.css",
  configBasedir: process.cwd(),
  config: {
    plugins: ["${stylelintPluginPackage}"],
    rules: { "css-property-type-validator/valid-property-types": true },
  },
});
const texts = result.results.flatMap((entry) => entry.warnings.map((warning) => warning.text));
if (!texts.some((text) => text.includes("inherits descriptor"))) {
  throw new Error(\`Stylelint \${stylelint.version ?? "unknown"} did not report the invalid registration: \${JSON.stringify(texts)}\`);
}
`;
const temporaryRoot = await mkdtemp(path.join(tmpdir(), "cptv-release-boundary-"));
const packDirectory = path.join(temporaryRoot, "packs");

async function readJsonBounded(filePath, limit = 256 * 1024) {
  const stat = await lstat(filePath);
  if (!stat.isFile() || stat.size > limit)
    throw new Error(`${filePath} is not a bounded regular manifest.`);
  const bytes = await readFile(filePath);
  if (bytes.byteLength > limit) throw new Error(`${filePath} exceeded its post-read limit.`);
  return JSON.parse(bytes.toString("utf8"));
}

try {
  await mkdir(packDirectory);
  for (const packageName of publicPackages) {
    await execFileAsync(
      "pnpm",
      ["--filter", packageName, "pack", "--pack-destination", packDirectory],
      {
        cwd: repositoryRoot,
      },
    );
  }

  const tarballs = (await readdir(packDirectory)).filter((name) => name.endsWith(".tgz")).sort();
  if (tarballs.length !== publicPackages.length) {
    throw new Error(`Expected ${publicPackages.length} tarballs, found ${tarballs.length}.`);
  }

  const tarballByPackage = new Map();
  for (const [index, tarball] of tarballs.entries()) {
    const extractDirectory = path.join(temporaryRoot, `extract-${index}`);
    await mkdir(extractDirectory);
    await execFileAsync("tar", ["-xzf", path.join(packDirectory, tarball), "-C", extractDirectory]);
    const manifest = await readJsonBounded(path.join(extractDirectory, "package", "package.json"));
    tarballByPackage.set(manifest.name, path.join(packDirectory, tarball));
    const dependencies = { ...manifest.dependencies, ...manifest.optionalDependencies };
    for (const [name, version] of Object.entries(dependencies)) {
      if (String(version).startsWith("workspace:"))
        throw new Error(`${manifest.name} packed a workspace protocol for ${name}.`);
      if (privateRuntimePackages.has(name))
        throw new Error(`${manifest.name} requires unpublished private runtime package ${name}.`);
    }
    const mainExists = manifest.main
      ? await access(path.join(extractDirectory, "package", manifest.main)).then(
          () => true,
          () => false,
        )
      : true;
    if (!mainExists) {
      throw new Error(`${manifest.name} is missing declared main entry ${manifest.main}.`);
    }
    if (
      manifest.name === stylelintPluginPackage &&
      manifest.peerDependencies?.stylelint !== expectedStylelintPeerRange
    ) {
      throw new Error(
        `${manifest.name} declares stylelint peer range ${JSON.stringify(manifest.peerDependencies?.stylelint)}, expected ${JSON.stringify(expectedStylelintPeerRange)}.`,
      );
    }
  }

  if (consume) {
    const coreTarball = tarballByPackage.get("@schalkneethling/css-property-type-validator-core");
    if (!coreTarball) throw new Error("The packed core tarball is unavailable to the consumer.");
    for (const major of supportedStylelintMajors) {
      const consumer = path.join(temporaryRoot, `consumer-stylelint-${major}`);
      await mkdir(consumer);
      await writeFile(
        path.join(consumer, "package.json"),
        `${JSON.stringify(
          {
            dependencies: Object.fromEntries([
              ...publicPackages.map((name) => [name, `file:${tarballByPackage.get(name)}`]),
              ["stylelint", `^${major}.0.0`],
            ]),
            private: true,
            type: "module",
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      // npm fails with ERESOLVE here when the plugin's peer range excludes this major.
      await execFileAsync("npm", ["install", "--ignore-scripts", "--no-package-lock"], {
        cwd: consumer,
      });
      await execFileAsync(
        "node",
        [
          "--input-type=module",
          "--eval",
          "await import('@schalkneethling/css-property-type-validator-core'); await import('@schalkneethling/stylelint-plugin-css-property-type-validator');",
        ],
        { cwd: consumer },
      );
      await execFileAsync("node", ["--input-type=module", "--eval", consumerLintScript], {
        cwd: consumer,
      });
      await execFileAsync(
        path.join(consumer, "node_modules", ".bin", "css-property-type-validator"),
        ["--help"],
        { cwd: consumer },
      );
    }
  }

  console.log(
    `${consume ? `Consumed with Stylelint ${supportedStylelintMajors.join(", ")}` : "Inspected"} ${tarballs.join(", ")} outside the workspace.`,
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
