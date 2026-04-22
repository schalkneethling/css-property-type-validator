# @schalkneethling/css-property-type-validator-core

Core validation engine for CSS Property Type Validator.

This package reads CSS `@property` registrations, builds a registry of typed custom properties, validates compatible `var()` usage against consuming CSS properties, and checks authored assignments to registered custom properties.

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
      path: "fixtures/imports/main.css",
      css: `
        @import "./tokens.css";

        .card {
          color: var(--brand-color);
        }
      `,
    },
  ],
  {
    resolveImport: (specifier, fromPath) => {
      if (specifier !== "./tokens.css" || fromPath !== "fixtures/imports/main.css") {
        return null;
      }

      return {
        path: "tokens.css",
        css: `
          @property --brand-color {
            syntax: "<color>";
            inherits: true;
            initial-value: transparent;
          }
        `,
      };
    },
  },
);

console.log(result.diagnostics);
```

## Notes

- Validates `@property` syntax descriptors
- Builds a registry across provided input files
- Can extend that registry with optional `registryInputs`
- Can follow local unconditioned `@import` rules when `resolveImport` is provided
- Validates single-`var()` declaration usages
- Validates authored values assigned to registered custom properties
- Skips whitespace-toggle and similarly ambiguous custom property assignment patterns for now
- Skips conditioned and remote `@import` traversal for now
- Ignores unregistered custom properties

Repository: [schalkneethling/css-property-type-validator](https://github.com/schalkneethling/css-property-type-validator)
