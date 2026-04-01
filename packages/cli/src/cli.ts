#!/usr/bin/env node

import { glob, readFile } from "node:fs/promises";
import process from "node:process";

import { Command } from "commander";

import { validateFiles } from "@css-property-type-validator/core";
import { formatValidationResult } from "./formatter.js";

import type { ValidationInput } from "@css-property-type-validator/core";

type OutputFormat = "human" | "json";

async function loadInputs(patterns: string[]): Promise<ValidationInput[]> {
  const filePaths = new Set<string>();

  for (const pattern of patterns) {
    for await (const filePath of glob(pattern, { cwd: process.cwd() })) {
      filePaths.add(filePath);
    }
  }

  const cssFiles = [...filePaths]
    .filter((filePath) => filePath.endsWith(".css"))
    .map((filePath) => (filePath.startsWith("/") ? filePath : `${process.cwd()}/${filePath}`));
  const inputs = await Promise.all(
    cssFiles.map(async (filePath) => ({
      path: filePath,
      css: await readFile(filePath, "utf8"),
    })),
  );

  return inputs.sort((left, right) => left.path.localeCompare(right.path));
}

async function main(): Promise<void> {
  const program = new Command();

  program
    .name("css-property-type-validator")
    .description("Validate @property registrations and var() usages across CSS files.")
    .argument("<patterns...>", "CSS files or glob patterns to validate")
    .option("-f, --format <format>", "output format: human or json", "human")
    .action(async (patterns: string[], options: { format: OutputFormat }) => {
      const format = options.format === "json" ? "json" : "human";
      const inputs = await loadInputs(patterns);

      if (inputs.length === 0) {
        process.stderr.write("No CSS files matched the provided patterns.\n");
        process.exitCode = 2;
        return;
      }

      const result = validateFiles(inputs);
      const output = formatValidationResult(result, format);

      process.stdout.write(`${output}\n`);
      process.exitCode = result.diagnostics.length > 0 ? 1 : 0;
    });

  await program.parseAsync(process.argv);
}

main().catch((error) => {
  process.stderr.write(`${(error as Error).message}\n`);
  process.exit(2);
});
