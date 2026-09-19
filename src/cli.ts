#!/usr/bin/env node
// `agentx` — operations CLI for the AgentX hub. Registry curation (add /
// enrich / backfill / validate over data/agents-snapshot.json) lives in
// awescholar (`pip install awescholar`, native --agentx commands); this CLI
// carries only hub operations awescholar cannot own — landing the snapshot
// in the hub database, moderating reviews, mirroring to the public hub.
// Each wraps the hub website's own scripts or workflows; nothing is
// re-implemented here.

import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import { CliError } from "./lib/cli-error";
import { mirrorUsage, runMirror } from "./commands/mirror";
import { moderateUsage, runModerate } from "./commands/moderate";
import { syncUsage, runSync } from "./commands/sync";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

interface Command {
  usage: () => string;
  run: (argv: string[]) => Promise<void>;
}

const COMMANDS: Record<string, Command> = {
  sync: { usage: syncUsage, run: runSync },
  moderate: { usage: moderateUsage, run: runModerate },
  mirror: { usage: mirrorUsage, run: runMirror },
};

export function helpText(): string {
  const verbs = Object.entries(COMMANDS).map(([verb, cmd]) => {
    // One short imperative sentence per command, taken from the usage's
    // first description line so help output never drifts between levels.
    const line =
      cmd
        .usage()
        .split("\n")
        .find((l) => l.trim() && !l.startsWith("Usage:") && !l.startsWith("Options:")) ?? "";
    return `  ${verb.padEnd(10)} ${line.trim()}`;
  });
  return [
    "Usage: agentx [OPTIONS] COMMAND [ARGS]...",
    "",
    "  Operate the AgentX hub: land the snapshot in the database,",
    "  moderate reviews, mirror to the public hub.",
    "",
    "Options:",
    "  -v, --version  Show the version and exit.",
    "  -h, --help     Show this message and exit.",
    "",
    "Commands:",
    ...verbs,
    "",
    "Registry curation (add/enrich/backfill/validate over the snapshot)",
    "lives in awescholar: `awescholar updater add|enrich|backfill --agentx`,",
    "`awescholar verify --agentx`.",
    "",
    "Env:",
    "  AGENTX_WEBSITE_DIR  default hub website checkout for local commands",
    "  AGENTX_HUB_REPO     default hub repo for dispatches",
    "                      (Webioinfo01/agentx-hub-dev)",
    "  GITHUB_TOKEN        dispatch authentication",
  ].join("\n");
}

export async function main(argv: string[]): Promise<number> {
  const first = argv[0];
  if (first === undefined || first === "-h" || first === "--help") {
    console.log(helpText());
    return 0;
  }
  if (first === "-v" || first === "--version") {
    console.log(`agentx ${version}`);
    return 0;
  }

  const command = COMMANDS[first];
  if (!command) {
    console.error(`Unknown command "${first}".`);
    console.error(helpText());
    return 1;
  }
  const commandArgs = argv.slice(1);
  if (commandArgs.includes("-h") || commandArgs.includes("--help")) {
    console.log(command.usage());
    return 0;
  }

  await command.run(commandArgs);
  return 0;
}

const isEntry = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;
if (isEntry) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(err instanceof CliError ? err.message : err);
      process.exit(1);
    });
}
