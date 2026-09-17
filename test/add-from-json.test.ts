// `agentx add --from-json` batch intake against a temp copy of the demo
// fixture. GitHub access is mocked at the module boundary — the tests cover
// skip/all-or-nothing semantics, not the network.

import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ghState = vi.hoisted(() => ({ repos: {} as Record<string, unknown> }));

vi.mock("../src/lib/github", () => ({
  githubHeaders: () => ({}),
  fetchRepo: async (repo: string) => {
    const hit = ghState.repos[repo.toLowerCase()];
    return hit ? { data: hit, notFound: false } : { data: null, notFound: true };
  },
  resolveRepoLicense: async () => null,
}));

import { runAdd } from "../src/commands/add";
import { readSnapshot } from "../src/lib/snapshot";
import { CliError } from "../src/lib/cli-error";

const fixtureRoot = fileURLToPath(new URL("./fixtures/demo-repo", import.meta.url));
const root = await mkdtemp(join(tmpdir(), "agentx-add-json-"));
const logs: string[] = [];
const logSpy = vi.spyOn(console, "log").mockImplementation((...a) => logs.push(a.join(" ")));

beforeEach(async () => {
  await rm(join(root, "data"), { recursive: true, force: true });
  await cp(join(fixtureRoot, "data"), join(root, "data"), { recursive: true });
  ghState.repos = {};
  logs.length = 0;
});

afterEach(() => {
  logSpy.mockClear();
});

afterAll(async () => {
  logSpy.mockRestore();
  await rm(root, { recursive: true, force: true });
});

function registerGh(fullName: string, overrides: Record<string, unknown> = {}): void {
  ghState.repos[fullName.toLowerCase()] = {
    full_name: fullName,
    homepage: null,
    language: "Python",
    stargazers_count: 10,
    pushed_at: "2026-09-01T00:00:00Z",
    open_issues_count: 1,
    archived: false,
    license: null,
    description: "Mock repo description",
    ...overrides,
  };
}

async function candidateFile(name: string, agents: unknown[]): Promise<string> {
  const path = join(root, name);
  await writeFile(path, JSON.stringify({ agents, counts: { total: agents.length, gone: 0 } }));
  return path;
}

describe("agentx add --from-json", () => {
  it("intakes a snapshot-shaped file, skipping already-registered repos", async () => {
    registerGh("example/gamma-agent");
    const file = await candidateFile("c1.json", [
      { repo: "example/gamma-agent", category: "bio-omics", name: "Gamma Agent", tags: [], source: "awescholar", sourceUrl: "https://example.org" },
      { repo: "example/alpha-agent", category: "bio-omics", tags: [] },
    ]);
    await runAdd(["--from-json", file], root);

    const snapshot = await readSnapshot(root);
    expect(snapshot.agents).toHaveLength(3);
    const gamma = snapshot.agents.find((a) => a.repo === "example/gamma-agent")!;
    expect(gamma.slug).toBe("gamma-agent");
    expect(gamma.source).toBe("awescholar");
    expect(gamma.sourceUrl).toBe("https://example.org");
    expect(gamma.description).toBe("Mock repo description");
    expect(logs.join("\n")).toContain("example/alpha-agent already in the snapshot, skipped");
    expect(logs.join("\n")).toContain("Added 1 agent");
  });

  it("accepts a bare top-level record array", async () => {
    registerGh("example/delta-agent");
    const file = join(root, "c2.json");
    await writeFile(file, JSON.stringify([{ repo: "example/delta-agent", category: "chem-drug", tags: [] }]));
    await runAdd(["--from-json", file], root);

    const snapshot = await readSnapshot(root);
    expect(snapshot.agents.map((a) => a.slug)).toContain("delta-agent");
  });

  it("writes nothing when any record fails validation (all-or-nothing)", async () => {
    registerGh("example/gamma-agent");
    const before = await readFile(join(root, "data", "agents-snapshot.json"), "utf8");
    const file = await candidateFile("c3.json", [
      { repo: "example/gamma-agent", category: "bio-omics", tags: [] },
      { repo: "example/epsilon-agent", category: "not-a-slug", tags: [] },
    ]);
    await expect(runAdd(["--from-json", file], root)).rejects.toThrow(CliError);
    await expect(runAdd(["--from-json", file], root)).rejects.toThrow(/not-a-slug/);
    expect(await readFile(join(root, "data", "agents-snapshot.json"), "utf8")).toBe(before);
  });

  it("rejects malformed or empty candidate files", async () => {
    const bad = join(root, "bad.json");
    await writeFile(bad, "{\"agents\": []}");
    await expect(runAdd(["--from-json", bad], root)).rejects.toThrow(/no candidate agents/);
    await writeFile(bad, "{\"unexpected\": 1}");
    await expect(runAdd(["--from-json", bad], root)).rejects.toThrow(/expected \{"agents": \[\.\.\.\]\}/);
  });

  it("succeeds without writing when every candidate is already registered", async () => {
    const file = await candidateFile("c4.json", [{ repo: "example/beta-agent", category: "chem-drug", tags: [] }]);
    await runAdd(["--from-json", file], root);
    expect(logs.join("\n")).toContain("Nothing new");
    const snapshot = await readSnapshot(root);
    expect(snapshot.agents).toHaveLength(2);
  });
});
