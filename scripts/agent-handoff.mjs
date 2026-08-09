import { run, runGuardrails } from "./lib/agent-lifecycle.mjs";

if (runGuardrails() && run("git", ["diff", "--check"]) && run("git", ["status", "--short"])) {
  process.stdout.write(
    "Handoff checks passed. Confirm the criterion-to-test-to-implementation-to-doc traceability table before closing the issue.\n",
  );
}
