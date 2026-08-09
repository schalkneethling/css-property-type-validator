import { readFile, lstat } from "node:fs/promises";
import process from "node:process";

const manifestUrl = new URL("../compatibility/ephemeral-pages.json", import.meta.url);
const stat = await lstat(manifestUrl);
if (!stat.isFile() || stat.size > 64 * 1024)
  throw new Error("Invalid Ephemeral manifest size or type.");
const bytes = await readFile(manifestUrl);
if (bytes.byteLength > 64 * 1024)
  throw new Error("Ephemeral manifest exceeded its post-read limit.");
const contract = JSON.parse(bytes.toString("utf8"));
const repository = new URL(contract.upstream.repository);
const [owner, repo] = repository.pathname.split("/").filter(Boolean);
const headers = {
  Accept: "application/vnd.github+json",
  "User-Agent": "css-property-type-validator-ephemeral-drift",
};
const failures = [];
const proposal = [];
const proposedCommitResponse = await fetch(
  `https://api.github.com/repos/${owner}/${repo}/commits/main`,
  { headers },
);
if (!proposedCommitResponse.ok)
  throw new Error(`Unable to resolve Ephemeral main: ${proposedCommitResponse.status}`);
const proposedCommit = (await proposedCommitResponse.json()).sha;

for (const source of contract.upstream.sources) {
  const endpoint = `https://api.github.com/repos/${owner}/${repo}/contents/${source.path}?ref=${proposedCommit}`;
  const response = await fetch(endpoint, { headers });
  if (!response.ok) {
    failures.push(`${source.path}: registry response ${response.status}`);
    continue;
  }
  const metadata = await response.json();
  proposal.push({ path: source.path, blobSha: metadata.sha });
  if (metadata.sha !== source.blobSha)
    failures.push(`${source.path}: pinned ${source.blobSha}, main ${metadata.sha}`);
}

if (process.argv.includes("--proposal")) {
  console.log(JSON.stringify({ commit: proposedCommit, sources: proposal }, null, 2));
  console.log(
    "Review the upstream source and effective delivery behavior before editing the manifest; this command never writes it.",
  );
}

if (failures.length > 0) {
  console.error(`Pinned Ephemeral contract drifted:\n${failures.join("\n")}`);
  process.exitCode = 1;
} else {
  console.log(
    `Ephemeral main ${proposedCommit} matches pinned source blobs at ${contract.upstream.commit}.`,
  );
}
