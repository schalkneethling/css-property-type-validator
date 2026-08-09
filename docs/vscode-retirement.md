# VS Code Extension Retirement

The repository no longer maintains the CSS Property Type Validator VS Code extension. Version 0.2.1 is the final extension release and receives no feature, compatibility, or security updates.

The validation engine, CLI, and Stylelint plugin remain maintained. Existing editor users should migrate extension settings as follows:

| Retired VS Code setting                                 | CLI                                                                          | Stylelint                      |
| ------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------ |
| `cssPropertyTypeValidator.registryFiles`                | `--registry` or `registryFiles` in `css-property-type-validator.config.json` | `registryFiles`                |
| `cssPropertyTypeValidator.tokenFiles`                   | `--tokens`                                                                   | `tokenFiles`                   |
| `cssPropertyTypeValidator.checkUnknownCustomProperties` | `--check-unknown-custom-properties`                                          | `checkUnknownCustomProperties` |

For editor feedback, configure the maintained Stylelint plugin through the editor's Stylelint integration. Other editor extensions may consume the core package or CLI, but maintaining those integrations is outside this project's scope.

The retired source remains available in Git history and the final release tag/artifact. Marketplace
and OpenVSX listings should point to this notice and the maintained alternatives rather than imply
continued support. Updating those external listings is the final manual retirement step; it is not
performed by repository CI.
