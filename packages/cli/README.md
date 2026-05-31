# @schalkneethling/css-property-type-validator-cli

Command-line interface for CSS Property Type Validator.

Use it locally or in CI to validate CSS `@property` registrations, registered `var()` usage, simple fallback branches, and authored assignments to registered custom properties. Static unresolved no-fallback `var()` checks are available as an opt-in.

## Install

```bash
npm install --global @schalkneethling/css-property-type-validator-cli
```

Or run it without installing:

```bash
npx @schalkneethling/css-property-type-validator-cli "src/**/*.css"
```

## Usage

```bash
css-property-type-validator "src/**/*.css"
css-property-type-validator "src/**/*.css" --format json
css-property-type-validator "src/**/*.css" --registry "src/tokens/**/*.css"
css-property-type-validator "src/tokens/**/*.css" --registry-only
css-property-type-validator "src/**/*.css" --check-unknown-custom-properties --tokens "src/tokens/**/*.css"
css-property-type-validator "src/**/*.css" --failfast
css-property-type-validator generate "src/**/*.css" --out properties.css
```

Use `--registry` multiple times to include shared registration sources:

```bash
css-property-type-validator "src/**/*.css" \
  --registry "src/tokens/**/*.css" \
  --registry "src/brand/**/*.css"
```

The CLI follows local unconditioned `@import` rules while assembling the registry and known custom property inputs, including relative and root-relative imports. Remote and conditioned imports are skipped.

Unresolved `var()` diagnostics are static known-inputs checks enabled with `--check-unknown-custom-properties`. Use `--tokens` to seed known custom property names from token files without validating ordinary declarations from those files. These diagnostics do not attempt a full browser cascade evaluation for a specific DOM element.

The CLI prints a warning when unresolved checks are enabled without `--tokens`, and when `--tokens` is provided without enabling unresolved checks.

By default, the CLI collects and reports all validation failures. Use `--failfast` to stop after the first validation failure, whether it comes from registry assembly, `@property` validation, or declaration usage validation. Exit codes and human/JSON output formats are unchanged.

## Generate Registrations

The experimental `generate` command writes inferred `@property` rules to `properties.css` by default:

```bash
css-property-type-validator generate "src/**/*.css"
```

Use `--out <path>` to specify another file, `--force` to overwrite an existing output file, and `--format json` to inspect generated and review-needed candidates.

Generation needs concrete authored custom property declarations:

```css
:root {
  --brand-color: red;
  --space: 1px;
}
```

`var()` usage sites are optional. Alias tokens such as `--border-color: var(--brand-color)` can generate only when the referenced token declarations are also passed to the command. If the generator only sees aliases and not the concrete primitive values they point to, those aliases are returned as review items.

## Exit Codes

- `0` no diagnostics found
- `1` validation diagnostics found
- `2` CLI or input failure

Repository: [schalkneethling/css-property-type-validator](https://github.com/schalkneethling/css-property-type-validator)
