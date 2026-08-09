import { lstat, open, realpath, stat } from "node:fs/promises";
import path from "node:path";

import { isNodeError, ProjectContextError } from "./errors.js";
import { resolveProjectLimits, type ProjectLimits } from "./limits.js";
import { isPathWithinRoot } from "./paths.js";

import type { FileHandle } from "node:fs/promises";

export interface LoadedTextFile {
  byteLength: number;
  content: string;
  path: string;
}

export interface ReadBudgetSnapshot {
  fileCount: number;
  totalBytes: number;
}

interface Reservation {
  byteLength: number;
  path: string;
}

export class ProjectReadBudget {
  readonly limits: ProjectLimits;
  #fileCount = 0;
  #totalBytes = 0;
  #reservedPaths = new Set<string>();

  constructor(limits: Partial<ProjectLimits> = {}) {
    this.limits = resolveProjectLimits(limits);
  }

  get snapshot(): ReadBudgetSnapshot {
    return { fileCount: this.#fileCount, totalBytes: this.#totalBytes };
  }

  reserve(filePath: string, byteLength: number): Reservation | null {
    if (this.#reservedPaths.has(filePath)) return null;

    if (byteLength > this.limits.maxFileBytes) {
      throw new ProjectContextError(
        "CPTV_CONTEXT_FILE_TOO_LARGE",
        `${filePath} is ${byteLength} bytes; the per-file limit is ${this.limits.maxFileBytes} bytes.`,
        { filePath },
      );
    }

    if (this.#fileCount + 1 > this.limits.maxFiles) {
      throw new ProjectContextError(
        "CPTV_CONTEXT_FILE_COUNT_EXCEEDED",
        `Reading ${filePath} would exceed the ${this.limits.maxFiles}-file project limit.`,
        { filePath },
      );
    }

    if (this.#totalBytes + byteLength > this.limits.maxTotalBytes) {
      throw new ProjectContextError(
        "CPTV_CONTEXT_AGGREGATE_TOO_LARGE",
        `Reading ${filePath} would exceed the ${this.limits.maxTotalBytes}-byte project limit.`,
        { filePath },
      );
    }

    this.#reservedPaths.add(filePath);
    this.#fileCount += 1;
    this.#totalBytes += byteLength;
    return { byteLength, path: filePath };
  }

  rollback(reservation: Reservation | null): void {
    if (!reservation || !this.#reservedPaths.delete(reservation.path)) return;
    this.#fileCount -= 1;
    this.#totalBytes -= reservation.byteLength;
  }
}

interface PreparedFile {
  byteLength: number;
  handle: FileHandle;
  path: string;
}

async function canonicalRoot(rootPath: string): Promise<string> {
  const absoluteRoot = path.resolve(rootPath);

  try {
    const rootMetadata = await stat(absoluteRoot);
    if (!rootMetadata.isDirectory()) {
      throw new ProjectContextError(
        "CPTV_CONTEXT_PATH_OUTSIDE_ROOT",
        `Project root is not a directory: ${absoluteRoot}`,
        { filePath: absoluteRoot },
      );
    }
    return await realpath(absoluteRoot);
  } catch (error) {
    if (error instanceof ProjectContextError) throw error;
    throw new ProjectContextError(
      isNodeError(error, "ENOENT") ? "CPTV_CONTEXT_FILE_NOT_FOUND" : "CPTV_CONTEXT_IO_ERROR",
      `Unable to inspect project root ${absoluteRoot}.`,
      { cause: error, filePath: absoluteRoot },
    );
  }
}

export async function resolveCanonicalRoot(rootPath: string): Promise<string> {
  return canonicalRoot(rootPath);
}

async function prepareFile(filePath: string, rootPath: string): Promise<PreparedFile> {
  const absolutePath = path.isAbsolute(filePath)
    ? path.normalize(filePath)
    : path.resolve(rootPath, filePath);

  try {
    // Canonicalize the parent first. This permits platform aliases such as
    // macOS `/var` -> `/private/var` while still rejecting an escaping symlink
    // before opening or allocating the target file.
    const canonicalParent = await realpath(path.dirname(absolutePath));
    const canonicalCandidate = path.join(canonicalParent, path.basename(absolutePath));
    if (!isPathWithinRoot(rootPath, canonicalCandidate)) {
      throw new ProjectContextError(
        "CPTV_CONTEXT_PATH_OUTSIDE_ROOT",
        `File is outside the configured project root: ${absolutePath}`,
        { filePath: absolutePath },
      );
    }

    // lstat is intentionally performed before realpath/open so an absent or special
    // directory entry is rejected before content allocation.
    await lstat(canonicalCandidate);
    const canonicalPath = await realpath(canonicalCandidate);

    if (!isPathWithinRoot(rootPath, canonicalPath)) {
      throw new ProjectContextError(
        "CPTV_CONTEXT_PATH_OUTSIDE_ROOT",
        `File is outside the configured project root: ${absolutePath}`,
        { filePath: absolutePath },
      );
    }

    const handle = await open(canonicalPath, "r");
    try {
      const metadata = await handle.stat();
      if (!metadata.isFile()) {
        throw new ProjectContextError(
          "CPTV_CONTEXT_NOT_REGULAR_FILE",
          `Input is not a regular file: ${canonicalPath}`,
          { filePath: canonicalPath },
        );
      }
      return { byteLength: metadata.size, handle, path: canonicalPath };
    } catch (error) {
      await handle.close();
      throw error;
    }
  } catch (error) {
    if (error instanceof ProjectContextError) throw error;
    throw new ProjectContextError(
      isNodeError(error, "ENOENT") ? "CPTV_CONTEXT_FILE_NOT_FOUND" : "CPTV_CONTEXT_IO_ERROR",
      `Unable to inspect input file ${absolutePath}.`,
      { cause: error, filePath: absolutePath },
    );
  }
}

async function consumePreparedFile(
  prepared: PreparedFile,
  budget: ProjectReadBudget,
): Promise<LoadedTextFile> {
  let reservation: Reservation | null = null;

  try {
    reservation = budget.reserve(prepared.path, prepared.byteLength);
    const buffer = await prepared.handle.readFile();
    const metadataAfterRead = await prepared.handle.stat();

    if (
      buffer.byteLength !== prepared.byteLength ||
      metadataAfterRead.size !== prepared.byteLength
    ) {
      throw new ProjectContextError(
        "CPTV_CONTEXT_FILE_CHANGED_DURING_READ",
        `Input changed while it was being read: ${prepared.path}`,
        { filePath: prepared.path },
      );
    }

    let content: string;
    try {
      content = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch (error) {
      throw new ProjectContextError(
        "CPTV_CONTEXT_INVALID_UTF8",
        `Input is not valid UTF-8: ${prepared.path}`,
        { cause: error, filePath: prepared.path },
      );
    }

    return { byteLength: buffer.byteLength, content, path: prepared.path };
  } catch (error) {
    budget.rollback(reservation);
    throw error;
  } finally {
    await prepared.handle.close();
  }
}

export async function readBoundedTextFile(
  filePath: string,
  options: {
    budget?: ProjectReadBudget;
    limits?: Partial<ProjectLimits>;
    root: string;
  },
): Promise<LoadedTextFile> {
  const rootPath = await canonicalRoot(options.root);
  const budget = options.budget ?? new ProjectReadBudget(options.limits);
  const prepared = await prepareFile(filePath, rootPath);
  return consumePreparedFile(prepared, budget);
}

export async function prepareAndReadBoundedTextFile(
  filePath: string,
  rootPath: string,
  budget: ProjectReadBudget,
): Promise<LoadedTextFile> {
  const prepared = await prepareFile(filePath, rootPath);
  return consumePreparedFile(prepared, budget);
}
