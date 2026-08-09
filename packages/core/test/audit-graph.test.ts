import { describe, expect, it } from "vitest";

import { analyzeInputs, type AnalyzeInputsOptions, type ValidationInput } from "../src/index.js";

const INPUTS: ValidationInput[] = [
  {
    path: "/repo/main.css",
    css: '@import "./tokens.css";\n.card { color: var(--alias, blue); }',
  },
  {
    path: "/repo/tokens.css",
    css: [
      '@property --base { syntax: "<color>"; inherits: true; initial-value: red; }',
      ":root { --base: red; --alias: var(--base); }",
    ].join("\n"),
  },
];

const GRAPH: AnalyzeInputsOptions = {
  entryPoints: ["/repo/main.css"],
  importEdges: [
    {
      conditional: false,
      fromPath: "/repo/main.css",
      order: 0,
      specifier: "./tokens.css",
      toPath: "/repo/tokens.css",
    },
  ],
};

describe("repository audit graph", () => {
  it("AC-AUDIT-001 inventories exact relationships deterministically per entry point", () => {
    const forward = analyzeInputs(INPUTS, GRAPH);
    const reverse = analyzeInputs([...INPUTS].reverse(), {
      ...GRAPH,
      importEdges: [...(GRAPH.importEdges ?? [])].reverse(),
    });

    expect(reverse).toEqual(forward);
    expect(forward.inventory.registrationOccurrences).toHaveLength(1);
    expect(forward.inventory.assignments.map(({ name, value }) => [name, value])).toEqual([
      ["--alias", "var(--base)"],
      ["--base", "red"],
    ]);
    expect(forward.inventory.aliases).toMatchObject([
      {
        entryPoints: ["/repo/main.css"],
        name: "--alias",
        target: "--base",
      },
    ]);
    expect(forward.inventory.references).toHaveLength(2);
    expect(forward.inventory.fallbacks).toMatchObject([{ value: "blue" }]);
    expect(forward.inventory.consumers).toMatchObject([
      { entryPoints: ["/repo/main.css"], property: "color" },
    ]);
    expect(forward.inventory.imports).toMatchObject([
      { fromPath: "/repo/main.css", specifier: "./tokens.css", toPath: "/repo/tokens.css" },
    ]);

    for (const collection of [
      forward.inventory.registrationOccurrences,
      forward.inventory.assignments,
      forward.inventory.aliases,
      forward.inventory.references,
      forward.inventory.fallbacks,
      forward.inventory.consumers,
    ]) {
      expect(collection.every((entry) => entry.loc !== null)).toBe(true);
    }
  });

  it("AC-AUDIT-002 distinguishes duplicates and selects only a complete stylesheet order", () => {
    const analysis = analyzeInputs(
      [
        {
          path: "/repo/a.css",
          css: [
            '@property --tone { syntax: "<color>"; inherits: true; initial-value: red; }',
            '@property --tone { syntax: "<color>"; inherits: true; initial-value: red; }',
            '@property --space { syntax: "<length>"; inherits: false; initial-value: 0px; }',
            '@property --space { syntax: "<length>"; inherits: true; initial-value: 0px; }',
          ].join("\n"),
        },
      ],
      { entryPoints: ["/repo/a.css"], importEdges: [] },
    );

    expect(analysis.conflicts.map(({ kind, name, ordering }) => [name, kind, ordering])).toEqual([
      ["--space", "conflicting", "source-order-certain"],
      ["--tone", "identical", "source-order-certain"],
    ]);
    expect(
      analysis.conflicts.every((conflict) => conflict.effectiveRegistrationId !== undefined),
    ).toBe(true);

    const uncertain = analyzeInputs([
      {
        path: "/repo/a.css",
        css: '@property --tone { syntax: "<color>"; inherits: true; initial-value: red; }',
      },
      {
        path: "/repo/b.css",
        css: '@property --tone { syntax: "<color>"; inherits: false; initial-value: red; }',
      },
    ]);

    expect(uncertain.conflicts[0]).toMatchObject({
      kind: "conflicting",
      ordering: "repository-order-uncertain",
    });
    expect(uncertain.skips).toContainEqual(
      expect.objectContaining({ code: "CPTV_SKIP_REPOSITORY_ORDER_UNCERTAIN" }),
    );
  });

  it("AC-AUDIT-002 reports exact alias cycles as review-only evidence", () => {
    const analysis = analyzeInputs([
      {
        path: "/repo/tokens.css",
        css: ":root { --a: var(--b); --b: var(--c); --c: var(--a); }",
      },
    ]);

    expect(analysis.aliasCycles).toHaveLength(1);
    expect(analysis.aliasCycles[0]).toMatchObject({
      names: ["--a", "--b", "--c"],
      status: "review-required",
    });
  });

  it("AC-AUDIT-003 exposes balanced coverage categories and missing-graph uncertainty", () => {
    const analysis = analyzeInputs([
      {
        path: "/repo/tokens.css",
        css: ":root { --tone: red; }\n.card { color: var(--tone); background: var(--missing,); }",
      },
    ]);

    for (const category of Object.values(analysis.coverage.categories)) {
      expect(category.total).toBe(category.analyzed + category.skipped);
    }
    expect(analysis.coverage.categories.assignments.total).toBe(1);
    expect(analysis.coverage.categories.references.total).toBe(2);
    expect(analysis.skips).toContainEqual(
      expect.objectContaining({ code: "CPTV_SKIP_REPOSITORY_CONTEXT_UNAVAILABLE" }),
    );
  });
});
