import { ProjectContextError } from "./errors.js";

export interface ProjectLimits {
  maxFileBytes: number;
  maxFiles: number;
  maxTotalBytes: number;
}

export const DEFAULT_PROJECT_LIMITS: Readonly<ProjectLimits> = Object.freeze({
  maxFileBytes: 5 * 1024 * 1024,
  maxFiles: 10_000,
  maxTotalBytes: 100 * 1024 * 1024,
});

export function resolveProjectLimits(overrides: Partial<ProjectLimits> = {}): ProjectLimits {
  const definedOverrides = Object.fromEntries(
    Object.entries(overrides).filter(([, value]) => value !== undefined),
  ) as Partial<ProjectLimits>;
  const limits = { ...DEFAULT_PROJECT_LIMITS, ...definedOverrides };

  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new ProjectContextError(
        "CPTV_CONTEXT_INVALID_LIMITS",
        `${name} must be a positive safe integer; received ${String(value)}.`,
      );
    }
  }

  if (limits.maxFileBytes > limits.maxTotalBytes) {
    throw new ProjectContextError(
      "CPTV_CONTEXT_INVALID_LIMITS",
      "maxFileBytes cannot exceed maxTotalBytes.",
    );
  }

  return limits;
}
