import { rm } from "node:fs/promises";

const targets = ["packages/core/dist", "packages/cli/dist"];

await Promise.all(
  targets.map((target) =>
    rm(new URL(`../${target}`, import.meta.url), { force: true, recursive: true }),
  ),
);
