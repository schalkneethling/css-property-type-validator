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

async function replaceEditorContents(page: Page, css: string) {
  const editor = page.getByRole("textbox", { name: "CSS input" });

  await editor.click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await page.keyboard.type(css);
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
