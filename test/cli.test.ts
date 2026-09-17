import { describe, expect, it } from "vitest";

import { helpText, main, parseGlobalArgs } from "../src/cli";
import { addUsage, parseAddArgs } from "../src/commands/add";
import { CliError } from "../src/lib/cli-error";

describe("helpText", () => {
  it("lists every command and the standard option block", () => {
    const help = helpText();
    for (const verb of ["add", "validate", "snapshot", "enrich-papers", "refresh-citations"]) {
      expect(help).toContain(verb);
    }
    expect(help).toContain("-v, --version");
    expect(help).toContain("-h, --help");
    expect(help).toMatch(/^Usage: agentx \[OPTIONS\] COMMAND \[ARGS\]\.\.\./);
  });
});

describe("parseGlobalArgs", () => {
  it("extracts --root in both forms and keeps the rest", () => {
    expect(parseGlobalArgs(["add", "--root", "/tmp/repo", "--category", "x"])).toEqual({
      root: "/tmp/repo",
      rest: ["add", "--category", "x"],
    });
    expect(parseGlobalArgs(["--root=/tmp/repo", "validate"])).toEqual({
      root: "/tmp/repo",
      rest: ["validate"],
    });
  });

  it("defaults to the current directory", () => {
    expect(parseGlobalArgs(["validate"]).root).toBe(process.cwd());
  });

  it("rejects a missing --root value", () => {
    expect(() => parseGlobalArgs(["--root"])).toThrow(CliError);
  });
});

describe("parseAddArgs", () => {
  it("reads the repo and option values", () => {
    const args = parseAddArgs(["owner/repo", "--category", "bio-omics", "--tags", "Stanford"], "/repo");
    expect(args).toMatchObject({
      repo: "owner/repo",
      root: "/repo",
      category: "bio-omics",
      tags: "Stanford",
    });
  });

  it("fails on a missing repo or a dangling flag", () => {
    expect(() => parseAddArgs([], "/repo")).toThrow(CliError);
    expect(() => parseAddArgs(["--category"], "/repo")).toThrow(CliError);
  });

  it("parses --from-json without a repo positional", () => {
    const args = parseAddArgs(["--from-json", "/tmp/candidates.json"], "/repo");
    expect(args).toMatchObject({ fromJson: "/tmp/candidates.json", root: "/repo", repo: "" });
  });

  it("rejects a repo positional alongside --from-json and a dangling --from-json", () => {
    expect(() => parseAddArgs(["--from-json", "/tmp/c.json", "owner/repo"], "/repo")).toThrow(CliError);
    expect(() => parseAddArgs(["--from-json"], "/repo")).toThrow(CliError);
  });

  it("exposes usage text through the same path as the error", () => {
    expect(addUsage()).toMatch(/^Usage: agentx add owner\/repo --category <slug>/);
    expect(addUsage()).toContain("--from-json <file>");
  });
});

describe("main dispatch", () => {
  it("prints help and version", async () => {
    // helpText/main write to stdout; vitest captures it. Assert exit codes.
    expect(await main(["--help"])).toBe(0);
    expect(await main([])).toBe(0);
    expect(await main(["--version"])).toBe(0);
  });

  it("rejects unknown commands with exit code 1", async () => {
    expect(await main(["frobnicate"])).toBe(1);
  });

  it("routes command help", async () => {
    expect(await main(["add", "--help"])).toBe(0);
  });
});
