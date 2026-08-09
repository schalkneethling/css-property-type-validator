# @schalkneethling/css-property-type-validator-core

Browser-safe, filesystem-free analysis and validation for typed CSS custom properties.

The core parses caller-provided CSS, validates `@property` registrations, builds deterministic
inventories and entry-point graphs, reports exact static evidence and uncertainty, proposes
review-required registration candidates, and converts explicit descriptor decisions into a
conservative plan. Every semantic rule carries provenance from the official
[CSS Properties and Values API Level 1](https://www.w3.org/TR/css-properties-values-api-1/).

## Install

```bash
pnpm add @schalkneethling/css-property-type-validator-core
```

## Analyze

```ts
import { analyzeInputs } from "@schalkneethling/css-property-type-validator-core";

const analysis = analyzeInputs(
  [
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
    {
      path: "component.css",
      css: ".card { color: var(--brand-color, black); }",
    },
  ],
  {
    entryPoints: ["component.css"],
    importEdges: [
      {
        fromPath: "component.css",
        order: 0,
        specifier: "./tokens.css",
        toPath: "tokens.css",
      },
    ],
  },
);

console.log(analysis.diagnostics, analysis.coverage, analysis.candidates);
```

`AnalysisResultV1` includes schema, tool, and specification versions; inputs and configuration;
registrations, assignments, aliases, references, fallbacks, consumers, and imports; diagnostics,
skips, coverage, conflicts, candidates, animation opportunities, and deterministic ordering.
Locations use line/column data and UTF-16 offsets when available. Diagnostics include permanent
`CPTV_*` IDs, evidence, confidence, provenance, related locations, stable SHA-256 fingerprints, and
only exact safe suggested edits.

The caller owns repository discovery. Pass file contents, entry-point identities, and resolved
import occurrences explicitly. Missing or ambiguous graph evidence produces structured uncertainty;
the core does not infer a browser-effective cascade or DOM state.

## Plan reviewed registrations

```ts
import {
  analyzeInputs,
  planPropertyRegistrations,
} from "@schalkneethling/css-property-type-validator-core";

const analysis = analyzeInputs([{ path: "tokens.css", css: ":root { --space: 1rem; }" }]);

const plan = planPropertyRegistrations(analysis, [
  {
    action: "accept",
    candidateId: "registration:--space",
    syntax: "<length>",
    inherits: false,
    initialValue: "0px",
  },
]);
```

Candidate syntax and value observations are evidence only. An accepted decision must explicitly
supply `syntax` and `inherits`, and `initialValue` unless the selected syntax is universal (`*`).
The planner self-validates the resulting registration. It never guesses missing descriptors or
applies files.

## Compatibility API

`validateFiles(inputs, options)` remains available as a compatibility wrapper for integrations that
need the earlier validation result. `generatePropertyRegistrations` remains deprecated
compatibility behavior until the next major release; new adoption flows should use analysis,
explicit review decisions, and planning.

`registryInputs` contribute registrations without validating their ordinary declarations.
`knownCustomPropertyInputs` support the opt-in static unresolved-reference check.
`resolveImport` may supply caller-owned local import resolution to the compatibility validator.

## Boundaries

- No filesystem, glob, configuration, cache, process, CI, registry, or editor APIs.
- No assumptions beyond official specification text and explicit product policy.
- No whole-browser cascade or DOM/computed-value simulation.
- Advisory, medium/low-confidence, and uncertain findings do not gate by default.
- Ambiguous aliases, nested substitutions, ordering, and unsupported syntax remain explicit skips.

Repository: [schalkneethling/css-property-type-validator](https://github.com/schalkneethling/css-property-type-validator)
