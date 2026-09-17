// awescholarSearch contract tests. The exec and file layers are mocked at the
// module boundary so these cover the failure mapping without a Python
// install: ENOENT -> install hint, old-record shape -> capability error.

import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  execError: null as unknown,
  file: "",
  fileExists: true,
}));

vi.mock("node:child_process", () => ({
  execFile: vi.fn((...args: unknown[]) => {
    const cb = args[args.length - 1] as (err: unknown, stdout?: string, stderr?: string) => void;
    cb(state.execError, "", "");
  }),
}));

vi.mock("node:fs/promises", () => ({
  stat: vi.fn(async () => {
    if (!state.fileExists) throw new Error("ENOENT");
  }),
  readFile: vi.fn(async () => state.file),
}));

import { awescholarSearch } from "../src/lib/scholar";
import { CliError } from "../src/lib/cli-error";

beforeEach(() => {
  state.execError = null;
  state.file = "";
  state.fileExists = true;
});

describe("awescholarSearch", () => {
  it("returns records from the current shape (authors may be empty, citations null)", async () => {
    state.file = JSON.stringify([
      { year: "2026", title: "T", team: "X", authors: [], citations: null, venue: "V", paperUrl: "", doi: "" },
    ]);
    const records = await awescholarSearch("doi", ["10.1/x"], "/tmp/out.json");
    expect(records).toHaveLength(1);
    expect(records[0]!.citations).toBeNull();
  });

  it("maps a missing binary to a CliError with the upgrade hint", async () => {
    state.execError = { code: "ENOENT" };
    await expect(awescholarSearch("doi", ["10.1/x"], "/tmp/out.json")).rejects.toThrow(CliError);
    await expect(awescholarSearch("doi", ["10.1/x"], "/tmp/out.json")).rejects.toThrow(
      'pip install -U "awescholar>=0.2.2"',
    );
  });

  it("rejects records missing the authors/citations keys as a too-old awescholar", async () => {
    state.file = JSON.stringify([
      { year: "2026", title: "T", team: "X", venue: "V", paperUrl: "", doi: "" },
    ]);
    await expect(awescholarSearch("doi", ["10.1/x"], "/tmp/out.json")).rejects.toThrow(/`authors` and `citations`/);
    await expect(awescholarSearch("doi", ["10.1/x"], "/tmp/out.json")).rejects.toThrow(
      'pip install -U "awescholar>=0.2.2"',
    );
  });

  it("treats an all-miss chunk (no output file) as zero records", async () => {
    state.fileExists = false;
    const records = await awescholarSearch("doi", ["10.1/x"], "/tmp/out.json");
    expect(records).toEqual([]);
  });
});
