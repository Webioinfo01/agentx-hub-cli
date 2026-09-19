// Run a pnpm script inside the hub website checkout, streaming output to
// this process's stdio so operator CLIs (apply logs, moderation prompts)
// behave exactly as if run from the checkout itself.

import { spawnSync } from "node:child_process";

import { CliError } from "./cli-error";

export function runPnpmScript(websiteDir: string, script: string, args: string[] = []): void {
  const command = ["pnpm", "run", script, ...args].join(" ");
  console.log(`$ cd ${websiteDir} && ${command}`);
  const result = spawnSync("pnpm", ["run", script, ...args], {
    cwd: websiteDir,
    stdio: "inherit",
  });
  if (result.error) {
    throw new CliError(`Failed to launch pnpm: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new CliError(`\`${command}\` exited with ${result.status}.`);
  }
}
