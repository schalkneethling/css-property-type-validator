/** JSON values are deliberately used at this boundary so core can evolve independently. */
export type JsonPrimitive = boolean | null | number | string;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export interface JsonObject {
  readonly [key: string]: JsonValue;
}

/**
 * Generic producer data for one possible `@property` registration. This deliberately contains
 * no core AST or validation types: a CLI may serialize its published analysis into this shape
 * while the standalone report stays browser-safe and independently consumable.
 */
export interface RegistrationSyntaxAlternative {
  readonly id: string;
  readonly syntax: string;
  /** Producers, not the report, declare whether this alternative is the universal syntax. */
  readonly isUniversalSyntax?: boolean;
  readonly evidence?: JsonValue;
  readonly confidence?: JsonValue;
  readonly specReferences?: readonly string[];
}

export interface RegistrationReviewCandidate {
  /** Stable producer identifier, preserved verbatim in the exported decision JSON. */
  readonly id: string;
  readonly title?: string;
  readonly propertyName?: string;
  readonly syntaxAlternatives: readonly RegistrationSyntaxAlternative[];
  /** Enables a reviewer to enter a syntax not offered by the producer. */
  readonly allowCustomSyntax?: boolean;
  /** A true value requires the reviewer to make an explicit true/false choice before accepting. */
  readonly requiresInherits?: boolean;
  /** A true value requires an initial value unless the selected alternative is universal. */
  readonly requiresInitialValue?: boolean;
  readonly evidence?: JsonValue;
  readonly confidence?: JsonValue;
  readonly specReferences?: readonly string[];
  /**
   * Optional producer-authored review text. `{syntax}`, `{inherits}`, `{initialValue}`, and
   * `{initialValueDeclaration}` are substituted only for a complete accepted decision; the
   * report never writes a file. The declaration placeholder is empty when the producer-declared
   * selected syntax is universal.
   */
  readonly patchTemplate?: string;
}

export interface StandaloneRegistrationReview {
  readonly schemaVersion: "cptv-registration-review/v1";
  readonly candidates: readonly RegistrationReviewCandidate[];
}

export interface EphemeralPagesContract {
  readonly schemaVersion: string;
  readonly compatibilityVersion: string;
  readonly upstream: {
    readonly repository: string;
    readonly commit: string;
    readonly checkedAt: string;
    readonly sources: readonly {
      readonly path: string;
      readonly blobSha: string;
    }[];
  };
  readonly delivery: {
    readonly httpCsp: string;
    readonly viewerIframeSandbox: string;
    readonly requiredAuthoredElements: readonly string[];
    readonly responseHeaders: Readonly<Record<string, string>>;
    readonly uploadLimits: {
      readonly rawHtmlBytes: number;
      readonly brotliCompressedHtmlBytes: number;
    };
    readonly supportedTtlHours: readonly number[];
  };
}

/**
 * The report package deliberately accepts generic JSON rather than core types. This keeps the
 * browser-safe report surface independent of unpublished core APIs.
 */
export interface StandaloneReportInput {
  readonly title?: string;
  readonly analysis: JsonValue;
  readonly decisionJson?: JsonValue;
  readonly patch?: string;
  /** Optional generic review model; it has no dependency on unpublished core APIs. */
  readonly registrationReview?: StandaloneRegistrationReview;
}

export interface StandaloneReport {
  readonly html: string;
  readonly metaCsp: string;
  readonly rawBytes: number;
  readonly contract: Pick<EphemeralPagesContract, "compatibilityVersion" | "upstream">;
}

export interface ReportContractValidation {
  readonly ok: boolean;
  readonly problems: readonly string[];
  readonly rawBytes: number;
  readonly rawLimitBytes: number;
  /** Present when an upload caller supplies a Brotli measurement. */
  readonly brotliCompressedBytes?: number;
  /** Present with `brotliCompressedBytes`; the limit always comes from the pinned contract. */
  readonly brotliCompressedLimitBytes?: number;
}
