# @schalkneethling/css-property-type-validator-core

Core validation engine for CSS Property Type Validator.

It reads CSS `@property` registrations, builds a registry of typed custom properties, validates registration descriptors, checks compatible `var()` usage against consuming CSS properties, validates simple fallback branches, and checks authored assignments to registered custom properties.

## Install

```bash
pnpm add @schalkneethling/css-property-type-validator-core
```

## Usage

```ts
import { validateFiles } from "@schalkneethling/css-property-type-validator-core";

const result = validateFiles(
  [
    {
      path: "component.css",
      css: ".card { color: var(--brand-color); }",
    },
  ],
  {
    registryInputs: [
      {
        path: "tokens.css",
        css: `
          @property --brand-color {
            syntax: "<color>";
            inherits: true;
            initial-value: transparent;
          }
        `,
      },
    ],
  },
);

console.log(result.diagnostics);
```

Diagnostics include stable machine-readable fields for tooling integrations:

```ts
type ValidationDiagnostic = {
  code:
    | "invalid-property-registration"
    | "incompatible-custom-property-assignment"
    | "incompatible-var-usage"
    | "unresolved-import"
    | "unparseable-stylesheet";
  phase: "parse" | "registry" | "assignment" | "usage" | "import";
  reason:
    | "missing-property-name"
    | "missing-syntax-descriptor"
    | "invalid-syntax-descriptor"
    | "unsupported-syntax-component"
    | "missing-inherits-descriptor"
    | "invalid-inherits-descriptor"
    | "missing-initial-value-descriptor"
    | "invalid-initial-value"
    | "incompatible-assignment-value"
    | "incompatible-var-substitution"
    | "incompatible-var-fallback"
    | "unresolved-import"
    | "unparseable-css";
  severity: "error";
  filePath: string;
  loc: SourceLocation | null;
  message: string;
  descriptorName?: "syntax" | "inherits" | "initial-value";
  propertyName?: string;
  registeredSyntax?: string;
  expectedProperty?: string;
  actualValue?: string;
  importSpecifier?: string;
  snippet?: string;
};
```

`code` is the broad diagnostic category, while `phase` and `reason` are intended for rule mapping, editor diagnostics, filtering, and stable automation. Existing fields such as `propertyName`, `registeredSyntax`, and `expectedProperty` remain available for integrations that already consume them.

Provide `resolveImport` when registry assembly should follow local unconditioned imports:

```ts
const result = validateFiles(inputs, {
  resolveImport: (specifier, fromPath) => {
    // Return { path, css } for local CSS imports, or null when unresolved.
    return null;
  },
});
```

## Notes

- `registryInputs` contribute registrations and registration diagnostics without validating ordinary declarations from those files.
- Unregistered custom properties are ignored.
- Ambiguous cases are skipped conservatively to avoid false positives.
- Remote and conditioned imports are out of scope unless a future validation model can handle them safely.

Repository: [schalkneethling/css-property-type-validator](https://github.com/schalkneethling/css-property-type-validator)
