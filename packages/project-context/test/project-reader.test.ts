import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { ProjectReader } from "../src/index.js";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "cptv-project-context-"));
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

describe("AC-PC-003 deterministic glob loading", () => {
  test("deduplicates overlapping CSS matches, excludes non-CSS files, and sorts paths", async () => {
    const root = await temporaryDirectory();
    await mkdir(path.join(root, "nested"));
    await writeFile(path.join(root, "z.css"), "z", "utf8");
    await writeFile(path.join(root, "nested", "a.css"), "a", "utf8");
    await writeFile(path.join(root, "nested", "ignored.txt"), "ignored", "utf8");
    const reader = await ProjectReader.create({ root });

    const loaded = await reader.loadCssInputs(["**/*", "nested/*.css"]);

    expect(loaded.map((input) => path.relative(reader.root, input.path))).toEqual([
      path.join("nested", "a.css"),
      "z.css",
    ]);
    expect(reader.budget.fileCount).toBe(2);
  });
});

describe("AC-PC-004 conservative local import resolution", () => {
  test("loads relative and root-relative CSS imports through the shared reader", async () => {
    const root = await temporaryDirectory();
    await mkdir(path.join(root, "components"));
    await mkdir(path.join(root, "tokens"));
    const importer = path.join(root, "components", "button.css");
    await writeFile(importer, "@import '../tokens/colors.css';", "utf8");
    await writeFile(path.join(root, "tokens", "colors.css"), ":root {}", "utf8");
    const reader = await ProjectReader.create({ root });

    const relative = await reader.loadCssImport("../tokens/colors.css", importer);
    const rootRelative = await reader.loadCssImport("/tokens/colors.css", importer);

    expect(relative.kind).toBe("resolved");
    expect(rootRelative.kind).toBe("resolved");
    expect(reader.budget.fileCount).toBe(1);
  });

  test.each([
    ["https://example.com/styles.css", "remote"],
    ["//example.com/styles.css", "remote"],
    ["#theme", "fragment"],
    ["tokens.json", "non-css"],
  ])("reports unsupported import %s as %s", async (specifier, reason) => {
    const root = await temporaryDirectory();
    const reader = await ProjectReader.create({ root });

    await expect(reader.loadCssImport(specifier, path.join(root, "main.css"))).resolves.toEqual({
      kind: "unsupported",
      reason,
    });
  });

  test("reports missing local imports but rejects paths escaping the root", async () => {
    const root = await temporaryDirectory();
    const reader = await ProjectReader.create({ root });
    const importer = path.join(root, "main.css");

    await expect(reader.loadCssImport("missing.css", importer)).resolves.toMatchObject({
      kind: "not-found",
    });
    await expect(reader.loadCssImport("../outside.css", importer)).rejects.toMatchObject({
      code: "CPTV_CONTEXT_PATH_OUTSIDE_ROOT",
    });
  });

  test("does not resolve root-relative imports when the project disables them", async () => {
    const root = await temporaryDirectory();
    const reader = await ProjectReader.create({ root, rootRelativeImports: false });

    await expect(
      reader.loadCssImport("/tokens/colors.css", path.join(root, "main.css")),
    ).resolves.toEqual({ kind: "unsupported", reason: "root-relative-disabled" });
  });
});
