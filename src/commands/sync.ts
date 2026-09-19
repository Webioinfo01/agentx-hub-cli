// `agentx sync` — land data/agents-snapshot.json in the hub database.
// Local mode (default) runs the website checkout's own db:apply-snapshot,
// so the reconcile semantics (Prisma-schema-coupled, shared with the
// server's boot apply) never have a second implementation here. --remote
// dispatches the hub repo's sync-db workflow instead — same code, run
// with the repository's production secrets, no local checkout needed.

import { CliError } from "../lib/cli-error";
import { WORKFLOWS, dispatchWorkflow, hubRepo, ref } from "../lib/dispatch";
import { runPnpmScript } from "../lib/pnpm";
import { resolveWebsiteDir } from "../lib/website";

export function syncUsage(): string {
  return [
    "Usage: agentx sync [options]",
    "",
    "  Apply data/agents-snapshot.json to the hub database.",
    "",
    "  Local mode runs the website checkout's db:apply-snapshot script;",
    "  --remote dispatches the hub repo's sync-db workflow instead.",
    "",
    "Options:",
    "  --remote      Dispatch sync-db.yml instead of running the local script",
    "  --dir <dir>   Hub website checkout (default: $AGENTX_WEBSITE_DIR)",
    "  --repo <repo> Hub repo for --remote (default: $AGENTX_HUB_REPO or",
    "                Webioinfo01/agentx-hub-dev)",
    "  --ref <ref>   Branch to dispatch (default: main)",
  ].join("\n");
}

export function parseSyncArgs(argv: string[]): {
  remote: boolean;
  dir?: string;
  repo?: string;
  ref?: string;
} {
  const out = { remote: false, dir: undefined, repo: undefined, ref: undefined } as {
    remote: boolean;
    dir?: string;
    repo?: string;
    ref?: string;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const value = (): string => {
      const v = argv[++i];
      if (!v) throw new CliError(`${a} requires a value`);
      return v;
    };
    if (a === "--remote") out.remote = true;
    else if (a === "--dir") out.dir = value();
    else if (a === "--repo") out.repo = value();
    else if (a === "--ref") out.ref = value();
    else throw new CliError(`Unknown option "${a}" for sync.\n\n${syncUsage()}`);
  }
  return out;
}

interface SyncDeps {
  runPnpmScript: typeof runPnpmScript;
  dispatch: typeof dispatchWorkflow;
}

export async function runSync(
  argv: string[],
  deps: SyncDeps = { runPnpmScript, dispatch: dispatchWorkflow },
): Promise<void> {
  const args = parseSyncArgs(argv);
  if (args.remote) {
    const message = await deps.dispatch(
      hubRepo(args.repo),
      WORKFLOWS.sync,
      ref(args.ref),
    );
    console.log(message);
    return;
  }
  const websiteDir = resolveWebsiteDir(args.dir, "sync", "scripts/apply-snapshot.ts");
  deps.runPnpmScript(websiteDir, "db:apply-snapshot", []);
}
