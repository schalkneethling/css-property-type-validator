#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { glob, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { parseArgs } from "node:util";

import { Command } from "commander";

import {
  formatValidationResult,
  generatePropertyRegistrations,
  validateFiles,
  type OutputFormat,
} from "@schalkneethling/css-property-type-validator-core";

import type {
  ResolveImport,
  ValidationInput,
} from "@schalkneethling/css-property-type-validator-core";

interface CliOptions {
  checkUnknownCustomProperties: boolean;
  failfast: boolean;
  format: OutputFormat;
  registry: string[];
  registryOnly: boolean;
  tokens: string[];
}

interface GenerateOptions {
  force: boolean;
  format: "css" | "json";
  out: string;
}

function parseGenerateArguments(args: string[]): { options: GenerateOptions; patterns: string[] } {
  const parsed = parseArgs({
    allowPositionals: true,
    args,
    options: {
      force: { type: "boolean" },
      format: { type: "string" },
      out: { type: "string" },
    },
    strict: true,
  });
  const format = parsed.values.format === "json" ? "json" : "css";
  const force = typeof parsed.values.force === "boolean" ? parsed.values.force : false;
  const out = typeof parsed.values.out === "string" ? parsed.values.out : "properties.css";

  return {
    options: {
      force,
      format,
      out,
    },
    patterns: parsed.positionals,
  };
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  const pluralRules = new Intl.PluralRules("en");
  return pluralRules.select(count) === "one" ? singular : plural;
}

async function runGenerateCommand(args: string[]): Promise<void> {
  const { options, patterns } = parseGenerateArguments(args);
  const inputs = await loadInputs(patterns);

  if (!inputs.length) {
    process.stderr.write(
      "No CSS files matched the generation patterns. Pass one or more CSS files or glob patterns.\n",
    );
    process.exitCode = 2;
    return;
  }

  const result = generatePropertyRegistrations(inputs, { outFile: options.out });

  if (options.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.diagnostics.length > 0 ? 1 : 0;
    return;
  }

  if (existsSync(options.out) && !options.force) {
    process.stderr.write(
      `${options.out} already exists. Use --force to overwrite it or --out to specify another file.\n`,
    );
    process.exitCode = 2;
    return;
  }

  await writeFile(options.out, result.css, "utf8");

  process.stdout.write(
    `Generated ${result.generatedCount} @property ${pluralize(result.generatedCount, "registration")} in ${options.out}.\n`,
  );

  if (result.reviewCount > 0 || result.diagnostics.length > 0) {
    process.stdout.write(
      `Review ${result.reviewCount} ${pluralize(result.reviewCount, "item")} with --format json. Share feedback at https://github.com/schalkneethling/css-property-type-validator/issues/98\n`,
    );
  } else {
    process.stdout.write(
      "Share feedback at https://github.com/schalkneethling/css-property-type-validator/issues/98\n",
    );
  }

  process.exitCode = result.diagnostics.length > 0 ? 1 : 0;
}

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

function createImportResolver(cwd: string): ResolveImport {
  return (specifier: string, fromPath: string) => {
    const resolvedPath = specifier.startsWith("/")
      ? path.join(cwd, specifier.slice(1))
      : path.resolve(path.dirname(fromPath), specifier);

    if (!resolvedPath.endsWith(".css")) {
      return null;
    }

    try {
      return {
        path: resolvedPath,
        css: readFileSync(resolvedPath, "utf8"),
      };
    } catch {
      return null;
    }
  };
}

async function loadRegistryInputs(
  patterns: string[],
  validationInputs: ValidationInput[],
): Promise<ValidationInput[]> {
  const registryInputs = await loadInputs(patterns);
  const validationPaths = new Set(validationInputs.map((input) => input.path));

  return registryInputs.filter((input) => !validationPaths.has(input.path));
}

function resolveOutputFormat(format: string): OutputFormat {
  return format === "json" ? "json" : "human";
}

function writeUnknownCustomPropertyConfigurationWarnings(options: CliOptions): void {
  if (options.checkUnknownCustomProperties && options.tokens.length === 0) {
    process.stderr.write(
      "Warning: --check-unknown-custom-properties is enabled without --tokens. Configure one or more token files to avoid false positives from project-wide custom properties outside the validation/import path.\n",
    );
  }

  if (!options.checkUnknownCustomProperties && options.tokens.length > 0) {
    process.stderr.write(
      "Warning: --tokens is ignored unless --check-unknown-custom-properties is enabled.\n",
    );
  }
}

async function loadKnownCustomPropertyInputs(options: CliOptions): Promise<ValidationInput[]> {
  writeUnknownCustomPropertyConfigurationWarnings(options);
  return options.checkUnknownCustomProperties ? loadInputs(options.tokens) : [];
}

async function main(): Promise<void> {
  if (process.argv[2] === "generate") {
    await runGenerateCommand(process.argv.slice(3));
    return;
  }

  const program = new Command();

  program
    .name("css-property-type-validator")
    .description("Validate @property registrations and var() usages across CSS files.")
    .addHelpText(
      "after",
      "\nCommands:\n  generate [options] <patterns...>  Experimentally generate @property registrations from existing CSS.",
    )
    .argument("[patterns...]", "CSS files or glob patterns to validate")
    .option("-f, --format <format>", "output format: human or json", "human")
    .option("--failfast", "stop after the first validation failure", false)
    .option(
      "--check-unknown-custom-properties",
      "report no-fallback var() references that are missing from known custom property inputs",
      false,
    )
    .option(
      "-r, --registry <pattern>",
      "CSS file or glob pattern to use for shared @property registrations",
      (value: string, previous: string[] = []) => [...previous, value],
      [],
    )
    .option(
      "--tokens <pattern>",
      "CSS file or glob pattern to use as known custom property token sources",
      (value: string, previous: string[] = []) => [...previous, value],
      [],
    )
    .option(
      "--registry-only",
      "validate @property registrations from the provided input patterns without validating ordinary declarations",
      false,
    )
    .action(async (patterns: string[], options: CliOptions) => {
      const format = resolveOutputFormat(options.format);

      if (options.registryOnly) {
        if (patterns.length === 0) {
          process.stderr.write(
            "No CSS files matched the registration-only patterns. Pass one or more CSS files or glob patterns to --registry-only.\n",
          );
          process.exitCode = 2;
          return;
        }

        const registryInputs = await loadInputs(patterns);

        if (registryInputs.length === 0) {
          process.stderr.write(
            "No CSS files matched the registration-only patterns. Pass one or more CSS files or glob patterns to --registry-only.\n",
          );
          process.exitCode = 2;
          return;
        }

        const additionalRegistryInputs = await loadRegistryInputs(options.registry, registryInputs);
        const knownCustomPropertyInputs = await loadKnownCustomPropertyInputs(options);
        const result = validateFiles([], {
          checkUnresolvedCustomProperties: options.checkUnknownCustomProperties,
          failFast: options.failfast,
          knownCustomPropertyInputs,
          registryInputs: [...registryInputs, ...additionalRegistryInputs],
          resolveImport: createImportResolver(process.cwd()),
        });
        const output = formatValidationResult(result, format);

        process.stdout.write(`${output}\n`);
        process.exitCode = result.diagnostics.length > 0 ? 1 : 0;
        return;
      }

      const inputs = await loadInputs(patterns);

      if (inputs.length === 0) {
        process.stderr.write(
          "No CSS files matched the validation patterns. Files passed via --registry are registration sources only.\n",
        );
        process.exitCode = 2;
        return;
      }

      const registryInputs = await loadRegistryInputs(options.registry, inputs);
      const knownCustomPropertyInputs = await loadKnownCustomPropertyInputs(options);
      const result = validateFiles(inputs, {
        checkUnresolvedCustomProperties: options.checkUnknownCustomProperties,
        failFast: options.failfast,
        knownCustomPropertyInputs,
        registryInputs,
        resolveImport: createImportResolver(process.cwd()),
      });
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
