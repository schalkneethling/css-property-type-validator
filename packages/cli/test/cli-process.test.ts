import { execFile } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

const execFileAsync = promisify(execFile);
const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const executable = path.join(packageRoot, "dist", "cli.js");
const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "cptv-cli-process-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function runCli(cwd: string, args: string[]) {
  try {
    const result = await execFileAsync(process.execPath, [executable, ...args], { cwd });
    return { code: 0, stderr: result.stderr, stdout: result.stdout };
  } catch (error) {
    const failure = error as Error & { code: number; stderr: string; stdout: string };
    return { code: failure.code, stderr: failure.stderr, stdout: failure.stdout };
  }
}

beforeAll(async () => {
  await execFileAsync(path.join(packageRoot, "node_modules", ".bin", "vp"), ["pack"], {
    cwd: packageRoot,
  });
});

afterAll(async () => {
  await Promise.all(
    temporaryDirectories.map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("AC-CLI-AUDIT-002 stable process exits", () => {
  test("exits 0 when accepted gates pass", async () => {
    const root = await temporaryDirectory();
    await writeFile(
      path.join(root, "valid.css"),
      '@property --brand { syntax: "<color>"; inherits: false; initial-value: red; }',
      "utf8",
    );
    const result = await runCli(root, ["audit", "valid.css", "--format", "json"]);

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ kind: "cptv-audit" });
  });

  test("exits 1 for a high-confidence normative gate failure", async () => {
    const root = await temporaryDirectory();
    await writeFile(
      path.join(root, "invalid.css"),
      "@property --brand { inherits: false; initial-value: red; }",
      "utf8",
    );

    const result = await runCli(root, ["audit", "invalid.css", "--format", "sarif"]);

    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ version: "2.1.0" });
  });

  test("exits 2 for usage or bounded-input failure", async () => {
    const root = await temporaryDirectory();

    const result = await runCli(root, ["audit", "missing.css"]);

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("Unable to inspect input file");
  });

  test("AC-CLI-CONTRACT-001 exits 2 for a closed-contract violation", async () => {
    const root = await temporaryDirectory();
    await writeFile(
      path.join(root, "baseline.json"),
      JSON.stringify({
        diagnosticFingerprints: [],
        kind: "cptv-baseline",
        schemaVersion: "1.0.0",
        unknown: true,
      }),
      "utf8",
    );
    await writeFile(path.join(root, "valid.css"), ":root { --brand: red; }", "utf8");

    const result = await runCli(root, [
      "audit",
      "valid.css",
      "--baseline",
      "baseline.json",
      "--new-only",
    ]);

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("CPTV_CLI_INVALID_BASELINE");
  });
});

describe("AC-CLI-PC-002 repository import context", () => {
  test("inventories an observed local edge and marks its target reachable", async () => {
    const root = await temporaryDirectory();
    await writeFile(path.join(root, "main.css"), '@import "./tokens.css";', "utf8");
    await writeFile(
      path.join(root, "tokens.css"),
      '@property --space { syntax: "<length>"; inherits: false; initial-value: 0px; }',
      "utf8",
    );
    const canonicalRoot = await realpath(root);

    const result = await runCli(root, ["audit", "main.css", "--format", "json"]);
    const audit = JSON.parse(result.stdout) as {
      analysis: {
        entryPoints: Array<{
          path: string;
          reachableInputs: string[];
          status: string;
        }>;
        inventory: {
          imports: Array<Record<string, unknown>>;
        };
      };
    };

    expect(result.code).toBe(0);
    expect(audit.analysis.inventory.imports).toContainEqual(
      expect.objectContaining({
        conditional: false,
        fromPath: path.join(canonicalRoot, "main.css"),
        order: 0,
        resolution: "resolved",
        specifier: "./tokens.css",
        toPath: path.join(canonicalRoot, "tokens.css"),
      }),
    );
    expect(audit.analysis.entryPoints).toContainEqual({
      path: path.join(canonicalRoot, "main.css"),
      reachableInputs: [
        path.join(canonicalRoot, "main.css"),
        path.join(canonicalRoot, "tokens.css"),
      ],
      status: "complete",
    });
  });

  test("keeps missing and conditional imports uncertain without resolved edges", async () => {
    const root = await temporaryDirectory();
    await writeFile(
      path.join(root, "main.css"),
      '@import "./missing.css";\n@import "./conditional.css" screen;',
      "utf8",
    );
    await writeFile(path.join(root, "conditional.css"), ":root { --space: 1px; }", "utf8");

    const result = await runCli(root, ["audit", "main.css", "--format", "json"]);
    const audit = JSON.parse(result.stdout) as {
      analysis: {
        entryPoints: Array<{ status: string }>;
        inventory: { imports: Array<Record<string, unknown>> };
        skips: Array<{ code: string }>;
      };
    };

    expect(result.code).toBe(0);
    expect(audit.analysis.inventory.imports).toEqual([
      expect.objectContaining({
        conditional: false,
        order: 0,
        resolution: "unresolved",
        specifier: "./missing.css",
      }),
      expect.objectContaining({
        conditional: true,
        order: 1,
        resolution: "unresolved",
        specifier: "./conditional.css",
      }),
    ]);
    expect(audit.analysis.entryPoints[0]?.status).toBe("uncertain");
    expect(audit.analysis.skips).toContainEqual(
      expect.objectContaining({ code: "CPTV_SKIP_REPOSITORY_CONTEXT_UNAVAILABLE" }),
    );
  });
});

describe("AC-CLI-PC-004 scan universe and explicit graph roots", () => {
  test("uses one configured main root without inventing independent-root uncertainty", async () => {
    const root = await temporaryDirectory();
    const fragments = path.join(root, "src", "fragments");
    await mkdir(fragments, { recursive: true });
    await writeFile(
      path.join(root, "css-property-type-validator.config.json"),
      JSON.stringify({
        entryPoints: ["src/main.css"],
        inputs: ["src/fragments/*.css"],
        schemaVersion: 1,
      }),
      "utf8",
    );
    await writeFile(
      path.join(root, "src", "main.css"),
      '@import "./fragments/a.css";\n@import "./fragments/b.css";',
      "utf8",
    );
    await writeFile(
      path.join(fragments, "a.css"),
      '@property --tone { syntax: "<color>"; inherits: false; initial-value: red; }',
      "utf8",
    );
    await writeFile(
      path.join(fragments, "b.css"),
      '@property --tone { syntax: "<length>"; inherits: false; initial-value: 0px; }',
      "utf8",
    );
    const canonicalRoot = await realpath(root);

    const result = await runCli(root, ["audit", "--format", "json"]);
    const audit = JSON.parse(result.stdout) as {
      analysis: {
        conflicts: Array<{ entryPoints: string[]; ordering: string }>;
        entryPoints: Array<{ path: string; status: string }>;
      };
    };

    expect(result.code).toBe(0);
    expect(audit.analysis.entryPoints).toEqual([
      expect.objectContaining({
        path: path.join(canonicalRoot, "src", "main.css"),
        status: "complete",
      }),
    ]);
    expect(audit.analysis.conflicts).toContainEqual(
      expect.objectContaining({
        entryPoints: [path.join(canonicalRoot, "src", "main.css")],
        ordering: "source-order-certain",
      }),
    );
  });

  test("fails closed when a configured entry-point pattern matches no CSS", async () => {
    const root = await temporaryDirectory();
    await writeFile(
      path.join(root, "css-property-type-validator.config.json"),
      JSON.stringify({
        entryPoints: ["src/missing.css"],
        inputs: ["src/input.css"],
        schemaVersion: 1,
      }),
      "utf8",
    );
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(path.join(root, "src", "input.css"), ":root { --tone: red; }", "utf8");

    const result = await runCli(root, ["audit", "--format", "json"]);

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("Unable to inspect input file");
    expect(result.stderr).toContain("src/missing.css");
  });
});

describe("AC-CLI-BASELINE-002 baseline recovery", () => {
  test("reports stale baseline entries in canonical JSON", async () => {
    const root = await temporaryDirectory();
    const cssPath = path.join(root, "input.css");
    await writeFile(cssPath, "@property --old { inherits: false; }", "utf8");
    await runCli(root, [
      "audit",
      "input.css",
      "--format",
      "json",
      "--write-baseline",
      "baseline.json",
    ]);
    await writeFile(
      cssPath,
      '@property --old { syntax: "<length>"; inherits: false; initial-value: 0px; }',
      "utf8",
    );

    const result = await runCli(root, [
      "audit",
      "input.css",
      "--format",
      "json",
      "--baseline",
      "baseline.json",
      "--new-only",
    ]);
    const audit = JSON.parse(result.stdout) as {
      gateEvaluation: {
        baseline: { staleFingerprints: string[] };
      };
    };

    expect(result.code).toBe(0);
    expect(audit.gateEvaluation.baseline.staleFingerprints).toHaveLength(1);
  });

  test("returns usage failure with recovery guidance for legacy coverage baselines", async () => {
    const root = await temporaryDirectory();
    await writeFile(path.join(root, "input.css"), ":root { --space: 1px; }", "utf8");
    await writeFile(
      path.join(root, "baseline.json"),
      JSON.stringify({
        diagnosticFingerprints: [],
        kind: "cptv-baseline",
        schemaVersion: "1.0.0",
      }),
      "utf8",
    );

    const result = await runCli(root, [
      "audit",
      "input.css",
      "--baseline",
      "baseline.json",
      "--coverage-regression",
    ]);

    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/regenerate/i);
  });
});
