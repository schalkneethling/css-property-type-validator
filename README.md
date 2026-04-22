# CSS Property Type Validator

Standalone tooling for validating CSS custom property registrations declared with `@property` and checking whether registered custom properties are used compatibly through `var()`.

## What it does today

- Parses CSS with `css-tree`
- Builds a registry from `@property` rules across multiple input files
- Validates `syntax` descriptors in those registrations
- Checks `var()` declaration values against the consuming CSS property, including coordinated multi-`var()` cases
- Validates simple fallback branches in `var(--token, fallback)` against the consuming property
- Validates authored values assigned directly to registered custom properties
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
npx @schalkneethling/css-property-type-validator-cli fixtures/imports/main.css
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
pnpm run check:supported-syntax-names
```

## CI and Releases

This repository uses GitHub Actions for CI and Release Please for automated releases and npm publishing. See [RELEASING.md](/Users/schalkneethling/dev/opensource/css-property-type-validator/RELEASING.md) for setup details and required secrets.

## Library usage

```ts
import { validateFiles } from "@schalkneethling/css-property-type-validator-core";

const result = validateFiles([
  {
    path: "fixtures/imports/main.css",
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
css-property-type-validator "src/**/*.css" --registry "src/tokens/**/*.css"
css-property-type-validator "src/tokens/**/*.css" --registry-only
css-property-type-validator "fixtures/imports/main.css"
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
      "filePath": "/Users/schalkneethling/dev/opensource/css-property-type-validator/fixtures/imports/main.css",
      "loc": {
        "source": "/Users/schalkneethling/dev/opensource/css-property-type-validator/fixtures/imports/main.css",
        "start": {
          "offset": 932,
          "line": 38,
          "column": 16
        },
        "end": {
          "offset": 950,
          "line": 38,
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
      "filePath": "/Users/schalkneethling/dev/opensource/css-property-type-validator/fixtures/imports/main.css",
      "loc": {
        "source": "/Users/schalkneethling/dev/opensource/css-property-type-validator/fixtures/imports/main.css",
        "start": {
          "offset": 961,
          "line": 39,
          "column": 10
        },
        "end": {
          "offset": 976,
          "line": 39,
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
      "filePath": "/Users/schalkneethling/dev/opensource/css-property-type-validator/fixtures/imports/registry/nested.css",
      "inherits": false,
      "initialValue": "12px",
      "loc": {
        "source": "/Users/schalkneethling/dev/opensource/css-property-type-validator/fixtures/imports/registry/nested.css",
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
      "name": "--radius-lg",
      "syntax": "<length>"
    },
    {
      "filePath": "/Users/schalkneethling/dev/opensource/css-property-type-validator/fixtures/imports/registry/tokens.css",
      "inherits": true,
      "initialValue": "transparent",
      "loc": {
        "source": "/Users/schalkneethling/dev/opensource/css-property-type-validator/fixtures/imports/registry/tokens.css",
        "start": {
          "offset": 25,
          "line": 3,
          "column": 1
        },
        "end": {
          "offset": 121,
          "line": 7,
          "column": 2
        }
      },
      "name": "--brand-color",
      "syntax": "<color>"
    },
    {
      "filePath": "/Users/schalkneethling/dev/opensource/css-property-type-validator/fixtures/imports/registry/tokens.css",
      "inherits": false,
      "initialValue": "16px",
      "loc": {
        "source": "/Users/schalkneethling/dev/opensource/css-property-type-validator/fixtures/imports/registry/tokens.css",
        "start": {
          "offset": 123,
          "line": 9,
          "column": 1
        },
        "end": {
          "offset": 211,
          "line": 13,
          "column": 2
        }
      },
      "name": "--space-md",
      "syntax": "<length>"
    }
  ],
  "skippedDeclarations": 0,
  "validatedDeclarations": 30
}
```

This example is truncated for readability. A full run against [fixtures/imports/main.css](/Users/schalkneethling/dev/opensource/css-property-type-validator/fixtures/imports/main.css) also includes invalid `@property` registrations from imported registry files, authored custom property assignment diagnostics, and more specific multi-`var()` messages when the validator can narrow the likely culprit.

## Current validation model

The validator assembles one registry from the full set of input files, then checks each stylesheet against that combined registry.

When shared registrations live outside the files you want to validate, the CLI can add them as registry-only sources:

```bash
css-property-type-validator "src/components/**/*.css" --registry "src/tokens/**/*.css"
```

Registry-only files contribute `@property` registrations and any registration/parse diagnostics, but their own normal declarations are not validated unless you also pass them as main inputs.

When you want to validate registrations on their own, use the explicit registration-only mode:

```bash
css-property-type-validator "src/tokens/**/*.css" --registry-only
```

In `--registry-only` mode, the positional patterns are treated as registration sources rather than normal declaration-validation targets.

When a resolver is available, the validator also follows local unconditioned `@import` rules while assembling the registry. That includes relative imports and root-relative imports in the CLI. Remote imports and conditioned imports remain intentionally out of scope for now.

For this first cut, compatibility checks are intentionally conservative:

- whitespace-toggle and similarly ambiguous custom property assignment patterns are skipped for now
- conditioned and remote `@import` traversal are not implemented yet
- config-file based registry discovery is not implemented yet

That keeps false positives down while the standalone core takes shape.
