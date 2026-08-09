import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import {
  applyRegistrationPlan,
  createAudit,
  createBaseline,
  createRegistrationPlan,
  evaluateGates,
  formatAudit,
  formatRegistrationPlan,
  formatSarif,
  parseAudit,
  parseBaseline,
  parseDecisions,
  parseRegistrationPlan,
  sha256,
} from "../src/adoption.js";
import { createCliProjectContext } from "../src/project-context.js";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "cptv-cli-adoption-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("AC-CLI-AUDIT-001 deterministic audit contract", () => {
  test("emits identical JSON and provenance-backed stable diagnostics", () => {
    const inputs = [
      {
        css: "@property --brand { inherits: false; initial-value: red; }",
        path: "/project/a.css",
      },
    ];

    const first = createAudit(inputs);
    const second = createAudit(inputs);

    expect(formatAudit(first, "json")).toBe(formatAudit(second, "json"));
    expect(first.diagnostics).toHaveLength(1);
    expect(first.diagnostics[0]).toMatchObject({
      code: "CPTV_REG_002",
      confidence: { level: "high" },
      gating: "gating",
    });
    expect(first.diagnostics[0]?.specReferences[0]?.url).toContain("w3.org/TR/");
    expect(first.diagnostics[0]?.fingerprint).toMatch(/^sha256:[a-f\d]{64}$/u);
    expect(first.analysis.skips.map((skip) => skip.status)).toContain("uncertain");
  });

  test("redacts source-bearing values without removing provenance", () => {
    const audit = createAudit([{ css: ":root { --brand: rgb(1 2 3); }", path: "/project/a.css" }], {
      redactSource: true,
    });

    expect(audit.sourceRedacted).toBe(true);
    expect(audit.analysis.candidates).toEqual([]);
    expect(audit.analysis.inventory.assignments).toEqual([]);
    expect(formatAudit(audit, "json")).not.toContain("rgb(1 2 3)");
  });

  test("fingerprints caller-resolved import content without inventing a resolved edge", () => {
    const audit = createAudit([{ css: '@import "./tokens.css";', path: "/project/a.css" }], {
      fingerprintInputs: [{ css: ":root { --space: 1px; }", path: "/project/tokens.css" }],
    });

    expect(audit.sourceFingerprints.map((fingerprint) => fingerprint.path)).toEqual([
      "/project/a.css",
      "/project/tokens.css",
    ]);
    expect(audit.analysis.inventory.imports).toContainEqual(
      expect.objectContaining({ resolution: "unresolved", specifier: "./tokens.css" }),
    );
    expect(audit.analysis.skips).toContainEqual(
      expect.objectContaining({ code: "CPTV_SKIP_REPOSITORY_CONTEXT_UNAVAILABLE" }),
    );
  });

  test("AC-CLI-DIAGNOSTIC-001 projects canonical core diagnostic fields without reclassification", () => {
    const audit = createAudit([
      { css: "@property --a { inherits: false; }", path: "/project/a.css" },
    ]);
    const coreDiagnostic = audit.analysis.diagnostics[0]!;
    const projected = audit.diagnostics[0]!;

    expect(projected).toMatchObject({
      baselineFingerprint: coreDiagnostic.baselineFingerprint,
      code: coreDiagnostic.id,
      confidence: coreDiagnostic.confidence,
      evidence: coreDiagnostic.evidence,
      fingerprint: coreDiagnostic.baselineFingerprint,
      gating: coreDiagnostic.gating,
      location: coreDiagnostic.location,
      provenance: coreDiagnostic.provenance,
      relatedLocations: coreDiagnostic.relatedLocations,
      suggestedEdits: coreDiagnostic.suggestedEdits,
    });
  });
});

describe("AC-CLI-AUDIT-002 incremental gates and stable exits", () => {
  test("new-only ignores a baselined normative diagnostic and rejects a new one", () => {
    const existing = createAudit([
      { css: "@property --a { inherits: false; }", path: "/project/a.css" },
    ]);
    const baseline = createBaseline(existing);

    expect(evaluateGates(existing, { baseline, newOnly: true }).passed).toBe(true);

    const changed = createAudit([
      { css: "@property --a { inherits: false; }", path: "/project/a.css" },
      { css: "@property --b { inherits: false; }", path: "/project/b.css" },
    ]);
    const gate = evaluateGates(changed, { baseline, newOnly: true });
    expect(gate.passed).toBe(false);
    expect(gate.diagnosticFailures).toHaveLength(1);
  });

  test("keeps an opt-in static unresolved-reference finding non-gating", () => {
    const audit = createAudit(
      [{ css: ".card { color: var(--not-in-inputs); }", path: "/project/a.css" }],
      { checkUnresolvedCustomProperties: true },
    );

    expect(audit.diagnostics[0]).toMatchObject({
      code: "CPTV_USAGE_003",
      confidence: { level: "low" },
      gating: "review-required",
    });
    expect(evaluateGates(audit).passed).toBe(true);
  });

  test("fails a requested coverage threshold when the denominator is unknown", () => {
    const audit = createAudit([{ css: "/* no declarations */", path: "/project/a.css" }]);
    expect(audit.coverage.percentage).toBeNull();
    expect(evaluateGates(audit, { minCoverage: 0.5 }).coverageFailed).toBe(true);
  });
});

describe("AC-CLI-BASELINE-002 baseline recovery and category coverage", () => {
  test("reports stale and new diagnostic fingerprints deterministically", () => {
    const previous = createAudit([
      { css: "@property --old { inherits: false; }", path: "/project/old.css" },
    ]);
    const current = createAudit([
      { css: "@property --new { inherits: false; }", path: "/project/new.css" },
    ]);
    const gate = evaluateGates(current, {
      baseline: createBaseline(previous),
      newOnly: true,
    });

    expect(gate.baseline).toEqual({
      matchedFingerprints: [],
      newFingerprints: [current.diagnostics[0]!.fingerprint],
      staleFingerprints: [previous.diagnostics[0]!.fingerprint],
    });
    expect(gate.diagnosticFailures).toHaveLength(1);
  });

  test("fails only an explicitly requested category coverage regression", () => {
    const previous = createAudit([{ css: ":root { --space: 1px; }", path: "/p/a.css" }]);
    const current = structuredClone(previous);
    previous.analysis.coverage.categories.consumers = { analyzed: 8, skipped: 2, total: 10 };
    current.analysis.coverage.categories.consumers = { analyzed: 7, skipped: 3, total: 10 };
    const baseline = createBaseline(previous);

    expect(evaluateGates(current, { baseline }).coverageRegressions).toEqual([]);
    const gate = evaluateGates(current, { baseline, coverageRegression: true });
    expect(gate.coverageRegressions).toEqual([
      {
        baselinePercentage: 0.8,
        category: "consumers",
        currentPercentage: 0.7,
      },
    ]);
    expect(gate.coverageFailed).toBe(true);
    expect(gate.passed).toBe(false);
  });

  test("gives a recovery action for a legacy baseline without category coverage", () => {
    const audit = createAudit([{ css: ":root { --space: 1px; }", path: "/p/a.css" }]);
    const legacy = parseBaseline({
      diagnosticFingerprints: [],
      kind: "cptv-baseline",
      schemaVersion: "1.0.0",
    });

    expect(() => evaluateGates(audit, { baseline: legacy, coverageRegression: true })).toThrow(
      /regenerate/i,
    );
  });
});

describe("AC-CLI-SARIF-001 SARIF 2.1.0 interoperability", () => {
  test("emits stable rule IDs, regions, provenance, and fingerprints", () => {
    const audit = createAudit([
      { css: "@property --a { inherits: false; }", path: "/project/a.css" },
    ]);
    const sarif = JSON.parse(formatSarif(audit)) as {
      runs: Array<{
        results: Array<Record<string, unknown>>;
        tool: { driver: { rules: Array<Record<string, unknown>> } };
      }>;
      version: string;
    };

    expect(sarif.version).toBe("2.1.0");
    expect(sarif.runs[0]?.tool.driver.rules[0]).toMatchObject({
      id: "CPTV_REG_002",
    });
    expect(sarif.runs[0]?.results[0]).toMatchObject({
      fingerprints: { "cptv/v1": audit.diagnostics[0]?.fingerprint },
      ruleId: "CPTV_REG_002",
    });
  });

  test("AC-CLI-DIAGNOSTIC-001 emits related locations and only safe exact fixes", () => {
    const audit = createAudit([
      {
        css: '@property --a { syntax: "<length>"; inherits: false; initial-value: 0px; }\n.a { --a: red; }',
        path: "/project/a.css",
      },
    ]);
    const diagnostic = audit.diagnostics[0]!;
    diagnostic.suggestedEdits = [
      {
        applicability: "safe",
        endOffset: 93,
        filePath: "/project/a.css",
        replacement: "1px",
        sourceFingerprint: `sha256:${"a".repeat(64)}`,
        startOffset: 90,
      },
      {
        applicability: "review-required",
        endOffset: 93,
        filePath: "/project/a.css",
        replacement: "2px",
        sourceFingerprint: `sha256:${"a".repeat(64)}`,
        startOffset: 90,
      },
    ];
    const result = JSON.parse(formatSarif(audit)).runs[0].results[0];

    expect(result.relatedLocations).toHaveLength(diagnostic.relatedLocations.length);
    expect(result.fixes).toEqual([
      expect.objectContaining({
        artifactChanges: [
          expect.objectContaining({
            artifactLocation: { uri: "/project/a.css" },
            replacements: [expect.objectContaining({ insertedContent: { text: "1px" } })],
          }),
        ],
      }),
    ]);
  });
});

describe("AC-CLI-PLAN-001 explicit review decisions", () => {
  test("does not turn candidate suggestions into implicit descriptor decisions", async () => {
    const root = await temporaryDirectory();
    const source = path.join(root, "tokens.css");
    await writeFile(source, ":root { --space: 1px; }", "utf8");
    const audit = createAudit([{ css: ":root { --space: 1px; }", path: source }]);
    const plan = await createRegistrationPlan(audit, [], "properties.css", root);

    expect(plan.edit).toBeNull();
    expect(plan.registrationPlan.registrations).toHaveLength(0);
    expect(plan.registrationPlan.skips).toContainEqual(
      expect.objectContaining({ code: "CPTV_SKIP_DECISION_REQUIRED" }),
    );

    const incomplete = await createRegistrationPlan(
      audit,
      [
        {
          action: "accept",
          candidateId: audit.analysis.candidates[0]!.id,
          initialValue: "0px",
          syntax: "<length>",
        },
      ],
      "properties.css",
      root,
    );
    expect(incomplete.edit).toBeNull();
    expect(incomplete.registrationPlan.skips).toContainEqual(
      expect.objectContaining({ code: "CPTV_SKIP_DECISION_REQUIRED" }),
    );
  });
});

describe("AC-CLI-PLAN-002 exact, stale-safe application", () => {
  test("creates exactly the reviewed bytes when all sources are unchanged", async () => {
    const root = await temporaryDirectory();
    const source = path.join(root, "tokens.css");
    await writeFile(source, ":root { --space: 1px; }", "utf8");
    const audit = createAudit([{ css: ":root { --space: 1px; }", path: source }]);
    const candidate = audit.analysis.candidates[0]!;
    const plan = await createRegistrationPlan(
      audit,
      [
        {
          action: "accept",
          candidateId: candidate.id,
          inherits: false,
          initialValue: "0px",
          syntax: "<length>",
        },
      ],
      "properties.css",
      root,
    );
    const context = await createCliProjectContext(root);

    const result = await applyRegistrationPlan(context, plan);

    expect(await readFile(result.applied, "utf8")).toBe(plan.edit?.content);
  });

  test("rejects a stale source before creating the target", async () => {
    const root = await temporaryDirectory();
    const source = path.join(root, "tokens.css");
    const target = path.join(root, "properties.css");
    await writeFile(source, ":root { --space: 1px; }", "utf8");
    const audit = createAudit([{ css: ":root { --space: 1px; }", path: source }]);
    const candidate = audit.analysis.candidates[0]!;
    const plan = await createRegistrationPlan(
      audit,
      [
        {
          action: "accept",
          candidateId: candidate.id,
          inherits: false,
          initialValue: "0px",
          syntax: "<length>",
        },
      ],
      target,
      root,
    );
    await writeFile(source, ":root { --space: 2px; }", "utf8");
    const context = await createCliProjectContext(root);

    await expect(applyRegistrationPlan(context, plan)).rejects.toMatchObject({
      code: "CPTV_CLI_STALE_PLAN",
    });
    await expect(readFile(target, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });
});

describe("AC-CLI-CONTRACT-001 closed runtime contracts", () => {
  test("rejects unknown fields and malformed fingerprints at machine-input boundaries", () => {
    const audit = createAudit([{ css: ":root { --space: 1px; }", path: "/project/a.css" }]);

    expect(parseAudit(audit)).toEqual(audit);
    expect(() => parseAudit({ ...audit, unknown: true })).toThrowError(
      expect.objectContaining({ code: "CPTV_CLI_INVALID_AUDIT" }),
    );
    expect(() =>
      parseBaseline({
        diagnosticFingerprints: ["not-a-sha256"],
        kind: "cptv-baseline",
        schemaVersion: "1.0.0",
      }),
    ).toThrowError(expect.objectContaining({ code: "CPTV_CLI_INVALID_BASELINE" }));
    expect(() =>
      parseDecisions({
        decisions: [{ action: "reject", candidateId: "registration:--space", extra: true }],
      }),
    ).toThrowError(expect.objectContaining({ code: "CPTV_CLI_INVALID_DECISIONS" }));
  });

  test("AC-CLI-PLAN-003 rejects duplicate, inconsistent, or newly edited plans", async () => {
    const root = await temporaryDirectory();
    const source = path.join(root, "tokens.css");
    await writeFile(source, ":root { --space: 1px; }", "utf8");
    const audit = createAudit([{ css: ":root { --space: 1px; }", path: source }]);
    const candidate = audit.analysis.candidates[0]!;
    const plan = await createRegistrationPlan(
      audit,
      [
        {
          action: "accept",
          candidateId: candidate.id,
          inherits: false,
          initialValue: "0px",
          syntax: "<length>",
        },
      ],
      "properties.css",
      root,
    );

    expect(plan.reviewedDigest).toMatch(/^sha256:[a-f\d]{64}$/u);
    expect(() => parseRegistrationPlan({ ...plan, patch: `${plan.patch}\n# edited` })).toThrowError(
      expect.objectContaining({ code: "CPTV_CLI_PLAN_DIGEST_MISMATCH" }),
    );
    expect(() =>
      parseRegistrationPlan({
        ...plan,
        decisions: [...plan.decisions, plan.decisions[0]],
      }),
    ).toThrowError(expect.objectContaining({ code: "CPTV_CLI_INVALID_PLAN" }));
    expect(() =>
      parseRegistrationPlan({
        ...plan,
        registrationPlan: { ...plan.registrationPlan, schemaVersion: "9.0.0" },
      }),
    ).toThrowError(expect.objectContaining({ code: "CPTV_CLI_INCOMPATIBLE_PLAN" }));
    expect(() =>
      parseRegistrationPlan({
        ...plan,
        sourceFingerprints: [{ ...plan.sourceFingerprints[0], sha256: "not-a-sha256" }],
      }),
    ).toThrowError(expect.objectContaining({ code: "CPTV_CLI_INVALID_PLAN" }));
    expect(() =>
      parseRegistrationPlan({
        ...plan,
        sourceFingerprints: [...plan.sourceFingerprints, plan.sourceFingerprints[0]],
      }),
    ).toThrowError(expect.objectContaining({ code: "CPTV_CLI_INVALID_PLAN" }));
  });
});

describe("AC-CLI-REPORT-001 published standalone report boundary", () => {
  test("renders self-contained HTML with selectable review outputs", () => {
    const audit = createAudit([{ css: ":root { --space: 1px; }", path: "/project/a.css" }]);
    const html = formatAudit(audit, "html");

    expect(html).toMatch(/^<!doctype html>\n<html\b/u);
    expect(html).toContain('id="cptv-decision-json"');
    expect(html).toContain('id="cptv-patch"');
    expect(html).not.toMatch(/<(?:link|img|script)\b[^>]*(?:src|href)=/iu);
  });
});

describe("AC-CLI-REPORT-002 interactive registration review mapping", () => {
  function reportPayload(html: string): {
    registrationReview: {
      candidates: Array<Record<string, unknown>>;
      schemaVersion: string;
    };
  } {
    const serialized = html.match(
      /<script id="cptv-report-data" type="application\/json">([^<]+)<\/script>/u,
    )?.[1];
    expect(serialized).toBeTruthy();
    return JSON.parse(serialized!) as {
      registrationReview: {
        candidates: Array<Record<string, unknown>>;
        schemaVersion: string;
      };
    };
  }

  test("maps core candidate evidence and explicit controls without a decision default", () => {
    const audit = createAudit([{ css: ":root { --space: 1px; }", path: "/project/tokens.css" }]);
    const html = formatAudit(audit, "html");
    const payload = reportPayload(html);
    const coreCandidate = audit.analysis.candidates[0]!;

    expect(payload.registrationReview.schemaVersion).toBe("cptv-registration-review/v1");
    expect(payload.registrationReview.candidates[0]).toMatchObject({
      confidence: coreCandidate.confidence,
      evidence: coreCandidate.evidence,
      id: coreCandidate.id,
      propertyName: coreCandidate.name,
      requiresInherits: true,
      requiresInitialValue: true,
      specReferences: coreCandidate.specReferences.map((reference) => reference.url),
      syntaxAlternatives: [expect.objectContaining({ syntax: coreCandidate.suggestedSyntax })],
    });
    expect(html).toContain("&quot;decision&quot;: &quot;review&quot;");
    expect(html).not.toContain("&quot;action&quot;: &quot;reject&quot;");
  });

  test("uses a safe template that reproduces explicit core planner output", async () => {
    const root = await temporaryDirectory();
    const source = path.join(root, "tokens.css");
    await writeFile(source, ":root { --space: 1px; }", "utf8");
    const audit = createAudit([{ css: ":root { --space: 1px; }", path: source }]);
    const candidate = audit.analysis.candidates[0]!;
    const plan = await createRegistrationPlan(
      audit,
      [
        {
          action: "accept",
          candidateId: candidate.id,
          inherits: false,
          initialValue: "0px",
          syntax: candidate.suggestedSyntax,
        },
      ],
      "properties.css",
      root,
    );
    const payload = reportPayload(formatRegistrationPlan(plan, "html"));
    const template = String(payload.registrationReview.candidates[0]?.patchTemplate);
    const rendered = template
      .replaceAll("{syntax}", candidate.suggestedSyntax!)
      .replaceAll("{inherits}", "false")
      .replaceAll("{initialValue}", "0px")
      .replaceAll("{initialValueDeclaration}", "initial-value: 0px;");

    expect(rendered).toBe(plan.registrationPlan.registrations[0]?.css);
  });

  test("does not reintroduce redacted observed or suggested initial values", () => {
    const audit = createAudit([{ css: ":root { --space: 17px; }", path: "/project/tokens.css" }], {
      redactSource: true,
    });
    const html = formatAudit(audit, "html");
    const payload = reportPayload(html);

    expect(html).not.toContain("17px");
    expect(payload.registrationReview.candidates).toEqual([]);
  });
});

describe("AC-CLI-PRIVACY-001 deep source redaction", () => {
  test("removes hostile authored sentinels from deterministic JSON and HTML", () => {
    const css = [
      '@property --CPTV_SECRET_NAME { syntax: "<length>"; inherits: false; initial-value: CPTV_SECRET_REGISTRATION; }',
      ":root { --CPTV_SECRET_NAME: CPTV_SECRET_ASSIGNMENT; }",
      ".card { width: var(--CPTV_SECRET_NAME, CPTV_SECRET_FALLBACK); }",
    ].join("\n");
    const input = { css, path: "/accepted/path/tokens.css" };
    const first = createAudit([input], { redactSource: true });
    const second = createAudit([input], { redactSource: true });
    const json = formatAudit(first, "json");
    const html = formatAudit(first, "html");
    const sourceFingerprint = sha256(css);

    expect(json).toBe(formatAudit(second, "json"));
    expect(() => parseAudit(JSON.parse(json))).not.toThrow();
    for (const sentinel of [
      "CPTV_SECRET_NAME",
      "CPTV_SECRET_REGISTRATION",
      "CPTV_SECRET_ASSIGNMENT",
      "CPTV_SECRET_FALLBACK",
      sourceFingerprint,
    ]) {
      expect(json).not.toContain(sentinel);
      expect(html).not.toContain(sentinel);
    }
    expect(first.sourceFingerprints).toEqual([]);
    expect(first.analysis.candidates).toEqual([]);
    expect(first.analysis.inventory).toEqual({
      aliases: [],
      assignments: [],
      consumers: [],
      fallbacks: [],
      imports: [],
      references: [],
      registrationOccurrences: [],
      registrations: [],
    });
    expect(first.diagnostics.every((diagnostic) => diagnostic.evidence.length === 0)).toBe(true);
    expect(first.diagnostics.every((diagnostic) => diagnostic.suggestedEdits.length === 0)).toBe(
      true,
    );
  });
});

describe("AC-CLI-PRIVACY-002 redacted audit consistency", () => {
  test("rejects source fingerprints when an audit declares source redaction", () => {
    const audit = createAudit([{ css: ":root { --space: 1px; }", path: "/project/a.css" }]);

    expect(() => parseAudit({ ...audit, sourceRedacted: true })).toThrowError(
      expect.objectContaining({ code: "CPTV_CLI_INVALID_AUDIT" }),
    );
  });
});
