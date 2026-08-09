import { describe, expect, it } from "vitest";

import { analyzeInputs, validateFiles } from "../src/index.js";

const COLOR = '@property --color { syntax: "<color>"; inherits: false; initial-value: black; }';
const ACCENT = '@property --accent { syntax: "<color>"; inherits: false; initial-value: blue; }';
const LENGTH = '@property --space { syntax: "<length>"; inherits: false; initial-value: 0px; }';

describe("Phase 5 deeper validation", () => {
  it("AC-DEEP-001 keeps exact registered alias compatibility review-only", () => {
    const compatible = validateFiles([
      {
        path: "/repo/compatible.css",
        css: `${LENGTH}\n@property --gap { syntax: "<length>"; inherits: false; initial-value: 0px; }\n:root { --gap: var(--space); }`,
      },
    ]);
    const incompatible = validateFiles([
      {
        path: "/repo/incompatible.css",
        css: `${COLOR}\n${LENGTH}\n:root { --space: var(--color); }`,
      },
    ]);
    const uncertain = validateFiles([
      {
        path: "/repo/universal.css",
        css: `${LENGTH}\n@property --anything { syntax: "*"; inherits: false; }\n:root { --space: var(--anything); }`,
      },
    ]);

    expect(compatible).toMatchObject({
      diagnostics: [],
      skippedDeclarations: 0,
      validatedDeclarations: 1,
    });
    expect(incompatible.diagnostics).toEqual([
      expect.objectContaining({
        basis: "representative-var-substitution",
        confidence: expect.objectContaining({ level: "medium" }),
        gating: "review-required",
        id: "CPTV_ASSIGN_002",
        provenance: expect.objectContaining({ classification: "tool-policy" }),
      }),
    ]);
    expect(uncertain).toMatchObject({
      diagnostics: [],
      skippedDeclarations: 1,
      validatedDeclarations: 0,
    });
  });

  it("AC-DEEP-002 validates concrete assignment-site fallbacks against the referenced registration", () => {
    const incompatibleCss = `${LENGTH}\n@property --gap { syntax: "<length>"; inherits: false; initial-value: 0px; }\n:root { --gap: var(--space, red); }`;
    const compatible = validateFiles([
      {
        path: "/repo/compatible.css",
        css: `${LENGTH}\n@property --gap { syntax: "<length>"; inherits: false; initial-value: 0px; }\n:root { --gap: var(--space, 1px); }`,
      },
    ]);
    const incompatible = validateFiles([
      {
        path: "/repo/incompatible.css",
        css: incompatibleCss,
      },
    ]);

    expect(compatible).toMatchObject({
      diagnostics: [],
      skippedDeclarations: 0,
      validatedDeclarations: 1,
    });
    expect(incompatible.diagnostics).toEqual([
      expect.objectContaining({
        basis: "direct",
        confidence: expect.objectContaining({ level: "high" }),
        gating: "gating",
        id: "CPTV_USAGE_002",
        propertyName: "--space",
        provenance: expect.objectContaining({ classification: "normative" }),
      }),
    ]);
    expect(incompatible.diagnostics[0]?.location).toMatchObject({
      source: "/repo/incompatible.css",
      start: { offset: incompatibleCss.indexOf("var(--space") },
    });
  });

  it("AC-DEEP-003 proves only acyclic exact same-syntax nested fallback chains", () => {
    const incompatibleLeafCss = `${COLOR}\n${ACCENT}\n.card { color: var(--color, var(--accent, 10px)); }`;
    const compatible = analyzeInputs([
      {
        path: "/repo/compatible.css",
        css: `${COLOR}\n${ACCENT}\n.card { color: var(--color, var(--accent, blue)); }`,
      },
    ]);
    const incompatibleLeaf = analyzeInputs([
      {
        path: "/repo/incompatible.css",
        css: incompatibleLeafCss,
      },
    ]);
    const uncertain = analyzeInputs([
      {
        path: "/repo/uncertain.css",
        css: `${COLOR}\n${LENGTH}\n.card { color: var(--color, var(--space, 1px)); }`,
      },
    ]);

    expect(compatible.diagnostics).toHaveLength(0);
    expect(compatible.skips).not.toContainEqual(
      expect.objectContaining({ code: "CPTV_SKIP_NESTED_FALLBACK_UNPROVEN" }),
    );
    expect(incompatibleLeaf.diagnostics).toEqual([
      expect.objectContaining({ id: "CPTV_USAGE_002", propertyName: "--accent" }),
    ]);
    expect(incompatibleLeaf.diagnostics[0]?.location).toMatchObject({
      source: "/repo/incompatible.css",
      start: { offset: incompatibleLeafCss.indexOf("var(--accent") },
    });
    expect(uncertain.diagnostics).toHaveLength(0);
    expect(uncertain.skips).toContainEqual(
      expect.objectContaining({
        code: "CPTV_SKIP_NESTED_FALLBACK_UNPROVEN",
        subject: "fallbacks",
      }),
    );
  });

  it("AC-DEEP-004 preserves representative consuming-property findings as non-gating", () => {
    const compatible = validateFiles([
      { path: "/repo/compatible.css", css: `${LENGTH}\n.card { width: var(--space); }` },
    ]);
    const incompatible = validateFiles([
      { path: "/repo/incompatible.css", css: `${COLOR}\n.card { width: var(--color); }` },
    ]);
    const uncertain = validateFiles([
      {
        path: "/repo/uncertain.css",
        css: `${COLOR}\n.card { width: var(--color) var(--runtime-value); }`,
      },
    ]);

    expect(compatible.diagnostics).toHaveLength(0);
    expect(incompatible.diagnostics).toEqual([
      expect.objectContaining({
        confidence: expect.objectContaining({ level: "medium" }),
        gating: "review-required",
        id: "CPTV_USAGE_001",
        provenance: expect.objectContaining({ classification: "tool-policy" }),
      }),
    ]);
    expect(uncertain).toMatchObject({
      diagnostics: [],
      skippedDeclarations: 1,
      validatedDeclarations: 0,
    });
  });

  it("AC-DEEP-005 selects a stylesheet winner only for one complete supplied order", () => {
    const css = [
      '@property --tone { syntax: "<color>"; inherits: true; initial-value: red; }',
      '@property --tone { syntax: "<color>"; inherits: false; initial-value: blue; }',
    ].join("\n");
    const complete = analyzeInputs([{ path: "/repo/main.css", css }], {
      entryPoints: ["/repo/main.css"],
      importEdges: [],
    });
    const lastOccurrence = complete.inventory.registrationOccurrences.at(-1);

    expect(complete.conflicts[0]).toMatchObject({
      effectiveEntryPoint: "/repo/main.css",
      effectiveRegistrationId: lastOccurrence?.id,
      ordering: "source-order-certain",
    });

    const imported = analyzeInputs(
      [
        { path: "/repo/main.css", css: '@import "./a.css";\n@import "./b.css";' },
        { path: "/repo/a.css", css: css.split("\n")[0] as string },
        { path: "/repo/b.css", css: css.split("\n")[1] as string },
      ],
      {
        entryPoints: ["/repo/main.css"],
        importEdges: [
          {
            fromPath: "/repo/main.css",
            order: 0,
            specifier: "./a.css",
            toPath: "/repo/a.css",
          },
          {
            fromPath: "/repo/main.css",
            order: 1,
            specifier: "./b.css",
            toPath: "/repo/b.css",
          },
        ],
      },
    );
    expect(imported.conflicts[0]).toMatchObject({
      effectiveEntryPoint: "/repo/main.css",
      effectiveRegistrationId: imported.inventory.registrationOccurrences.find(
        (entry) => entry.filePath === "/repo/b.css",
      )?.id,
    });

    const uncertain = analyzeInputs([
      { path: "/repo/a.css", css: css.split("\n")[0] as string },
      { path: "/repo/b.css", css: css.split("\n")[1] as string },
    ]);
    expect(uncertain.conflicts[0]?.effectiveRegistrationId).toBeUndefined();
    expect(uncertain.skips).toContainEqual(
      expect.objectContaining({ code: "CPTV_SKIP_REPOSITORY_ORDER_UNCERTAIN" }),
    );
  });

  it("AC-DEEP-006 inventories typed-animation opportunities as advisory evidence", () => {
    const complete = analyzeInputs(
      [
        {
          path: "/repo/main.css",
          css: [
            "@keyframes pulse { from { --progress: 0; } to { --progress: 1; } }",
            ".meter { transition-property: --progress; }",
          ].join("\n"),
        },
      ],
      { entryPoints: ["/repo/main.css"], importEdges: [] },
    );

    expect(complete.opportunities.animations).toEqual([
      expect.objectContaining({
        confidence: expect.objectContaining({ level: "medium" }),
        entryPoints: ["/repo/main.css"],
        name: "--progress",
        registrationStatus: "not-observed",
        status: "advisory",
      }),
    ]);
    expect(complete.opportunities.animations[0]?.evidence.map((entry) => entry.kind)).toEqual([
      "keyframes-assignment",
      "keyframes-assignment",
      "transition-property-reference",
    ]);
    expect(complete.opportunities.animations[0]?.specReferences[0]?.url).toContain(
      "#animation-behavior",
    );

    const uncertain = analyzeInputs([
      { path: "/repo/component.css", css: ".meter { transition-property: --progress; }" },
    ]);
    expect(uncertain.opportunities.animations[0]?.registrationStatus).toBe("uncertain");
  });
});
