import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repositoryRoot = resolve(import.meta.dirname, "../..");

async function fixture(callback) {
  const root = await mkdtemp(resolve(tmpdir(), "cptv-guardrail-"));
  try {
    await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function run(script, root, args = []) {
  return spawnSync(
    process.execPath,
    [resolve(repositoryRoot, "scripts", script), "--root", root, ...args],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
    },
  );
}

test("AC-GUARD-001 rejects an acceptance criterion missing from traceability", async () => {
  await fixture(async (root) => {
    await mkdir(resolve(root, "docs/acceptance"), { recursive: true });
    await writeFile(
      resolve(root, "docs/acceptance/slice.md"),
      "# Slice\n\n## AC-TEST-001 — Outcome\n\n## Traceability\n\n| Criterion/scenario | Implementation |\n| --- | --- |\n",
    );
    const result = run("check-acceptance-traceability.mjs", root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /AC-TEST-001 must occur exactly once/);
  });
});

test("AC-GUARD-002 rejects a Node-only core import", async () => {
  await fixture(async (root) => {
    await mkdir(resolve(root, "packages/core/src"), { recursive: true });
    await writeFile(
      resolve(root, "packages/core/src/index.ts"),
      'import { readFile } from "node:fs/promises";\n',
    );
    const result = run("check-core-browser-boundary.mjs", root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Node built-in import/);
  });
});

test("AC-GUARD-003 rejects a direct package file read", async () => {
  await fixture(async (root) => {
    await mkdir(resolve(root, "packages/project-context/src"), { recursive: true });
    await mkdir(resolve(root, "packages/cli/src"), { recursive: true });
    await writeFile(
      resolve(root, "packages/project-context/src/bounded-reader.ts"),
      "await lstat(path); await stat(path); const text = await readFile(path); Buffer.byteLength(text);\n",
    );
    await writeFile(
      resolve(root, "packages/cli/src/load.ts"),
      "const text = await readFile(path);\n",
    );
    const result = run("check-bounded-css-reads.mjs", root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /directly reads a file/);
  });
});

test("AC-GUARD-004 rejects duplicate permanent diagnostic codes", async () => {
  await fixture(async (root) => {
    await mkdir(resolve(root, "contracts"), { recursive: true });
    await mkdir(resolve(root, "packages/core/src"), { recursive: true });
    await writeFile(
      resolve(root, "contracts/diagnostic-codes.json"),
      JSON.stringify({ codes: [{ code: "CPTV_DUP" }, { code: "CPTV_DUP" }] }),
    );
    const result = run("check-diagnostic-code-contract.mjs", root, ["--require"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /duplicate code CPTV_DUP/);
  });
});

test("AC-GUARD-005 rejects a stale generated contract digest", async () => {
  await fixture(async (root) => {
    await mkdir(resolve(root, "contracts"), { recursive: true });
    await writeFile(resolve(root, "generated.json"), '{"value":1}\n');
    await writeFile(
      resolve(root, "contracts/generated-contracts.json"),
      JSON.stringify({ contracts: [{ path: "generated.json", sha256: "0".repeat(64) }] }),
    );
    const result = run("check-generated-contracts.mjs", root, ["--require"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Generated contract is stale/);
  });
});

test("AC-GUARD-006 requires a criterion and explicit RED test command", () => {
  const result = spawnSync(
    process.execPath,
    [resolve(repositoryRoot, "scripts/agent-verify-red.mjs")],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Usage: agent-verify-red/);
});

test("AC-GUARD-006 rejects a RED command that passes instead of proving an unmet outcome", () => {
  const result = spawnSync(
    process.execPath,
    [
      resolve(repositoryRoot, "scripts/agent-verify-red.mjs"),
      "--criterion",
      "AC-GUARD-001",
      "--",
      process.execPath,
      "-e",
      "process.exit(0)",
    ],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /did not prove the selected unmet criterion/);
});
