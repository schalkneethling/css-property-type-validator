# CSS Property Type Validator

Validate CSS custom property registrations declared with `@property`, then check whether registered custom properties are used compatibly through `var()`.

Use it when your design tokens or component styles rely on typed custom properties and you want CI to catch mistakes such as a color token being used for `inline-size`, or a length token being assigned an invalid value.

## What It Does

- Parses CSS with `css-tree`
- Builds a registry from `@property` rules across input files, registry-only files, and local unconditioned imports
- Validates `syntax`, `inherits`, and `initial-value` descriptors
- Checks registered `var()` usages against the consuming CSS property
- Checks simple `var()` fallback branches against the consuming CSS property
- Validates authored values assigned directly to registered custom properties
- Optionally reports unknown no-fallback `var()` references from configured known custom property inputs
- Ignores unknown custom properties when that `var()` call provides a fallback
- Skips ambiguous cases conservatively to avoid false positives

## Packages

- [`@schalkneethling/css-property-type-validator-core`](https://www.npmjs.com/package/@schalkneethling/css-property-type-validator-core): validation engine for programmatic use
- [`@schalkneethling/css-property-type-validator-cli`](https://www.npmjs.com/package/@schalkneethling/css-property-type-validator-cli): command-line wrapper for local development and CI

## Try The CLI

```bash
npx @schalkneethling/css-property-type-validator-cli "src/**/*.css"
```

Install it globally if you prefer:

```bash
npm install --global @schalkneethling/css-property-type-validator-cli
css-property-type-validator "src/**/*.css"
```

The CLI exits with:

- `0` when no diagnostics are found
- `1` when validation diagnostics are found
- `2` for usage or file-loading failures

## CLI Usage

```bash
css-property-type-validator "src/**/*.css"
css-property-type-validator "src/**/*.css" --format json
css-property-type-validator "src/**/*.css" --registry "src/tokens/**/*.css"
css-property-type-validator "src/tokens/**/*.css" --registry-only
css-property-type-validator "src/**/*.css" --check-unknown-custom-properties --tokens "src/tokens/**/*.css"
css-property-type-validator "src/**/*.css" --failfast
```

Use `--registry` for shared `@property` definitions that should contribute registrations without validating ordinary declarations from those files:

```bash
css-property-type-validator "src/components/**/*.css" --registry "src/tokens/**/*.css"
```

Use `--registry-only` when you only want to validate `@property` registrations:

```bash
css-property-type-validator "src/tokens/**/*.css" --registry-only
```

Registry-only files still report parse errors and invalid `@property` registrations.

Use `--check-unknown-custom-properties` to opt in to static no-fallback `var()` reference checks. Use `--tokens` with that flag to seed known custom property names from one or more token files without validating ordinary declarations from those files:

```bash
css-property-type-validator "src/components/**/*.css" \
  --check-unknown-custom-properties \
  --tokens "src/tokens/**/*.css"
```

The CLI prints a warning when unresolved checks are enabled without `--tokens`, and when `--tokens` is provided without enabling unresolved checks.

By default, the CLI collects every validation failure it can find and reports the full result set.
Use `--failfast` when you want it to stop after the first validation failure, including
registration/import failures and declaration usage failures. Human and JSON output keep the same
format; the diagnostics array simply contains the first issue found.

## Library Usage

```ts
import { validateFiles } from "@schalkneethling/css-property-type-validator-core";

const result = validateFiles([
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
  {
    path: "component.css",
    css: ".card { inline-size: var(--brand-color); }",
  },
]);

console.log(result.diagnostics);
```

## JSON Output Shape

With `--format json`, the CLI prints the same shape returned by the core package:

```json
{
  "diagnostics": [
    {
      "code": "incompatible-var-usage",
      "filePath": "/project/component.css",
      "message": "Registered property --brand-color uses syntax \"<color>\" which is incompatible with inline-size at this var() usage.",
      "propertyName": "--brand-color",
      "registeredSyntax": "<color>",
      "expectedProperty": "inline-size",
      "snippet": "inline-size:var(--brand-color)"
    }
  ],
  "registry": [
    {
      "filePath": "/project/tokens.css",
      "inherits": true,
      "initialValue": "transparent",
      "name": "--brand-color",
      "syntax": "<color>"
    }
  ],
  "skippedDeclarations": 0,
  "validatedDeclarations": 1
}
```

Locations are included when available.

## Current Validation Model

The validator assembles one registry from the full set of validation inputs, registry-only inputs, and resolved local imports. It then checks each validation input against that combined registry.

When a resolver is available, the core follows local unconditioned `@import` rules while assembling the registry and known custom property inputs. The CLI provides a resolver for relative and root-relative local CSS imports. Remote imports and conditioned imports are intentionally out of scope for now.

Unresolved `var()` diagnostics are opt-in static known-inputs checks. They report `var(--token)` when `--token` is absent from known files/imports/registry/token inputs and no fallback is provided, but they do not attempt a full browser cascade evaluation for a specific DOM element.

Consumers should follow the same pattern as the CLI, web app, and VS Code extension: expose the unresolved-reference check as off by default, and expose token-file configuration beside it so projects can provide their real custom property source of truth.

The browser UI accepts one or more selected CSS token files. Recursive folder selection is not exposed because directory upload is not consistently standardized across browsers.

Compatibility checks are conservative:

- whitespace-toggle and similarly ambiguous custom property assignment patterns are skipped
- nested fallback chains are skipped until fallback reachability can be modeled safely
- universal-syntax registrations are skipped for compatibility checks because their computed value can still be valid
- config-file based registry discovery is not implemented yet

## Develop

```bash
pnpm install
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run build
pnpm run check:supported-syntax-names
```

For the full local gate:

```bash
pnpm run check
pnpm run check:supported-syntax-names
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for contributor guidance and [RELEASING.md](./RELEASING.md) for release details.
