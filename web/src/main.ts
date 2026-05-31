import {
  formatValidationResult,
  generatePropertyRegistrations,
  validateFiles,
  type GeneratePropertyRegistrationsResult,
  type OutputFormat,
  type ValidationInput,
  type ValidationResult,
} from "@schalkneethling/css-property-type-validator-core";

import "./components/code-editor.js";

const VALIDATION_DEFAULT_CSS = `@property --brand-color {
  syntax: "<color>";
  inherits: true;
  initial-value: transparent;
}

.card {
  inline-size: var(--brand-color);
}`;

const GENERATION_DEFAULT_CSS = `:root {
  --brand-color: red;
  --space: 1px;
}

.card {
  color: var(--brand-color);
  inline-size: var(--space);
}`;

const INITIAL_OUTPUT = "Run validation to see diagnostics here.";
const INITIAL_GENERATION_OUTPUT = "Generate registrations to preview properties.css here.";
const FEEDBACK_URL = "https://github.com/schalkneethling/css-property-type-validator/issues/98";

type AppMode = "validate" | "generate";

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
  #cssSource = VALIDATION_DEFAULT_CSS;
  #fileName = "pasted.css";
  #fileInputs: ValidationInput[] = [];
  #checkUnknownCustomProperties = false;
  #mode: AppMode = "validate";
  #outputFormat: OutputFormat = "human";
  #generationResult: GeneratePropertyRegistrationsResult | null = null;
  #result: ValidationResult | null = null;
  #tokenInputs: ValidationInput[] = [];

  #abortController: AbortController | null = null;
  #checkUnknownCustomPropertiesInput: HTMLInputElement | null = null;
  #fileInput: HTMLInputElement | null = null;
  #fileNameElement: HTMLElement | null = null;
  #generateButton: HTMLButtonElement | null = null;
  #inputEditor: CodeEditorElement | null = null;
  #modeInputs: HTMLInputElement[] = [];
  #outputEditor: CodeEditorElement | null = null;
  #outputFormatInputs: HTMLInputElement[] = [];
  #outputTitle: HTMLElement | null = null;
  #statDiagnostics: HTMLElement | null = null;
  #statDiagnosticsLabel: HTMLElement | null = null;
  #statRegistered: HTMLElement | null = null;
  #statRegisteredLabel: HTMLElement | null = null;
  #statSkipped: HTMLElement | null = null;
  #statSkippedLabel: HTMLElement | null = null;
  #statValidated: HTMLElement | null = null;
  #statValidatedLabel: HTMLElement | null = null;
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
    this.#generateButton = queryElement<HTMLButtonElement>(this, ".js-generate-button");
    this.#inputEditor = queryElement<CodeEditorElement>(this, ".js-input-editor");
    this.#modeInputs = Array.from(this.querySelectorAll<HTMLInputElement>(".js-mode"));
    this.#outputEditor = queryElement<CodeEditorElement>(this, ".js-output-editor");
    this.#outputFormatInputs = Array.from(
      this.querySelectorAll<HTMLInputElement>(".js-output-format"),
    );
    this.#outputTitle = queryElement<HTMLElement>(this, ".js-output-title");
    this.#statDiagnostics = queryElement<HTMLElement>(this, ".js-stat-diagnostics");
    this.#statDiagnosticsLabel = queryElement<HTMLElement>(this, ".js-stat-diagnostics-label");
    this.#statRegistered = queryElement<HTMLElement>(this, ".js-stat-registered");
    this.#statRegisteredLabel = queryElement<HTMLElement>(this, ".js-stat-registered-label");
    this.#statSkipped = queryElement<HTMLElement>(this, ".js-stat-skipped");
    this.#statSkippedLabel = queryElement<HTMLElement>(this, ".js-stat-skipped-label");
    this.#statValidated = queryElement<HTMLElement>(this, ".js-stat-validated");
    this.#statValidatedLabel = queryElement<HTMLElement>(this, ".js-stat-validated-label");
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
    this.#renderMode();
  }

  #addEventListeners(): void {
    const abortController = requireCachedValue(this.#abortController, "abort controller");
    const checkUnknownCustomPropertiesInput = requireCachedValue(
      this.#checkUnknownCustomPropertiesInput,
      "unknown custom properties input",
    );
    const fileInput = requireCachedValue(this.#fileInput, "file input");
    const generateButton = requireCachedValue(this.#generateButton, "generate button");
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
    generateButton.addEventListener("click", this.#generateCss, { signal });
    inputEditor.addEventListener("editor-change", this.#handleEditorChange, { signal });
    tokenFileInput.addEventListener("change", this.#handleTokenFileSelection, { signal });
    validateButton.addEventListener("click", this.#validateCss, { signal });

    for (const input of this.#outputFormatInputs) {
      input.addEventListener("change", this.#handleFormatChange, { signal });
    }

    for (const input of this.#modeInputs) {
      input.addEventListener("change", this.#handleModeChange, { signal });
    }
  }

  #handleEditorChange = (event: Event): void => {
    this.#cssSource = (event as CustomEvent<string>).detail;
    this.#fileInputs = [];
    this.#result = null;
    this.#generationResult = null;
  };

  #handleUnknownCustomPropertiesChange = (event: Event): void => {
    this.#checkUnknownCustomProperties = (event.currentTarget as HTMLInputElement).checked;
    requireCachedValue(this.#tokenFileInput, "token file input").disabled =
      !this.#checkUnknownCustomProperties;
  };

  #handleFileSelection = async (event: Event): Promise<void> => {
    const input = event.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    const [file] = files;

    if (!file) {
      return;
    }

    this.#fileInputs = await Promise.all(
      files.map(async (selectedFile, index) => ({
        path: tokenInputPath(selectedFile, index),
        css: await selectedFile.text(),
      })),
    );
    this.#cssSource = this.#fileInputs[0]?.css ?? "";
    this.#fileName =
      files.length === 1 ? file.name || "pasted.css" : `${files.length} CSS files selected`;
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

  #handleModeChange = (event: Event): void => {
    const input = event.currentTarget as HTMLInputElement;
    const nextMode: AppMode = input.value === "generate" ? "generate" : "validate";

    this.#updateDefaultExample(nextMode);
    this.#mode = nextMode;
    this.#renderMode();
    this.#renderOutput();
    this.#renderStatus();
    this.#renderStats();
  };

  #validateCss = (): void => {
    this.#result = validateFiles(this.#activeInputs(), {
      checkUnresolvedCustomProperties: this.#checkUnknownCustomProperties,
      knownCustomPropertyInputs: this.#checkUnknownCustomProperties ? this.#tokenInputs : [],
    });
    this.#renderOutput();
    this.#renderStatus();
    this.#renderStats();
  };

  #generateCss = (): void => {
    this.#generationResult = generatePropertyRegistrations(
      [...this.#activeInputs(), ...this.#tokenInputs],
      { outFile: "properties.css" },
    );
    this.#renderOutput();
    this.#renderStatus();
    this.#renderStats();
  };

  #activeInputs(): ValidationInput[] {
    return this.#fileInputs.length > 0
      ? this.#fileInputs
      : [
          {
            path: this.#fileName || "pasted.css",
            css: this.#cssSource,
          },
        ];
  }

  #updateDefaultExample(nextMode: AppMode): void {
    const nextDefault = nextMode === "validate" ? VALIDATION_DEFAULT_CSS : GENERATION_DEFAULT_CSS;
    const currentIsDefault =
      this.#cssSource === VALIDATION_DEFAULT_CSS || this.#cssSource === GENERATION_DEFAULT_CSS;

    if (!currentIsDefault) {
      return;
    }

    this.#cssSource = nextDefault;
    this.#fileInputs = [];
    this.#fileName = "pasted.css";
    this.#result = null;
    this.#generationResult = null;
    requireCachedValue(this.#inputEditor, "input editor").value = this.#cssSource;
    requireCachedValue(this.#fileNameElement, "file name").textContent = this.#fileName;
  }

  #renderMode(): void {
    const checkUnknownCustomPropertiesInput = requireCachedValue(
      this.#checkUnknownCustomPropertiesInput,
      "unknown custom properties input",
    );
    const generateButton = requireCachedValue(this.#generateButton, "generate button");
    const outputTitle = requireCachedValue(this.#outputTitle, "output title");
    const tokenFileInput = requireCachedValue(this.#tokenFileInput, "token file input");
    const validateButton = requireCachedValue(this.#validateButton, "validate button");

    validateButton.hidden = this.#mode !== "validate";
    generateButton.hidden = this.#mode !== "generate";
    checkUnknownCustomPropertiesInput.disabled = this.#mode !== "validate";
    tokenFileInput.disabled =
      this.#mode === "validate" ? !this.#checkUnknownCustomProperties : false;
    outputTitle.textContent = this.#mode === "validate" ? "Validation result" : "properties.css";
  }

  #renderOutput(): void {
    const outputEditor = requireCachedValue(this.#outputEditor, "output editor");

    if (this.#mode === "generate") {
      outputEditor.language = this.#outputFormat === "json" ? "json" : "css";
      outputEditor.value = this.#generationResult
        ? this.#outputFormat === "json"
          ? JSON.stringify(this.#generationResult, null, 2)
          : this.#generationResult.css || "No ready registrations generated. Review JSON output."
        : INITIAL_GENERATION_OUTPUT;
      return;
    }

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

    const statDiagnosticsLabel = requireCachedValue(
      this.#statDiagnosticsLabel,
      "diagnostics label",
    );
    const statRegisteredLabel = requireCachedValue(this.#statRegisteredLabel, "registered label");
    const statSkippedLabel = requireCachedValue(this.#statSkippedLabel, "skipped label");
    const statValidatedLabel = requireCachedValue(this.#statValidatedLabel, "validated label");

    if (this.#mode === "generate") {
      statDiagnosticsLabel.textContent = "Diagnostics";
      statRegisteredLabel.textContent = "Generated";
      statValidatedLabel.textContent = "Review";
      statSkippedLabel.textContent = "Total";
      statDiagnostics.textContent = String(this.#generationResult?.diagnostics.length ?? "—");
      statRegistered.textContent = String(this.#generationResult?.generatedCount ?? "—");
      statValidated.textContent = String(this.#generationResult?.reviewCount ?? "—");
      statSkipped.textContent = String(this.#generationResult?.candidates.length ?? "—");
      return;
    }

    statDiagnosticsLabel.textContent = "Diagnostics";
    statRegisteredLabel.textContent = "Registered";
    statValidatedLabel.textContent = "Validated";
    statSkippedLabel.textContent = "Skipped";
    statDiagnostics.textContent = String(this.#result?.diagnostics.length ?? "—");
    statRegistered.textContent = String(this.#result?.registry.length ?? "—");
    statSkipped.textContent = String(this.#result?.skippedDeclarations ?? "—");
    statValidated.textContent = String(this.#result?.validatedDeclarations ?? "—");
  }

  #renderStatus(): void {
    const validationStatus = requireCachedValue(this.#validationStatus, "validation status");
    const generationResult = this.#generationResult;

    if (this.#mode === "generate") {
      validationStatus.replaceChildren();
      validationStatus.hidden = !generationResult;

      if (!generationResult) {
        return;
      }

      const message = document.createElement("div");
      const heading = document.createElement("strong");
      const detail = document.createElement("span");
      const feedback = document.createElement("a");

      message.className = generationResult.reviewCount > 0 ? "warning-message" : "success-message";
      message.role = "status";
      heading.textContent =
        generationResult.reviewCount > 0
          ? "Review generated registrations."
          : "Generated registrations are valid.";
      detail.textContent = `${generationResult.generatedCount} ready, ${generationResult.reviewCount} need review. `;
      feedback.href = FEEDBACK_URL;
      feedback.textContent = "Share feedback on issue #98.";
      message.append(heading, detail, feedback);
      validationStatus.append(message);
      return;
    }

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
