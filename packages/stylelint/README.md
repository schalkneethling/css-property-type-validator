# @schalkneethling/stylelint-plugin-css-property-type-validator

Stylelint plugin for CSS Property Type Validator.

Use it when you already run Stylelint and want typed CSS custom property validation in the same lint workflow as the rest of your CSS checks.

## Install

```bash
npm install --save-dev stylelint @schalkneethling/stylelint-plugin-css-property-type-validator
```

## Usage

```js
export default {
  plugins: ["@schalkneethling/stylelint-plugin-css-property-type-validator"],
  rules: {
    "css-property-type-validator/valid-property-types": [
      true,
      {
        registryFiles: ["src/tokens/**/*.css"],
        checkUnknownCustomProperties: false,
        tokenFiles: [],
      },
    ],
  },
};
```

The rule validates `@property` registrations, assignments to registered custom properties, registered `var()` usage, simple fallback branches, unresolved local imports, and parse failures.

`registryFiles` are contextual registration sources. They contribute `@property` registrations without changing which files Stylelint lints.

Unresolved `var()` checks are off by default. Enable `checkUnknownCustomProperties` and configure `tokenFiles` when you want static no-fallback `var()` references checked against known custom property inputs. These checks do not attempt a full browser cascade evaluation for a specific DOM element.

## Options

```ts
interface Options {
  registryFiles?: string[];
  checkUnknownCustomProperties?: boolean;
  tokenFiles?: string[];
}
```

- `registryFiles`: CSS file or glob patterns to use as shared `@property` registry inputs.
- `checkUnknownCustomProperties`: report no-fallback `var()` references missing from known custom property inputs.
- `tokenFiles`: CSS file or glob patterns to use as known custom property token sources when unknown checks are enabled.

Repository: [schalkneethling/css-property-type-validator](https://github.com/schalkneethling/css-property-type-validator)
