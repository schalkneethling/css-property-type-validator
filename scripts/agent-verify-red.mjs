import { runExpectedFailure, runGuardrails, usage } from "./lib/agent-lifecycle.mjs";

const args = process.argv.slice(2);
const criterionIndex = args.indexOf("--criterion");
const separatorIndex = args.indexOf("--");
const criterion = criterionIndex === -1 ? undefined : args[criterionIndex + 1];

if (!criterion || !/^AC-[A-Z0-9]+-\d+$/.test(criterion)) {
  usage("Usage: agent-verify-red --criterion AC-AREA-001 -- <test command> [arguments]");
} else if (separatorIndex === -1 || separatorIndex === args.length - 1) {
  usage("RED verification requires one explicit test command after --.");
} else if (runGuardrails()) {
  const [command, ...commandArgs] = args.slice(separatorIndex + 1);
  if (runExpectedFailure(command, commandArgs)) {
    process.stdout.write(
      `RED evidence captured for ${criterion}. Record the intended failure in the issue or PR.\n`,
    );
  }
}
