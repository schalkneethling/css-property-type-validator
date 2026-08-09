import path from "node:path";

import {
  validateFiles,
  type ResolveImport,
  type ValidationInput,
} from "@schalkneethling/css-property-type-validator-core";
import {
  discoverProjectConfig,
  ProjectReader,
  resolveLocalCssImportPath,
  type ProjectConfig,
} from "@schalkneethling/css-property-type-validator-project-context";

interface ImportResolverInputs {
  inputs: ValidationInput[];
  knownCustomPropertyInputs?: ValidationInput[];
  onResolvedEdge?: (edge: { fromPath: string; specifier: string; toPath: string }) => void;
  onResolvedInput?: (input: ValidationInput) => void;
  registryInputs?: ValidationInput[];
}

export interface CliProjectContext {
  config: ProjectConfig | null;
  projectRoot: string;
  reader: ProjectReader;
}

function resolverKey(specifier: string, fromPath: string): string {
  return `${fromPath}\0${specifier}`;
}

function asValidationInput(file: { content: string; path: string }): ValidationInput {
  return { css: file.content, path: file.path };
}

export async function createCliProjectContext(cwd: string): Promise<CliProjectContext> {
  const discovered = await discoverProjectConfig({
    boundaryDirectory: cwd,
    startDirectory: cwd,
  });

  return {
    config: discovered?.config ?? null,
    projectRoot: discovered?.root ?? cwd,
    reader: await ProjectReader.create({
      limits: discovered?.config.limits,
      root: discovered?.root ?? cwd,
    }),
  };
}

export async function loadProjectInputs(
  context: CliProjectContext,
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
    left.path.localeCompare(right.path),
  );
}

/**
 * Core intentionally exposes a synchronous resolver. Discover its requested import
 * edges first, load each edge through ProjectReader, then provide a synchronous
 * cache to the authoritative validation pass.
 *
 * CLI and Stylelint currently keep small package-local adapters. Extracting these
 * is deferred until both consumers demonstrate a stable shared contract.
 */
export async function prepareImportResolver(
  context: CliProjectContext,
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
      left.localeCompare(right),
    )) {
      if (resolved.has(key)) continue;

      const resolution = resolveLocalCssImportPath(request.specifier, request.fromPath, {
        projectRoot: context.projectRoot,
        rootRelativeImports: context.config?.rootRelativeImports,
      });
      if (resolution.kind === "unsupported") {
        resolved.set(key, null);
        continue;
      }
      try {
        const loaded = await context.reader.readCssFile(resolution.path);
        const input = { css: loaded.content, path: resolution.path };
        resolved.set(key, input);
        resolverInputs.onResolvedEdge?.({
          fromPath: request.fromPath,
          specifier: request.specifier,
          toPath: resolution.path,
        });
        resolverInputs.onResolvedInput?.(input);
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
