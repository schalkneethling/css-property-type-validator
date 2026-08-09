import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {
    ignorePatterns: [
      ".artifacts/**",
      "fixtures/parser-corpus/**",
      "github-issue-triage-report.html",
      "packages/cli/CHANGELOG.md",
      "packages/cli/src/ephemeral-contract.generated.ts",
      "packages/core/CHANGELOG.md",
      "plans/typed-custom-property-adoption.md",
    ],
  },
  test: {
    include: ["packages/core/test/**/*.test.ts", "packages/stylelint/test/**/*.test.ts"],
  },
});
