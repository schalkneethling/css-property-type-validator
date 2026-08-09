export type ProjectContextErrorCode =
  | "CPTV_CONTEXT_AGGREGATE_TOO_LARGE"
  | "CPTV_CONTEXT_FILE_CHANGED_DURING_READ"
  | "CPTV_CONTEXT_FILE_COUNT_EXCEEDED"
  | "CPTV_CONTEXT_FILE_NOT_FOUND"
  | "CPTV_CONTEXT_FILE_TOO_LARGE"
  | "CPTV_CONTEXT_INVALID_CONFIG"
  | "CPTV_CONTEXT_INVALID_LIMITS"
  | "CPTV_CONTEXT_INVALID_UTF8"
  | "CPTV_CONTEXT_IO_ERROR"
  | "CPTV_CONTEXT_NOT_REGULAR_FILE"
  | "CPTV_CONTEXT_PATH_OUTSIDE_ROOT";

export class ProjectContextError extends Error {
  readonly code: ProjectContextErrorCode;
  readonly filePath?: string;

  constructor(
    code: ProjectContextErrorCode,
    message: string,
    options: { cause?: unknown; filePath?: string } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "ProjectContextError";
    this.code = code;
    this.filePath = options.filePath;
  }
}

export function isNodeError(error: unknown, code: string): boolean {
  return (
    error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === code
  );
}
