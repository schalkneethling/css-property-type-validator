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
