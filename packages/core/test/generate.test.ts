import { describe, expect, it } from "vitest";

import { generatePropertyRegistrations } from "../src/index.js";

describe("generatePropertyRegistrations", () => {
  it("generates conservative property registrations from custom property values", () => {
    const result = generatePropertyRegistrations([
      {
        path: "/tmp/tokens.css",
        css: ":root { --brand-color: rebeccapurple; --space: 1px; }",
      },
    ]);

    expect(result.css).toContain('@property --brand-color {\n  syntax: "<color>";');
    expect(result.css).toContain("@property --space");
    expect(result.css).toContain("inherits: true;");
    expect(result.generatedCount).toBe(2);
    expect(result.diagnostics).toHaveLength(0);
  });

  it("dedupes observed values across multiple inputs", () => {
    const result = generatePropertyRegistrations([
      { path: "/tmp/a.css", css: ":root { --space: 1rem; }" },
      { path: "/tmp/b.css", css: ".card { --space: 1rem; }" },
    ]);

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.observedValues).toEqual(["1rem"]);
    expect(result.candidates[0]?.sources).toEqual(["/tmp/a.css", "/tmp/b.css"]);
  });

  it("leaves existing property rules untouched and reports them as existing", () => {
    const result = generatePropertyRegistrations([
      {
        path: "/tmp/tokens.css",
        css: [
          '@property --brand-color { syntax: "<color>"; inherits: true; initial-value: red; }',
          ":root { --brand-color: blue; }",
        ].join("\n"),
      },
    ]);

    expect(result.css).toBe("");
    expect(result.candidates[0]?.status).toBe("existing");
    expect(result.candidates[0]?.reason).toContain("Existing @property");
  });

  it("reports conflicting values instead of guessing", () => {
    const result = generatePropertyRegistrations([
      { path: "/tmp/tokens.css", css: ":root { --token: 1rem; }\n.card { --token: red; }" },
    ]);

    expect(result.css).toBe("");
    expect(result.candidates[0]?.status).toBe("conflict");
    expect(result.reviewCount).toBe(1);
  });

  it("reports parse failures without stopping other inputs", () => {
    const result = generatePropertyRegistrations([
      { path: "/tmp/broken.css", css: null as unknown as string },
      { path: "/tmp/tokens.css", css: ":root { --brand-color: red; }" },
    ]);

    expect(result.diagnostics[0]?.code).toBe("unparseable-stylesheet");
    expect(result.generatedCount).toBe(1);
  });

  it("does not emit candidates without a computationally independent initial value", () => {
    const result = generatePropertyRegistrations([
      { path: "/tmp/tokens.css", css: ":root { --font-size: 1em; }" },
    ]);

    expect(result.css).toBe("");
    expect(result.candidates[0]?.status).toBe("unsupported");
    expect(result.candidates[0]?.reason).toContain("computationally independent");
  });

  it("resolves exact var() aliases when referenced custom properties are provided", () => {
    const result = generatePropertyRegistrations([
      {
        path: "/tmp/tokens.css",
        css: ":root { --brand-color: red; --border-color: var(--brand-color); }",
      },
    ]);

    const borderColor = result.candidates.find((candidate) => candidate.name === "--border-color");

    expect(borderColor?.status).toBe("generated");
    expect(borderColor?.syntax).toBe("<color>");
    expect(borderColor?.initialValue).toBe("red");
    expect(result.css).toContain("@property --border-color");
  });

  it("reports unresolved exact var() aliases with a concrete review reason", () => {
    const result = generatePropertyRegistrations([
      {
        path: "/tmp/tokens.css",
        css: ":root { --border-color: var(--brand-color); }",
      },
    ]);

    expect(result.css).toBe("");
    expect(result.candidates[0]?.status).toBe("conflict");
    expect(result.candidates[0]?.reason).toContain("Include declarations for --brand-color");
  });

  it("does not treat multi-token var() values as exact aliases", () => {
    const result = generatePropertyRegistrations([
      {
        path: "/tmp/tokens.css",
        css: ":root { --border: var(--brand-color) solid; --brand-color: red; }",
      },
    ]);

    const border = result.candidates.find((candidate) => candidate.name === "--border");

    expect(border?.status).toBe("conflict");
    expect(border?.reason).toContain("do not share one supported syntax");
  });

  it("keeps resolved aliases generated when unrelated aliases are unresolved", () => {
    const result = generatePropertyRegistrations([
      {
        path: "/tmp/tokens.css",
        css: [
          ":root {",
          "  --known: red;",
          "  --known-alias: var(--known);",
          "  --unknown-alias: var(--unknown);",
          "}",
        ].join("\n"),
      },
    ]);

    const knownAlias = result.candidates.find((candidate) => candidate.name === "--known-alias");
    const unknownAlias = result.candidates.find(
      (candidate) => candidate.name === "--unknown-alias",
    );

    expect(knownAlias?.status).toBe("generated");
    expect(knownAlias?.syntax).toBe("<color>");
    expect(knownAlias?.initialValue).toBe("red");
    expect(result.css).toContain("@property --known-alias");
    expect(unknownAlias?.status).toBe("conflict");
    expect(unknownAlias?.reason).toContain("--unknown");
  });
});
