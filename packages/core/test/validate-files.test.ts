import { spawnSync } from "node:child_process";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { validateFiles } from "../src/index.js";

const SHARED_REGISTRY = [
  '@property --space-sm { syntax: "<length>"; inherits: false; initial-value: 4px; }',
  '@property --space-md { syntax: "<length>"; inherits: false; initial-value: 8px; }',
  '@property --border-width { syntax: "<length>"; inherits: false; initial-value: 1px; }',
  '@property --brand-color { syntax: "<color>"; inherits: true; initial-value: transparent; }',
].join("\n");

function runValidation(cssByPath: Record<string, string>) {
  return validateFiles(
    Object.entries(cssByPath).map(([path, css]) => ({
      path,
      css,
    })),
  );
}

describe("validateFiles", () => {
  it("accepts a compatible var() usage from a registration in another file", () => {
    const result = runValidation({
      "/tmp/registry.css":
        '@property --space { syntax: "<length>"; inherits: false; initial-value: 0px; }',
      "/tmp/usage.css": ".card { inline-size: var(--space); }",
    });

    expect(result.diagnostics).toHaveLength(0);
    expect(result.validatedDeclarations).toBe(1);
  });

  it("reports an incompatible var() usage", () => {
    const result = runValidation({
      "/tmp/registry.css":
        '@property --brand-color { syntax: "<color>"; inherits: true; initial-value: transparent; }',
      "/tmp/usage.css": ".card { inline-size: var(--brand-color); }",
    });

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe("incompatible-var-usage");
    expect(result.diagnostics[0]?.expectedProperty).toBe("inline-size");
  });

  it("ignores unregistered custom properties", () => {
    const result = runValidation({
      "/tmp/usage.css": ".card { inline-size: var(--space); }",
    });

    expect(result.diagnostics).toHaveLength(0);
    expect(result.validatedDeclarations).toBe(0);
  });

  it("reports invalid @property syntax descriptors", () => {
    const result = validateFiles([
      {
        path: "/tmp/registry.css",
        css: '@property --bad { syntax: "<color"; inherits: true; initial-value: transparent; }',
      },
    ]);

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe("invalid-property-registration");
  });

  it("reports missing string-valued syntax descriptors in @property rules", () => {
    const result = runValidation({
      "/tmp/registry.css": "@property --space { inherits: false; initial-value: 0px; }",
    });

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe("invalid-property-registration");
    expect(result.diagnostics[0]?.message).toContain("missing a valid string-valued syntax");
  });

  it("uses the latest collected registration when the same custom property is declared in multiple files", () => {
    const result = runValidation({
      "/tmp/tokens-base.css":
        '@property --surface-token { syntax: "<color>"; inherits: true; initial-value: white; }',
      "/tmp/tokens-theme.css":
        '@property --surface-token { syntax: "<length>"; inherits: false; initial-value: 0px; }',
      "/tmp/component.css": ".card { color: var(--surface-token); }",
    });

    expect(result.registry).toHaveLength(1);
    expect(result.registry[0]?.filePath).toBe("/tmp/tokens-theme.css");
    expect(result.registry[0]?.syntax).toBe("<length>");
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.expectedProperty).toBe("color");
  });

  it("accepts compatible direct assignments to registered custom properties", () => {
    const result = runValidation({
      "/tmp/registry.css":
        '@property --brand-color { syntax: "<color>"; inherits: true; initial-value: transparent; }',
      "/tmp/usage.css": ":root { --brand-color: rebeccapurple; }",
    });

    expect(result.diagnostics).toHaveLength(0);
    expect(result.validatedDeclarations).toBe(1);
  });

  it("reports incompatible direct assignments to registered custom properties", () => {
    const result = runValidation({
      "/tmp/registry.css":
        '@property --brand-color { syntax: "<color>"; inherits: true; initial-value: transparent; }',
      "/tmp/usage.css": ":root { --brand-color: 10px; }",
    });

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe("incompatible-custom-property-assignment");
    expect(result.diagnostics[0]?.propertyName).toBe("--brand-color");
    expect(result.diagnostics[0]?.expectedProperty).toBeUndefined();
    expect(result.validatedDeclarations).toBe(1);
  });

  it("accepts compatible assignment-site var() usage for registered custom properties", () => {
    const result = runValidation({
      "/tmp/registry.css": [
        '@property --brand-color { syntax: "<color>"; inherits: true; initial-value: transparent; }',
        '@property --accent-color { syntax: "<color>"; inherits: true; initial-value: black; }',
      ].join("\n"),
      "/tmp/usage.css": ":root { --accent-color: var(--brand-color); }",
    });

    expect(result.diagnostics).toHaveLength(0);
    expect(result.validatedDeclarations).toBe(1);
  });

  it("reports incompatible assignment-site var() usage for registered custom properties", () => {
    const result = runValidation({
      "/tmp/registry.css": [
        '@property --brand-color { syntax: "<color>"; inherits: true; initial-value: transparent; }',
        '@property --space { syntax: "<length>"; inherits: false; initial-value: 0px; }',
      ].join("\n"),
      "/tmp/usage.css": ":root { --space: var(--brand-color); }",
    });

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe("incompatible-custom-property-assignment");
    expect(result.validatedDeclarations).toBe(1);
  });

  it("skips assignment-site validation when var() references are mixed registered and unregistered", () => {
    const result = runValidation({
      "/tmp/registry.css":
        '@property --space { syntax: "<length>"; inherits: false; initial-value: 0px; }',
      "/tmp/usage.css": ":root { --space: var(--unknown-space); }",
    });

    expect(result.diagnostics).toHaveLength(0);
    expect(result.skippedDeclarations).toBe(1);
    expect(result.validatedDeclarations).toBe(0);
  });

  it("skips whitespace-only assignment-site declarations for the conservative MVP", () => {
    const result = runValidation({
      "/tmp/registry.css":
        '@property --space-toggle { syntax: "<length>"; inherits: false; initial-value: 0px; }',
      "/tmp/usage.css": ":root { --space-toggle: ; }",
    });

    expect(result.diagnostics).toHaveLength(0);
    expect(result.skippedDeclarations).toBe(1);
    expect(result.validatedDeclarations).toBe(0);
  });

  it('accepts direct assignments for registered custom properties using syntax "*"', () => {
    const result = runValidation({
      "/tmp/registry.css":
        '@property --anything { syntax: "*"; inherits: false; initial-value: 0px; }',
      "/tmp/usage.css": ':root { --anything: clamp(1rem, 2vw, 3rem); }',
    });

    expect(result.diagnostics).toHaveLength(0);
    expect(result.validatedDeclarations).toBe(1);
  });

  it("accepts registered var() usages that include fallbacks in realistic component code", () => {
    const result = runValidation({
      "/tmp/tokens.css": SHARED_REGISTRY,
      "/tmp/component.css": [
        ".card {",
        "  color: var(--brand-color, rebeccapurple);",
        "  padding-inline: var(--space-md, 1rem);",
        "}",
      ].join("\n"),
    });

    expect(result.diagnostics).toHaveLength(0);
    expect(result.validatedDeclarations).toBe(2);
  });

  it("accepts compatible declarations with multiple var() usages", () => {
    const result = runValidation({
      "/tmp/registry.css": [
        '@property --space { syntax: "<length>"; inherits: false; initial-value: 0px; }',
        '@property --gap { syntax: "<length>"; inherits: false; initial-value: 0px; }',
      ].join("\n"),
      "/tmp/usage.css": ".card { margin: var(--space) var(--gap); }",
    });

    expect(result.diagnostics).toHaveLength(0);
    expect(result.validatedDeclarations).toBe(1);
    expect(result.skippedDeclarations).toBe(0);
  });

  it("accepts shorthand-like declarations that combine multiple registered custom properties", () => {
    const result = runValidation({
      "/tmp/registry.css": SHARED_REGISTRY,
      "/tmp/usage.css": ".card { border: var(--border-width) solid var(--brand-color); }",
    });

    expect(result.diagnostics).toHaveLength(0);
    expect(result.validatedDeclarations).toBe(1);
    expect(result.skippedDeclarations).toBe(0);
  });

  it("reports incompatible declarations with multiple var() usages", () => {
    const result = runValidation({
      "/tmp/registry.css": [
        '@property --brand-color { syntax: "<color>"; inherits: true; initial-value: transparent; }',
        '@property --space { syntax: "<length>"; inherits: false; initial-value: 0px; }',
      ].join("\n"),
      "/tmp/usage.css": ".card { margin: var(--brand-color) var(--space); }",
    });

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe("incompatible-var-usage");
    expect(result.diagnostics[0]?.expectedProperty).toBe("margin");
    expect(result.validatedDeclarations).toBe(1);
  });

  it("reports incompatible shorthand-like declarations with multiple registered custom properties", () => {
    const result = runValidation({
      "/tmp/registry.css": SHARED_REGISTRY,
      "/tmp/usage.css": ".card { border: var(--brand-color) solid var(--brand-color); }",
    });

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe("incompatible-var-usage");
    expect(result.diagnostics[0]?.expectedProperty).toBe("border");
    expect(result.diagnostics[0]?.message).toContain(
      "Registered properties --brand-color are jointly incompatible with border",
    );
    expect(result.diagnostics[0]?.message).not.toContain("--brand-color, --brand-color");
    expect(result.diagnostics[0]?.snippet).toBe(
      "border:var(--brand-color) solid var(--brand-color)",
    );
  });

  it("accepts repeated use of the same registered custom property in one declaration", () => {
    const result = runValidation({
      "/tmp/registry.css":
        '@property --space { syntax: "<length>"; inherits: false; initial-value: 0px; }',
      "/tmp/usage.css": ".stack { margin-inline: var(--space) var(--space); }",
    });

    expect(result.diagnostics).toHaveLength(0);
    expect(result.validatedDeclarations).toBe(1);
  });

  it("skips mixed registered and unregistered multi-var() declarations", () => {
    const result = runValidation({
      "/tmp/registry.css":
        '@property --space { syntax: "<length>"; inherits: false; initial-value: 0px; }',
      "/tmp/usage.css": ".card { margin: var(--space) var(--unknown-gap); }",
    });

    expect(result.diagnostics).toHaveLength(0);
    expect(result.skippedDeclarations).toBe(1);
  });

  it("skips multi-var() declarations when one var() cannot be fully resolved", () => {
    const result = runValidation({
      "/tmp/registry.css": SHARED_REGISTRY,
      "/tmp/usage.css": ".card { border: var(--border-width) solid var(--missing-color); }",
    });

    expect(result.diagnostics).toHaveLength(0);
    expect(result.skippedDeclarations).toBe(1);
    expect(result.validatedDeclarations).toBe(0);
  });

  it("validates multiple declarations in the same realistic component stylesheet", () => {
    const result = runValidation({
      "/tmp/tokens.css": SHARED_REGISTRY,
      "/tmp/component.css": [
        ".card {",
        "  border: var(--border-width) solid var(--brand-color);",
        "  margin-inline: var(--space-sm) var(--space-md);",
        "  color: var(--brand-color);",
        "}",
      ].join("\n"),
    });

    expect(result.diagnostics).toHaveLength(0);
    expect(result.validatedDeclarations).toBe(3);
    expect(result.skippedDeclarations).toBe(0);
  });

  it("runs the example script as an end-to-end smoke test", { timeout: 120000 }, () => {
    const repoRoot = path.resolve(import.meta.dirname, "../../..");
    const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
    const result = spawnSync(pnpmCommand, ["run", "build"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    expect(result.status).toBe(0);

    const cliResult = spawnSync(
      "node",
      ["packages/cli/dist/cli.js", "example.css", "--format", "json"],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );

    expect(cliResult.status).toBe(1);

    const report = JSON.parse(cliResult.stdout) as {
      diagnostics: Array<{ code: string; expectedProperty?: string; snippet?: string }>;
      skippedDeclarations: number;
      validatedDeclarations: number;
    };

    expect(report.diagnostics).toHaveLength(15);
    expect(
      report.diagnostics.every(
        (diagnostic) =>
          diagnostic.code === "incompatible-var-usage" ||
          diagnostic.code === "incompatible-custom-property-assignment",
      ),
    ).toBe(true);
    expect(report.diagnostics.some((diagnostic) => diagnostic.expectedProperty === "inline-size")).toBe(
      true,
    );
    expect(
      report.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "incompatible-custom-property-assignment" &&
          diagnostic.propertyName === "--brand-color",
      ),
    ).toBe(true);
    expect(
      report.diagnostics.some(
        (diagnostic) => diagnostic.snippet === "border:var(--brand-color) solid var(--brand-color)",
      ),
    ).toBe(true);
    expect(
      report.diagnostics.some(
        (diagnostic) => diagnostic.snippet === "margin-inline:var(--brand-color) var(--radius-lg)",
      ),
    ).toBe(true);
    expect(report.skippedDeclarations).toBe(0);
    expect(report.validatedDeclarations).toBe(33);
  });
});
