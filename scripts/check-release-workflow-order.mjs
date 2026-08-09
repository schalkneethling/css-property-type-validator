import { lstat, readFile } from "node:fs/promises";

const workflowUrl = new URL("../.github/workflows/publish.yml", import.meta.url);
const stat = await lstat(workflowUrl);
if (!stat.isFile() || stat.size > 512 * 1024)
  throw new Error("Publish workflow must be a bounded regular file.");
const bytes = await readFile(workflowUrl);
if (bytes.byteLength > 512 * 1024)
  throw new Error("Publish workflow exceeded its post-read limit.");
const workflow = bytes.toString("utf8");
const allCase = workflow.match(/all-v\*\)([\s\S]*?)\n\s*;;/u)?.[1] ?? "";
const core = allCase.indexOf("css-property-type-validator-core");
const cli = allCase.indexOf("css-property-type-validator-cli");
const stylelint = allCase.indexOf("stylelint-plugin-css-property-type-validator");
if (core === -1 || cli === -1 || stylelint === -1 || !(core < cli && cli < stylelint)) {
  throw new Error("The all-package release must publish core, then CLI, then Stylelint.");
}
if (/publish_matching[^\n]*css-property-type-validator-web/u.test(workflow)) {
  throw new Error("The workspace publish workflow must not publish or deploy web.");
}
console.log("Release workflow preserves core → CLI → Stylelint order and excludes web deployment.");
