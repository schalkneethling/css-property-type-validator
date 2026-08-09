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
css-property-type-validator audit "src/**/*.css" --format json
css-property-type-validator audit "src/**/*.css" --format sarif
css-property-type-validator audit "src/**/*.css" --format html > audit.html
css-property-type-validator audit "src/**/*.css" --write-baseline .cptv-baseline.json
css-property-type-validator audit "src/**/*.css" --baseline .cptv-baseline.json --new-only
```

`audit` is the canonical adoption workflow. Its versioned JSON includes stable provenance IDs,
source fingerprints, available exact locations, confidence, official specification references,
repository inventories, coverage, and explicit uncertainty records. `--redact-source` removes
snippets, authored assignment/fallback/initial values, and candidate value evidence from emitted output. Only high-confidence diagnostics backed
directly by a normative rule gate by default.

Use `--min-coverage <percent>` to prevent coverage regression. A requested coverage threshold
fails conservatively when no coverage denominator is available.

Create a reviewable registration plan from explicit decisions:

```bash
css-property-type-validator plan "src/**/*.css" \
  --decisions decisions.json \
  --target properties.css \
  --format json > registration-plan.json

css-property-type-validator apply --plan registration-plan.json
```

An accepted decision supplies `candidateId`, `action: "accept"`, `syntax`, `inherits`, and
`initialValue`; `initialValue` may be omitted only for the universal `*` syntax. Candidate
suggestions are evidence, not decisions. Apply rejects changed source fingerprints, targets outside
the project root, existing targets, modified plan content, and incompatible schemas. The current
safe edit contract creates one explicit absent file and never performs fuzzy or partial application.

HTML audit/plan reports are standalone, offline documents rendered against the repository's pinned
Ephemeral Pages contract. Selectable decision JSON and patch text remain available when clipboard
or download capabilities are unavailable.

Use `--registry` multiple times to include shared registration sources:

```bash
css-property-type-validator "src/**/*.css" \
  --registry "src/tokens/**/*.css" \
  --registry "src/brand/**/*.css"
```

The CLI follows local unconditioned `@import` rules while assembling the registry and known custom property inputs, including relative and root-relative imports. Remote and conditioned imports are skipped.

In `css-property-type-validator.config.json`, `inputs` define the audit/plan scan universe and a
non-empty `entryPoints` array defines the repository graph roots. Entry-point patterns are resolved
separately and must match files inside the project root; roots not already matched by `inputs` are
included safely. Positional audit/plan patterns replace configured `inputs`, but configured
`entryPoints` remain the explicit roots. When `entryPoints` is empty, every matched input is a root.

Unresolved `var()` diagnostics are static known-inputs checks enabled with `--check-unknown-custom-properties`. Use `--tokens` to seed known custom property names from token files without validating ordinary declarations from those files. These diagnostics do not attempt a full browser cascade evaluation for a specific DOM element.

The CLI prints a warning when unresolved checks are enabled without `--tokens`, and when `--tokens` is provided without enabling unresolved checks.

By default, the CLI collects and reports all validation failures. Use `--failfast` to stop after the first validation failure, whether it comes from registry assembly, `@property` validation, or declaration usage validation. Exit codes and human/JSON output formats are unchanged.

## Deprecated generation compatibility

The legacy experimental `generate` command remains temporarily available for compatibility. New
adoption work should use `audit`, explicit decisions, `plan`, and `apply`.

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

- `0` accepted gates passed
- `1` a high-confidence normative diagnostic or requested coverage gate failed
- `2` usage, configuration, bounded I/O, incompatible schema, or stale-plan failure

Legacy validation invocation retains its existing behavior while migrations move to `audit`.

Repository: [schalkneethling/css-property-type-validator](https://github.com/schalkneethling/css-property-type-validator)
