import { css as cssLanguage } from "@codemirror/lang-css";
import { json as jsonLanguage } from "@codemirror/lang-json";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";

type EditorLanguage = "css" | "json" | "text";

function languageExtension(language: EditorLanguage): Extension[] {
  if (language === "css") {
    return [cssLanguage()];
  }

  if (language === "json") {
    return [jsonLanguage()];
  }

  return [];
}

function toEditorLanguage(value: string | null): EditorLanguage {
  if (value === "css" || value === "json") {
    return value;
  }

  return "text";
}

export class ValidatorCodeEditor extends HTMLElement {
  static observedAttributes = ["label", "language", "readonly"];

  #editorView: EditorView | null = null;
  #host: HTMLDivElement | null = null;
  #label = "Editor";
  #language: EditorLanguage = "text";
  #readonly = false;
  #value = "";

  get label(): string {
    return this.#label;
  }

  set label(value: string) {
    this.#label = value;
    this.#createEditor();
  }

  get language(): EditorLanguage {
    return this.#language;
  }

  set language(value: EditorLanguage) {
    this.#language = value;
    this.#createEditor();
  }

  get readonly(): boolean {
    return this.#readonly;
  }

  set readonly(value: boolean) {
    this.#readonly = value;
    this.#createEditor();
  }

  get value(): string {
    return this.#value;
  }

  set value(value: string) {
    this.#value = value;
    this.#syncEditorValue();
  }

  connectedCallback(): void {
    this.#label = this.getAttribute("label") ?? this.#label;
    this.#language = toEditorLanguage(this.getAttribute("language"));
    this.#readonly = this.hasAttribute("readonly");
    this.#host = document.createElement("div");
    this.#host.className = "code-editor-host";
    this.replaceChildren(this.#host);
    this.#createEditor();
  }

  disconnectedCallback(): void {
    this.#editorView?.destroy();
    this.#editorView = null;
    this.#host = null;
  }

  attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null): void {
    if (name === "label") {
      this.label = newValue ?? "Editor";
      return;
    }

    if (name === "language") {
      this.language = toEditorLanguage(newValue);
      return;
    }

    if (name === "readonly") {
      this.readonly = newValue !== null;
    }
  }

  #createEditor(): void {
    if (!this.#host) {
      return;
    }

    this.#editorView?.destroy();

    const extensions: Extension[] = [
      basicSetup,
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({
        "aria-label": this.#label,
        role: "textbox",
      }),
      EditorView.updateListener.of((update) => {
        if (!update.docChanged || this.#readonly) {
          return;
        }

        this.#value = update.state.doc.toString();
        this.dispatchEvent(
          new CustomEvent<string>("editor-change", {
            bubbles: true,
            composed: true,
            detail: this.#value,
          }),
        );
      }),
      ...languageExtension(this.#language),
    ];

    if (this.#readonly) {
      extensions.push(EditorState.readOnly.of(true), EditorView.editable.of(false));
    }

    this.#editorView = new EditorView({
      doc: this.#value,
      extensions,
      parent: this.#host,
    });
  }

  #syncEditorValue(): void {
    const currentValue = this.#editorView?.state.doc.toString();

    if (!this.#editorView || currentValue === undefined || this.#value === currentValue) {
      return;
    }

    this.#editorView.dispatch({
      changes: {
        from: 0,
        to: currentValue.length,
        insert: this.#value,
      },
    });
  }
}

if (!customElements.get("validator-code-editor")) {
  customElements.define("validator-code-editor", ValidatorCodeEditor);
}
