import path from "node:path";

import {
  validateFiles,
  type ResolveImport,
  type ValidationInput,
} from "@schalkneethling/css-property-type-validator-core";
import {
  ProjectReader,
  resolveCanonicalRoot,
  resolveLocalCssImportPath,
} from "@schalkneethling/css-property-type-validator-project-context";

interface ImportResolverInputs {
  inputs: ValidationInput[];
  knownCustomPropertyInputs?: ValidationInput[];
  registryInputs?: ValidationInput[];
}

export interface StylelintProjectContext {
  projectRoot: string;
  reader: ProjectReader;
}

export interface StylelintContextualInputs {
  context: StylelintProjectContext;
  knownCustomPropertyInputs: ValidationInput[];
  registryInputs: ValidationInput[];
}

export interface StylelintContextCacheOptions {
  maxEntries?: number;
  now?: () => number;
  ttlMs?: number;
}

export interface StylelintContextCacheRequest {
  checkUnknownCustomProperties: boolean;
  projectRoot: string;
  registryPatterns: readonly string[];
  tokenPatterns: readonly string[];
}

interface CachedContextualInputs {
  canonicalRoot: string;
  expiresAt: number;
  inputs: Promise<StylelintContextualInputs>;
  requestedRoot: string;
}

const DEFAULT_CONTEXT_CACHE_TTL_MS = 1_000;
const DEFAULT_CONTEXT_CACHE_MAX_ENTRIES = 32;

function normalizePatterns(projectRoot: string, patterns: readonly string[]): string[] {
  return [...new Set(patterns.map((pattern) => path.resolve(projectRoot, pattern)))].sort(
    (left, right) => (left < right ? -1 : left > right ? 1 : 0),
  );
}

function cacheKey(request: StylelintContextCacheRequest, canonicalRoot: string): string {
  const registryPatterns = normalizePatterns(canonicalRoot, request.registryPatterns);
  const tokenPatterns = request.checkUnknownCustomProperties
    ? normalizePatterns(canonicalRoot, request.tokenPatterns)
    : [];

  return JSON.stringify({
    checkUnknownCustomProperties: request.checkUnknownCustomProperties,
    projectRoot: canonicalRoot,
    registryPatterns,
    tokenPatterns,
  });
}

/**
 * Shares bounded project context only between equivalent Stylelint rule
 * invocations. Entries expire quickly and can be explicitly invalidated by
 * hosts that know a contextual file changed; this is deliberately not a
 * persistent repository cache.
 */
export class StylelintContextCache {
  readonly #entries = new Map<string, CachedContextualInputs>();
  readonly #maxEntries: number;
  readonly #now: () => number;
  readonly #ttlMs: number;

  constructor(options: StylelintContextCacheOptions = {}) {
    this.#maxEntries = options.maxEntries ?? DEFAULT_CONTEXT_CACHE_MAX_ENTRIES;
    this.#now = options.now ?? Date.now;
    this.#ttlMs = options.ttlMs ?? DEFAULT_CONTEXT_CACHE_TTL_MS;
  }

  clear(): void {
    this.#entries.clear();
  }

  async get(request: StylelintContextCacheRequest): Promise<StylelintContextualInputs> {
    const canonicalRoot = await resolveCanonicalRoot(request.projectRoot);
    const key = cacheKey(request, canonicalRoot);
    const now = this.#now();
    const existing = this.#entries.get(key);

    if (existing && existing.expiresAt > now) {
      return existing.inputs;
    }

    const inputs = this.createInputs({
      ...request,
      projectRoot: canonicalRoot,
      registryPatterns: normalizePatterns(canonicalRoot, request.registryPatterns),
      tokenPatterns: normalizePatterns(canonicalRoot, request.tokenPatterns),
    });
    this.#entries.delete(key);
    this.#entries.set(key, {
      canonicalRoot,
      expiresAt: now + this.#ttlMs,
      inputs,
      requestedRoot: path.resolve(request.projectRoot),
    });
    this.trim();

    try {
      return await inputs;
    } catch (error) {
      if (this.#entries.get(key)?.inputs === inputs) {
        this.#entries.delete(key);
      }
      throw error;
    }
  }

  invalidate(projectRoot?: string): void {
    if (!projectRoot) {
      this.clear();
      return;
    }

    const absoluteRoot = path.resolve(projectRoot);
    for (const [key, entry] of this.#entries) {
      if (entry.canonicalRoot === absoluteRoot || entry.requestedRoot === absoluteRoot) {
        this.#entries.delete(key);
      }
    }
  }

  private async createInputs(
    request: StylelintContextCacheRequest,
  ): Promise<StylelintContextualInputs> {
    const context = await createStylelintProjectContext(request.projectRoot);
    const registryInputs = await loadProjectInputs(context, request.registryPatterns);
    const knownCustomPropertyInputs = request.checkUnknownCustomProperties
      ? await loadProjectInputs(context, request.tokenPatterns)
      : [];

    return { context, knownCustomPropertyInputs, registryInputs };
  }

  private trim(): void {
    while (this.#entries.size > this.#maxEntries) {
      const oldest = this.#entries.keys().next().value;
      if (!oldest) return;
      this.#entries.delete(oldest);
    }
  }
}

export const stylelintContextCache = new StylelintContextCache();

/** Explicit invalidation hook for long-lived Stylelint embedding hosts. */
export function invalidateStylelintContextCache(projectRoot?: string): void {
  stylelintContextCache.invalidate(projectRoot);
}

export async function loadCachedStylelintContextualInputs(
  request: StylelintContextCacheRequest,
): Promise<StylelintContextualInputs> {
  return stylelintContextCache.get(request);
}

function resolverKey(specifier: string, fromPath: string): string {
  return `${fromPath}\0${specifier}`;
}

function asValidationInput(file: { content: string; path: string }): ValidationInput {
  return { css: file.content, path: file.path };
}

export async function createStylelintProjectContext(cwd: string): Promise<StylelintProjectContext> {
  return {
    projectRoot: cwd,
    reader: await ProjectReader.create({ root: cwd }),
  };
}

export async function loadProjectInputs(
  context: StylelintProjectContext,
  patterns: readonly string[],
): Promise<ValidationInput[]> {
  const absolutePatterns = patterns.map((pattern) =>
    path.isAbsolute(pattern) ? pattern : path.resolve(context.projectRoot, pattern),
  );
  const inputsByCanonicalPath = new Map<string, ValidationInput>();
  const globPatterns: string[] = [];

  for (const pattern of absolutePatterns) {
    if (path.extname(pattern).toLowerCase() === ".css" && !/[*?[\]{}()!]/u.test(pattern)) {
      const loaded = await context.reader.readCssFile(pattern);
      inputsByCanonicalPath.set(loaded.path, { css: loaded.content, path: pattern });
    } else {
      globPatterns.push(pattern);
    }
  }

  for (const loaded of await context.reader.loadCssInputs(globPatterns)) {
    if (!inputsByCanonicalPath.has(loaded.path)) {
      inputsByCanonicalPath.set(loaded.path, asValidationInput(loaded));
    }
  }

  return [...inputsByCanonicalPath.values()].sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  );
}

/**
 * Core's resolver is synchronous, so collect requested edges first, load them
 * through ProjectReader, and use the resulting cache for final validation.
 */
export async function prepareImportResolver(
  context: StylelintProjectContext,
  resolverInputs: ImportResolverInputs,
): Promise<ResolveImport> {
  const resolved = new Map<string, ValidationInput | null>();
  const discoveryInputs = new Map<string, ValidationInput>();
  for (const input of [
    ...resolverInputs.inputs,
    ...(resolverInputs.registryInputs ?? []),
    ...(resolverInputs.knownCustomPropertyInputs ?? []),
  ]) {
    discoveryInputs.set(input.path, input);
  }

  for (;;) {
    const pending = new Map<string, { fromPath: string; specifier: string }>();
    const resolver: ResolveImport = (specifier, fromPath) => {
      const key = resolverKey(specifier, fromPath);
      if (resolved.has(key)) return resolved.get(key) ?? null;
      pending.set(key, { fromPath, specifier });
      return null;
    };

    validateFiles([...discoveryInputs.values()], {
      resolveImport: resolver,
    });

    if (pending.size === 0) {
      return (specifier, fromPath) => resolved.get(resolverKey(specifier, fromPath)) ?? null;
    }

    for (const [key, request] of [...pending].sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    )) {
      if (resolved.has(key)) continue;
      const resolution = resolveLocalCssImportPath(request.specifier, request.fromPath, {
        projectRoot: context.projectRoot,
      });
      if (resolution.kind === "unsupported") {
        resolved.set(key, null);
        continue;
      }
      try {
        const loaded = await context.reader.readCssFile(resolution.path);
        resolved.set(key, { css: loaded.content, path: resolution.path });
      } catch (error) {
        if (
          error instanceof Error &&
          "code" in error &&
          error.code === "CPTV_CONTEXT_FILE_NOT_FOUND"
        ) {
          resolved.set(key, null);
          continue;
        }
        throw error;
      }
    }
  }
}
