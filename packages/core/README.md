# @schalkneethling/css-property-type-validator-core

Core validation engine for CSS Property Type Validator.

This package reads CSS `@property` registrations, builds a registry of typed custom properties, and validates compatible `var()` usage against consuming CSS properties.

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
      path: "example.css",
      css: `
        .card {
          inline-size: var(--brand-color);
        }
      `,
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

## Notes

- Validates `@property` syntax descriptors
- Builds a registry across provided input files
- Can extend that registry with optional `registryInputs`
- Validates single-`var()` declaration usages
- Ignores unregistered custom properties in the current version

Repository: [schalkneethling/css-property-type-validator](https://github.com/schalkneethling/css-property-type-validator)
