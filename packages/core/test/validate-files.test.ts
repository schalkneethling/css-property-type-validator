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

function createTestResolver(cssByPath: Record<string, string>) {
  return (specifier: string, fromPath: string) => {
    const resolvedPath = specifier.startsWith("/")
      ? specifier
      : path.posix.resolve(path.posix.dirname(fromPath), specifier);

    return resolvedPath in cssByPath ? { path: resolvedPath, css: cssByPath[resolvedPath] } : null;
  };
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

  it("reports missing inherits descriptors in @property rules", () => {
    const result = runValidation({
      "/tmp/registry.css": '@property --space { syntax: "<length>"; initial-value: 0px; }',
    });

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe("invalid-property-registration");
    expect(result.diagnostics[0]?.message).toContain("missing the required inherits descriptor");
    expect(result.registry).toHaveLength(0);
  });

  it("reports invalid inherits values in @property rules", () => {
    const result = runValidation({
      "/tmp/registry.css":
        '@property --space { syntax: "<length>"; inherits: maybe; initial-value: 0px; }',
    });

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe("invalid-property-registration");
    expect(result.diagnostics[0]?.message).toContain("must set inherits to true or false");
    expect(result.registry).toHaveLength(0);
  });

  it("reports missing initial-value descriptors for non-universal syntax", () => {
    const result = runValidation({
      "/tmp/registry.css": '@property --space { syntax: "<length>"; inherits: false; }',
    });

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe("invalid-property-registration");
    expect(result.diagnostics[0]?.message).toContain("missing the required initial-value descriptor");
    expect(result.registry).toHaveLength(0);
  });

  it('allows omitted initial-value descriptors for syntax "*"', () => {
    const result = runValidation({
      "/tmp/registry.css": '@property --anything { syntax: "*"; inherits: false; }',
    });

    expect(result.diagnostics).toHaveLength(0);
    expect(result.registry).toHaveLength(1);
    expect(result.registry[0]?.syntax).toBe("*");
  });

  it("reports initial-value values that do not match the declared syntax", () => {
    const result = runValidation({
      "/tmp/registry.css":
        '@property --brand-color { syntax: "<color>"; inherits: true; initial-value: 10px; }',
    });

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe("invalid-property-registration");
    expect(result.diagnostics[0]?.message).toContain('does not match its syntax descriptor "<color>"');
    expect(result.registry).toHaveLength(0);
  });

  it("reports non-computationally-independent initial-value units", () => {
    const result = runValidation({
      "/tmp/registry.css":
        '@property --space { syntax: "<length>"; inherits: false; initial-value: 3em; }',
    });

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe("invalid-property-registration");
    expect(result.diagnostics[0]?.message).toContain('uses the relative or context-dependent unit "em"');
    expect(result.registry).toHaveLength(0);
  });

  it("reports initial-value values that use var()", () => {
    const result = runValidation({
      "/tmp/registry.css":
        '@property --space { syntax: "<length>"; inherits: false; initial-value: var(--token); }',
    });

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe("invalid-property-registration");
    expect(result.diagnostics[0]?.message).toContain("uses var()");
    expect(result.registry).toHaveLength(0);
  });

  it("ignores unknown descriptors when the known descriptors are valid", () => {
    const result = runValidation({
      "/tmp/registry.css":
        '@property --space { syntax: "<length>"; inherits: false; initial-value: 0px; design-token-group: spacing; }',
    });

    expect(result.diagnostics).toHaveLength(0);
    expect(result.registry).toHaveLength(1);
    expect(result.registry[0]?.name).toBe("--space");
  });

  it("rejects unsupported syntax component names", () => {
    const result = runValidation({
      "/tmp/registry.css":
        '@property --space { syntax: "<foo>"; inherits: false; initial-value: bar; }',
    });

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe("invalid-property-registration");
    expect(result.diagnostics[0]?.message).toContain('unsupported syntax component name "<foo>"');
    expect(result.registry).toHaveLength(0);
  });

  it("accepts supported pre-multiplied syntax component names", () => {
    const result = runValidation({
      "/tmp/registry.css":
        '@property --transforms { syntax: "<transform-list>"; inherits: false; initial-value: rotate(45deg); }',
    });

    expect(result.diagnostics).toHaveLength(0);
    expect(result.registry).toHaveLength(1);
    expect(result.registry[0]?.syntax).toBe("<transform-list>");
  });

  it("accepts syntax strings that use custom identifiers", () => {
    const result = runValidation({
      "/tmp/registry.css":
        '@property --size-name { syntax: "big | bigger | BIGGER"; inherits: false; initial-value: big; }',
    });

    expect(result.diagnostics).toHaveLength(0);
    expect(result.registry).toHaveLength(1);
    expect(result.registry[0]?.syntax).toBe("big | bigger | BIGGER");
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

  it("keeps the last valid registration when a later registration is invalid", () => {
    const result = runValidation({
      "/tmp/tokens-base.css":
        '@property --surface-token { syntax: "<color>"; inherits: true; initial-value: white; }',
      "/tmp/tokens-theme.css":
        '@property --surface-token { syntax: "<length>"; inherits: false; initial-value: 3em; }',
      "/tmp/component.css": ".card { color: var(--surface-token); }",
    });

    expect(result.registry).toHaveLength(1);
    expect(result.registry[0]?.filePath).toBe("/tmp/tokens-base.css");
    expect(result.registry[0]?.syntax).toBe("<color>");
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe("invalid-property-registration");
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

  it("reports an incompatible fallback value for a registered var() usage", () => {
    const result = runValidation({
      "/tmp/tokens.css": SHARED_REGISTRY,
      "/tmp/component.css": '.card { color: var(--brand-color, 10px); }',
    });

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe("incompatible-var-usage");
    expect(result.diagnostics[0]?.message).toContain("Fallback value in var()");
    expect(result.diagnostics[0]?.message).toContain("--brand-color");
    expect(result.diagnostics[0]?.expectedProperty).toBe("color");
    expect(result.validatedDeclarations).toBe(1);
    expect(result.skippedDeclarations).toBe(0);
  });

  it("reports an incompatible fallback branch within a multi-var() declaration", () => {
    const result = runValidation({
      "/tmp/tokens.css": SHARED_REGISTRY,
      "/tmp/component.css":
        ".card { border: var(--border-width, red) solid var(--brand-color, rebeccapurple); }",
    });

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe("incompatible-var-usage");
    expect(result.diagnostics[0]?.message).toContain("Fallback value in var()");
    expect(result.diagnostics[0]?.message).toContain("--border-width");
    expect(result.diagnostics[0]?.expectedProperty).toBe("border");
    expect(result.validatedDeclarations).toBe(1);
    expect(result.skippedDeclarations).toBe(0);
  });

  it("skips assignment-site fallback validation for now", () => {
    const result = runValidation({
      "/tmp/tokens.css": SHARED_REGISTRY,
      "/tmp/component.css": ':root { --space-md: var(--space-sm, red); }',
    });

    expect(result.diagnostics).toHaveLength(0);
    expect(result.validatedDeclarations).toBe(0);
    expect(result.skippedDeclarations).toBe(1);
  });

  it("skips nested fallback chains until fallback reachability is modeled", () => {
    const result = runValidation({
      "/tmp/tokens.css": SHARED_REGISTRY,
      "/tmp/component.css": '.card { color: var(--brand-color, var(--accent-color, blue)); }',
    });

    expect(result.diagnostics).toHaveLength(0);
    expect(result.validatedDeclarations).toBe(0);
    expect(result.skippedDeclarations).toBe(1);
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
    expect(result.diagnostics[0]?.propertyName).toBe("--brand-color");
    expect(result.diagnostics[0]?.message).toContain("at this var() usage");
    expect(result.validatedDeclarations).toBe(1);
  });

  it("reports possible culprits for ambiguous shorthand-like declarations", () => {
    const result = runValidation({
      "/tmp/registry.css": SHARED_REGISTRY,
      "/tmp/usage.css": ".card { border: var(--brand-color) solid var(--brand-color); }",
    });

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe("incompatible-var-usage");
    expect(result.diagnostics[0]?.expectedProperty).toBe("border");
    expect(result.diagnostics[0]?.message).toContain(
      "One or more var() usages of registered property --brand-color may be incompatible with border",
    );
    expect(result.diagnostics[0]?.message).not.toContain("--brand-color, --brand-color");
    expect(result.diagnostics[0]?.propertyName).toBeUndefined();
    expect(result.diagnostics[0]?.snippet).toBe(
      "border:var(--brand-color) solid var(--brand-color)",
    );
  });

  it("falls back to a declaration-level diagnostic when no single var() removal isolates the mismatch", () => {
    const result = runValidation({
      "/tmp/registry.css":
        '@property --brand-color { syntax: "<color>"; inherits: true; initial-value: transparent; }',
      "/tmp/usage.css": ".card { margin: var(--brand-color) var(--brand-color); }",
    });

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe("incompatible-var-usage");
    expect(result.diagnostics[0]?.expectedProperty).toBe("margin");
    expect(result.diagnostics[0]?.message).toContain(
      "Registered properties --brand-color are jointly incompatible with margin",
    );
    expect(result.diagnostics[0]?.propertyName).toBeUndefined();
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

  it("uses imports from validation inputs when assembling the registry", () => {
    const cssByPath = {
      "/tmp/main.css": '@import "./tokens.css";\n.card { inline-size: var(--space); }',
      "/tmp/tokens.css":
        '@property --space { syntax: "<length>"; inherits: false; initial-value: 0px; }',
    };

    const result = validateFiles(
      [{ path: "/tmp/main.css", css: cssByPath["/tmp/main.css"] }],
      { resolveImport: createTestResolver(cssByPath) },
    );

    expect(result.diagnostics).toHaveLength(0);
    expect(result.registry).toHaveLength(1);
    expect(result.registry[0]?.filePath).toBe("/tmp/tokens.css");
    expect(result.validatedDeclarations).toBe(1);
  });

  it("follows nested imports from registry-only inputs", () => {
    const cssByPath = {
      "/tmp/component.css": ".card { inline-size: var(--space); }",
      "/tmp/registry.css": '@import "./tokens.css";',
      "/tmp/tokens.css":
        '@property --space { syntax: "<length>"; inherits: false; initial-value: 0px; }',
    };

    const result = validateFiles(
      [{ path: "/tmp/component.css", css: cssByPath["/tmp/component.css"] }],
      {
        registryInputs: [{ path: "/tmp/registry.css", css: cssByPath["/tmp/registry.css"] }],
        resolveImport: createTestResolver(cssByPath),
      },
    );

    expect(result.diagnostics).toHaveLength(0);
    expect(result.registry).toHaveLength(1);
    expect(result.registry[0]?.filePath).toBe("/tmp/tokens.css");
    expect(result.validatedDeclarations).toBe(1);
  });

  it("resolves root-relative imports through the resolver policy", () => {
    const cssByPath = {
      "/tmp/main.css": '@import "/tokens/root.css";\n.card { background-image: var(--hero-url); }',
      "/tokens/root.css":
        '@property --hero-url { syntax: "<url>"; inherits: false; initial-value: url("https://example.com/hero.png"); }',
    };

    const result = validateFiles(
      [{ path: "/tmp/main.css", css: cssByPath["/tmp/main.css"] }],
      { resolveImport: createTestResolver(cssByPath) },
    );

    expect(result.diagnostics).toHaveLength(0);
    expect(result.registry[0]?.filePath).toBe("/tokens/root.css");
    expect(result.validatedDeclarations).toBe(1);
  });

  it("treats imported files as registry sources rather than additional validation targets", () => {
    const cssByPath = {
      "/tmp/main.css": '@import "./tokens.css";\n.card { color: var(--brand-color); }',
      "/tmp/tokens.css": [
        '@property --brand-color { syntax: "<color>"; inherits: true; initial-value: transparent; }',
        ".tokens { inline-size: var(--brand-color); }",
      ].join("\n"),
    };

    const result = validateFiles(
      [{ path: "/tmp/main.css", css: cssByPath["/tmp/main.css"] }],
      { resolveImport: createTestResolver(cssByPath) },
    );

    expect(result.diagnostics).toHaveLength(0);
    expect(result.validatedDeclarations).toBe(1);
  });

  it("preserves last-valid-registration-wins precedence across import boundaries", () => {
    const cssByPath = {
      "/tmp/main.css": [
        '@import "./theme.css";',
        '@property --surface-token { syntax: "<length>"; inherits: false; initial-value: 0px; }',
        ".card { color: var(--surface-token); }",
      ].join("\n"),
      "/tmp/theme.css":
        '@property --surface-token { syntax: "<color>"; inherits: true; initial-value: white; }',
    };

    const result = validateFiles(
      [{ path: "/tmp/main.css", css: cssByPath["/tmp/main.css"] }],
      { resolveImport: createTestResolver(cssByPath) },
    );

    expect(result.registry).toHaveLength(1);
    expect(result.registry[0]?.filePath).toBe("/tmp/main.css");
    expect(result.registry[0]?.syntax).toBe("<length>");
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.expectedProperty).toBe("color");
  });

  it("handles cyclic import graphs without infinite recursion or duplicate registry entries", () => {
    const cssByPath = {
      "/tmp/main.css": '@import "./a.css";\n.card { inline-size: var(--space); }',
      "/tmp/a.css": '@import "./b.css";',
      "/tmp/b.css": [
        '@import "./a.css";',
        '@property --space { syntax: "<length>"; inherits: false; initial-value: 0px; }',
      ].join("\n"),
    };

    const result = validateFiles(
      [{ path: "/tmp/main.css", css: cssByPath["/tmp/main.css"] }],
      { resolveImport: createTestResolver(cssByPath) },
    );

    expect(result.diagnostics).toHaveLength(0);
    expect(result.registry).toHaveLength(1);
    expect(result.validatedDeclarations).toBe(1);
  });

  it("skips absolute URL imports when assembling the registry", () => {
    const result = validateFiles(
      [
        {
          path: "/tmp/main.css",
          css: '@import "https://example.com/tokens.css";\n.card { inline-size: var(--space); }',
        },
      ],
      {
        resolveImport: () => {
          throw new Error("remote imports should be skipped before resolution");
        },
      },
    );

    expect(result.diagnostics).toHaveLength(0);
    expect(result.registry).toHaveLength(0);
    expect(result.validatedDeclarations).toBe(0);
  });

  it("skips conditioned imports when assembling the registry", () => {
    const result = validateFiles(
      [
        {
          path: "/tmp/main.css",
          css: '@import "./tokens.css" screen;\n.card { inline-size: var(--space); }',
        },
      ],
      {
        resolveImport: () => {
          throw new Error("conditioned imports should be skipped before resolution");
        },
      },
    );

    expect(result.diagnostics).toHaveLength(0);
    expect(result.registry).toHaveLength(0);
    expect(result.validatedDeclarations).toBe(0);
  });

  it("reports unresolved local imports", () => {
    const result = validateFiles(
      [{ path: "/tmp/main.css", css: '@import "./missing.css";\n.card { color: red; }' }],
      { resolveImport: () => null },
    );

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe("unresolved-import");
    expect(result.diagnostics[0]?.message).toContain("./missing.css");
  });

  it("treats registry-only files as registration sources, not validation targets", () => {
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
      ["packages/cli/dist/cli.js", "fixtures/imports/main.css", "--format", "json"],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );

    expect(cliResult.status).toBe(1);

    const report = JSON.parse(cliResult.stdout) as {
      diagnostics: Array<{
        code: string;
        expectedProperty?: string;
        message: string;
        propertyName?: string;
        snippet?: string;
      }>;
      skippedDeclarations: number;
      validatedDeclarations: number;
    };

    expect(report.diagnostics).toHaveLength(21);
    expect(report.diagnostics.some((diagnostic) => diagnostic.code === "invalid-property-registration")).toBe(
      true,
    );
    expect(report.diagnostics.some((diagnostic) => diagnostic.expectedProperty === "inline-size")).toBe(
      true,
    );
    expect(
      report.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "invalid-property-registration" &&
          diagnostic.propertyName === "--relative-space",
      ),
    ).toBe(true);
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
    expect(
      report.diagnostics.some(
        (diagnostic) =>
          diagnostic.snippet === "border-color:var(--brand-color, 10px)" &&
          diagnostic.message.includes("Fallback value in var()"),
      ),
    ).toBe(true);
    expect(
      report.diagnostics.some(
        (diagnostic) =>
          diagnostic.snippet === "border:var(--brand-color) solid var(--brand-color)" &&
          diagnostic.message.includes("may be incompatible"),
      ),
    ).toBe(true);
    expect(report.skippedDeclarations).toBe(0);
    expect(report.validatedDeclarations).toBe(32);
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

  it("supports explicit registration-only CLI mode", { timeout: 120000 }, () => {
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
        registryPath,
        "--registry-only",
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
    expect(report.validatedDeclarations).toBe(0);
  });

  it("reports invalid registrations in explicit registration-only CLI mode", { timeout: 120000 }, () => {
    const repoRoot = path.resolve(import.meta.dirname, "../../..");
    const fixtureDir = mkdtempSync(path.join(tmpdir(), "css-property-validator-"));
    const registryPath = path.join(fixtureDir, "tokens.css");

    writeFileSync(
      registryPath,
      '@property --bad { syntax: "<color"; inherits: true; initial-value: transparent; }\n',
    );

    const cliResult = spawnSync(
      "node",
      [
        "packages/cli/dist/cli.js",
        registryPath,
        "--registry-only",
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

  it("returns exit code 2 when registration-only patterns do not match", { timeout: 120000 }, () => {
    const repoRoot = path.resolve(import.meta.dirname, "../../..");
    const fixtureDir = mkdtempSync(path.join(tmpdir(), "css-property-validator-"));

    const cliResult = spawnSync(
      "node",
      [
        "packages/cli/dist/cli.js",
        path.join(fixtureDir, "missing-*.css"),
        "--registry-only",
        "--format",
        "json",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );

    expect(cliResult.status).toBe(2);
    expect(cliResult.stderr).toContain(
      "No CSS files matched the registration-only patterns. Pass one or more CSS files or glob patterns to --registry-only.",
    );
  });

  it("returns the normal validation-input error when no validation patterns are provided", { timeout: 120000 }, () => {
    const repoRoot = path.resolve(import.meta.dirname, "../../..");

    const cliResult = spawnSync(
      "node",
      ["packages/cli/dist/cli.js", "--format", "json"],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );

    expect(cliResult.status).toBe(2);
    expect(cliResult.stderr).toContain(
      "No CSS files matched the validation patterns. Files passed via --registry are registration sources only.",
    );
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

  it("follows local imports automatically in CLI mode", { timeout: 120000 }, () => {
    const repoRoot = path.resolve(import.meta.dirname, "../../..");
    const fixtureDir = mkdtempSync(path.join(tmpdir(), "css-property-validator-"));
    const validationPath = path.join(fixtureDir, "component.css");
    const registryPath = path.join(fixtureDir, "tokens.css");

    writeFileSync(validationPath, '@import "./tokens.css";\n.card { inline-size: var(--space); }\n');
    writeFileSync(
      registryPath,
      '@property --space { syntax: "<length>"; inherits: false; initial-value: 0px; }\n',
    );

    const cliResult = spawnSync(
      "node",
      ["packages/cli/dist/cli.js", validationPath, "--format", "json"],
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
    expect(report.registry[0]?.filePath).toBe(registryPath);
    expect(report.validatedDeclarations).toBe(1);
  });

  it("includes unresolved-import diagnostics in CLI output", { timeout: 120000 }, () => {
    const repoRoot = path.resolve(import.meta.dirname, "../../..");
    const fixtureDir = mkdtempSync(path.join(tmpdir(), "css-property-validator-"));
    const validationPath = path.join(fixtureDir, "component.css");

    writeFileSync(validationPath, '@import "./missing.css";\n.card { color: red; }\n');

    const cliResult = spawnSync(
      "node",
      ["packages/cli/dist/cli.js", validationPath, "--format", "json"],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );

    expect(cliResult.status).toBe(1);

    const report = JSON.parse(cliResult.stdout) as {
      diagnostics: Array<{ code: string; message: string }>;
    };

    expect(report.diagnostics).toHaveLength(1);
    expect(report.diagnostics[0]?.code).toBe("unresolved-import");
    expect(report.diagnostics[0]?.message).toContain("./missing.css");
  });
});
