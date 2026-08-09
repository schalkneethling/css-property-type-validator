import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import {
  DEFAULT_CONFIG_FILE_NAME,
  MAX_CONFIG_BYTES,
  discoverProjectConfig,
  validateProjectConfig,
} from "../src/index.js";

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

describe("AC-PC-005 JSON config discovery and validation", () => {
  test("discovers and validates the nearest configuration within the boundary", async () => {
    const root = await temporaryDirectory();
    const nested = path.join(root, "packages", "site", "src");
    const nearerRoot = path.join(root, "packages", "site");
    await mkdir(nested, { recursive: true });
    await writeFile(path.join(root, DEFAULT_CONFIG_FILE_NAME), '{"inputs":["root.css"]}');
    await writeFile(
      path.join(nearerRoot, DEFAULT_CONFIG_FILE_NAME),
      '{"schemaVersion":1,"inputs":["src/**/*.css"],"limits":{"maxFiles":25}}',
    );

    const discovered = await discoverProjectConfig({
      boundaryDirectory: root,
      startDirectory: nested,
    });
    const canonicalNearerRoot = await realpath(nearerRoot);

    expect(discovered).toMatchObject({
      config: {
        inputs: ["src/**/*.css"],
        limits: { maxFiles: 25 },
        schemaVersion: 1,
      },
      path: path.join(canonicalNearerRoot, DEFAULT_CONFIG_FILE_NAME),
      root: canonicalNearerRoot,
    });
  });

  test("returns null when no configuration exists", async () => {
    const root = await temporaryDirectory();
    await expect(
      discoverProjectConfig({ boundaryDirectory: root, startDirectory: root }),
    ).resolves.toBeNull();
  });

  test("rejects malformed and oversized configuration files", async () => {
    const malformedRoot = await temporaryDirectory();
    const oversizedRoot = await temporaryDirectory();
    await writeFile(path.join(malformedRoot, DEFAULT_CONFIG_FILE_NAME), "{");
    await writeFile(
      path.join(oversizedRoot, DEFAULT_CONFIG_FILE_NAME),
      "x".repeat(MAX_CONFIG_BYTES + 1),
    );

    await expect(
      discoverProjectConfig({
        boundaryDirectory: malformedRoot,
        startDirectory: malformedRoot,
      }),
    ).rejects.toMatchObject({ code: "CPTV_CONTEXT_INVALID_CONFIG" });
    await expect(
      discoverProjectConfig({
        boundaryDirectory: oversizedRoot,
        startDirectory: oversizedRoot,
      }),
    ).rejects.toMatchObject({ code: "CPTV_CONTEXT_FILE_TOO_LARGE" });
  });

  test.each([
    [{ unknown: true }, "Unknown configuration key"],
    [{ inputs: [""] }, "inputs must be an array"],
    [{ limits: { maxFiles: 0 } }, "Invalid limits"],
    [{ schemaVersion: 2 }, "schemaVersion must be 1"],
  ])("rejects invalid configuration %#", (value, message) => {
    expect(() => validateProjectConfig(value)).toThrow(message);
  });

  test("rejects a search start outside the explicit boundary", async () => {
    const root = await temporaryDirectory();
    const outside = await temporaryDirectory();

    await expect(
      discoverProjectConfig({ boundaryDirectory: root, startDirectory: outside }),
    ).rejects.toMatchObject({ code: "CPTV_CONTEXT_PATH_OUTSIDE_ROOT" });
  });
});
