// `agentx mirror` — mirror user-facing content from the private hub repo
// to the public hub (Webioinfo01/agentx-hub). Dispatch-only: the sync is an
// allowlisted bridge defined in the hub repo's sync-public workflow, which
// also holds the push token.

import { WORKFLOWS, dispatchWorkflow, hubRepo, ref } from "../lib/dispatch";
import { CliError } from "../lib/cli-error";

export function mirrorUsage(): string {
  return [
    "Usage: agentx mirror [options]",
    "",
    "  Dispatch sync-public.yml — mirror user-facing content to the",
    "  public hub repo.",
    "",
    "Options:",
    "  --repo <repo> Hub repo to dispatch in (default: $AGENTX_HUB_REPO or",
    "                Webioinfo01/agentx-hub-dev)",
    "  --ref <ref>   Branch to dispatch (default: main)",
  ].join("\n");
}

export function parseMirrorArgs(argv: string[]): { repo?: string; ref?: string } {
  const out = {} as { repo?: string; ref?: string };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const value = (): string => {
      const v = argv[++i];
      if (!v) throw new CliError(`${a} requires a value`);
      return v;
    };
    if (a === "--repo") out.repo = value();
    else if (a === "--ref") out.ref = value();
    else throw new CliError(`Unknown option "${a}" for mirror.\n\n${mirrorUsage()}`);
  }
  return out;
}

export async function runMirror(
  argv: string[],
  deps: { dispatch: typeof dispatchWorkflow } = { dispatch: dispatchWorkflow },
): Promise<void> {
  const args = parseMirrorArgs(argv);
  const message = await deps.dispatch(hubRepo(args.repo), WORKFLOWS.mirror, ref(args.ref));
  console.log(message);
}
