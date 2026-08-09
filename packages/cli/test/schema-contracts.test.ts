import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

const contractRoot = fileURLToPath(new URL("../../../contracts/", import.meta.url));

const schemas = [
  "analysis-result-v1.schema.json",
  "cli-audit-v1.schema.json",
  "cli-baseline-v1.schema.json",
  "decisions-v1.schema.json",
  "registration-plan-v1.schema.json",
  "cli-registration-plan-v1.schema.json",
  "project-config-v1.schema.json",
] as const;

describe("AC-CLI-CONTRACT-001 canonical Draft 2020-12 schemas", () => {
  test.each(schemas)("publishes a stable closed schema for %s", async (name) => {
    const parsed = JSON.parse(await readFile(new URL(name, `file://${contractRoot}/`), "utf8")) as {
      $id?: string;
      $schema?: string;
      additionalProperties?: boolean;
      type?: string;
    };

    expect(parsed.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(parsed.$id).toBe(
      `https://github.com/schalkneethling/css-property-type-validator/contracts/${name}`,
    );
    expect(parsed.type).toBe("object");
    expect(parsed.additionalProperties).toBe(false);
  });

  test("AC-CLI-BASELINE-002 closes the recovery and coverage fields", async () => {
    const audit = JSON.parse(
      await readFile(new URL("cli-audit-v1.schema.json", `file://${contractRoot}/`), "utf8"),
    ) as {
      properties: Record<string, unknown>;
      required: string[];
    };
    const baseline = JSON.parse(
      await readFile(new URL("cli-baseline-v1.schema.json", `file://${contractRoot}/`), "utf8"),
    ) as { properties: Record<string, unknown> };
    const plan = JSON.parse(
      await readFile(
        new URL("cli-registration-plan-v1.schema.json", `file://${contractRoot}/`),
        "utf8",
      ),
    ) as { properties: Record<string, unknown>; required: string[] };

    expect(audit.required).toContain("gateEvaluation");
    expect(audit.properties).toHaveProperty("gateEvaluation");
    expect(baseline.properties).toHaveProperty("coverageCategories");
    expect(plan.required).toContain("candidates");
    expect(plan.properties).toHaveProperty("candidates");
  });

  test("AC-CLI-PRIVACY-002 forbids fingerprints in a redacted audit", async () => {
    const audit = JSON.parse(
      await readFile(new URL("cli-audit-v1.schema.json", `file://${contractRoot}/`), "utf8"),
    ) as { allOf?: unknown[] };

    expect(audit.allOf).toHaveLength(1);
    expect(audit.allOf?.[0]).toHaveProperty("if.properties.sourceRedacted.const", true);
    expect(audit.allOf?.[0]).toHaveProperty("if.required", ["sourceRedacted"]);
    expect(audit.allOf?.[0]).toHaveProperty("then.properties.sourceFingerprints.maxItems", 0);
  });
});
