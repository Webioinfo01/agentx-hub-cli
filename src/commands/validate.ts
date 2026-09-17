// `agentx validate` — offline gate for data/agents-snapshot.json. Fails with
// an itemized list when the file violates the writer invariants. Read-only:
// never touches the snapshot, needs no tokens, safe in CI.

import { readSnapshot } from "../lib/snapshot";
import { validateSnapshotFile } from "../lib/snapshot-validate";
import { CliError } from "../lib/cli-error";

export function validateUsage(): string {
  return [
    "Usage: agentx validate [options]",
    "",
    "  Check the snapshot against the writer invariants, offline.",
    "",
    "Options:",
    "  --root <dir>  AgentX repository root (default: the current directory)",
  ].join("\n");
}

export async function runValidate(_argv: string[], root: string): Promise<void> {
  const snapshot = await readSnapshot(root);
  const problems = validateSnapshotFile(snapshot);
  if (problems.length > 0) {
    throw new CliError(
      `Snapshot invalid — ${problems.length} problem(s):\n${problems.map((p) => `  - ${p}`).join("\n")}`,
    );
  }
  console.log(`Snapshot OK: ${snapshot.agents.length} agents, counts consistent.`);
}
