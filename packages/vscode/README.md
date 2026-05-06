# CSS Property Type Validator

Validate typed CSS custom property registrations and `var()` usage directly in VS Code and compatible desktop editors.

## Features

- Validates plain CSS documents as you edit.
- Reports native editor diagnostics for invalid `@property` registrations, incompatible registered custom property assignments, incompatible `var()` usage, unresolved imports, and parse failures.
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

## Commands

- `CSS Property Type Validator: Refresh` reloads configured registry files and revalidates open CSS documents.

## Known Limits

- V1 validates CSS files only.
- Desktop VS Code-compatible editors are supported; web extension hosts such as vscode.dev and github.dev are out of scope for this version.
- Embedded HTML style blocks, SCSS, Less, PostCSS, Vue, Svelte, JSX, and TSX are out of scope for this version.
- The extension does not provide autofixes.

## Packaging And Release

Build and package a VSIX:

```bash
pnpm --filter ./packages/vscode package:vsix
```

Manual release paths:

- VS Code Marketplace: upload the generated VSIX manually, or publish later with `vsce publish` after configuring a Marketplace publisher and PAT.
- OpenVSX: publish the same generated VSIX with `ovsx publish <file> -p <token>` after namespace setup.
