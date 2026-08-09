import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import {
  createCliProjectContext,
  loadProjectInputs,
  prepareImportResolver,
} from "../src/project-context.js";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "cptv-cli-context-"));
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

describe("AC-CLI-PC-001 configured inputs and limits", () => {
  test("loads input paths relative to the bounded JSON configuration", async () => {
    const root = await temporaryDirectory();
    await mkdir(path.join(root, "styles"));
    await writeFile(path.join(root, "styles", "component.css"), ".card { color: red; }", "utf8");
    await writeFile(
      path.join(root, "css-property-type-validator.config.json"),
      JSON.stringify({ inputs: ["styles/*.css"], schemaVersion: 1 }),
      "utf8",
    );

    const context = await createCliProjectContext(root);
    const inputs = await loadProjectInputs(context, context.config?.inputs ?? []);
    const canonicalRoot = await realpath(root);

    expect(inputs).toEqual([
      {
        css: ".card { color: red; }",
        path: path.join(canonicalRoot, "styles", "component.css"),
      },
    ]);
  });

  test("rejects a configured oversized input before returning content", async () => {
    const root = await temporaryDirectory();
    await writeFile(path.join(root, "large.css"), ".card { color: red; }", "utf8");
    await writeFile(
      path.join(root, "css-property-type-validator.config.json"),
      JSON.stringify({
        inputs: ["large.css"],
        limits: { maxFileBytes: 8, maxFiles: 2, maxTotalBytes: 16 },
        schemaVersion: 1,
      }),
      "utf8",
    );

    const context = await createCliProjectContext(root);

    await expect(loadProjectInputs(context, context.config?.inputs ?? [])).rejects.toMatchObject({
      code: "CPTV_CONTEXT_FILE_TOO_LARGE",
    });
  });

  test("rejects an explicit absolute CSS path outside the project root", async () => {
    const root = await temporaryDirectory();
    const outside = await temporaryDirectory();
    const outsideFile = path.join(outside, "outside.css");
    await writeFile(outsideFile, ".outside { color: red; }", "utf8");

    const context = await createCliProjectContext(root);

    await expect(loadProjectInputs(context, [outsideFile])).rejects.toMatchObject({
      code: "CPTV_CONTEXT_PATH_OUTSIDE_ROOT",
    });
  });
});

describe("AC-CLI-PC-002 bounded import closure", () => {
  test("loads transitive local imports through the shared reader", async () => {
    const root = await temporaryDirectory();
    await mkdir(path.join(root, "tokens"));
    await writeFile(path.join(root, "main.css"), '@import "./tokens/a.css";', "utf8");
    await writeFile(path.join(root, "tokens", "a.css"), '@import "./b.css";', "utf8");
    await writeFile(
      path.join(root, "tokens", "b.css"),
      '@property --space { syntax: "<length>"; inherits: false; initial-value: 0px; }',
      "utf8",
    );
    const context = await createCliProjectContext(root);
    const inputs = await loadProjectInputs(context, ["main.css"]);
    const edges: Array<{ fromPath: string; specifier: string; toPath: string }> = [];

    const resolver = await prepareImportResolver(context, {
      inputs,
      onResolvedEdge: (edge) => edges.push(edge),
    });
    const first = resolver("./tokens/a.css", inputs[0]!.path);
    const second = first ? resolver("./b.css", first.path) : null;

    expect(first?.path).toBe(path.join(root, "tokens", "a.css"));
    expect(second?.path).toBe(path.join(root, "tokens", "b.css"));
    expect(edges).toEqual([
      {
        fromPath: path.join(root, "main.css"),
        specifier: "./tokens/a.css",
        toPath: path.join(root, "tokens", "a.css"),
      },
      {
        fromPath: path.join(root, "tokens", "a.css"),
        specifier: "./b.css",
        toPath: path.join(root, "tokens", "b.css"),
      },
    ]);
    expect(context.reader.budget.fileCount).toBe(3);
  });
});
