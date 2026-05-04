# @schalkneethling/css-property-type-validator-cli

Command-line interface for CSS Property Type Validator.

Use it locally or in CI to validate CSS `@property` registrations, registered `var()` usage, simple fallback branches, and authored assignments to registered custom properties.

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
css-property-type-validator "src/**/*.css" --failfast
```

Use `--registry` multiple times to include shared registration sources:

```bash
css-property-type-validator "src/**/*.css" \
  --registry "src/tokens/**/*.css" \
  --registry "src/brand/**/*.css"
```

The CLI follows local unconditioned `@import` rules while assembling the registry, including relative and root-relative imports. Remote and conditioned imports are skipped.

By default, the CLI collects and reports all validation failures. Use `--failfast` to stop after the first validation failure, whether it comes from registry assembly, `@property` validation, or declaration usage validation. Exit codes and human/JSON output formats are unchanged.

## Exit Codes

- `0` no diagnostics found
- `1` validation diagnostics found
- `2` CLI or input failure

Repository: [schalkneethling/css-property-type-validator](https://github.com/schalkneethling/css-property-type-validator)
