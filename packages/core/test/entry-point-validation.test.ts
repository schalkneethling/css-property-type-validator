import { describe, expect, it } from "vitest";

import { analyzeInputs } from "../src/index.js";

const COLOR = '@property --tone { syntax: "<color>"; inherits: false; initial-value: black; }';
const LENGTH = '@property --tone { syntax: "<length>"; inherits: false; initial-value: 0px; }';

describe("entry-point validation isolation", () => {
  it("SC-CONTEXT-001A isolates registrations in independent complete roots", () => {
    const analysis = analyzeInputs(
      [
        {
          path: "/repo/a.css",
          css: `${COLOR}\n:root { --tone: red; }\n.card { color: var(--tone, red); }`,
        },
        { path: "/repo/b.css", css: `${LENGTH}\n:root { --tone: 1px; }` },
      ],
      {
        entryPoints: ["/repo/a.css", "/repo/b.css"],
        importEdges: [],
      },
    );

    expect(analysis.diagnostics).toEqual([]);
    expect(analysis.entryPoints).toEqual([
      expect.objectContaining({ path: "/repo/a.css", status: "complete" }),
      expect.objectContaining({ path: "/repo/b.css", status: "complete" }),
    ]);
  });

  it("SC-CONTEXT-001B validates a connected graph in proven import order", () => {
    const assignmentCss = ":root { --tone: 1px; }";
    const analysis = analyzeInputs(
      [
        {
          path: "/repo/main.css",
          css: '@import "./registration.css";\n@import "./assignment.css";',
        },
        { path: "/repo/registration.css", css: COLOR },
        { path: "/repo/assignment.css", css: assignmentCss },
      ],
      {
        entryPoints: ["/repo/main.css"],
        importEdges: [
          {
            fromPath: "/repo/main.css",
            order: 0,
            specifier: "./registration.css",
            toPath: "/repo/registration.css",
          },
          {
            fromPath: "/repo/main.css",
            order: 1,
            specifier: "./assignment.css",
            toPath: "/repo/assignment.css",
          },
        ],
      },
    );

    expect(analysis.diagnostics).toEqual([
      expect.objectContaining({
        filePath: "/repo/assignment.css",
        gating: "gating",
        id: "CPTV_ASSIGN_001",
        registeredSyntax: "<color>",
      }),
    ]);
    expect(analysis.diagnostics[0]?.relatedLocations).toEqual([
      expect.objectContaining({
        location: expect.objectContaining({ source: "/repo/registration.css" }),
      }),
    ]);
  });

  it("SC-CONTEXT-001C does not gate on a conditional cross-file relationship", () => {
    const analysis = analyzeInputs(
      [
        {
          path: "/repo/main.css",
          css: [
            '@import "./registration.css" supports(display: grid);',
            ":root { --tone: 1px; }",
            ".card { color: var(--tone, 1px); }",
          ].join("\n"),
        },
        { path: "/repo/registration.css", css: COLOR },
      ],
      {
        entryPoints: ["/repo/main.css"],
        importEdges: [
          {
            conditional: true,
            fromPath: "/repo/main.css",
            order: 0,
            specifier: "./registration.css",
            toPath: "/repo/registration.css",
          },
        ],
      },
    );

    expect(analysis.diagnostics.filter((entry) => entry.gating === "gating")).toEqual([]);
    expect(analysis.skips).toContainEqual(
      expect.objectContaining({ code: "CPTV_SKIP_REPOSITORY_CONTEXT_UNAVAILABLE" }),
    );
  });
});
