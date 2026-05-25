# Dependabot Package Ecosystem Identifiers

Reference: https://docs.github.com/en/code-security/dependabot/dependabot-version-updates/configuration-options-for-the-dependabot.yml-file#package-ecosystem

| Identifier       | Ecosystem                  | Manifest file(s)                     |
| ---------------- | -------------------------- | ------------------------------------ |
| `npm`            | npm / Yarn / pnpm          | `package.json`                       |
| `pip`            | pip / Poetry / pip-compile | `requirements.txt`, `pyproject.toml` |
| `cargo`          | Rust / Cargo               | `Cargo.toml`                         |
| `bundler`        | Ruby / Bundler             | `Gemfile`                            |
| `composer`       | PHP / Composer             | `composer.json`                      |
| `docker`         | Docker                     | `Dockerfile`                         |
| `gradle`         | Java / Gradle              | `build.gradle`, `build.gradle.kts`   |
| `maven`          | Java / Maven               | `pom.xml`                            |
| `gomod`          | Go modules                 | `go.mod`                             |
| `nuget`          | .NET / NuGet               | `*.csproj`, `packages.config`        |
| `github-actions` | GitHub Actions workflows   | `.github/workflows/*.yml`            |
| `terraform`      | Terraform                  | `*.tf`                               |
| `hex`            | Elixir / Hex               | `mix.exs`                            |
| `elm`            | Elm                        | `elm.json`                           |
| `pub`            | Dart / Flutter             | `pubspec.yaml`                       |
| `swift`          | Swift Package Manager      | `Package.swift`                      |

## Directory conventions

- Single-package project: `directory: "/"`
- Monorepo with packages in subdirectories: one block per directory, e.g.
  `directory: "/packages/ui"`, `directory: "/packages/api"`
- Docker images referenced in a subdirectory: `directory: "/docker"`

## Notes

- `github-actions` scans `.github/workflows/` regardless of the `directory` value;
  `"/"` is the correct and conventional value.
- Multiple ecosystems in the same directory each require their own `updates` block.
