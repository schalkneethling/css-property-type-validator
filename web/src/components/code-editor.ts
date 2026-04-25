import { css as cssLanguage } from "@codemirror/lang-css";
import { json as jsonLanguage } from "@codemirror/lang-json";
import { Annotation, Compartment, EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";

type EditorLanguage = "css" | "json" | "text";

const programmaticChange = Annotation.define<boolean>();

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

function readonlyExtension(readonly: boolean): Extension[] {
  if (!readonly) {
    return [];
  }

  return [EditorState.readOnly.of(true), EditorView.editable.of(false)];
}

export class ValidatorCodeEditor extends HTMLElement {
  static observedAttributes = ["label", "language", "readonly"];

  #editorView: EditorView | null = null;
  #host: HTMLDivElement | null = null;
  #label = "Editor";
  #labelCompartment = new Compartment();
  #language: EditorLanguage = "text";
  #languageCompartment = new Compartment();
  #readonly = false;
  #readonlyCompartment = new Compartment();
  #value = "";

  get label(): string {
    return this.#label;
  }

  set label(value: string) {
    this.#label = value;
    this.#reconfigureLabel();
  }

  get language(): EditorLanguage {
    return this.#language;
  }

  set language(value: EditorLanguage) {
    this.#language = value;
    this.#editorView?.dispatch({
      effects: this.#languageCompartment.reconfigure(languageExtension(this.#language)),
      annotations: programmaticChange.of(true),
    });
  }

  get readonly(): boolean {
    return this.#readonly;
  }

  set readonly(value: boolean) {
    this.#readonly = value;
    this.#editorView?.dispatch({
      effects: this.#readonlyCompartment.reconfigure(readonlyExtension(this.#readonly)),
      annotations: programmaticChange.of(true),
    });
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
      this.#labelCompartment.of(this.#labelExtension()),
      EditorView.updateListener.of((update) => {
        const isProgrammatic = update.transactions.some((transaction) =>
          transaction.annotation(programmaticChange),
        );

        if (!update.docChanged || this.#readonly || isProgrammatic) {
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
      this.#languageCompartment.of(languageExtension(this.#language)),
      this.#readonlyCompartment.of(readonlyExtension(this.#readonly)),
    ];

    this.#editorView = new EditorView({
      doc: this.#value,
      extensions,
      parent: this.#host,
    });
  }

  #labelExtension(): Extension {
    return EditorView.contentAttributes.of({
      "aria-label": this.#label,
      role: "textbox",
    });
  }

  #reconfigureLabel(): void {
    this.#editorView?.dispatch({
      effects: this.#labelCompartment.reconfigure(this.#labelExtension()),
      annotations: programmaticChange.of(true),
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
      annotations: programmaticChange.of(true),
    });
  }
}

if (!customElements.get("validator-code-editor")) {
  customElements.define("validator-code-editor", ValidatorCodeEditor);
}
