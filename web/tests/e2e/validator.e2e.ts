import { expect, test, type Page } from "@playwright/test";

const INVALID_CSS = `@property --brand-color {
  syntax: "<color>";
  inherits: true;
  initial-value: transparent;
}

.card {
  inline-size: var(--brand-color);
}`;

const VALID_CSS = `@property --space {
  syntax: "<length>";
  inherits: false;
  initial-value: 0px;
}

.card {
  inline-size: var(--space);
}`;

const UNRESOLVED_CSS = `.card {
  color: var(--missing-color);
}`;

async function replaceEditorContents(page: Page, css: string) {
  await page.locator("validator-code-editor.js-input-editor").evaluate((editor, value) => {
    const codeEditor = editor as HTMLElement & { value: string };

    codeEditor.value = value;
    editor.dispatchEvent(
      new CustomEvent("editor-change", {
        bubbles: true,
        composed: true,
        detail: value,
      }),
    );
  }, css);
}

test("renders the validator workspace", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("body")).toMatchAriaSnapshot(`
    - banner:
      - paragraph: Browser validator
      - heading "CSS Property Type Validator" [level=1]
      - paragraph:
        - text: Paste or open a CSS file, then validate typed custom properties and var() usage locally in your browser.
        - link "View repo":
          - /url: https://github.com/schalkneethling/css-property-type-validator
      - region "Validation actions":
        - heading "Validation actions" [level=2]
        - checkbox "Unknown custom properties"
        - text: Unknown custom properties Open Tokens
        - button "Open Tokens" [disabled]
        - text: Open CSS
        - button "Open CSS"
        - button "Validate"
    - main:
      - article "Validator workspace":
        - heading "Validator workspace" [level=2]
        - region "CSS source":
          - paragraph: Input
          - heading "CSS source" [level=2]
          - text: pasted.css
          - textbox "CSS input"
        - region "Validation result":
          - paragraph: Output
          - heading "Validation result" [level=2]
          - group "Output format":
            - text: Output format
            - radio "Human" [checked]
            - text: Human
            - radio "JSON"
            - text: JSON
          - textbox "Validation output"
          - region "Validation summary":
            - heading "Validation summary" [level=3]
            - term: Diagnostics
            - definition: —
            - term: Registered
            - definition: —
            - term: Validated
            - definition: —
            - term: Skipped
            - definition: —
  `);
  await expect(page.getByLabel("Open CSS")).toBeAttached();
});

test("shows a human diagnostic for pasted invalid CSS", async ({ page }) => {
  await page.goto("/");
  await replaceEditorContents(page, INVALID_CSS);
  await page.getByRole("button", { name: "Validate" }).click();
  const outputPanel = page.getByRole("region", { name: "Validation result" });

  await expect(outputPanel.getByText("incompatible-var-usage")).toBeVisible();
  await expect(outputPanel.getByText("Registered property --brand-color")).toContainText(
    "inline-size",
  );
});

test("switches diagnostics to pretty JSON", async ({ page }) => {
  await page.goto("/");
  await replaceEditorContents(page, INVALID_CSS);
  await page.getByRole("button", { name: "Validate" }).click();
  await page.getByLabel("JSON").check();

  await expect(page.getByText('"diagnostics": [')).toBeVisible();
  await expect(page.getByText('"code": "incompatible-var-usage"')).toBeVisible();
});

test("does not show unresolved var diagnostics by default", async ({ page }) => {
  await page.goto("/");
  await replaceEditorContents(page, UNRESOLVED_CSS);
  await page.getByRole("button", { name: "Validate" }).click();

  await expect(page.getByRole("status")).toContainText("No validation issues found.");
  await expect(page.getByText("Custom property --missing-color is not defined")).toBeHidden();
});

test("shows unresolved var diagnostics when enabled", async ({ page }) => {
  await page.goto("/");
  await replaceEditorContents(page, UNRESOLVED_CSS);
  await page.getByLabel("Unknown custom properties").check();
  await page.getByRole("button", { name: "Validate" }).click();

  await expect(page.getByText("Custom property --missing-color is not defined")).toBeVisible();
  await expect(page.getByText("not a full browser cascade evaluation")).toBeVisible();
});

test("warns when unresolved var checks are enabled without token files", async ({ page }) => {
  await page.goto("/");
  await replaceEditorContents(page, `.card {\n  color: var(--missing-color, red);\n}`);
  await page.getByLabel("Unknown custom properties").check();
  await page.getByRole("button", { name: "Validate" }).click();

  await expect(page.getByText("Configuration warning.")).toBeVisible();
  await expect(page.getByText("Choose token files")).toBeVisible();
});

test("uses token files for unresolved var diagnostics when enabled", async ({ page }) => {
  await page.goto("/");
  await replaceEditorContents(page, `.card {\n  color: var(--surface-color);\n}`);
  await page.getByLabel("Unknown custom properties").check();
  await page.getByLabel("Open Tokens").setInputFiles({
    name: "tokens.css",
    mimeType: "text/css",
    buffer: Buffer.from(":root { --surface-color: canvas; }\n"),
  });
  await page.getByRole("button", { name: "Validate" }).click();

  await expect(page.getByRole("status")).toContainText("No validation issues found.");
});

test("shows the success state for valid CSS", async ({ page }) => {
  await page.goto("/");
  await replaceEditorContents(page, VALID_CSS);
  await page.getByRole("button", { name: "Validate" }).click();

  await expect(page.getByRole("status")).toContainText("No validation issues found.");
  await expect(page.getByLabel("Validation summary")).toContainText("Diagnostics");
  await expect(page.getByLabel("Validation summary")).toContainText("0");
});

test("opens a CSS fixture and validates it", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Open CSS").setInputFiles("tests/fixtures/valid.css");

  await expect(page.getByText("valid.css")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "CSS input" })).toContainText("--brand-color");

  await page.getByRole("button", { name: "Validate" }).click();
  await expect(page.getByRole("status")).toContainText("No validation issues found.");
});
