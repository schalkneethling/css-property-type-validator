import type { EphemeralPagesContract } from "./types.js";

const REQUIRED_SERVICE_DIRECTIVES = [
  "default-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
] as const;

function normalizedDirectives(csp: string): Map<string, string> {
  return new Map(
    csp
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [name, ...values] = part.split(/\s+/);
        return [name ?? "", values.join(" ")] as const;
      }),
  );
}

/**
 * Builds a report policy from the pinned service policy. The report intentionally removes every
 * service network allowance while retaining only the inline script/style capability it needs.
 */
export function buildReportMetaCsp(contract: EphemeralPagesContract): string {
  const directives = normalizedDirectives(contract.delivery.httpCsp);

  for (const directive of REQUIRED_SERVICE_DIRECTIVES) {
    const [name, value] = directive.split(/\s+/, 2);
    if (directives.get(name ?? "") !== value) {
      throw new Error(`Ephemeral contract is missing required directive: ${directive}`);
    }
  }

  if (directives.get("sandbox") !== "allow-scripts") {
    throw new Error("Ephemeral contract must sandbox uploaded reports with allow-scripts.");
  }
  if (!directives.get("script-src")?.split(/\s+/).includes("'unsafe-inline'")) {
    throw new Error("Ephemeral contract must explicitly permit the report's inline script.");
  }
  if (!directives.get("style-src")?.split(/\s+/).includes("'unsafe-inline'")) {
    throw new Error("Ephemeral contract must explicitly permit the report's inline styles.");
  }

  return [
    "default-src 'none'",
    "connect-src 'none'",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
    "font-src 'none'",
    "img-src 'none'",
    "media-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
}

export function assertEphemeralContract(contract: EphemeralPagesContract): void {
  if (!contract.upstream.repository.startsWith("https://github.com/")) {
    throw new Error("Ephemeral contract must identify its upstream GitHub repository.");
  }
  if (!/^[a-f0-9]{40}$/i.test(contract.upstream.commit)) {
    throw new Error("Ephemeral contract must pin a full commit SHA.");
  }
  if (
    !contract.delivery.requiredAuthoredElements.some(
      (element) => element === "html" || element === "head",
    )
  ) {
    throw new Error("Ephemeral contract must require a source-authored html or head element.");
  }
  if (
    contract.delivery.uploadLimits.rawHtmlBytes <= 0 ||
    contract.delivery.uploadLimits.brotliCompressedHtmlBytes <= 0
  ) {
    throw new Error("Ephemeral contract must declare positive upload limits.");
  }
  buildReportMetaCsp(contract);
}
