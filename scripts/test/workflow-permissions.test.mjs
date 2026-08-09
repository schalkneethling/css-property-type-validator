import assert from "node:assert/strict";
import { lstat, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const workflowsDirectory = resolve(import.meta.dirname, "../../.github/workflows");
const maximumWorkflowBytes = 512 * 1024;

async function readWorkflowBounded(path) {
  const before = await lstat(path);
  assert.equal(before.isFile(), true, `${path} must be a regular file`);
  assert.ok(before.size <= maximumWorkflowBytes, `${path} exceeds the workflow read limit`);

  const bytes = await readFile(path);
  assert.ok(
    bytes.byteLength <= maximumWorkflowBytes,
    `${path} grew beyond the workflow read limit`,
  );
  return bytes.toString("utf8");
}

test("AC-GUARD-007 workflows declare explicit top-level token permissions", async () => {
  const workflowNames = (await readdir(workflowsDirectory))
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .sort();

  for (const name of workflowNames) {
    const workflow = await readWorkflowBounded(resolve(workflowsDirectory, name));
    const jobsOffset = workflow.search(/^jobs:/mu);
    const permissionsOffset = workflow.search(/^permissions:/mu);
    assert.ok(permissionsOffset >= 0, `${name} must declare top-level permissions`);
    assert.ok(permissionsOffset < jobsOffset, `${name} permissions must be top-level`);
  }
});

test("AC-GUARD-007 ordinary CI grants only read-only repository contents", async () => {
  const workflow = await readWorkflowBounded(resolve(workflowsDirectory, "ci.yml"));
  const topLevel = workflow.slice(0, workflow.search(/^jobs:/mu));
  const permissions = topLevel.match(/^permissions:\n((?:  [^\n]+\n?)*)/mu)?.[1].trim();
  assert.equal(permissions, "contents: read");
});
