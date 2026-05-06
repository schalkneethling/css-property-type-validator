import assert from "node:assert/strict";
import path from "node:path";

import * as vscode from "vscode";

// This file uses .cts so TypeScript emits CommonJS for Mocha inside
// @vscode/test-electron while the extension package itself remains ESM.
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDiagnostics(uri: vscode.Uri, count: number): Promise<vscode.Diagnostic[]> {
  const deadline = Date.now() + 5000;

  // Diagnostics are published by the extension host after document and
  // configuration events settle, so tests poll the VS Code diagnostics API
  // instead of assuming the update is synchronous with the triggering action.
  while (Date.now() < deadline) {
    const diagnostics = vscode.languages.getDiagnostics(uri);

    if (diagnostics.length === count) {
      return diagnostics;
    }

    await delay(100);
  }

  const diagnostics = vscode.languages.getDiagnostics(uri);
  assert.equal(diagnostics.length, count);
  return diagnostics;
}

async function writeWorkspaceFile(relativePath: string, content: string): Promise<vscode.Uri> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(workspaceFolder, "Expected the extension tests to run with a workspace folder.");

  const uri = vscode.Uri.file(path.join(workspaceFolder.uri.fsPath, relativePath));
  await vscode.workspace.fs.writeFile(uri, Buffer.from(content, "utf8"));
  return uri;
}

suite("CSS Property Type Validator extension", () => {
  setup(async () => {
    await vscode.extensions.getExtension("schalkneethling.css-property-type-validator")?.activate();
  });

  teardown(async () => {
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    await vscode.workspace
      .getConfiguration("cssPropertyTypeValidator")
      .update("registryFiles", undefined, vscode.ConfigurationTarget.Workspace);
  });

  test("reports and clears diagnostics for an open CSS document", async () => {
    const componentUri = await writeWorkspaceFile(
      "inline-component.css",
      [
        '@property --brand-color { syntax: "<color>"; inherits: true; initial-value: transparent; }',
        ".card { inline-size: var(--brand-color); }",
      ].join("\n"),
    );
    const document = await vscode.workspace.openTextDocument(componentUri);

    await vscode.window.showTextDocument(document);

    const diagnostics = await waitForDiagnostics(document.uri, 1);
    assert.equal(diagnostics[0]?.source, "CSS Property Type Validator");
    assert.equal(diagnostics[0]?.code, "incompatible-var-substitution");

    const edit = new vscode.WorkspaceEdit();
    edit.replace(
      document.uri,
      new vscode.Range(0, 0, document.lineCount, 0),
      [
        '@property --brand-color { syntax: "<color>"; inherits: true; initial-value: transparent; }',
        ".card { color: var(--brand-color); }",
      ].join("\n"),
    );

    await vscode.workspace.applyEdit(edit);
    await waitForDiagnostics(document.uri, 0);
  });

  test("reports diagnostics when only a registry file is configured", async () => {
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    const registryUri = await writeWorkspaceFile(
      "registry-only-tokens.css",
      '@property --bad { syntax: "<color"; inherits: true; initial-value: transparent; }',
    );

    await vscode.workspace
      .getConfiguration("cssPropertyTypeValidator")
      .update("registryFiles", ["registry-only-tokens.css"], vscode.ConfigurationTarget.Workspace);
    await vscode.commands.executeCommand("cssPropertyTypeValidator.refresh");

    const diagnostics = await waitForDiagnostics(registryUri, 1);
    assert.equal(diagnostics[0]?.code, "invalid-syntax-descriptor");
  });

  test("keeps configured registry diagnostics after closing the registry document", async () => {
    const registryUri = await writeWorkspaceFile(
      "closable-tokens.css",
      '@property --bad-space { syntax: "<length>"; inherits: maybe; initial-value: 0px; }',
    );

    await vscode.workspace
      .getConfiguration("cssPropertyTypeValidator")
      .update("registryFiles", ["closable-tokens.css"], vscode.ConfigurationTarget.Workspace);

    const document = await vscode.workspace.openTextDocument(registryUri);
    await vscode.window.showTextDocument(document);
    await vscode.commands.executeCommand("cssPropertyTypeValidator.refresh");

    const diagnostics = await waitForDiagnostics(registryUri, 1);
    assert.equal(diagnostics[0]?.code, "invalid-inherits-descriptor");

    await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
    await waitForDiagnostics(registryUri, 1);
  });

  test("uses configured registry files and refreshes diagnostics", async () => {
    await writeWorkspaceFile(
      "tokens.css",
      '@property --space { syntax: "<color>"; inherits: false; initial-value: red; }',
    );
    const componentUri = await writeWorkspaceFile(
      "component.css",
      ".card { inline-size: var(--space); }",
    );

    await vscode.workspace
      .getConfiguration("cssPropertyTypeValidator")
      .update("registryFiles", ["tokens.css"], vscode.ConfigurationTarget.Workspace);

    const document = await vscode.workspace.openTextDocument(componentUri);
    await vscode.window.showTextDocument(document);

    await waitForDiagnostics(componentUri, 1);

    await writeWorkspaceFile(
      "tokens.css",
      '@property --space { syntax: "<length>"; inherits: false; initial-value: 0px; }',
    );
    await vscode.commands.executeCommand("cssPropertyTypeValidator.refresh");

    await waitForDiagnostics(componentUri, 0);
  });
});
