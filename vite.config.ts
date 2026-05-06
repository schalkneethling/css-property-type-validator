import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {
    ignorePatterns: ["packages/cli/CHANGELOG.md", "packages/core/CHANGELOG.md"],
  },
  test: {
    include: ["packages/core/test/**/*.test.ts"],
    exclude: ["packages/vscode/out/**", "packages/vscode/test/**"],
  },
});
