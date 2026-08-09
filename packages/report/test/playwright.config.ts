import { defineConfig } from "@playwright/test";

/**
 * This intentionally uses the repository's existing Playwright installation. Promote it to a
 * root devDependency before making this browser contract part of the default CI command.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  webServer: {
    command: "node ./e2e/server.mjs",
    url: "http://127.0.0.1:4188",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  use: {
    baseURL: "http://127.0.0.1:4188",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
