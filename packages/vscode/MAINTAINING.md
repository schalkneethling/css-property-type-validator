# Maintaining The VS Code Extension

This note exists to capture the parts of shipping the extension that were easy
to get almost right and still miss in the published package.

## What Was Tricky

The extension worked in local extension-host tests before it worked in the
published VSIX. The hard part was not activation events or diagnostics logic.
The hard part was packaging the runtime assets that `css-tree` expects to load
with `require()` at runtime.

Two assets matter:

- `packages/vscode/data/patch.json`
- `packages/vscode/data/mdn-data/css/{at-rules,properties,syntaxes}.json`

Without those files in the VSIX, the extension can install successfully, show
its settings, and still fail during activation before the refresh command is
registered.

## The Failure Modes We Hit

- `Cannot find module 'css-tree/package.json'` during CI build.
  Cause: the packaging script assumed `css-tree` was directly resolvable from
  `packages/vscode`, but it may come from the core package dependency graph.

- `Cannot find module 'mdn-data/css/at-rules.json'` in installed VS Code.
  Cause: the bundle still contained runtime `require("mdn-data/css/*.json")`
  calls, but the VSIX did not contain those JSON files.

- Formatting drift in generated JSON after builds.
  Cause: writing generated JSON with plain `JSON.stringify(..., null, 2)` can
  produce files that no longer match repo formatting expectations.

## The Correct Approach

1. Bundle the extension entry with Vite Plus.
2. After bundling, run `scripts/copy-css-tree-data.mjs`.
3. In that script:
   - resolve `css-tree` from the core package dependency context
   - resolve `mdn-data` from the VS Code package first, then fall back to core
   - ensure the generated JSON files in `packages/vscode/data/` exist and match
     the source dependency data semantically
   - rewrite the bundled `dist/extension.cjs` so runtime `mdn-data` requires
     point at `../data/mdn-data/css/*.json`
4. Package the VSIX and inspect its contents before publishing.

## Release Checklist

Before publishing a new extension version:

1. Update `packages/vscode/package.json` version.
2. Update `packages/vscode/CHANGELOG.md`.
3. Run:

```bash
pnpm run format
pnpm --filter ./packages/vscode test
pnpm run build
pnpm --filter ./packages/vscode package:vsix
```

4. Confirm the VSIX contains:

```text
extension/dist/extension.cjs
extension/data/patch.json
extension/data/mdn-data/css/at-rules.json
extension/data/mdn-data/css/properties.json
extension/data/mdn-data/css/syntaxes.json
```

5. Confirm the bundled runtime points at packaged data paths:

```bash
unzip -p packages/vscode/css-property-type-validator-<version>.vsix extension/dist/extension.cjs \
  | rg "data/mdn-data|patch.json"
```

6. Install the VSIX in a real VS Code window and test one intentionally invalid
   CSS file before publishing publicly.

Use this smoke test:

```css
@property --brand-color {
  syntax: "<color>";
  inherits: true;
  initial-value: transparent;
}

.test {
  inline-size: var(--brand-color);
}
```

Expected result: `inline-size: var(--brand-color)` is flagged.

## If It Breaks Again

If the extension installs but the command palette says
`cssPropertyTypeValidator.refresh` is not found, assume activation failed.

Check:

1. `Log (Extension Host)` in VS Code output
2. `Developer: Toggle Developer Tools` console
3. The installed extension folder for missing JSON assets

The first thing to suspect is packaged runtime data, not validation logic.
