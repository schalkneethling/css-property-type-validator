# @schalkneethling/css-property-type-validator-cli

CLI for CSS Property Type Validator.

This package validates CSS `@property` registrations and checks whether registered custom properties are used compatibly through `var()`.

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
```

## Exit codes

- `0` no diagnostics found
- `1` validation diagnostics found
- `2` CLI or input failure

Repository: [schalkneethling/css-property-type-validator](https://github.com/schalkneethling/css-property-type-validator)
