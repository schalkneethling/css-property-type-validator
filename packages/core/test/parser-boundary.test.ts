import { readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const SOURCE_DIRECTORY = join(dirname(fileURLToPath(import.meta.url)), "../src");
const CSS_TREE_IMPORT = /from\s+["']css-tree["']/u;

describe("parser dependency boundary", () => {
  it("AC-PARSER-003 permits only the typed parser facade to import css-tree", () => {
    const directImporters = readdirSync(SOURCE_DIRECTORY, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
      .map((entry) => join(SOURCE_DIRECTORY, entry.name))
      .filter((filePath) => CSS_TREE_IMPORT.test(readFileSync(filePath, "utf8")))
      .map((filePath) => basename(filePath))
      .sort();

    expect(directImporters).toEqual(["parser.ts"]);
  });
});
