import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import stylelint from "stylelint";
import { describe, expect, it } from "vitest";

import plugin, { ruleName } from "../src/index.js";

function fixturePath(name: string): string {
  return path.join(mkdtempSync(path.join(tmpdir(), "stylelint-property-validator-")), name);
}

async function lint(
  code: string,
  options?: Record<string, unknown>,
  codeFilename = fixturePath("component.css"),
): Promise<stylelint.LinterResult> {
  return stylelint.lint({
    code,
    codeFilename,
    config: {
      plugins: [plugin],
      rules: {
        [ruleName]: options ? [true, options] : true,
      },
    },
  });
}

function warningTexts(result: stylelint.LinterResult): string[] {
  return result.results.flatMap((entry) => entry.warnings.map((warning) => warning.text));
}

describe(ruleName, () => {
  it("exports the namespaced rule", () => {
    expect(ruleName).toBe("css-property-type-validator/valid-property-types");
    expect(plugin.ruleName).toBe(ruleName);
  });

  it("reports invalid rule options", async () => {
    const result = await lint("a {}", { registryFiles: "tokens.css" });

    expect(result.errored).toBe(true);
    expect(
      warningTexts(result).some((text) => text.includes("registryFiles must be an array")),
    ).toBe(true);
  });

  it("reports invalid @property registrations", async () => {
    const result = await lint('@property --brand-color { syntax: "<color>"; }');

    expect(result.errored).toBe(true);
    expect(warningTexts(result).some((text) => text.includes("inherits descriptor"))).toBe(true);
  });

  it("uses registry files as contextual inputs", async () => {
    const registryPath = fixturePath("tokens.css");
    writeFileSync(
      registryPath,
      '@property --brand-color { syntax: "<color>"; inherits: false; initial-value: red; }',
    );

    const result = await lint("a { --brand-color: 10px; }", {
      registryFiles: [registryPath],
    });

    expect(result.errored).toBe(true);
    expect(warningTexts(result).some((text) => text.includes("--brand-color"))).toBe(true);
  });

  it("reports incompatible var() usage", async () => {
    const result = await lint(
      [
        '@property --brand-color { syntax: "<color>"; inherits: false; initial-value: red; }',
        "a { inline-size: var(--brand-color); }",
      ].join("\n"),
    );

    expect(result.errored).toBe(true);
    expect(warningTexts(result).some((text) => text.includes("inline-size"))).toBe(true);
  });

  it("reports unresolved local imports when the input has a file path", async () => {
    const result = await lint('@import "./missing.css";');

    expect(result.errored).toBe(true);
    expect(
      warningTexts(result).some((text) => text.includes("Could not resolve imported stylesheet")),
    ).toBe(true);
  });

  it("does not check unknown custom properties by default", async () => {
    const result = await lint("a { color: var(--missing-color); }");

    expect(result.errored).toBe(false);
    expect(result.results[0]?.warnings).toHaveLength(0);
  });

  it("reports unknown custom properties when enabled", async () => {
    const result = await lint("a { color: var(--missing-color); }", {
      checkUnknownCustomProperties: true,
    });

    expect(result.errored).toBe(true);
    expect(warningTexts(result).some((text) => text.includes("--missing-color"))).toBe(true);
  });

  it("uses token files to suppress known custom property false positives", async () => {
    const tokenPath = fixturePath("tokens.css");
    writeFileSync(tokenPath, ":root { --brand-color: red; }");

    const result = await lint("a { color: var(--brand-color); }", {
      checkUnknownCustomProperties: true,
      tokenFiles: [tokenPath],
    });

    expect(warningTexts(result).filter((text) => text.includes("--brand-color"))).toHaveLength(0);
  });

  it("uses imports from token files as known custom property inputs", async () => {
    const fixtureDir = mkdtempSync(path.join(tmpdir(), "stylelint-property-validator-"));
    const tokenPath = path.join(fixtureDir, "tokens.css");
    const importedPath = path.join(fixtureDir, "imported.css");
    writeFileSync(tokenPath, '@import "./imported.css";');
    writeFileSync(importedPath, ":root { --brand-color: red; }");

    const result = await lint("a { color: var(--brand-color); }", {
      checkUnknownCustomProperties: true,
      tokenFiles: [tokenPath],
    });

    expect(warningTexts(result).filter((text) => text.includes("--brand-color"))).toHaveLength(0);
  });

  it("warns when unknown custom property checks are enabled without tokenFiles", async () => {
    const result = await lint("a { color: red; }", {
      checkUnknownCustomProperties: true,
    });

    expect(warningTexts(result).some((text) => text.includes("enabled without tokenFiles"))).toBe(
      true,
    );
  });

  it("warns when token files are configured while unknown checks are disabled", async () => {
    const result = await lint("a { color: red; }", {
      tokenFiles: ["tokens.css"],
    });

    expect(warningTexts(result).some((text) => text.includes("tokenFiles are ignored"))).toBe(true);
  });

  it("warns instead of inventing import resolution for inputs without file paths", async () => {
    const result = await stylelint.lint({
      code: '@import "token file.css";\n@import url( "tokens.css" );',
      config: {
        plugins: [plugin],
        rules: {
          [ruleName]: true,
        },
      },
    });

    expect(
      warningTexts(result).some((text) =>
        text.includes("could not resolve local CSS imports because this input has no file path"),
      ),
    ).toBe(true);
    expect(
      warningTexts(result).some((text) => text.includes("Could not resolve imported stylesheet")),
    ).toBe(false);
  });
});
