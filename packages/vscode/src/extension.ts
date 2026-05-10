import fs from "node:fs";
import path from "node:path";
import { TextDecoder } from "node:util";

import {
  validateFiles,
  type ResolveImport,
  type ValidationDiagnostic,
  type ValidationInput,
} from "@schalkneethling/css-property-type-validator-core";
import * as vscode from "vscode";

import { getDiagnosticCode, toPlainRange } from "./diagnostics.js";

const DOCUMENT_SELECTOR = { language: "css", scheme: "file" };
const DIAGNOSTIC_SOURCE = "CSS Property Type Validator";
const REGISTRY_EXCLUDE_GLOB = "{**/node_modules/**,**/dist/**,**/build/**}";
const VALIDATION_DEBOUNCE_MS = 300;

let diagnosticCollection: vscode.DiagnosticCollection;
let registryInputs: ValidationInput[] = [];
let knownCustomPropertyInputs: ValidationInput[] = [];
let lastConfigurationWarningKey: string | null = null;
const validationTimers = new Map<string, NodeJS.Timeout>();
const diagnosticUris = new Set<string>();

function isCssFileDocument(document: vscode.TextDocument): boolean {
  return (
    document.uri.scheme === DOCUMENT_SELECTOR.scheme &&
    document.languageId === DOCUMENT_SELECTOR.language
  );
}

function getRegistryPatterns(): string[] {
  return getConfigurationPatterns("registryFiles");
}

function getTokenPatterns(): string[] {
  return getConfigurationPatterns("tokenFiles");
}

function getConfigurationPatterns(name: string): string[] {
  return vscode.workspace
    .getConfiguration("cssPropertyTypeValidator")
    .get<string[]>(name, [])
    .filter((pattern) => pattern.trim().length > 0);
}

function shouldCheckUnknownCustomProperties(): boolean {
  return vscode.workspace
    .getConfiguration("cssPropertyTypeValidator")
    .get<boolean>("checkUnknownCustomProperties", false);
}

async function readWorkspaceFile(uri: vscode.Uri): Promise<string> {
  const bytes = await vscode.workspace.fs.readFile(uri);
  return new TextDecoder().decode(bytes);
}

async function loadConfiguredInputs(patterns: string[]): Promise<ValidationInput[]> {
  const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
  const inputsByPath = new Map<string, ValidationInput>();

  for (const folder of workspaceFolders) {
    for (const pattern of patterns) {
      const include = new vscode.RelativePattern(folder, pattern);
      const uris = await vscode.workspace.findFiles(include, REGISTRY_EXCLUDE_GLOB);

      for (const uri of uris) {
        if (uri.scheme !== "file" || !uri.fsPath.endsWith(".css")) {
          continue;
        }

        inputsByPath.set(uri.fsPath, {
          css: await readWorkspaceFile(uri),
          path: uri.fsPath,
        });
      }
    }
  }

  return [...inputsByPath.values()].sort((left, right) => left.path.localeCompare(right.path));
}

async function loadRegistryInputs(): Promise<ValidationInput[]> {
  return loadConfiguredInputs(getRegistryPatterns());
}

async function loadKnownCustomPropertyInputs(): Promise<ValidationInput[]> {
  return shouldCheckUnknownCustomProperties() ? loadConfiguredInputs(getTokenPatterns()) : [];
}

function showUnknownCustomPropertyConfigurationWarning(): void {
  const shouldCheck = shouldCheckUnknownCustomProperties();
  const tokenPatterns = getTokenPatterns();
  let nextWarningKey: string | null = null;
  let message: string | null = null;

  if (shouldCheck && tokenPatterns.length === 0) {
    nextWarningKey = "enabled-without-token-files";
    message =
      "CSS Property Type Validator: unknown custom property checks are enabled without tokenFiles. Configure tokenFiles to avoid false positives from project-wide custom properties outside the validation/import path.";
  } else if (!shouldCheck && tokenPatterns.length > 0) {
    nextWarningKey = "token-files-disabled";
    message =
      "CSS Property Type Validator: tokenFiles are ignored unless checkUnknownCustomProperties is enabled.";
  }

  if (!message || nextWarningKey === lastConfigurationWarningKey) {
    lastConfigurationWarningKey = nextWarningKey;
    return;
  }

  lastConfigurationWarningKey = nextWarningKey;
  void vscode.window.showWarningMessage(message);
}

function getWorkspaceFolderForPath(filePath: string): vscode.WorkspaceFolder | undefined {
  return vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
}

function resolveImportPath(specifier: string, fromPath: string): string | null {
  if (!specifier.startsWith("/")) {
    return path.resolve(path.dirname(fromPath), specifier);
  }

  const workspaceFolder = getWorkspaceFolderForPath(fromPath);
  return workspaceFolder ? path.join(workspaceFolder.uri.fsPath, specifier.slice(1)) : null;
}

function createImportResolver(): ResolveImport {
  return (specifier: string, fromPath: string) => {
    const resolvedPath = resolveImportPath(specifier, fromPath);

    if (!resolvedPath || !resolvedPath.endsWith(".css")) {
      return null;
    }

    try {
      return {
        css: fs.readFileSync(resolvedPath, "utf8"),
        path: resolvedPath,
      };
    } catch {
      return null;
    }
  };
}

function toVsCodeDiagnostic(diagnostic: ValidationDiagnostic): vscode.Diagnostic {
  const range = toPlainRange(diagnostic.loc);
  const vscodeDiagnostic = new vscode.Diagnostic(
    new vscode.Range(range.start.line, range.start.character, range.end.line, range.end.character),
    diagnostic.message,
    vscode.DiagnosticSeverity.Error,
  );

  vscodeDiagnostic.code = getDiagnosticCode(diagnostic);
  vscodeDiagnostic.source = DIAGNOSTIC_SOURCE;

  return vscodeDiagnostic;
}

function setDiagnostics(diagnostics: ValidationDiagnostic[]): void {
  const diagnosticsByPath = new Map<string, vscode.Diagnostic[]>();

  // Core returns a flat diagnostic list. VS Code stores diagnostics per URI,
  // so first group each diagnostic by the file it belongs to.
  for (const diagnostic of diagnostics) {
    const entries = diagnosticsByPath.get(diagnostic.filePath) ?? [];
    entries.push(toVsCodeDiagnostic(diagnostic));
    diagnosticsByPath.set(diagnostic.filePath, entries);
  }

  const nextUris = new Set<string>();

  // Replace diagnostics for every file reported in this validation pass and
  // remember which URIs are now owned by the extension.
  for (const [filePath, entries] of diagnosticsByPath) {
    const uri = vscode.Uri.file(filePath);
    diagnosticCollection.set(uri, entries);
    nextUris.add(uri.toString());
  }

  // Files that had diagnostics in the previous pass may now be clean. VS Code
  // only clears them if we explicitly delete that URI from the collection.
  for (const uriString of diagnosticUris) {
    if (!nextUris.has(uriString)) {
      diagnosticCollection.delete(vscode.Uri.parse(uriString));
    }
  }

  // Keep our URI cache in sync with the latest validation pass so the next run
  // knows exactly which stale diagnostics may need to be cleared.
  diagnosticUris.clear();
  for (const uriString of nextUris) {
    diagnosticUris.add(uriString);
  }
}

function getOpenCssInputs(): ValidationInput[] {
  return vscode.workspace.textDocuments.filter(isCssFileDocument).map((document) => ({
    css: document.getText(),
    path: document.uri.fsPath,
  }));
}

function validateOpenCssDocuments(): void {
  const inputs = getOpenCssInputs();
  const result = validateFiles(inputs, {
    checkUnresolvedCustomProperties: shouldCheckUnknownCustomProperties(),
    knownCustomPropertyInputs,
    registryInputs,
    resolveImport: createImportResolver(),
  });

  setDiagnostics(result.diagnostics);
}

function scheduleValidation(document: vscode.TextDocument, delay = VALIDATION_DEBOUNCE_MS): void {
  if (!isCssFileDocument(document)) {
    return;
  }

  const key = document.uri.toString();
  const existingTimer = validationTimers.get(key);

  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  validationTimers.set(
    key,
    setTimeout(() => {
      validationTimers.delete(key);
      validateOpenCssDocuments();
    }, delay),
  );
}

async function reloadRegistryAndValidate(): Promise<void> {
  showUnknownCustomPropertyConfigurationWarning();
  registryInputs = await loadRegistryInputs();
  knownCustomPropertyInputs = await loadKnownCustomPropertyInputs();
  validateOpenCssDocuments();
}

async function handleSavedDocument(document: vscode.TextDocument): Promise<void> {
  if (isCssFileDocument(document)) {
    await reloadRegistryAndValidate();
  }
}

function handleClosedDocument(document: vscode.TextDocument): void {
  if (!isCssFileDocument(document)) {
    return;
  }

  validateOpenCssDocuments();
}

async function handleConfigurationChanged(event: vscode.ConfigurationChangeEvent): Promise<void> {
  if (
    event.affectsConfiguration("cssPropertyTypeValidator.registryFiles") ||
    event.affectsConfiguration("cssPropertyTypeValidator.tokenFiles") ||
    event.affectsConfiguration("cssPropertyTypeValidator.checkUnknownCustomProperties")
  ) {
    await reloadRegistryAndValidate();
  }
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  diagnosticCollection = vscode.languages.createDiagnosticCollection("css-property-type-validator");
  context.subscriptions.push(diagnosticCollection);

  context.subscriptions.push(
    vscode.commands.registerCommand("cssPropertyTypeValidator.refresh", reloadRegistryAndValidate),
    vscode.workspace.onDidOpenTextDocument((document) => scheduleValidation(document, 0)),
    vscode.workspace.onDidChangeTextDocument((event) => scheduleValidation(event.document)),
    vscode.workspace.onDidSaveTextDocument(handleSavedDocument),
    vscode.workspace.onDidCloseTextDocument(handleClosedDocument),
    vscode.workspace.onDidChangeConfiguration(handleConfigurationChanged),
  );

  await reloadRegistryAndValidate();
}

export function deactivate(): void {
  for (const timer of validationTimers.values()) {
    clearTimeout(timer);
  }

  validationTimers.clear();
}
