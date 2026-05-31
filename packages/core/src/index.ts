export { validateFiles } from "./validate.js";
export type { ValidateFilesOptions } from "./validate.js";
export { generatePropertyRegistrations } from "./generate.js";
export type {
  GeneratedPropertyCandidate,
  GeneratedPropertyStatus,
  GeneratePropertyRegistrationsResult,
} from "./generate.js";
export { formatValidationResult } from "./formatter.js";
export type { OutputFormat } from "./formatter.js";
export { isAbsoluteImportUrl } from "./imports.js";

export type {
  RegisteredProperty,
  ResolveImport,
  SourceLocation,
  SourcePosition,
  ValidationDiagnostic,
  ValidationInput,
  ValidationResult,
} from "./types.js";
