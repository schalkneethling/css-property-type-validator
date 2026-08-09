import { lstat, realpath, stat } from "node:fs/promises";
import path from "node:path";

import { readBoundedTextFile } from "./bounded-reader.js";
import { isNodeError, ProjectContextError } from "./errors.js";
import { resolveProjectLimits, type ProjectLimits } from "./limits.js";
import { isPathWithinRoot } from "./paths.js";

export const DEFAULT_CONFIG_FILE_NAME = "css-property-type-validator.config.json";
export const MAX_CONFIG_BYTES = 1024 * 1024;

export interface ProjectConfig {
  checkUnknownCustomProperties: boolean;
  entryPoints: string[];
  inputs: string[];
  limits: ProjectLimits;
  registry: string[];
  rootRelativeImports: boolean;
  schemaVersion: 1;
  tokens: string[];
}

export interface DiscoveredProjectConfig {
  config: ProjectConfig;
  path: string;
  root: string;
}

const TOP_LEVEL_KEYS = new Set([
  "checkUnknownCustomProperties",
  "entryPoints",
  "inputs",
  "limits",
  "registry",
  "rootRelativeImports",
  "schemaVersion",
  "tokens",
]);
const LIMIT_KEYS = new Set(["maxFileBytes", "maxFiles", "maxTotalBytes"]);

function invalidConfig(message: string, filePath?: string): never {
  throw new ProjectContextError("CPTV_CONTEXT_INVALID_CONFIG", message, { filePath });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown, name: string, filePath?: string): string[] {
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string" || item.trim() === "")
  ) {
    invalidConfig(`${name} must be an array of non-empty strings.`, filePath);
  }
  return [...value];
}

function booleanValue(
  value: unknown,
  name: string,
  defaultValue: boolean,
  filePath?: string,
): boolean {
  if (value === undefined) return defaultValue;
  if (typeof value !== "boolean") invalidConfig(`${name} must be a boolean.`, filePath);
  return value;
}

function limitsValue(value: unknown, filePath?: string): ProjectLimits {
  if (value === undefined) return resolveProjectLimits();
  if (!isRecord(value)) invalidConfig("limits must be an object.", filePath);

  for (const key of Object.keys(value)) {
    if (!LIMIT_KEYS.has(key)) invalidConfig(`Unknown limits key: ${key}.`, filePath);
  }

  try {
    return resolveProjectLimits({
      maxFileBytes: value.maxFileBytes as number | undefined,
      maxFiles: value.maxFiles as number | undefined,
      maxTotalBytes: value.maxTotalBytes as number | undefined,
    });
  } catch (error) {
    if (error instanceof ProjectContextError) {
      invalidConfig(`Invalid limits: ${error.message}`, filePath);
    }
    throw error;
  }
}

export function validateProjectConfig(value: unknown, filePath?: string): ProjectConfig {
  if (!isRecord(value)) invalidConfig("Project configuration must be a JSON object.", filePath);

  for (const key of Object.keys(value)) {
    if (!TOP_LEVEL_KEYS.has(key)) invalidConfig(`Unknown configuration key: ${key}.`, filePath);
  }

  if (value.schemaVersion !== undefined && value.schemaVersion !== 1) {
    invalidConfig("schemaVersion must be 1 when provided.", filePath);
  }

  return {
    checkUnknownCustomProperties: booleanValue(
      value.checkUnknownCustomProperties,
      "checkUnknownCustomProperties",
      false,
      filePath,
    ),
    entryPoints: stringArray(value.entryPoints, "entryPoints", filePath),
    inputs: stringArray(value.inputs, "inputs", filePath),
    limits: limitsValue(value.limits, filePath),
    registry: stringArray(value.registry, "registry", filePath),
    rootRelativeImports: booleanValue(
      value.rootRelativeImports,
      "rootRelativeImports",
      true,
      filePath,
    ),
    schemaVersion: 1,
    tokens: stringArray(value.tokens, "tokens", filePath),
  };
}

async function canonicalDirectory(directory: string, description: string): Promise<string> {
  const absolutePath = path.resolve(directory);
  try {
    const metadata = await stat(absolutePath);
    if (!metadata.isDirectory()) {
      invalidConfig(`${description} is not a directory: ${absolutePath}`, absolutePath);
    }
    return await realpath(absolutePath);
  } catch (error) {
    if (error instanceof ProjectContextError) throw error;
    throw new ProjectContextError(
      isNodeError(error, "ENOENT") ? "CPTV_CONTEXT_FILE_NOT_FOUND" : "CPTV_CONTEXT_IO_ERROR",
      `Unable to inspect ${description.toLowerCase()} ${absolutePath}.`,
      { cause: error, filePath: absolutePath },
    );
  }
}

export async function discoverProjectConfig(options: {
  boundaryDirectory: string;
  fileName?: string;
  startDirectory: string;
}): Promise<DiscoveredProjectConfig | null> {
  const fileName = options.fileName ?? DEFAULT_CONFIG_FILE_NAME;
  if (path.basename(fileName) !== fileName || fileName === "." || fileName === "..") {
    invalidConfig("Configuration fileName must be a plain file name.");
  }

  const [boundary, start] = await Promise.all([
    canonicalDirectory(options.boundaryDirectory, "Configuration boundary"),
    canonicalDirectory(options.startDirectory, "Configuration start directory"),
  ]);

  if (!isPathWithinRoot(boundary, start)) {
    throw new ProjectContextError(
      "CPTV_CONTEXT_PATH_OUTSIDE_ROOT",
      `Configuration start directory is outside the search boundary: ${start}`,
      { filePath: start },
    );
  }

  let directory = start;
  while (isPathWithinRoot(boundary, directory)) {
    const candidate = path.join(directory, fileName);
    try {
      await lstat(candidate);
      const loaded = await readBoundedTextFile(candidate, {
        limits: {
          maxFileBytes: MAX_CONFIG_BYTES,
          maxFiles: 1,
          maxTotalBytes: MAX_CONFIG_BYTES,
        },
        root: boundary,
      });

      let parsed: unknown;
      try {
        parsed = JSON.parse(loaded.content) as unknown;
      } catch (error) {
        throw new ProjectContextError(
          "CPTV_CONTEXT_INVALID_CONFIG",
          `Configuration is not valid JSON: ${loaded.path}`,
          { cause: error, filePath: loaded.path },
        );
      }

      return {
        config: validateProjectConfig(parsed, loaded.path),
        path: loaded.path,
        root: path.dirname(loaded.path),
      };
    } catch (error) {
      if (isNodeError(error, "ENOENT")) {
        // No configuration in this directory; continue toward the boundary.
      } else {
        throw error;
      }
    }

    if (directory === boundary) break;
    const parent = path.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }

  return null;
}
