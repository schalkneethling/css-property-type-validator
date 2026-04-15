#!/usr/bin/env node

import { glob, readFile } from "node:fs/promises";
import process from "node:process";

import { Command } from "commander";

import { validateFiles } from "@schalkneethling/css-property-type-validator-core";
import { formatValidationResult } from "./formatter.js";

import type { ValidationInput } from "@schalkneethling/css-property-type-validator-core";

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

async function loadRegistryInputs(
  patterns: string[],
  validationInputs: ValidationInput[],
): Promise<ValidationInput[]> {
  const registryInputs = await loadInputs(patterns);
  const validationPaths = new Set(validationInputs.map((input) => input.path));

  return registryInputs.filter((input) => !validationPaths.has(input.path));
}

async function main(): Promise<void> {
  const program = new Command();

  program
    .name("css-property-type-validator")
    .description("Validate @property registrations and var() usages across CSS files.")
    .argument("<patterns...>", "CSS files or glob patterns to validate")
    .option("-f, --format <format>", "output format: human or json", "human")
    .option(
      "-r, --registry <pattern>",
      "CSS file or glob pattern to use for shared @property registrations",
      (value: string, previous: string[] = []) => [...previous, value],
      [],
    )
    .action(async (patterns: string[], options: { format: OutputFormat; registry: string[] }) => {
      const format = options.format === "json" ? "json" : "human";
      const inputs = await loadInputs(patterns);

      if (inputs.length === 0) {
        process.stderr.write(
          "No CSS files matched the validation patterns. Files passed via --registry are registration sources only.\n",
        );
        process.exitCode = 2;
        return;
      }

      const registryInputs = await loadRegistryInputs(options.registry, inputs);
      const result = validateFiles(inputs, { registryInputs });
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
