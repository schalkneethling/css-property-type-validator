import { createHash } from "node:crypto";
import { lstat, readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

export const MAX_GUARDRAIL_READ_BYTES = 2 * 1024 * 1024;

export function parseRootArgument(argv) {
  const rootIndex = argv.indexOf("--root");
  if (rootIndex === -1) {
    return process.cwd();
  }

  const root = argv[rootIndex + 1];
  if (!root || root.startsWith("-")) {
    throw new Error("--root requires a directory path.");
  }

  return resolve(root);
}

export function hasFlag(argv, flag) {
  return argv.includes(flag);
}

export async function readTextBounded(filePath, limit = MAX_GUARDRAIL_READ_BYTES) {
  const before = await lstat(filePath);
  if (!before.isFile()) {
    throw new Error(`Expected a regular file: ${filePath}`);
  }
  if (before.size > limit) {
    throw new Error(`Refusing to read ${filePath}: ${before.size} bytes exceeds ${limit} bytes.`);
  }

  const content = await readFile(filePath, "utf8");
  const byteLength = Buffer.byteLength(content, "utf8");
  if (byteLength > limit) {
    throw new Error(`Refusing ${filePath}: content grew beyond ${limit} bytes while reading.`);
  }

  return content;
}

export async function pathExists(filePath) {
  try {
    await lstat(filePath);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export async function listFiles(root, predicate) {
  const files = [];

  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const candidate = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(candidate);
      } else if (entry.isFile() && predicate(candidate)) {
        files.push(candidate);
      }
    }
  }

  if (await pathExists(root)) {
    await walk(root);
  }

  return files;
}

export function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

export function fail(messages) {
  for (const message of messages) {
    process.stderr.write(`${message}\n`);
  }
  process.exitCode = 1;
}
