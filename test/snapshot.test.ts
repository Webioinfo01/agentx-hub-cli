import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { readSnapshot, snapshotPath, writeSnapshot, type SnapshotFile } from "../src/lib/snapshot";
import fixture from "./fixtures/demo-repo/data/agents-snapshot.json";

const dir = await mkdtemp(join(tmpdir(), "agentx-snapshot-"));
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("snapshot read/write", () => {
  it("resolves <root>/data/agents-snapshot.json", () => {
    expect(snapshotPath("/repo")).toBe(join("/repo", "data", "agents-snapshot.json"));
  });

  it("round-trips a file written in stable slug order", async () => {
    const file = fixture as unknown as SnapshotFile;
    // Feed agents out of order; writeSnapshot must restore slug order.
    file.agents = [...file.agents].reverse();

    await writeSnapshot(dir, file);
    const raw = JSON.parse(await readFile(snapshotPath(dir), "utf8")) as SnapshotFile;
    expect(raw.agents.map((a) => a.slug)).toEqual(["alpha-agent", "beta-agent"]);
    expect(raw.counts.total).toBe(2);

    const reread = await readSnapshot(dir);
    expect(reread.agents).toHaveLength(2);
    expect(reread.agents[0]!.name).toBe("Alpha Agent");
  });
});
