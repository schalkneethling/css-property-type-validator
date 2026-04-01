import { describe, expect, it } from "vitest";

import { validateFiles } from "../src/index.js";

describe("validateFiles", () => {
  it("accepts a compatible var() usage from a registration in another file", () => {
    const result = validateFiles([
      {
        path: "/tmp/registry.css",
        css: '@property --space { syntax: "<length>"; inherits: false; initial-value: 0px; }',
      },
      {
        path: "/tmp/usage.css",
        css: ".card { width: var(--space); }",
      },
    ]);

    expect(result.diagnostics).toHaveLength(0);
    expect(result.validatedDeclarations).toBe(1);
  });

  it("reports an incompatible var() usage", () => {
    const result = validateFiles([
      {
        path: "/tmp/registry.css",
        css: '@property --brand-color { syntax: "<color>"; inherits: true; initial-value: transparent; }',
      },
      {
        path: "/tmp/usage.css",
        css: ".card { width: var(--brand-color); }",
      },
    ]);

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe("incompatible-var-usage");
    expect(result.diagnostics[0]?.expectedProperty).toBe("width");
  });

  it("ignores unregistered custom properties", () => {
    const result = validateFiles([
      {
        path: "/tmp/usage.css",
        css: ".card { width: var(--space); }",
      },
    ]);

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

  it("skips declarations with multiple var() usages for now", () => {
    const result = validateFiles([
      {
        path: "/tmp/registry.css",
        css: [
          '@property --space { syntax: "<length>"; inherits: false; initial-value: 0px; }',
          '@property --gap { syntax: "<length>"; inherits: false; initial-value: 0px; }',
        ].join("\n"),
      },
      {
        path: "/tmp/usage.css",
        css: ".card { margin: var(--space) var(--gap); }",
      },
    ]);

    expect(result.diagnostics).toHaveLength(0);
    expect(result.skippedDeclarations).toBe(1);
  });
});
