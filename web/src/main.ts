import {
  formatValidationResult,
  validateFiles,
  type OutputFormat,
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
  if (!value) {
    throw new Error(`Missing cached element: ${name}`);
  }

  return value;
}

class ValidatorController extends HTMLElement {
  #cssSource = DEFAULT_CSS;
  #fileName = "pasted.css";
  #outputFormat: OutputFormat = "human";
  #result: ValidationResult | null = null;

  #abortController: AbortController | null = null;
  #fileInput: HTMLInputElement | null = null;
  #fileNameElement: HTMLElement | null = null;
  #inputEditor: CodeEditorElement | null = null;
  #outputEditor: CodeEditorElement | null = null;
  #outputFormatInputs: HTMLInputElement[] = [];
  #statDiagnostics: HTMLElement | null = null;
  #statRegistered: HTMLElement | null = null;
  #statSkipped: HTMLElement | null = null;
  #statValidated: HTMLElement | null = null;
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
  }

  #addEventListeners(): void {
    const abortController = requireCachedValue(this.#abortController, "abort controller");
    const fileInput = requireCachedValue(this.#fileInput, "file input");
    const inputEditor = requireCachedValue(this.#inputEditor, "input editor");
    const validateButton = requireCachedValue(this.#validateButton, "validate button");
    const { signal } = abortController;

    fileInput.addEventListener("change", this.#handleFileSelection, { signal });
    inputEditor.addEventListener("editor-change", this.#handleEditorChange, { signal });
    validateButton.addEventListener("click", this.#validateCss, { signal });

    for (const input of this.#outputFormatInputs) {
      input.addEventListener("change", this.#handleFormatChange, { signal });
    }
  }

  #handleEditorChange = (event: Event): void => {
    this.#cssSource = (event as CustomEvent<string>).detail;

    if (!this.#fileName) {
      this.#fileName = "pasted.css";
    }
  };

  #handleFileSelection = async (event: Event): Promise<void> => {
    const input = event.currentTarget as HTMLInputElement;
    const [file] = Array.from(input.files ?? []);

    if (!file) {
      return;
    }

    this.#cssSource = await file.text();
    this.#fileName = file.name;
    requireCachedValue(this.#inputEditor, "input editor").value = this.#cssSource;
    requireCachedValue(this.#fileNameElement, "file name").textContent = this.#fileName;
    input.value = "";
  };

  #handleFormatChange = (event: Event): void => {
    const input = event.currentTarget as HTMLInputElement;

    this.#outputFormat = input.value === "json" ? "json" : "human";
    this.#renderOutput();
  };

  #validateCss = (): void => {
    this.#result = validateFiles([
      {
        path: this.#fileName || "pasted.css",
        css: this.#cssSource,
      },
    ]);
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

    validationStatus.replaceChildren();
    validationStatus.hidden = !hasPassed;

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
}

if (!customElements.get("css-validator-controller")) {
  customElements.define("css-validator-controller", ValidatorController);
}
