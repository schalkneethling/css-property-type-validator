import { glob } from "node:fs/promises";
import path from "node:path";

import {
  prepareAndReadBoundedTextFile,
  ProjectReadBudget,
  resolveCanonicalRoot,
  type LoadedTextFile,
  type ReadBudgetSnapshot,
} from "./bounded-reader.js";
import { ProjectContextError } from "./errors.js";
import { resolveLocalCssImportPath, type UnsupportedImportReason } from "./imports.js";
import { type ProjectLimits } from "./limits.js";
import { comparePaths } from "./paths.js";

export type CssImportLoadResult =
  | { file: LoadedTextFile; kind: "resolved" }
  | { kind: "not-found"; path: string }
  | { kind: "unsupported"; reason: UnsupportedImportReason };

export interface ProjectReaderOptions {
  limits?: Partial<ProjectLimits>;
  root: string;
  rootRelativeImports?: boolean;
}

export class ProjectReader {
  readonly root: string;
  readonly #budget: ProjectReadBudget;
  readonly #rootRelativeImports: boolean;
  readonly #cache = new Map<string, Promise<LoadedTextFile>>();

  private constructor(root: string, options: ProjectReaderOptions) {
    this.root = root;
    this.#budget = new ProjectReadBudget(options.limits);
    this.#rootRelativeImports = options.rootRelativeImports ?? true;
  }

  static async create(options: ProjectReaderOptions): Promise<ProjectReader> {
    return new ProjectReader(await resolveCanonicalRoot(options.root), options);
  }

  get budget(): ReadBudgetSnapshot {
    return this.#budget.snapshot;
  }

  async readCssFile(filePath: string): Promise<LoadedTextFile> {
    const requestedPath = path.isAbsolute(filePath)
      ? path.normalize(filePath)
      : path.resolve(this.root, filePath);
    const existing = this.#cache.get(requestedPath);
    if (existing) return existing;

    const pending = prepareAndReadBoundedTextFile(requestedPath, this.root, this.#budget);
    this.#cache.set(requestedPath, pending);

    try {
      const loaded = await pending;
      const canonicalExisting = this.#cache.get(loaded.path);
      if (canonicalExisting && canonicalExisting !== pending) {
        this.#cache.delete(requestedPath);
        return canonicalExisting;
      }
      this.#cache.set(loaded.path, Promise.resolve(loaded));
      return loaded;
    } catch (error) {
      this.#cache.delete(requestedPath);
      throw error;
    }
  }

  async loadCssInputs(patterns: readonly string[]): Promise<LoadedTextFile[]> {
    const matchedPaths = new Set<string>();

    for (const pattern of patterns) {
      for await (const matchedPath of glob(pattern, { cwd: this.root })) {
        const absolutePath = path.isAbsolute(matchedPath)
          ? path.normalize(matchedPath)
          : path.resolve(this.root, matchedPath);
        if (path.extname(absolutePath).toLowerCase() === ".css") {
          matchedPaths.add(absolutePath);
        }
      }
    }

    const loadedByCanonicalPath = new Map<string, LoadedTextFile>();
    for (const filePath of [...matchedPaths].sort(comparePaths)) {
      const loaded = await this.readCssFile(filePath);
      loadedByCanonicalPath.set(loaded.path, loaded);
    }

    return [...loadedByCanonicalPath.values()].sort((left, right) =>
      comparePaths(left.path, right.path),
    );
  }

  async loadCssImport(specifier: string, fromPath: string): Promise<CssImportLoadResult> {
    const resolution = resolveLocalCssImportPath(specifier, fromPath, {
      projectRoot: this.root,
      rootRelativeImports: this.#rootRelativeImports,
    });
    if (resolution.kind === "unsupported") return resolution;

    try {
      return { file: await this.readCssFile(resolution.path), kind: "resolved" };
    } catch (error) {
      if (error instanceof ProjectContextError && error.code === "CPTV_CONTEXT_FILE_NOT_FOUND") {
        return { kind: "not-found", path: resolution.path };
      }
      throw error;
    }
  }
}
