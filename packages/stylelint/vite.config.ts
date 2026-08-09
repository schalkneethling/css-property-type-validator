import { fileURLToPath } from "node:url";

import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    deps: {
      alwaysBundle: ["@schalkneethling/css-property-type-validator-project-context"],
      neverBundle: ["@schalkneethling/css-property-type-validator-core", "stylelint", /^node:/u],
    },
    dts: true,
    entry: { index: "src/index.ts" },
    fixedExtension: false,
    format: "esm",
    outExtensions: () => ({ dts: ".d.ts", js: ".js" }),
  },
  resolve: {
    alias: {
      "@schalkneethling/css-property-type-validator-project-context": fileURLToPath(
        new URL("../project-context/src/index.ts", import.meta.url),
      ),
    },
  },
  root: fileURLToPath(new URL(".", import.meta.url)),
  test: {
    include: ["test/**/*.test.ts"],
  },
});
