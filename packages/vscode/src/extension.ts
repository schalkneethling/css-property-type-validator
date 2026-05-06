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
const validationTimers = new Map<string, NodeJS.Timeout>();
const diagnosticUris = new Set<string>();

function isCssFileDocument(document: vscode.TextDocument): boolean {
  return (
    document.uri.scheme === DOCUMENT_SELECTOR.scheme &&
    document.languageId === DOCUMENT_SELECTOR.language
  );
}

function getRegistryPatterns(): string[] {
  return vscode.workspace
    .getConfiguration("cssPropertyTypeValidator")
    .get<string[]>("registryFiles", [])
    .filter((pattern) => pattern.trim().length > 0);
}

async function readWorkspaceFile(uri: vscode.Uri): Promise<string> {
  const bytes = await vscode.workspace.fs.readFile(uri);
  return new TextDecoder().decode(bytes);
}

async function loadRegistryInputs(): Promise<ValidationInput[]> {
  const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
  const patterns = getRegistryPatterns();
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

  if (inputs.length === 0) {
    setDiagnostics([]);
    return;
  }

  const result = validateFiles(inputs, {
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
  registryInputs = await loadRegistryInputs();
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

  diagnosticCollection.delete(document.uri);
  diagnosticUris.delete(document.uri.toString());
}

async function handleConfigurationChanged(event: vscode.ConfigurationChangeEvent): Promise<void> {
  if (event.affectsConfiguration("cssPropertyTypeValidator.registryFiles")) {
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
