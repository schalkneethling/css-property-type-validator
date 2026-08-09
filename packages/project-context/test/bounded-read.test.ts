import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { ProjectContextError, ProjectReader, readBoundedTextFile } from "../src/index.js";

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

describe("AC-PC-001 bounded reads", () => {
  test("returns UTF-8 content only after accepting an in-root regular file", async () => {
    const root = await temporaryDirectory();
    const filePath = path.join(root, "tokens.css");
    await writeFile(filePath, ":root { --space: 1rem; }", "utf8");

    const loaded = await readBoundedTextFile(filePath, { root });

    expect(loaded).toMatchObject({
      byteLength: Buffer.byteLength(":root { --space: 1rem; }"),
      content: ":root { --space: 1rem; }",
      path: await realpath(filePath),
    });
  });

  test("rejects an oversized file before allocating its contents or charging the budget", async () => {
    const root = await temporaryDirectory();
    const filePath = path.join(root, "large.css");
    await writeFile(filePath, "12345", "utf8");

    const reader = await ProjectReader.create({
      limits: { maxFileBytes: 4, maxFiles: 1, maxTotalBytes: 4 },
      root,
    });

    await expect(reader.readCssFile(filePath)).rejects.toMatchObject({
      code: "CPTV_CONTEXT_FILE_TOO_LARGE",
    });
    expect(reader.budget).toEqual({ fileCount: 0, totalBytes: 0 });
  });

  test("rejects directories, invalid UTF-8, and symlink escapes with stable codes", async () => {
    const root = await temporaryDirectory();
    const outside = await temporaryDirectory();
    const directoryPath = path.join(root, "directory.css");
    const invalidPath = path.join(root, "invalid.css");
    const outsidePath = path.join(outside, "outside.css");
    const linkPath = path.join(root, "link.css");
    await mkdir(directoryPath);
    await writeFile(invalidPath, Uint8Array.from([0xc3, 0x28]));
    await writeFile(outsidePath, ":root {}", "utf8");
    await symlink(outsidePath, linkPath);

    await expect(readBoundedTextFile(directoryPath, { root })).rejects.toMatchObject({
      code: "CPTV_CONTEXT_NOT_REGULAR_FILE",
    });
    await expect(readBoundedTextFile(invalidPath, { root })).rejects.toMatchObject({
      code: "CPTV_CONTEXT_INVALID_UTF8",
    });
    await expect(readBoundedTextFile(linkPath, { root })).rejects.toMatchObject({
      code: "CPTV_CONTEXT_PATH_OUTSIDE_ROOT",
    });
  });
});

describe("AC-PC-002 shared run budget", () => {
  test("shares aggregate and count limits while cached files are charged once", async () => {
    const root = await temporaryDirectory();
    await writeFile(path.join(root, "one.css"), "123456", "utf8");
    await writeFile(path.join(root, "two.css"), "abcdef", "utf8");
    const reader = await ProjectReader.create({
      limits: { maxFileBytes: 10, maxFiles: 2, maxTotalBytes: 10 },
      root,
    });

    await reader.readCssFile("one.css");
    await reader.readCssFile("one.css");
    expect(reader.budget).toEqual({ fileCount: 1, totalBytes: 6 });
    await expect(reader.readCssFile("two.css")).rejects.toMatchObject({
      code: "CPTV_CONTEXT_AGGREGATE_TOO_LARGE",
    });
    expect(reader.budget).toEqual({ fileCount: 1, totalBytes: 6 });
  });

  test("rejects the first file beyond the file-count limit", async () => {
    const root = await temporaryDirectory();
    await writeFile(path.join(root, "one.css"), "1", "utf8");
    await writeFile(path.join(root, "two.css"), "2", "utf8");
    const reader = await ProjectReader.create({
      limits: { maxFileBytes: 2, maxFiles: 1, maxTotalBytes: 2 },
      root,
    });

    await reader.readCssFile("one.css");
    await expect(reader.readCssFile("two.css")).rejects.toBeInstanceOf(ProjectContextError);
    await expect(reader.readCssFile("two.css")).rejects.toMatchObject({
      code: "CPTV_CONTEXT_FILE_COUNT_EXCEEDED",
    });
  });
});
