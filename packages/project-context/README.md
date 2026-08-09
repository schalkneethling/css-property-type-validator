# CSS Property Type Validator project context

Private, Node.js-only project discovery and bounded file-loading primitives shared by the CLI and Stylelint integration.

This package deliberately contains no CSS or `@property` semantics. The browser-safe core must not import it, and the package must not be published.

## Guarantees

- Every file is inspected before its contents are allocated, then checked again after reading.
- Files must be regular files whose canonical path is within the configured project root.
- Direct inputs and imports share one file-count and aggregate-byte budget.
- Glob results and loaded inputs are deterministic and canonical.
- Only local `.css` imports are resolved. Unsupported and unsafe specifiers produce explicit non-throwing outcomes; file safety violations throw stable context errors.
- Configuration is non-executable JSON, discovered nearest-first within an explicit boundary, bounded before reading, and rejects unknown fields.

See [docs/acceptance.md](./docs/acceptance.md) for acceptance boundaries and test traceability.

## Integration notes

The root workspace references this package for development. CLI and Stylelint use one `ProjectReader` per run so direct files and imported files share a budget and cache, then inline the private implementation into their publishable artifacts. Clean-package checks reject any runtime dependency or import of this unpublished package.
