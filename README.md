# CSS Property Type Validator

Standalone tooling for validating CSS custom property registrations declared with `@property` and checking whether registered custom properties are used compatibly through `var()`.

## What it does today

- Parses CSS with `css-tree`
- Builds a registry from `@property` rules across multiple input files
- Validates `syntax` descriptors in those registrations
- Checks single-`var()` declaration values against the consuming CSS property
- Ignores unregistered custom properties
- Ships a standalone core package and a thin CLI wrapper

## Workspace layout

- `packages/core`: parser, registry builder, and validation engine
- `packages/cli`: command-line interface for local use and CI

## Install

### CLI

```bash
npm install --global @schalkneethling/css-property-type-validator-cli
```

Or run it without a global install:

```bash
npx @schalkneethling/css-property-type-validator-cli example.css
```

### Core library

```bash
pnpm add @schalkneethling/css-property-type-validator-core
```

## Published Packages

- Core package: [`@schalkneethling/css-property-type-validator-core`](https://www.npmjs.com/package/@schalkneethling/css-property-type-validator-core)
- CLI package: [`@schalkneethling/css-property-type-validator-cli`](https://www.npmjs.com/package/@schalkneethling/css-property-type-validator-cli)

## Develop

```bash
pnpm install
pnpm run typecheck
pnpm test
pnpm run build
```

## CI and Releases

This repository uses GitHub Actions for CI and Release Please for automated releases and npm publishing. See [RELEASING.md](/Users/schalkneethling/dev/opensource/css-property-type-validator/RELEASING.md) for setup details and required secrets.

## Library usage

```ts
import { validateFiles } from "@schalkneethling/css-property-type-validator-core";

const result = validateFiles([
  {
    path: "example.css",
    css: `
      @property --brand-color {
        syntax: "<color>";
        inherits: true;
        initial-value: transparent;
      }

      .card {
        inline-size: var(--brand-color);
      }
    `,
  },
]);

console.log(result.diagnostics);
```

## CLI usage

```bash
css-property-type-validator "src/**/*.css"
css-property-type-validator "src/**/*.css" --format json
```

Human output is the default. The CLI exits with:

- `0` when no diagnostics are found
- `1` when validation diagnostics are found
- `2` for usage or file-loading failures

## Example JSON output

```json
{
  "diagnostics": [
    {
      "code": "incompatible-var-usage",
      "filePath": "/Users/schalkneethling/dev/opensource/css-property-type-validator/example.css",
      "loc": {
        "source": "/Users/schalkneethling/dev/opensource/css-property-type-validator/example.css",
        "start": {
          "offset": 1356,
          "line": 76,
          "column": 16
        },
        "end": {
          "offset": 1374,
          "line": 76,
          "column": 34
        }
      },
      "message": "Registered property --brand-color uses syntax \"<color>\" which is incompatible with inline-size at this var() usage.",
      "propertyName": "--brand-color",
      "registeredSyntax": "<color>",
      "expectedProperty": "inline-size",
      "snippet": "inline-size:var(--brand-color)"
    },
    {
      "code": "incompatible-var-usage",
      "filePath": "/Users/schalkneethling/dev/opensource/css-property-type-validator/example.css",
      "loc": {
        "source": "/Users/schalkneethling/dev/opensource/css-property-type-validator/example.css",
        "start": {
          "offset": 1385,
          "line": 77,
          "column": 10
        },
        "end": {
          "offset": 1400,
          "line": 77,
          "column": 25
        }
      },
      "message": "Registered property --space-md uses syntax \"<length>\" which is incompatible with color at this var() usage.",
      "propertyName": "--space-md",
      "registeredSyntax": "<length>",
      "expectedProperty": "color",
      "snippet": "color:var(--space-md)"
    }
  ],
  "registry": [
    {
      "filePath": "/Users/schalkneethling/dev/opensource/css-property-type-validator/example.css",
      "inherits": true,
      "initialValue": "transparent",
      "loc": {
        "source": "/Users/schalkneethling/dev/opensource/css-property-type-validator/example.css",
        "start": {
          "offset": 0,
          "line": 1,
          "column": 1
        },
        "end": {
          "offset": 96,
          "line": 5,
          "column": 2
        }
      },
      "name": "--brand-color",
      "syntax": "<color>"
    },
    {
      "filePath": "/Users/schalkneethling/dev/opensource/css-property-type-validator/example.css",
      "inherits": false,
      "initialValue": "1rem",
      "loc": {
        "source": "/Users/schalkneethling/dev/opensource/css-property-type-validator/example.css",
        "start": {
          "offset": 98,
          "line": 7,
          "column": 1
        },
        "end": {
          "offset": 186,
          "line": 11,
          "column": 2
        }
      },
      "name": "--space-md",
      "syntax": "<length>"
    }
  ],
  "skippedDeclarations": 1,
  "validatedDeclarations": 15
}
```

This example is truncated for readability. A full run against [example.css](/Users/schalkneethling/dev/opensource/css-property-type-validator/example.css) includes additional diagnostics and all registered properties in the combined registry.

## Current validation model

The validator assembles one registry from the full set of input files, then checks each stylesheet against that combined registry.

For this first cut, compatibility checks are intentionally conservative:

- only declarations with a single `var()` usage are validated
- direct custom property assignments like `--token: 10px` are not validated yet
- automatic `@import` resolution is not implemented yet

That keeps false positives down while the standalone core takes shape.
