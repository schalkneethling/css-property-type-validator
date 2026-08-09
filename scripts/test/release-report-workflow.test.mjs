import assert from "node:assert/strict";
import { lstat, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const byteLimit = 512 * 1024;

async function readBounded(relativePath) {
  const filePath = resolve(repositoryRoot, relativePath);
  const fileStat = await lstat(filePath);
  assert.equal(fileStat.isFile(), true, `${relativePath} must be a regular file`);
  assert.ok(fileStat.size <= byteLimit, `${relativePath} exceeds the test byte limit`);
  const bytes = await readFile(filePath);
  assert.ok(bytes.byteLength <= byteLimit, `${relativePath} grew while being read`);
  return bytes.toString("utf8");
}

test("AC-RELEASE-004 keeps public audit publication opt-in and sanitized", async () => {
  const [ci, optionalWorkflow, generator] = await Promise.all([
    readBounded(".github/workflows/ci.yml"),
    readBounded(".github/workflows/ephemeral-audit-report.yml"),
    readBounded("scripts/create-ci-audit-report.mjs"),
  ]);

  assert.match(ci, /pnpm run report:ci/u);
  assert.match(ci, /css-property-adoption-audit/u);
  assert.match(generator, /--redact-source/u);
  assert.match(generator, /validateCompressedReportForEphemeral|packages\/cli\/dist\/cli\.js/u);

  assert.match(optionalWorkflow, /head\.repo\.full_name == github\.repository/u);
  assert.match(optionalWorkflow, /vars\.CPTV_EPHEMERAL_REPORTS == 'true'/u);
  assert.match(optionalWorkflow, /pnpm run report:ci/u);
  assert.match(optionalWorkflow, /schalkneethling\/ephemeral-pages-action@[0-9a-f]{40}/u);
  assert.doesNotMatch(optionalWorkflow, /continue-on-error:\s*true/u);
});
