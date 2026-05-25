import { rm } from "node:fs/promises";

const targets = [
  "packages/core/dist",
  "packages/core/tsconfig.tsbuildinfo",
  "packages/cli/dist",
  "packages/cli/tsconfig.tsbuildinfo",
  "packages/stylelint/dist",
  "packages/stylelint/tsconfig.tsbuildinfo",
];

await Promise.all(
  targets.map((target) =>
    rm(new URL(`../${target}`, import.meta.url), { force: true, recursive: true }),
  ),
);
