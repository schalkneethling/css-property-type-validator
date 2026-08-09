# CSS Property Type Validator

Make typed CSS custom properties practical to adopt and maintain:

**audit → review → generate → validate → gate**

CSS Property Type Validator inventories an existing CSS codebase, explains where registrations are
missing or conflicting, produces conservative review plans, validates registered values and
`var()` usage, and supports incremental CI adoption. Its machine-readable JSON is the canonical
contract for engineers, coding agents, and integrations.

Every semantic rule about `@property` is traced to the official
[CSS Properties and Values API Level 1](https://www.w3.org/TR/css-properties-values-api-1/).
Ambiguous static evidence is reported as uncertainty or review-required work, never guessed into a
diagnostic or edit.

## Maintained surfaces

- [`@schalkneethling/css-property-type-validator-core`](https://www.npmjs.com/package/@schalkneethling/css-property-type-validator-core): browser-safe, filesystem-free analysis and validation.
- [`@schalkneethling/css-property-type-validator-cli`](https://www.npmjs.com/package/@schalkneethling/css-property-type-validator-cli): bounded repository discovery, audits, reports, plans, baselines, SARIF, and CI gates.
- [`@schalkneethling/stylelint-plugin-css-property-type-validator`](https://www.npmjs.com/package/@schalkneethling/stylelint-plugin-css-property-type-validator): focused validation of Stylelint-owned CSS.
- The web interface: local validation and learning features supported by its exact published core dependency.

The former VS Code package is retired. See [the migration notice](./docs/vscode-retirement.md).
External editor integrations may consume the core or CLI, but are not maintained by this project.

## Audit a project

```bash
npx @schalkneethling/css-property-type-validator-cli audit "src/**/*.css"
npx @schalkneethling/css-property-type-validator-cli audit "src/**/*.css" --format json
npx @schalkneethling/css-property-type-validator-cli audit "src/**/*.css" --format html > audit.html
npx @schalkneethling/css-property-type-validator-cli audit "src/**/*.css" --format sarif > audit.sarif
```

SARIF stands for Static Analysis Results Interchange Format; it is the standard interchange view
for code-scanning systems. JSON remains the richer canonical CPTV contract.

Audit JSON is deterministic and versioned. It includes registrations, assignments, aliases,
references, fallbacks, consumers, import evidence, conflicts, coverage, registration candidates,
animation opportunities, diagnostics, explicit skips, exact available locations, confidence,
stable fingerprints, and specification references.

HTML reports are standalone and offline. They are tested against a pinned
[Ephemeral Pages](https://github.com/schalkneethling/ephemeral-pages) delivery contract and always
provide selectable decision JSON and patch text when clipboard or download features are blocked.
Use `--redact-source` before making a report public.

## Review and apply registrations

Registration suggestions are evidence, not decisions. Planning requires explicit review choices;
the validator never guesses `inherits` or a non-universal `initial-value`.

```bash
css-property-type-validator plan "src/**/*.css" \
  --decisions decisions.json \
  --target properties.css \
  --format json > registration-plan.json

css-property-type-validator apply --plan registration-plan.json
```

The safe apply contract creates one reviewed, absent, project-contained file. It rejects changed
sources, altered plan content, incompatible schemas, existing targets, and partial or fuzzy edits.
The older `generate` command remains temporarily as deprecated compatibility behavior.

## Adopt gates incrementally

```bash
css-property-type-validator audit "src/**/*.css" \
  --write-baseline .cptv-baseline.json

css-property-type-validator audit "src/**/*.css" \
  --baseline .cptv-baseline.json \
  --new-only \
  --coverage-regression \
  --min-coverage 80 \
  --format json
```

Exit codes are stable:

- `0`: accepted gates passed.
- `1`: a high-confidence normative diagnostic or requested coverage gate failed.
- `2`: usage, configuration, bounded I/O, incompatible contract, or stale-plan failure.

Only high-confidence, normatively supported errors gate by default. Advisory findings and
uncertainty remain review items.

## Configuration and repository context

The CLI discovers the nearest bounded `css-property-type-validator.config.json` within the project
root. Command-line values override configuration, which overrides defaults. Project context owns
globs, entry points, resolved local imports, paths, caches, and fingerprints; the core receives only
content and explicit graph edges.

Default safety budgets are 5 MiB per file, 10,000 files, and 100 MiB aggregate. Every file is
checked with `lstat`/`stat` before allocation, must be a contained regular file, and is checked again
after reading. Multiple independent entry points and incomplete, conditional, cyclic, or external
imports produce structured ordering uncertainty rather than claims about a browser-effective
cascade.

See the [architecture](./docs/architecture.md), [glossary](./docs/glossary.md), and
[CLI documentation](./packages/cli/README.md) for the full contracts and options.

## Stylelint

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

Stylelint validates only the source Stylelint owns. Configured registry and token files provide
context; the plugin does not scan the repository, generate registrations, apply edits, manage
baselines, or calculate repository-wide coverage.

## Core library

```ts
import {
  analyzeInputs,
  planPropertyRegistrations,
} from "@schalkneethling/css-property-type-validator-core";

const analysis = analyzeInputs([
  {
    path: "tokens.css",
    css: `
      @property --brand-color {
        syntax: "<color>";
        inherits: true;
        initial-value: transparent;
      }

      :root { --brand-color: rebeccapurple; }
    `,
  },
]);

const plan = planPropertyRegistrations(analysis, []);
```

`validateFiles` remains as a compatibility wrapper. The core has no filesystem, glob, Node, CI,
registry, or editor responsibilities.

## Web publication boundary

A workspace web build is future-integration evidence only. A deployable web artifact must pin an
exact core version available from npm, install outside the workspace, reject aliases, links,
overrides and deep imports, and build/test only declared published exports. Core is published and
verified before a web consumer change is allowed to deploy.

## Develop

```bash
pnpm install --ignore-scripts
pnpm run agent:preflight
pnpm run check
pnpm run check:supported-syntax-names
```

Define acceptance boundaries before a RED test. Every test must trace to an accepted product,
specification, safety, release, or compatibility outcome. See [AGENTS.md](./AGENTS.md), the
repo-local `cptv-development` skill, [CONTRIBUTING.md](./CONTRIBUTING.md), and
[RELEASING.md](./RELEASING.md).
