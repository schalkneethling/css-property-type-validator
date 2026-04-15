import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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

  it("ignores direct custom property assignments in the current version", () => {
    const result = runValidation({
      "/tmp/registry.css":
        '@property --brand-color { syntax: "<color>"; inherits: true; initial-value: transparent; }',
      "/tmp/usage.css": ":root { --brand-color: 10px; }",
    });

    expect(result.diagnostics).toHaveLength(0);
    expect(result.validatedDeclarations).toBe(0);
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

  it("uses registry-only inputs to validate declarations in the main files", () => {
    const result = validateFiles(
      [{ path: "/tmp/component.css", css: ".card { inline-size: var(--space); }" }],
      {
        registryInputs: [
          {
            path: "/tmp/registry.css",
            css: '@property --space { syntax: "<length>"; inherits: false; initial-value: 0px; }',
          },
        ],
      },
    );

    expect(result.diagnostics).toHaveLength(0);
    expect(result.validatedDeclarations).toBe(1);
    expect(result.registry).toHaveLength(1);
    expect(result.registry[0]?.filePath).toBe("/tmp/registry.css");
  });

  it("ensures that an @property registration from external CSS validates local use", () => {
    const result = validateFiles(
      [{ path: "/tmp/component.css", css: ".card { inline-size: var(--brand-color); }" }],
      {
        registryInputs: [
          {
            path: "/tmp/registry.css",
            css: '@property --brand-color { syntax: "<color>"; inherits: true; initial-value: transparent; }',
          },
        ],
      },
    );

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe("incompatible-var-usage");
    expect(result.diagnostics[0]?.expectedProperty).toBe("inline-size");
    expect(result.validatedDeclarations).toBe(1);
  });

  it("reports invalid registrations from registry-only inputs", () => {
    const result = validateFiles(
      [{ path: "/tmp/component.css", css: ".card { color: var(--unknown-color, red); }" }],
      {
        registryInputs: [
          {
            path: "/tmp/registry.css",
            css: '@property --bad { syntax: "<color"; inherits: true; initial-value: transparent; }',
          },
        ],
      },
    );

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe("invalid-property-registration");
  });

  it("does not validate declarations that only appear in registry-only inputs", () => {
    const result = validateFiles(
      [{ path: "/tmp/component.css", css: ".card { color: var(--brand-color); }" }],
      {
        registryInputs: [
          {
            path: "/tmp/registry.css",
            css: [
              '@property --brand-color { syntax: "<color>"; inherits: true; initial-value: transparent; }',
              ".tokens { inline-size: var(--brand-color); }",
            ].join("\n"),
          },
        ],
      },
    );

    expect(result.diagnostics).toHaveLength(0);
    expect(result.validatedDeclarations).toBe(1);
    expect(result.skippedDeclarations).toBe(0);
  });

  it("does not duplicate diagnostics when a file appears in both validation and registry inputs", () => {
    const sharedInput = {
      path: "/tmp/shared.css",
      css: [
        '@property --brand-color { syntax: "<color>"; inherits: true; initial-value: transparent; }',
        ".card { inline-size: var(--brand-color); }",
      ].join("\n"),
    };

    const result = validateFiles([sharedInput], { registryInputs: [sharedInput] });

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe("incompatible-var-usage");
    expect(result.registry).toHaveLength(1);
    expect(result.validatedDeclarations).toBe(1);
  });

  it("skips compatibility diagnostics for universal-syntax registrations", () => {
    const result = runValidation({
      "/tmp/registry.css": '@property --anything { syntax: "*"; inherits: false; }',
      "/tmp/usage.css": ".card { color: var(--anything); }",
    });

    expect(result.diagnostics).toHaveLength(0);
    expect(result.skippedDeclarations).toBe(1);
    expect(result.validatedDeclarations).toBe(0);
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

    expect(report.diagnostics).toHaveLength(12);
    expect(report.diagnostics.every((diagnostic) => diagnostic.code === "incompatible-var-usage")).toBe(
      true,
    );
    expect(report.diagnostics.some((diagnostic) => diagnostic.expectedProperty === "inline-size")).toBe(
      true,
    );
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
    expect(report.validatedDeclarations).toBe(27);
  });

  it("supports registry-only CLI inputs", { timeout: 120000 }, () => {
    const repoRoot = path.resolve(import.meta.dirname, "../../..");
    const fixtureDir = mkdtempSync(path.join(tmpdir(), "css-property-validator-"));
    const validationPath = path.join(fixtureDir, "component.css");
    const registryPath = path.join(fixtureDir, "tokens.css");

    writeFileSync(validationPath, ".card { inline-size: var(--space); }\n");
    writeFileSync(
      registryPath,
      '@property --space { syntax: "<length>"; inherits: false; initial-value: 0px; }\n',
    );

    const cliResult = spawnSync(
      "node",
      [
        "packages/cli/dist/cli.js",
        validationPath,
        "--registry",
        registryPath,
        "--format",
        "json",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );

    expect(cliResult.status).toBe(0);

    const report = JSON.parse(cliResult.stdout) as {
      diagnostics: Array<{ code: string }>;
      registry: Array<{ filePath: string }>;
      validatedDeclarations: number;
    };

    expect(report.diagnostics).toHaveLength(0);
    expect(report.registry).toHaveLength(1);
    expect(report.registry[0]?.filePath).toBe(registryPath);
    expect(report.validatedDeclarations).toBe(1);
  });

  it("returns exit code 2 when only registry inputs match", { timeout: 120000 }, () => {
    const repoRoot = path.resolve(import.meta.dirname, "../../..");
    const fixtureDir = mkdtempSync(path.join(tmpdir(), "css-property-validator-"));
    const registryPath = path.join(fixtureDir, "tokens.css");

    writeFileSync(
      registryPath,
      '@property --space { syntax: "<length>"; inherits: false; initial-value: 0px; }\n',
    );

    const cliResult = spawnSync(
      "node",
      [
        "packages/cli/dist/cli.js",
        path.join(fixtureDir, "missing-*.css"),
        "--registry",
        registryPath,
        "--format",
        "json",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );

    expect(cliResult.status).toBe(2);
    expect(cliResult.stderr).toContain("No CSS files matched the provided patterns.");
  });

  it("includes registry-only diagnostics in CLI json output", { timeout: 120000 }, () => {
    const repoRoot = path.resolve(import.meta.dirname, "../../..");
    const fixtureDir = mkdtempSync(path.join(tmpdir(), "css-property-validator-"));
    const validationPath = path.join(fixtureDir, "component.css");
    const registryPath = path.join(fixtureDir, "tokens.css");

    writeFileSync(validationPath, ".card { color: var(--unknown-color, red); }\n");
    writeFileSync(
      registryPath,
      '@property --bad { syntax: "<color"; inherits: true; initial-value: transparent; }\n',
    );

    const cliResult = spawnSync(
      "node",
      [
        "packages/cli/dist/cli.js",
        validationPath,
        "--registry",
        registryPath,
        "--format",
        "json",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );

    expect(cliResult.status).toBe(1);

    const report = JSON.parse(cliResult.stdout) as {
      diagnostics: Array<{ code: string; filePath: string }>;
      validatedDeclarations: number;
    };

    expect(report.diagnostics).toHaveLength(1);
    expect(report.diagnostics[0]?.code).toBe("invalid-property-registration");
    expect(report.diagnostics[0]?.filePath).toBe(registryPath);
    expect(report.validatedDeclarations).toBe(0);
  });
});
