import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { CliError } from "../src/lib/cli-error";
import { runMirror } from "../src/commands/mirror";
import { runSync } from "../src/commands/sync";

// A fake hub website checkout: just the marker files the resolvers check.
const fixtureRoot = mkdtempSync(join(tmpdir(), "agentx-cli-"));
const websiteDir = join(fixtureRoot, "website");
mkdirSync(join(websiteDir, "scripts"), { recursive: true });
writeFileSync(join(websiteDir, "scripts", "apply-snapshot.ts"), "// marker\n");
writeFileSync(join(websiteDir, "scripts", "review-moderate.ts"), "// marker\n");
writeFileSync(join(websiteDir, "package.json"), "{}\n");
afterAll(() => rmSync(fixtureRoot, { recursive: true, force: true }));

const savedEnv = { ...process.env };
beforeEach(() => {
  process.env = { ...savedEnv };
  delete process.env.AGENTX_WEBSITE_DIR;
});

describe("runSync", () => {
  it("local mode resolves the checkout and runs db:apply-snapshot", async () => {
    process.env.AGENTX_WEBSITE_DIR = websiteDir;
    const calls: Array<{ dir: string; script: string; args: string[] }> = [];
    await runSync([], {
      runPnpmScript: (dir, script, args = []) => {
        calls.push({ dir, script, args });
      },
      dispatch: async () => {
        throw new Error("dispatch must not run in local mode");
      },
    });
    expect(calls).toEqual([{ dir: websiteDir, script: "db:apply-snapshot", args: [] }]);
  });

  it("without a checkout it fails with guidance", async () => {
    await expect(
      runSync([], {
        runPnpmScript: () => undefined,
        dispatch: async () => "",
      }),
    ).rejects.toThrow(CliError);
  });

  it("--remote dispatches sync-db.yml on the default repo and ref", async () => {
    const dispatched: Array<{ repo: string; workflow: string; ref: string }> = [];
    await runSync(["--remote"], {
      runPnpmScript: () => {
        throw new Error("local script must not run in --remote mode");
      },
      dispatch: async (repo, workflow, ref) => {
        dispatched.push({ repo, workflow, ref });
        return "ok";
      },
    });
    expect(dispatched).toEqual([
      { repo: "Webioinfo01/agentx-hub-dev", workflow: "sync-db.yml", ref: "main" },
    ]);
  });

  it("--remote honors --repo and --ref", async () => {
    const dispatched: Array<{ repo: string; workflow: string; ref: string }> = [];
    await runSync(["--remote", "--repo", "octocat/hub", "--ref", "dev"], {
      runPnpmScript: () => undefined,
      dispatch: async (repo, workflow, ref) => {
        dispatched.push({ repo, workflow, ref });
        return "ok";
      },
    });
    expect(dispatched).toEqual([{ repo: "octocat/hub", workflow: "sync-db.yml", ref: "dev" }]);
  });
});

describe("runMirror", () => {
  it("dispatches sync-public.yml", async () => {
    const dispatched: Array<{ repo: string; workflow: string; ref: string }> = [];
    await runMirror([], {
      dispatch: async (repo, workflow, ref) => {
        dispatched.push({ repo, workflow, ref });
        return "ok";
      },
    });
    expect(dispatched).toEqual([
      { repo: "Webioinfo01/agentx-hub-dev", workflow: "sync-public.yml", ref: "main" },
    ]);
  });
});
