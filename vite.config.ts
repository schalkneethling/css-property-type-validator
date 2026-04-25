import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {
    ignorePatterns: ["packages/cli/CHANGELOG.md", "packages/core/CHANGELOG.md"],
  },
});
