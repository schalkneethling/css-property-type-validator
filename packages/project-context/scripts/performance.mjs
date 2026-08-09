import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import { ProjectReader } from "../dist/index.js";

const CRITERION_ID = "AC-PC-PERF-001";
const FILE_COUNT = 1_000;
const TOTAL_BYTES = 10 * 1024 * 1024;
const MAX_ELAPSED_MS = 10_000;
const MAX_RSS_BYTES = 512 * 1024 * 1024;
const REQUIRED_NODE_MAJOR = 22;

function emit(result) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function currentMaxRssBytes() {
  // Node reports maxRSS in KiB on the supported Linux CI runtime.
  return process.resourceUsage().maxRSS * 1024;
}

function cssContent(byteLength) {
  const prefix = ":root{--cptv-performance:";
  const suffix = ";}";
  if (byteLength < prefix.length + suffix.length) {
    throw new Error("Synthetic CSS byte allocation is too small for its declaration.");
  }
  return `${prefix}${" ".repeat(byteLength - prefix.length - suffix.length)}${suffix}`;
}

function environmentError() {
  const nodeMajor = Number.parseInt(process.versions.node.split(".")[0], 10);
  if (process.platform !== "linux" || nodeMajor !== REQUIRED_NODE_MAJOR) {
    return `requires Linux and Node ${REQUIRED_NODE_MAJOR}; received ${process.platform} and Node ${process.versions.node}`;
  }
  return undefined;
}

async function main() {
  const environment = {
    arch: process.arch,
    node: process.versions.node,
    platform: process.platform,
  };
  const environmentFailure = environmentError();
  if (environmentFailure) {
    emit({ criterionId: CRITERION_ID, environment, passed: false, reason: environmentFailure });
    process.exitCode = 1;
    return;
  }

  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "cptv-project-context-performance-"));
  let result;

  try {
    const baseBytes = Math.floor(TOTAL_BYTES / FILE_COUNT);
    const remainder = TOTAL_BYTES % FILE_COUNT;

    await Promise.all(
      Array.from({ length: FILE_COUNT }, (_, index) => {
        const byteLength = baseBytes + (index < remainder ? 1 : 0);
        return writeFile(
          path.join(temporaryRoot, `fixture-${String(index).padStart(4, "0")}.css`),
          cssContent(byteLength),
          "utf8",
        );
      }),
    );

    const startedAt = performance.now();
    const reader = await ProjectReader.create({ root: temporaryRoot });
    const firstLoad = await reader.loadCssInputs(["**/*.css"]);
    const secondLoad = await reader.loadCssInputs(["**/*.css"]);
    const elapsedMs = performance.now() - startedAt;
    const maxRssBytes = currentMaxRssBytes();
    const firstPaths = firstLoad.map((file) => file.path);
    const secondPaths = secondLoad.map((file) => file.path);
    const totalLoadedBytes = firstLoad.reduce((total, file) => total + file.byteLength, 0);
    const deterministic = JSON.stringify(firstPaths) === JSON.stringify(secondPaths);
    const passed =
      firstLoad.length === FILE_COUNT &&
      totalLoadedBytes === TOTAL_BYTES &&
      deterministic &&
      elapsedMs <= MAX_ELAPSED_MS &&
      maxRssBytes <= MAX_RSS_BYTES;

    result = {
      criterionId: CRITERION_ID,
      deterministic,
      elapsedMs: Number(elapsedMs.toFixed(3)),
      environment,
      filesLoaded: firstLoad.length,
      limits: { maxElapsedMs: MAX_ELAPSED_MS, maxRssBytes: MAX_RSS_BYTES },
      maxRssBytes,
      passed,
      totalLoadedBytes,
    };
  } catch (error) {
    result = {
      criterionId: CRITERION_ID,
      environment,
      error: error instanceof Error ? error.message : String(error),
      passed: false,
    };
  } finally {
    await rm(temporaryRoot, { force: true, maxRetries: 3, recursive: true });
  }

  emit(result);
  if (!result.passed) process.exitCode = 1;
}

await main();
