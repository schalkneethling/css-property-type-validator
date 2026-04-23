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
```

Use `--registry` multiple times to include shared registration sources:

```bash
css-property-type-validator "src/**/*.css" \
  --registry "src/tokens/**/*.css" \
  --registry "src/brand/**/*.css"
```

The CLI follows local unconditioned `@import` rules while assembling the registry, including relative and root-relative imports. Remote and conditioned imports are skipped.

## Exit Codes

- `0` no diagnostics found
- `1` validation diagnostics found
- `2` CLI or input failure

Repository: [schalkneethling/css-property-type-validator](https://github.com/schalkneethling/css-property-type-validator)
