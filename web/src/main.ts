import {
  formatValidationResult,
  validateFiles,
  type OutputFormat,
  type ValidationInput,
  type ValidationResult,
} from "@schalkneethling/css-property-type-validator-core";

import "./components/code-editor.js";

const DEFAULT_CSS = `@property --brand-color {
  syntax: "<color>";
  inherits: true;
  initial-value: transparent;
}

.card {
  inline-size: var(--brand-color);
}`;

const INITIAL_OUTPUT = "Run validation to see diagnostics here.";

interface CodeEditorElement extends HTMLElement {
  language: "css" | "json" | "text";
  value: string;
}

function queryElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }

  return element;
}

function requireCachedValue<T>(value: T | null, name: string): T {
  if (value === null) {
    throw new Error(`Missing cached element: ${name}`);
  }

  return value;
}

function tokenInputPath(file: File, index: number): string {
  return file.webkitRelativePath || file.name || `tokens-${index + 1}.css`;
}

class ValidatorController extends HTMLElement {
  #cssSource = DEFAULT_CSS;
  #fileName = "pasted.css";
  #checkUnknownCustomProperties = false;
  #outputFormat: OutputFormat = "human";
  #result: ValidationResult | null = null;
  #tokenInputs: ValidationInput[] = [];

  #abortController: AbortController | null = null;
  #checkUnknownCustomPropertiesInput: HTMLInputElement | null = null;
  #fileInput: HTMLInputElement | null = null;
  #fileNameElement: HTMLElement | null = null;
  #inputEditor: CodeEditorElement | null = null;
  #outputEditor: CodeEditorElement | null = null;
  #outputFormatInputs: HTMLInputElement[] = [];
  #statDiagnostics: HTMLElement | null = null;
  #statRegistered: HTMLElement | null = null;
  #statSkipped: HTMLElement | null = null;
  #statValidated: HTMLElement | null = null;
  #tokenFileInput: HTMLInputElement | null = null;
  #validationStatus: HTMLElement | null = null;
  #validateButton: HTMLButtonElement | null = null;

  connectedCallback(): void {
    this.#abortController = new AbortController();
    this.#cacheDOMElements();
    this.#initializeDOM();
    this.#addEventListeners();
  }

  disconnectedCallback(): void {
    this.#abortController?.abort();
    this.#abortController = null;
  }

  #cacheDOMElements(): void {
    this.#checkUnknownCustomPropertiesInput = queryElement<HTMLInputElement>(
      this,
      ".js-check-unknown-custom-properties",
    );
    this.#fileInput = queryElement<HTMLInputElement>(this, ".js-file-input");
    this.#fileNameElement = queryElement<HTMLElement>(this, ".js-file-name");
    this.#inputEditor = queryElement<CodeEditorElement>(this, ".js-input-editor");
    this.#outputEditor = queryElement<CodeEditorElement>(this, ".js-output-editor");
    this.#outputFormatInputs = Array.from(
      this.querySelectorAll<HTMLInputElement>(".js-output-format"),
    );
    this.#statDiagnostics = queryElement<HTMLElement>(this, ".js-stat-diagnostics");
    this.#statRegistered = queryElement<HTMLElement>(this, ".js-stat-registered");
    this.#statSkipped = queryElement<HTMLElement>(this, ".js-stat-skipped");
    this.#statValidated = queryElement<HTMLElement>(this, ".js-stat-validated");
    this.#tokenFileInput = queryElement<HTMLInputElement>(this, ".js-token-file-input");
    this.#validationStatus = queryElement<HTMLElement>(this, ".js-validation-status");
    this.#validateButton = queryElement<HTMLButtonElement>(this, ".js-validate-button");
  }

  #initializeDOM(): void {
    const inputEditor = requireCachedValue(this.#inputEditor, "input editor");
    const outputEditor = requireCachedValue(this.#outputEditor, "output editor");
    const fileNameElement = requireCachedValue(this.#fileNameElement, "file name");

    inputEditor.value = this.#cssSource;
    outputEditor.value = INITIAL_OUTPUT;
    fileNameElement.textContent = this.#fileName;
    requireCachedValue(this.#tokenFileInput, "token file input").disabled = true;
  }

  #addEventListeners(): void {
    const abortController = requireCachedValue(this.#abortController, "abort controller");
    const checkUnknownCustomPropertiesInput = requireCachedValue(
      this.#checkUnknownCustomPropertiesInput,
      "unknown custom properties input",
    );
    const fileInput = requireCachedValue(this.#fileInput, "file input");
    const inputEditor = requireCachedValue(this.#inputEditor, "input editor");
    const tokenFileInput = requireCachedValue(this.#tokenFileInput, "token file input");
    const validateButton = requireCachedValue(this.#validateButton, "validate button");
    const { signal } = abortController;

    checkUnknownCustomPropertiesInput.addEventListener(
      "change",
      this.#handleUnknownCustomPropertiesChange,
      { signal },
    );
    fileInput.addEventListener("change", this.#handleFileSelection, { signal });
    inputEditor.addEventListener("editor-change", this.#handleEditorChange, { signal });
    tokenFileInput.addEventListener("change", this.#handleTokenFileSelection, { signal });
    validateButton.addEventListener("click", this.#validateCss, { signal });

    for (const input of this.#outputFormatInputs) {
      input.addEventListener("change", this.#handleFormatChange, { signal });
    }
  }

  #handleEditorChange = (event: Event): void => {
    this.#cssSource = (event as CustomEvent<string>).detail;
  };

  #handleUnknownCustomPropertiesChange = (event: Event): void => {
    this.#checkUnknownCustomProperties = (event.currentTarget as HTMLInputElement).checked;
    requireCachedValue(this.#tokenFileInput, "token file input").disabled =
      !this.#checkUnknownCustomProperties;
  };

  #handleFileSelection = async (event: Event): Promise<void> => {
    const input = event.currentTarget as HTMLInputElement;
    const [file] = Array.from(input.files ?? []);

    if (!file) {
      return;
    }

    this.#cssSource = await file.text();
    this.#fileName = file.name || "pasted.css";
    requireCachedValue(this.#inputEditor, "input editor").value = this.#cssSource;
    requireCachedValue(this.#fileNameElement, "file name").textContent = this.#fileName;
    input.value = "";
  };

  #handleTokenFileSelection = async (event: Event): Promise<void> => {
    const input = event.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);

    this.#tokenInputs = await Promise.all(
      files.map(async (file, index) => ({
        path: tokenInputPath(file, index),
        css: await file.text(),
      })),
    );
    input.value = "";
  };

  #handleFormatChange = (event: Event): void => {
    const input = event.currentTarget as HTMLInputElement;

    this.#outputFormat = input.value === "json" ? "json" : "human";
    this.#renderOutput();
  };

  #validateCss = (): void => {
    this.#result = validateFiles(
      [
        {
          path: this.#fileName || "pasted.css",
          css: this.#cssSource,
        },
      ],
      {
        checkUnresolvedCustomProperties: this.#checkUnknownCustomProperties,
        knownCustomPropertyInputs: this.#checkUnknownCustomProperties ? this.#tokenInputs : [],
      },
    );
    this.#renderOutput();
    this.#renderStatus();
    this.#renderStats();
  };

  #renderOutput(): void {
    const outputEditor = requireCachedValue(this.#outputEditor, "output editor");

    outputEditor.language = this.#outputFormat === "json" ? "json" : "text";
    outputEditor.value = this.#result
      ? formatValidationResult(this.#result, this.#outputFormat)
      : INITIAL_OUTPUT;
  }

  #renderStats(): void {
    const statDiagnostics = requireCachedValue(this.#statDiagnostics, "diagnostics stat");
    const statRegistered = requireCachedValue(this.#statRegistered, "registered stat");
    const statSkipped = requireCachedValue(this.#statSkipped, "skipped stat");
    const statValidated = requireCachedValue(this.#statValidated, "validated stat");

    statDiagnostics.textContent = String(this.#result?.diagnostics.length ?? "—");
    statRegistered.textContent = String(this.#result?.registry.length ?? "—");
    statSkipped.textContent = String(this.#result?.skippedDeclarations ?? "—");
    statValidated.textContent = String(this.#result?.validatedDeclarations ?? "—");
  }

  #renderStatus(): void {
    const validationStatus = requireCachedValue(this.#validationStatus, "validation status");
    const hasPassed = Boolean(this.#result && this.#result.diagnostics.length === 0);
    const configurationWarning = this.#configurationWarning();

    validationStatus.replaceChildren();
    validationStatus.hidden = !configurationWarning && !hasPassed;

    if (configurationWarning) {
      const warning = document.createElement("div");
      const heading = document.createElement("strong");
      const detail = document.createElement("span");

      warning.className = "warning-message";
      warning.role = "status";
      heading.textContent = "Configuration warning.";
      detail.textContent = configurationWarning;
      warning.append(heading, detail);
      validationStatus.append(warning);
    }

    if (!hasPassed) {
      return;
    }

    const message = document.createElement("div");
    const heading = document.createElement("strong");
    const detail = document.createElement("span");

    message.className = "success-message";
    message.role = "status";
    heading.textContent = "No validation issues found.";
    detail.textContent = "Your registered custom properties matched the checked declarations.";

    message.append(heading, detail);
    validationStatus.append(message);
  }

  #configurationWarning(): string | null {
    if (this.#checkUnknownCustomProperties && this.#tokenInputs.length === 0) {
      return "Choose token files to reduce false positives from project-wide custom properties outside the pasted CSS.";
    }

    if (!this.#checkUnknownCustomProperties && this.#tokenInputs.length > 0) {
      return "Token files are ignored while unknown custom property checks are off.";
    }

    return null;
  }
}

if (!customElements.get("css-validator-controller")) {
  customElements.define("css-validator-controller", ValidatorController);
}
