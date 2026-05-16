# CSS Property Type Validator

Validate typed CSS custom property registrations and `var()` usage directly in VS Code and compatible desktop editors.

## Features

- Validates plain CSS documents as you edit.
- Reports native editor diagnostics for invalid `@property` registrations, incompatible registered custom property assignments, incompatible `var()` usage, unresolved imports, and parse failures.
- Optionally reports unknown no-fallback `var()` references from configured token files.
- Supports shared `@property` registry files through workspace settings.
- Refreshes registry inputs and open-document diagnostics with one command.

## Configuration

Shared registry files are configured with workspace-relative glob patterns:

```json
{
  "cssPropertyTypeValidator.registryFiles": ["src/tokens/**/*.css", "src/theme/**/*.css"]
}
```

Registry files contribute `@property` registrations and registration diagnostics. Ordinary declarations from registry files are not validated unless the file is also open as a CSS document.

Unknown custom property checks are off by default. Enable them with token files that represent the project custom property source of truth:

```json
{
  "cssPropertyTypeValidator.checkUnknownCustomProperties": true,
  "cssPropertyTypeValidator.tokenFiles": ["src/tokens/**/*.css"]
}
```

Token files seed known custom property names without validating ordinary declarations from those files.

The extension warns when unknown custom property checks are enabled without `tokenFiles`, and when `tokenFiles` are configured while the check is disabled.

## Commands

- `CSS Property Type Validator: Refresh` reloads configured registry and token files, then revalidates open CSS documents.

## Known Limits

- V1 validates CSS files only.
- Desktop VS Code-compatible editors are supported; web extension hosts such as vscode.dev and GitHub.dev are out of scope for this version.
- Embedded HTML style blocks, SCSS, Less, PostCSS, Vue, Svelte, JSX, and TSX are out of scope for this version.
- Unresolved `var()` diagnostics are opt-in static known-inputs checks, not full browser cascade evaluations for a specific DOM element.
- The extension does not provide autofixes.

## Packaging And Release

Refresh the checked-in MDN and css-tree snapshots after dependency updates:

```bash
pnpm run update:vscode-data
```

The repository CI runs `pnpm run check:vscode-data` and fails with an explicit regeneration hint when the checked-in snapshot drifts from the installed dependency data. Regenerate the snapshot locally and commit the result before merging dependency updates.

Build and package a VSIX:

```bash
pnpm --filter ./packages/vscode package:vsix
```

Manual release paths:

- VS Code Marketplace: upload the generated VSIX manually, or publish later with `vsce publish` after configuring a Marketplace publisher and PAT.
- OpenVSX: publish the same generated VSIX with `ovsx publish <file> -p <token>` after namespace setup.
