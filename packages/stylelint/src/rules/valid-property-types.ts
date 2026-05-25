import { readFileSync } from "node:fs";
import { glob, readFile } from "node:fs/promises";
import path from "node:path";

import {
  validateFiles,
  isAbsoluteImportUrl,
  type ResolveImport,
  type ValidationDiagnostic,
  type ValidationInput,
} from "@schalkneethling/css-property-type-validator-core";
import stylelint from "stylelint";

const {
  createPlugin,
  utils: { report, ruleMessages, validateOptions },
} = stylelint;

export const ruleName = "css-property-type-validator/valid-property-types";

export const messages = ruleMessages(ruleName, {
  configuration: (message: string) => `CSS Property Type Validator: ${message}`,
  rejected: (message: string) => message,
});

const meta = {
  url: "https://github.com/schalkneethling/css-property-type-validator/tree/main/packages/stylelint#readme",
};

interface RuleOptions {
  checkUnknownCustomProperties?: boolean;
  registryFiles?: string[];
  tokenFiles?: string[];
}

type PostCssRoot = Parameters<NonNullable<ReturnType<stylelint.Rule>>>[0];
type StylelintResult = Parameters<NonNullable<ReturnType<stylelint.Rule>>>[1];

const CSS_FILE_EXTENSION = ".css";
const VIRTUAL_STDIN_SOURCE = "<stylelint-input>";

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function validateRuleOptions(
  result: StylelintResult,
  root: PostCssRoot,
  options: unknown,
): options is RuleOptions {
  if (options === undefined) {
    return true;
  }

  if (!options || typeof options !== "object" || Array.isArray(options)) {
    report({
      result,
      ruleName,
      message: messages.configuration("rule options must be an object."),
      node: root,
    });
    return false;
  }

  const typedOptions = options as Record<string, unknown>;

  if (
    typedOptions["registryFiles"] !== undefined &&
    !isStringArray(typedOptions["registryFiles"])
  ) {
    report({
      result,
      ruleName,
      message: messages.configuration("registryFiles must be an array of strings."),
      node: root,
    });
    return false;
  }

  if (typedOptions["tokenFiles"] !== undefined && !isStringArray(typedOptions["tokenFiles"])) {
    report({
      result,
      ruleName,
      message: messages.configuration("tokenFiles must be an array of strings."),
      node: root,
    });
    return false;
  }

  if (
    typedOptions["checkUnknownCustomProperties"] !== undefined &&
    typeof typedOptions["checkUnknownCustomProperties"] !== "boolean"
  ) {
    report({
      result,
      ruleName,
      message: messages.configuration("checkUnknownCustomProperties must be a boolean."),
      node: root,
    });
    return false;
  }

  return true;
}

async function loadInputs(patterns: string[], cwd: string): Promise<ValidationInput[]> {
  const filePaths = new Set<string>();

  for (const pattern of patterns) {
    for await (const filePath of glob(pattern, { cwd })) {
      filePaths.add(path.resolve(cwd, filePath));
    }
  }

  const inputs = await Promise.all(
    [...filePaths]
      .filter((filePath) => filePath.endsWith(CSS_FILE_EXTENSION))
      .map(async (filePath) => ({
        css: await readFile(filePath, "utf8"),
        path: filePath,
      })),
  );

  return inputs.sort((left, right) => left.path.localeCompare(right.path));
}

function createImportResolver(cwd: string): ResolveImport {
  return (specifier: string, fromPath: string) => {
    const resolvedPath = specifier.startsWith("/")
      ? path.join(cwd, specifier.slice(1))
      : path.resolve(path.dirname(fromPath), specifier);

    if (!resolvedPath.endsWith(CSS_FILE_EXTENSION)) {
      return null;
    }

    try {
      return {
        css: readFileSync(resolvedPath, "utf8"),
        path: resolvedPath,
      };
    } catch {
      return null;
    }
  };
}

function getSourcePath(root: PostCssRoot): string | null {
  const sourcePath = root.source?.input.file ?? root.source?.input.from;

  if (!sourcePath || sourcePath.startsWith("<")) {
    return null;
  }

  return path.resolve(sourcePath);
}

function hasLocalImport(root: PostCssRoot): boolean {
  let hasImport = false;

  root.walkAtRules("import", (atRule) => {
    if (hasImport) {
      return;
    }

    const match = atRule.params.match(/^(?:url\()?["']?([^"')\s]+)["']?\)?/u);
    const specifier = match?.[1];

    if (specifier && !isAbsoluteImportUrl(specifier)) {
      hasImport = true;
    }
  });

  return hasImport;
}

function reportConfigurationWarning(
  result: StylelintResult,
  root: PostCssRoot,
  message: string,
): void {
  report({
    result,
    ruleName,
    message: messages.configuration(message),
    node: root,
  });
}

function reportDiagnostic(
  result: StylelintResult,
  root: PostCssRoot,
  diagnostic: ValidationDiagnostic,
): void {
  report({
    result,
    ruleName,
    message: messages.rejected(diagnostic.message),
    node: root,
    start: diagnostic.loc
      ? {
          column: diagnostic.loc.start.column,
          line: diagnostic.loc.start.line,
        }
      : undefined,
    end: diagnostic.loc
      ? {
          column: diagnostic.loc.end.column,
          line: diagnostic.loc.end.line,
        }
      : undefined,
  });
}

const ruleFunction: stylelint.Rule = (primary, ruleOptions) => {
  return async (root, result) => {
    const validPrimaryOptions = validateOptions(result, ruleName, {
      actual: primary,
      possible: [true],
    });

    if (!validPrimaryOptions || !validateRuleOptions(result, root, ruleOptions)) {
      return;
    }

    const options = ruleOptions ?? {};
    const cwd = process.cwd();
    const sourcePath = getSourcePath(root);
    const checkUnknownCustomProperties = options.checkUnknownCustomProperties ?? false;
    const registryPatterns = options.registryFiles ?? [];
    const tokenPatterns = options.tokenFiles ?? [];

    if (checkUnknownCustomProperties && tokenPatterns.length === 0) {
      reportConfigurationWarning(
        result,
        root,
        "enabled without tokenFiles. Configure tokenFiles to avoid false positives from project-wide custom properties outside the validation/import path.",
      );
    }

    if (!checkUnknownCustomProperties && tokenPatterns.length > 0) {
      reportConfigurationWarning(
        result,
        root,
        "tokenFiles are ignored unless checkUnknownCustomProperties is enabled.",
      );
    }

    if (!sourcePath && hasLocalImport(root)) {
      reportConfigurationWarning(
        result,
        root,
        "could not resolve local CSS imports because this input has no file path.",
      );
    }

    const [registryInputs, knownCustomPropertyInputs] = await Promise.all([
      loadInputs(registryPatterns, cwd),
      checkUnknownCustomProperties ? loadInputs(tokenPatterns, cwd) : Promise.resolve([]),
    ]);

    const validationInput: ValidationInput = {
      css: root.toString(),
      path: sourcePath ?? root.source?.input.from ?? VIRTUAL_STDIN_SOURCE,
    };
    const validationResult = validateFiles([validationInput], {
      checkUnresolvedCustomProperties: checkUnknownCustomProperties,
      knownCustomPropertyInputs,
      registryInputs,
      resolveImport: sourcePath ? createImportResolver(cwd) : undefined,
    });

    for (const diagnostic of validationResult.diagnostics) {
      reportDiagnostic(result, root, diagnostic);
    }
  };
};

ruleFunction.ruleName = ruleName;
ruleFunction.messages = messages;
ruleFunction.meta = meta;

export default createPlugin(ruleName, ruleFunction);
