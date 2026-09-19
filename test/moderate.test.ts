import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { CliError } from "../src/lib/cli-error";
import { parseModerateArgs, runModerate } from "../src/commands/moderate";
import { resolveWebsiteDir } from "../src/lib/website";

const fixtureRoot = mkdtempSync(join(tmpdir(), "agentx-cli-moderate-"));
const websiteDir = join(fixtureRoot, "website");
mkdirSync(join(websiteDir, "scripts"), { recursive: true });
writeFileSync(join(websiteDir, "scripts", "review-moderate.ts"), "// marker\n");
afterAll(() => rmSync(fixtureRoot, { recursive: true, force: true }));

const savedEnv = { ...process.env };
beforeEach(() => {
  process.env = { ...savedEnv };
  delete process.env.AGENTX_WEBSITE_DIR;
});

describe("parseModerateArgs", () => {
  it("separates --dir from the passthrough tail", () => {
    expect(parseModerateArgs(["--approve", "42"])).toEqual({
      dir: undefined,
      passthrough: ["--approve", "42"],
    });
    expect(parseModerateArgs(["--dir", "/w", "--reject", "7", "--verbose"])).toEqual({
      dir: "/w",
      passthrough: ["--reject", "7", "--verbose"],
    });
    expect(parseModerateArgs(["--dir=/w"])).toEqual({ dir: "/w", passthrough: [] });
  });

  it("rejects a valueless --dir", () => {
    expect(() => parseModerateArgs(["--dir"])).toThrow(CliError);
  });
});

describe("runModerate", () => {
  it("passes everything through to reviews:moderate in the checkout", async () => {
    process.env.AGENTX_WEBSITE_DIR = websiteDir;
    const calls: Array<{ script: string; args: string[] }> = [];
    await runModerate(["--approve", "42"], {
      runPnpmScript: (_dir, script, args = []) => {
        calls.push({ script, args });
      },
    });
    expect(calls).toEqual([{ script: "reviews:moderate", args: ["--approve", "42"] }]);
  });

  it("fails with guidance when no checkout is configured", async () => {
    await expect(
      runModerate([], { runPnpmScript: () => undefined }),
    ).rejects.toThrow(/AGENTX_WEBSITE_DIR/);
  });
});

describe("resolveWebsiteDir", () => {
  it("rejects a checkout missing the marker file", () => {
    process.env.AGENTX_WEBSITE_DIR = fixtureRoot; // has no scripts/review-moderate.ts
    expect(() =>
      resolveWebsiteDir(undefined, "moderate", "scripts/review-moderate.ts"),
    ).toThrow(/review-moderate\.ts not found/);
  });
});
