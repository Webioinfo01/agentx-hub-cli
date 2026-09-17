import { describe, expect, it } from "vitest";

import type { SnapshotFile } from "../src/lib/snapshot";
import { validateSnapshotFile } from "../src/lib/snapshot-validate";
import fixture from "./fixtures/demo-repo/data/agents-snapshot.json";

const valid = (): SnapshotFile => JSON.parse(JSON.stringify(fixture)) as SnapshotFile;

describe("validateSnapshotFile", () => {
  it("accepts the fixture", () => {
    expect(validateSnapshotFile(valid())).toEqual([]);
  });

  it("rejects non-objects and missing agents arrays", () => {
    expect(validateSnapshotFile(null)).toEqual(["top level is not an object"]);
    expect(validateSnapshotFile({ counts: {} })).toEqual(["agents is not an array"]);
    expect(validateSnapshotFile({ agents: [] })).toEqual(["counts is not an object"]);
  });

  it("checks counts.total against the agents list", () => {
    const file = valid();
    file.counts.total = 99;
    expect(validateSnapshotFile(file)).toEqual([
      "counts.total is 99, but agents has 2 entries",
    ]);
  });

  it("rejects unknown categories", () => {
    const file = valid();
    file.agents[0]!.category = "wat";
    expect(validateSnapshotFile(file)).toEqual([
      'agents[0] (alpha-agent): unknown category "wat"',
    ]);
  });

  it("enforces the tag policy and the registry", () => {
    const file = valid();
    file.agents[0]!.tags = ["multi-agent", "Not-Registered"];
    const problems = validateSnapshotFile(file);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain("multi-agent — generic descriptor");
    expect(problems[1]).toContain("unregistered tag(s) multi-agent, Not-Registered");
  });

  it("requires canonical githubUrl", () => {
    const file = valid();
    file.agents[0]!.githubUrl = "https://github.com/someone/else";
    const problems = validateSnapshotFile(file);
    expect(problems).toEqual([
      'agents[0] (alpha-agent): githubUrl must be null or "https://github.com/example/alpha-agent", got "https://github.com/someone/else"',
    ]);
  });

  it("requires stable slug order", () => {
    const file = valid();
    file.agents = [...file.agents].reverse();
    expect(validateSnapshotFile(file)).toEqual([
      "agents are not in stable slug order (writeSnapshot sorts by slug.localeCompare)",
    ]);
  });

  it("keeps graveyard metadata on graveyard records only", () => {
    const file = valid();
    file.agents[0]!.retiredReason = "idle";
    const problems = validateSnapshotFile(file);
    expect(problems).toEqual([
      'agents[0] (alpha-agent): retiredReason set while status is "active" — only graveyard records carry it',
    ]);
  });

  it("allows null citations for unindexed papers", () => {
    const file = valid();
    file.agents[0]!.paperMeta!.citations = null;
    expect(validateSnapshotFile(file)).toEqual([]);
  });
});
