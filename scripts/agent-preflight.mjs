import { runGuardrails } from "./lib/agent-lifecycle.mjs";

if (runGuardrails()) {
  process.stdout.write("Agent preflight passed. Define acceptance boundaries before adding RED.\n");
}
