#!/usr/bin/env node
// `agentx` — standalone operator CLI for an AgentX registry checkout.
// Thin dispatcher: each verb delegates to src/commands/<verb>.ts, which owns
// its flags and output. `--root <dir>` is a global option (default: cwd);
// every command resolves <root>/data/agents-snapshot.json through it.

import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { CliError } from "./lib/cli-error";
import { addUsage, runAdd } from "./commands/add";
import { validateUsage, runValidate } from "./commands/validate";
import { snapshotUsage, runSnapshot } from "./commands/snapshot";
import { enrichPapersUsage, runEnrichPapers } from "./commands/enrich-papers";
import { refreshCitationsUsage, runRefreshCitations } from "./commands/refresh-citations";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

interface Command {
  usage: () => string;
  run: (argv: string[], root: string) => Promise<void>;
}

const COMMANDS: Record<string, Command> = {
  add: { usage: addUsage, run: runAdd },
  validate: { usage: validateUsage, run: runValidate },
  snapshot: { usage: snapshotUsage, run: runSnapshot },
  "enrich-papers": { usage: enrichPapersUsage, run: runEnrichPapers },
  "refresh-citations": { usage: refreshCitationsUsage, run: runRefreshCitations },
};

export function helpText(): string {
  const verbs = Object.entries(COMMANDS).map(([verb, cmd]) => {
    // One short imperative sentence per command, taken from the usage's
    // first description line so help output never drifts between levels.
    const line = cmd.usage().split("\n").find((l) => l.trim() && !l.startsWith("Usage:") && !l.startsWith("Options:")) ?? "";
    return `  ${verb.padEnd(17)} ${line.trim()}`;
  });
  return [
    "Usage: agentx [OPTIONS] COMMAND [ARGS]...",
    "",
    "  Maintain an AgentX registry snapshot: add research AI agents,",
    "  refresh GitHub metrics, fill paper metadata.",
    "",
    "Options:",
    "  -v, --version  Show the version and exit.",
    "  -h, --help     Show this message and exit.",
    "",
    "Commands:",
    ...verbs,
    "",
    "Run `agentx <command> --help` for command options.",
  ].join("\n");
}

/** Split out the global --root option; everything else passes through. */
export function parseGlobalArgs(argv: string[]): { root: string; rest: string[] } {
  const rest: string[] = [];
  let root = process.cwd();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--root") {
      const v = argv[++i];
      if (!v || v.startsWith("--")) throw new CliError("--root requires a directory argument");
      root = resolve(v);
    } else if (a.startsWith("--root=")) {
      const v = a.slice("--root=".length);
      if (!v) throw new CliError("--root requires a directory argument");
      root = resolve(v);
    } else {
      rest.push(a);
    }
  }
  return { root, rest };
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

  const { root, rest } = parseGlobalArgs(argv);
  const command = COMMANDS[rest[0] ?? ""];
  if (!command) {
    console.error(`Unknown command "${rest[0] ?? ""}".`);
    console.error(helpText());
    return 1;
  }
  const commandArgs = rest.slice(1);
  if (commandArgs.includes("-h") || commandArgs.includes("--help")) {
    console.log(command.usage());
    return 0;
  }

  await command.run(commandArgs, root);
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
