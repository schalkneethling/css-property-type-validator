import { run, runGuardrails } from "./lib/agent-lifecycle.mjs";

if (runGuardrails() && run("pnpm", ["test"]) && run("pnpm", ["run", "typecheck"])) {
  process.stdout.write(
    "Changed-work verification passed. Run package or browser checks required by the acceptance criterion before handoff.\n",
  );
}
