# @schalkneethling/css-property-type-validator-cli

CLI for CSS Property Type Validator.

This package validates CSS `@property` registrations, checks whether registered custom properties are used compatibly through `var()`, and validates authored assignments to registered custom properties.

## Install

```bash
npm install --global @schalkneethling/css-property-type-validator-cli
```

Or run it with `npx`:

```bash
npx @schalkneethling/css-property-type-validator-cli "src/**/*.css"
```

## Usage

```bash
css-property-type-validator "src/**/*.css"
css-property-type-validator "src/**/*.css" --format json
css-property-type-validator "src/**/*.css" --registry "src/tokens/**/*.css"
css-property-type-validator "src/tokens/**/*.css" --registry-only
css-property-type-validator "fixtures/imports/main.css"
```

Use `--registry` multiple times to include shared `@property` definitions without validating the rest of those files:

```bash
css-property-type-validator "src/**/*.css" \
  --registry "src/tokens/**/*.css" \
  --registry "src/brand/**/*.css"
```

Registry-only files still report parse errors and invalid `@property` registrations. The CLI also follows local unconditioned `@import` rules automatically while assembling the registry, including relative and root-relative imports. Remote and conditioned imports are still out of scope for now.

Use `--registry-only` when you want to validate `@property` rules without also validating ordinary declarations from those files:

```bash
css-property-type-validator "src/tokens/**/*.css" --registry-only
```

In `--registry-only` mode, the positional patterns become registration sources instead of normal validation targets. You can still add extra shared registry inputs with `--registry` when needed.

## Exit codes

- `0` no diagnostics found
- `1` validation diagnostics found
- `2` CLI or input failure

Repository: [schalkneethling/css-property-type-validator](https://github.com/schalkneethling/css-property-type-validator)
