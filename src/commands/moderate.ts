// `agentx moderate` — operate the website's pending verified-run review
// queue. Pure passthrough: everything after the recognized options goes to
// `pnpm run reviews:moderate` in the website checkout (--approve <id>,
// --reject <id>, or bare to list).

import { CliError } from "../lib/cli-error";
import { runPnpmScript } from "../lib/pnpm";
import { resolveWebsiteDir } from "../lib/website";

export function moderateUsage(): string {
  return [
    "Usage: agentx moderate [options] [--approve <id> | --reject <id>]",
    "",
    "  Moderate pending verified-run reviews in the hub database.",
    "  Bare `agentx moderate` lists the pending queue.",
    "",
    "Options:",
    "  --dir <dir>    Hub website checkout (default: $AGENTX_WEBSITE_DIR)",
    "",
    "  Everything else is passed through to the website's",
    "  reviews:moderate script (--approve <id>, --reject <id>).",
  ].join("\n");
}

export function parseModerateArgs(argv: string[]): { dir?: string; passthrough: string[] } {
  let dir: string | undefined;
  const passthrough: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--dir") {
      const v = argv[++i];
      if (!v) throw new CliError("--dir requires a directory argument");
      dir = v;
    } else if (a.startsWith("--dir=")) {
      dir = a.slice("--dir=".length);
      if (!dir) throw new CliError("--dir requires a directory argument");
    } else {
      passthrough.push(a);
    }
  }
  return { dir, passthrough };
}

export async function runModerate(
  argv: string[],
  deps: { runPnpmScript: typeof runPnpmScript } = { runPnpmScript },
): Promise<void> {
  const { dir, passthrough } = parseModerateArgs(argv);
  const websiteDir = resolveWebsiteDir(dir, "moderate", "scripts/review-moderate.ts");
  deps.runPnpmScript(websiteDir, "reviews:moderate", passthrough);
}
