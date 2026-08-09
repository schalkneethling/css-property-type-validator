#!/usr/bin/env node

import { existsSync } from "node:fs";
import { lstat, realpath, writeFile } from "node:fs/promises";
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

import type { ValidationInput } from "@schalkneethling/css-property-type-validator-core";

import {
  createCliProjectContext,
  loadProjectInputs,
  prepareImportResolver,
  type CliProjectContext,
} from "./project-context.js";
import {
  applyRegistrationPlan,
  createAudit,
  createBaseline,
  createRegistrationPlan,
  evaluateGates,
  formatAudit,
  formatRegistrationPlan,
  parseBaseline,
  parseDecisions,
  stableJson,
  type AdoptionOutputFormat,
} from "./adoption.js";

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

interface AdoptionArguments {
  options: {
    baseline?: string;
    checkUnknownCustomProperties: boolean;
    coverageRegression: boolean;
    decisions?: string;
    format: AdoptionOutputFormat;
    minCoverage?: number;
    newOnly: boolean;
    redactSource: boolean;
    registry: string[];
    target?: string;
    tokens: string[];
    writeBaseline?: string;
  };
  patterns: string[];
}

function resolveAdoptionFormat(value: string | undefined): AdoptionOutputFormat {
  const format = value ?? "human";
  if (!["human", "json", "html", "sarif"].includes(format)) {
    throw new Error(`Unsupported format "${format}". Use human, json, html, or sarif.`);
  }
  return format as AdoptionOutputFormat;
}

function parseAdoptionArguments(args: string[], command: "audit" | "plan"): AdoptionArguments {
  const parsed = parseArgs({
    allowPositionals: true,
    args,
    options: {
      baseline: { type: "string" },
      "check-unknown-custom-properties": { type: "boolean" },
      "coverage-regression": { type: "boolean" },
      decisions: { type: "string" },
      format: { short: "f", type: "string" },
      "min-coverage": { type: "string" },
      "new-only": { type: "boolean" },
      "redact-source": { type: "boolean" },
      registry: { multiple: true, short: "r", type: "string" },
      target: { type: "string" },
      tokens: { multiple: true, type: "string" },
      "write-baseline": { type: "string" },
    },
    strict: true,
  });
  if (command === "plan" && !parsed.values.target) {
    throw new Error("plan requires an explicit --target <file>.");
  }
  const minCoverageText = parsed.values["min-coverage"];
  const minCoverage = minCoverageText === undefined ? undefined : Number(minCoverageText) / 100;
  return {
    options: {
      ...(parsed.values.baseline === undefined ? {} : { baseline: parsed.values.baseline }),
      checkUnknownCustomProperties: parsed.values["check-unknown-custom-properties"] ?? false,
      coverageRegression: parsed.values["coverage-regression"] ?? false,
      ...(parsed.values.decisions === undefined ? {} : { decisions: parsed.values.decisions }),
      format: resolveAdoptionFormat(parsed.values.format),
      ...(minCoverage === undefined ? {} : { minCoverage }),
      newOnly: parsed.values["new-only"] ?? false,
      redactSource: parsed.values["redact-source"] ?? false,
      registry: parsed.values.registry ?? [],
      ...(parsed.values.target === undefined ? {} : { target: parsed.values.target }),
      tokens: parsed.values.tokens ?? [],
      ...(parsed.values["write-baseline"] === undefined
        ? {}
        : { writeBaseline: parsed.values["write-baseline"] }),
    },
    patterns: parsed.positionals,
  };
}

async function readJson(context: CliProjectContext, filePath: string): Promise<unknown> {
  const loaded = await context.reader.readCssFile(
    path.isAbsolute(filePath) ? filePath : path.resolve(context.projectRoot, filePath),
  );
  try {
    return JSON.parse(loaded.content) as unknown;
  } catch {
    throw new Error(`Invalid JSON in ${loaded.path}.`);
  }
}

async function resolveContainedOutput(projectRoot: string, filePath: string): Promise<string> {
  const canonicalRoot = await realpath(projectRoot);
  const absolute = path.isAbsolute(filePath)
    ? path.normalize(filePath)
    : path.resolve(projectRoot, filePath);
  const canonicalParent = await realpath(path.dirname(absolute));
  const output = path.join(canonicalParent, path.basename(absolute));
  const relative = path.relative(canonicalRoot, output);
  if (relative === "" || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("Output must remain inside the project root.");
  }
  try {
    const metadata = await lstat(output);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error("Output must be a regular, non-symbolic file.");
    }
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  return output;
}

async function loadConfiguredEntryPoints(
  context: CliProjectContext,
  patterns: readonly string[],
): Promise<ValidationInput[]> {
  const entryPointsByPath = new Map<string, ValidationInput>();

  for (const pattern of patterns) {
    const matches = await loadProjectInputs(context, [pattern]);
    if (matches.length === 0) {
      throw new Error(`Configured entry point "${pattern}" matched no CSS files.`);
    }
    for (const match of matches) entryPointsByPath.set(match.path, match);
  }

  return [...entryPointsByPath.values()].sort((left, right) => left.path.localeCompare(right.path));
}

async function loadAdoptionAudit(args: AdoptionArguments) {
  const context = await createCliProjectContext(process.cwd());
  const configuredInputs = context.config?.inputs.length
    ? context.config.inputs
    : (context.config?.entryPoints ?? []);
  const patterns = args.patterns.length > 0 ? args.patterns : configuredInputs;
  const scannedInputs = await loadProjectInputs(context, patterns);
  if (scannedInputs.length === 0) {
    throw new Error("No CSS files matched the audit patterns.");
  }
  const configuredEntryPointPatterns = context.config?.entryPoints ?? [];
  const configuredEntryPoints =
    configuredEntryPointPatterns.length > 0
      ? await loadConfiguredEntryPoints(context, configuredEntryPointPatterns)
      : [];
  const inputs = [
    ...new Map(
      [...scannedInputs, ...configuredEntryPoints].map((input) => [input.path, input]),
    ).values(),
  ].sort((left, right) => left.path.localeCompare(right.path));
  const registryPatterns =
    args.options.registry.length > 0 ? args.options.registry : (context.config?.registry ?? []);
  const tokenPatterns =
    args.options.tokens.length > 0 ? args.options.tokens : (context.config?.tokens ?? []);
  const registryInputs = await loadRegistryInputs(context, registryPatterns, inputs);
  const checkUnresolvedCustomProperties =
    args.options.checkUnknownCustomProperties ||
    (context.config?.checkUnknownCustomProperties ?? false);
  const knownCustomPropertyInputs = checkUnresolvedCustomProperties
    ? await loadProjectInputs(context, tokenPatterns)
    : [];
  const importedInputs = new Map<string, ValidationInput>();
  const resolvedImportEdges = new Map<
    string,
    { fromPath: string; specifier: string; toPath: string }
  >();
  const resolveImport = await prepareImportResolver(context, {
    inputs,
    knownCustomPropertyInputs,
    onResolvedEdge: (edge) => resolvedImportEdges.set(`${edge.fromPath}\0${edge.specifier}`, edge),
    onResolvedInput: (input) => importedInputs.set(input.path, input),
    registryInputs,
  });
  const analysisInputs = [
    ...new Map(
      [...inputs, ...importedInputs.values()].map((input) => [input.path, input]),
    ).values(),
  ];
  const entryPoints = (
    configuredEntryPoints.length > 0 ? configuredEntryPoints : scannedInputs
  ).map((input) => input.path);
  // Core owns CSS parsing and occurrence ordering. The bounded resolver supplies only
  // successful local resolutions; joining those two observed facts avoids claiming
  // that conditional, external, or missing imports resolved.
  const importDiscovery = createAudit(analysisInputs, {
    checkUnresolvedCustomProperties,
    entryPoints,
    knownCustomPropertyInputs,
    registryInputs,
    resolveImport,
  });
  const importEdges = importDiscovery.analysis.inventory.imports.flatMap((occurrence) => {
    if (occurrence.conditional || occurrence.resolution === "external") return [];
    const resolved = resolvedImportEdges.get(`${occurrence.fromPath}\0${occurrence.specifier}`);
    return resolved
      ? [
          {
            conditional: false,
            fromPath: occurrence.fromPath,
            order: occurrence.order,
            specifier: occurrence.specifier,
            toPath: resolved.toPath,
          },
        ]
      : [];
  });
  return {
    audit: createAudit(analysisInputs, {
      checkUnresolvedCustomProperties,
      entryPoints,
      importEdges,
      knownCustomPropertyInputs,
      redactSource: args.options.redactSource,
      registryInputs,
      resolveImport,
    }),
    context,
  };
}

async function runAuditCommand(argv: string[]): Promise<void> {
  const args = parseAdoptionArguments(argv, "audit");
  const { audit, context } = await loadAdoptionAudit(args);
  const baseline = args.options.baseline
    ? parseBaseline(await readJson(context, args.options.baseline))
    : undefined;
  const gates = evaluateGates(audit, {
    ...(baseline === undefined ? {} : { baseline }),
    coverageRegression: args.options.coverageRegression,
    ...(args.options.minCoverage === undefined ? {} : { minCoverage: args.options.minCoverage }),
    newOnly: args.options.newOnly,
  });
  audit.gateEvaluation = gates;

  if (args.options.writeBaseline) {
    const outputPath = await resolveContainedOutput(
      context.projectRoot,
      args.options.writeBaseline,
    );
    await writeFile(outputPath, `${stableJson(createBaseline(audit))}\n`, "utf8");
  }
  process.stdout.write(`${formatAudit(audit, args.options.format)}\n`);
  process.exitCode = gates.passed ? 0 : 1;
}

async function runPlanCommand(argv: string[]): Promise<void> {
  const args = parseAdoptionArguments(argv, "plan");
  const { audit, context } = await loadAdoptionAudit(args);
  const decisions = args.options.decisions
    ? parseDecisions(await readJson(context, args.options.decisions))
    : [];
  const plan = await createRegistrationPlan(
    audit,
    decisions,
    args.options.target as string,
    context.projectRoot,
  );
  process.stdout.write(`${formatRegistrationPlan(plan, args.options.format)}\n`);
  process.exitCode = plan.registrationPlan.diagnostics.length > 0 ? 1 : 0;
}

async function runApplyCommand(argv: string[]): Promise<void> {
  const parsed = parseArgs({
    allowPositionals: false,
    args: argv,
    options: { plan: { type: "string" } },
    strict: true,
  });
  if (!parsed.values.plan) throw new Error("apply requires --plan <file>.");
  const context = await createCliProjectContext(process.cwd());
  const result = await applyRegistrationPlan(context, await readJson(context, parsed.values.plan));
  process.stdout.write(`Applied reviewed plan: created ${result.applied}.\n`);
  process.exitCode = 0;
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
  const requestedFormat = parsed.values.format;
  const format =
    requestedFormat === undefined || requestedFormat === "css" || requestedFormat === "json"
      ? (requestedFormat ?? "css")
      : null;
  const force = typeof parsed.values.force === "boolean" ? parsed.values.force : false;
  const out = typeof parsed.values.out === "string" ? parsed.values.out : "properties.css";

  if (!format) {
    throw new Error(`Unsupported generate format "${requestedFormat}". Use "css" or "json".`);
  }

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
  const context = await createCliProjectContext(process.cwd());
  const effectivePatterns =
    patterns.length > 0
      ? patterns
      : context.config?.inputs.length
        ? context.config.inputs
        : (context.config?.entryPoints ?? []);
  const inputs = await loadProjectInputs(context, effectivePatterns);

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

async function loadRegistryInputs(
  context: CliProjectContext,
  patterns: string[],
  validationInputs: ValidationInput[],
): Promise<ValidationInput[]> {
  const registryInputs = await loadProjectInputs(context, patterns);
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

async function loadKnownCustomPropertyInputs(
  context: CliProjectContext,
  options: CliOptions,
): Promise<ValidationInput[]> {
  writeUnknownCustomPropertyConfigurationWarnings(options);
  return options.checkUnknownCustomProperties ? loadProjectInputs(context, options.tokens) : [];
}

async function main(): Promise<void> {
  if (process.argv[2] === "audit") {
    await runAuditCommand(process.argv.slice(3));
    return;
  }

  if (process.argv[2] === "plan") {
    await runPlanCommand(process.argv.slice(3));
    return;
  }

  if (process.argv[2] === "apply") {
    await runApplyCommand(process.argv.slice(3));
    return;
  }

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
      "\nCommands:\n  audit [options] <patterns...>     Audit adoption with human, JSON, HTML, or SARIF output.\n  plan [options] <patterns...>      Build a reviewed, fingerprinted registration plan.\n  apply --plan <file>              Apply one exact, stale-safe reviewed plan.\n  generate [options] <patterns...>  Deprecated experimental generation compatibility command.",
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
      const context = await createCliProjectContext(process.cwd());
      const configuredInputs = context.config?.inputs.length
        ? context.config.inputs
        : (context.config?.entryPoints ?? []);
      const effectivePatterns = patterns.length > 0 ? patterns : configuredInputs;
      const effectiveOptions: CliOptions = {
        ...options,
        checkUnknownCustomProperties:
          options.checkUnknownCustomProperties ||
          (context.config?.checkUnknownCustomProperties ?? false),
        registry: options.registry.length > 0 ? options.registry : (context.config?.registry ?? []),
        tokens: options.tokens.length > 0 ? options.tokens : (context.config?.tokens ?? []),
      };
      const format = resolveOutputFormat(options.format);

      if (options.registryOnly) {
        if (effectivePatterns.length === 0) {
          process.stderr.write(
            "No CSS files matched the registration-only patterns. Pass one or more CSS files or glob patterns to --registry-only.\n",
          );
          process.exitCode = 2;
          return;
        }

        const registryInputs = await loadProjectInputs(context, effectivePatterns);

        if (registryInputs.length === 0) {
          process.stderr.write(
            "No CSS files matched the registration-only patterns. Pass one or more CSS files or glob patterns to --registry-only.\n",
          );
          process.exitCode = 2;
          return;
        }

        const additionalRegistryInputs = await loadRegistryInputs(
          context,
          effectiveOptions.registry,
          registryInputs,
        );
        const knownCustomPropertyInputs = await loadKnownCustomPropertyInputs(
          context,
          effectiveOptions,
        );
        const allRegistryInputs = [...registryInputs, ...additionalRegistryInputs];
        const resolveImport = await prepareImportResolver(context, {
          inputs: [],
          knownCustomPropertyInputs,
          registryInputs: allRegistryInputs,
        });
        const result = validateFiles([], {
          checkUnresolvedCustomProperties: effectiveOptions.checkUnknownCustomProperties,
          failFast: options.failfast,
          knownCustomPropertyInputs,
          registryInputs: allRegistryInputs,
          resolveImport,
        });
        const output = formatValidationResult(result, format);

        process.stdout.write(`${output}\n`);
        process.exitCode = result.diagnostics.length > 0 ? 1 : 0;
        return;
      }

      const inputs = await loadProjectInputs(context, effectivePatterns);

      if (inputs.length === 0) {
        process.stderr.write(
          "No CSS files matched the validation patterns. Files passed via --registry are registration sources only.\n",
        );
        process.exitCode = 2;
        return;
      }

      const registryInputs = await loadRegistryInputs(context, effectiveOptions.registry, inputs);
      const knownCustomPropertyInputs = await loadKnownCustomPropertyInputs(
        context,
        effectiveOptions,
      );
      const resolveImport = await prepareImportResolver(context, {
        inputs,
        knownCustomPropertyInputs,
        registryInputs,
      });
      const result = validateFiles(inputs, {
        checkUnresolvedCustomProperties: effectiveOptions.checkUnknownCustomProperties,
        failFast: options.failfast,
        knownCustomPropertyInputs,
        registryInputs,
        resolveImport,
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
