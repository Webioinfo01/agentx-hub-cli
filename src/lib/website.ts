// Resolve the hub website checkout for commands that run its scripts.
// The apply/moderation logic is coupled to the website's Prisma schema and
// lives there; this CLI only locates a checkout and shells into it.

import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { CliError } from "./cli-error";

/** --dir flag beats $AGENTX_WEBSITE_DIR; no silent cwd default. */
export function resolveWebsiteDir(
  explicit: string | undefined,
  command: string,
  marker: string,
): string {
  const candidate = explicit ?? process.env.AGENTX_WEBSITE_DIR;
  if (!candidate) {
    throw new CliError(
      `No hub website checkout for \`agentx ${command}\` — pass --dir /path/to/agentx-hub-dev or set AGENTX_WEBSITE_DIR.`,
    );
  }
  const dir = resolve(candidate);
  if (!existsSync(resolve(dir, marker))) {
    throw new CliError(
      `${resolve(dir, marker)} not found — --dir / AGENTX_WEBSITE_DIR must point at the hub website checkout.`,
    );
  }
  return dir;
}
