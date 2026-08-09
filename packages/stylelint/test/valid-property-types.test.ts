import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { ProjectReader } from "@schalkneethling/css-property-type-validator-project-context";
import stylelint from "stylelint";
import { afterEach, describe, expect, it, vi } from "vitest";

import plugin, { ruleName } from "../src/index.js";
import { invalidateStylelintContextCache, StylelintContextCache } from "../src/project-context.js";

function fixturePath(name: string): string {
  return path.join(mkdtempSync(path.join(tmpdir(), "stylelint-property-validator-")), name);
}

async function lint(
  code: string,
  options?: Record<string, unknown>,
  codeFilename = fixturePath("component.css"),
  projectRoot = path.dirname(codeFilename),
): Promise<stylelint.LinterResult> {
  vi.spyOn(process, "cwd").mockReturnValue(projectRoot);
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

function fixtureDirectory(): string {
  return mkdtempSync(path.join(tmpdir(), "stylelint-property-validator-"));
}

afterEach(() => {
  invalidateStylelintContextCache();
  vi.restoreAllMocks();
});

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

    const result = await lint(
      "a { --brand-color: 10px; }",
      {
        registryFiles: [registryPath],
      },
      path.join(path.dirname(registryPath), "component.css"),
    );

    expect(result.errored).toBe(true);
    expect(warningTexts(result).some((text) => text.includes("--brand-color"))).toBe(true);
  });

  it("AC-SL-PC-002 resolves the documented registryFiles pattern from the invocation root", async () => {
    const directory = fixtureDirectory();
    const sourcePath = path.join(directory, "src", "components", "card.css");
    const registryPath = path.join(directory, "src", "tokens", "brand.css");
    mkdirSync(path.dirname(sourcePath), { recursive: true });
    mkdirSync(path.dirname(registryPath), { recursive: true });
    writeFileSync(
      registryPath,
      '@property --brand-color { syntax: "<color>"; inherits: false; initial-value: red; }',
    );

    const result = await lint(
      "a { --brand-color: 10px; }",
      { registryFiles: ["src/tokens/**/*.css"] },
      sourcePath,
      directory,
    );

    expect(result.errored).toBe(true);
    expect(warningTexts(result).some((text) => text.includes("--brand-color"))).toBe(true);
  });

  it("AC-SL-PC-001 reports unsafe contextual files without reading them as CSS", async () => {
    const registryDirectory = fixturePath("tokens.css");
    mkdirSync(registryDirectory);

    const result = await lint(
      "a { color: red; }",
      {
        registryFiles: [registryDirectory],
      },
      path.join(path.dirname(registryDirectory), "component.css"),
    );

    expect(result.errored).toBe(true);
    expect(
      warningTexts(result).some((text) => text.includes("CPTV_CONTEXT_NOT_REGULAR_FILE")),
    ).toBe(true);
  });

  it("AC-SL-PC-001 rejects contextual files outside the linted source project root", async () => {
    const registryPath = fixturePath("tokens.css");
    writeFileSync(
      registryPath,
      '@property --brand-color { syntax: "<color>"; inherits: false; initial-value: red; }',
    );

    const result = await lint(
      "a { color: red; }",
      { registryFiles: [registryPath] },
      fixturePath("component.css"),
    );

    expect(result.errored).toBe(true);
    expect(
      warningTexts(result).some((text) => text.includes("CPTV_CONTEXT_PATH_OUTSIDE_ROOT")),
    ).toBe(true);
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

    const result = await lint(
      "a { color: var(--brand-color); }",
      {
        checkUnknownCustomProperties: true,
        tokenFiles: [tokenPath],
      },
      path.join(path.dirname(tokenPath), "component.css"),
    );

    expect(warningTexts(result).filter((text) => text.includes("--brand-color"))).toHaveLength(0);
  });

  it("uses imports from token files as known custom property inputs", async () => {
    const fixtureDir = mkdtempSync(path.join(tmpdir(), "stylelint-property-validator-"));
    const tokenPath = path.join(fixtureDir, "tokens.css");
    const importedPath = path.join(fixtureDir, "imported.css");
    writeFileSync(tokenPath, '@import "./imported.css";');
    writeFileSync(importedPath, ":root { --brand-color: red; }");

    const result = await lint(
      "a { color: var(--brand-color); }",
      {
        checkUnknownCustomProperties: true,
        tokenFiles: [tokenPath],
      },
      path.join(fixtureDir, "component.css"),
    );

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

  it("AC-SL-PC-004 coalesces contextual glob loading for concurrent Stylelint roots", async () => {
    const directory = fixtureDirectory();
    const registryPath = path.join(directory, "tokens.css");
    writeFileSync(
      registryPath,
      '@property --brand-color { syntax: "<color>"; inherits: false; initial-value: red; }',
    );
    const loadCssInputs = vi.spyOn(ProjectReader.prototype, "loadCssInputs");

    const [first, second] = await Promise.all([
      lint(
        "a { --brand-color: 10px; }",
        { registryFiles: ["tokens.css"] },
        path.join(directory, "one.css"),
      ),
      lint(
        "a { --brand-color: 10px; }",
        { registryFiles: ["tokens.css"] },
        path.join(directory, "two.css"),
      ),
    ]);

    expect(loadCssInputs).toHaveBeenCalledTimes(1);
    expect(first.errored).toBe(true);
    expect(second.errored).toBe(true);
  });

  it("AC-SL-PC-004 shares one invocation-root cache across source subdirectories", async () => {
    const directory = fixtureDirectory();
    const registryPath = path.join(directory, "src", "tokens", "brand.css");
    mkdirSync(path.dirname(registryPath), { recursive: true });
    writeFileSync(
      registryPath,
      '@property --brand-color { syntax: "<color>"; inherits: false; initial-value: red; }',
    );
    const loadCssInputs = vi.spyOn(ProjectReader.prototype, "loadCssInputs");
    const options = { registryFiles: ["src/tokens/**/*.css"] };

    const [first, second] = await Promise.all([
      lint(
        "a { --brand-color: 10px; }",
        options,
        path.join(directory, "src", "components", "one.css"),
        directory,
      ),
      lint(
        "a { --brand-color: 10px; }",
        options,
        path.join(directory, "src", "pages", "two.css"),
        directory,
      ),
    ]);

    expect(loadCssInputs).toHaveBeenCalledTimes(1);
    expect(first.errored).toBe(true);
    expect(second.errored).toBe(true);
  });

  it("AC-SL-PC-004 invalidates contextual content before a later lint request", async () => {
    const directory = fixtureDirectory();
    const registryPath = path.join(directory, "tokens.css");
    writeFileSync(
      registryPath,
      '@property --space { syntax: "<color>"; inherits: false; initial-value: red; }',
    );

    const first = await lint(
      "a { --space: 10px; }",
      { registryFiles: ["tokens.css"] },
      path.join(directory, "component.css"),
    );
    expect(first.errored).toBe(true);

    writeFileSync(
      registryPath,
      '@property --space { syntax: "<length>"; inherits: false; initial-value: 0px; }',
    );
    invalidateStylelintContextCache(directory);

    const second = await lint(
      "a { --space: 10px; }",
      { registryFiles: ["tokens.css"] },
      path.join(directory, "component.css"),
    );
    expect(second.errored).toBe(false);
  });

  it("AC-SL-PC-004 expires finite contextual entries instead of retaining them indefinitely", async () => {
    const directory = fixtureDirectory();
    const registryPath = path.join(directory, "tokens.css");
    writeFileSync(
      registryPath,
      '@property --brand-color { syntax: "<color>"; inherits: false; initial-value: red; }',
    );
    let now = 0;
    const cache = new StylelintContextCache({ now: () => now, ttlMs: 10 });
    const loadCssInputs = vi.spyOn(ProjectReader.prototype, "loadCssInputs");
    const request = {
      checkUnknownCustomProperties: false,
      projectRoot: directory,
      registryPatterns: ["tokens.css"],
      tokenPatterns: [],
    };

    await cache.get(request);
    now = 10;
    await cache.get(request);

    expect(loadCssInputs).toHaveBeenCalledTimes(2);
  });

  it("AC-SL-PC-004 does not modify Stylelint-owned CSS while validating it", async () => {
    const directory = fixtureDirectory();
    const sourcePath = path.join(directory, "component.css");
    const source = "a { --brand-color: 10px; }";
    writeFileSync(sourcePath, source);
    writeFileSync(
      path.join(directory, "tokens.css"),
      '@property --brand-color { syntax: "<color>"; inherits: false; initial-value: red; }',
    );

    const result = await lint(source, { registryFiles: ["tokens.css"] }, sourcePath);

    expect(result.errored).toBe(true);
    expect(readFileSync(sourcePath, "utf8")).toBe(source);
  });
});
