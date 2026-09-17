// Read/write access to <root>/data/agents-snapshot.json — the single source
// of truth for the directory. All commands resolve the file through --root
// (default: the current directory), so the CLI operates on any AgentX
// repository checkout without copying data.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { PaperMeta } from "./papers";
import { normalizeHomepage } from "./transform";
import type { GhRepo } from "./github";

export interface SnapshotAgent {
  slug: string;
  name: string;
  repo: string;
  // Null for no-repo records (benchmark datasets, closed products); the
  // repo field then carries the canonical external identity instead.
  githubUrl: string | null;
  homepage: string | null;
  paper: string | null;
  paperMeta?: PaperMeta | null;
  category: string;
  tags: string[];
  language: string | null;
  stars: number;
  pushedAt: string | null;
  openIssues: number;
  license: string | null;
  description: string | null;
  status: string;
  /** GitHub-derived: the owner archived the repo; refresh maps it to "gone". */
  archived?: boolean | null;
  /** Curator veto against the automatic stable promotion. */
  autoStableExempt?: boolean;
  /** Why the project entered the graveyard; absent for live records. */
  retiredReason?: "idle" | "owner-archived" | "not-found" | null;
  /** GitHub stars captured when the project entered the graveyard. */
  retiredStars?: number | null;
  source?: string;
  sourceUrl?: string | null;
}

export interface SnapshotFile {
  agents: SnapshotAgent[];
  counts: { total: number; gone: number };
}

/** The snapshot file for an AgentX repository root. */
export function snapshotPath(root: string): string {
  return join(root, "data", "agents-snapshot.json");
}

export async function readSnapshot(root: string): Promise<SnapshotFile> {
  return JSON.parse(await readFile(snapshotPath(root), "utf8")) as SnapshotFile;
}

/** Merge refreshed GitHub fields without replacing curated snapshot metadata. */
export function mergeSnapshotAgent(
  agent: SnapshotAgent,
  slug: string,
  github: GhRepo | null,
  status: string,
  license: string | null,
): SnapshotAgent {
  const out: SnapshotAgent = {
    slug,
    name: agent.name,
    repo: agent.repo,
    githubUrl: agent.githubUrl,
    homepage: normalizeHomepage(agent.homepage) ?? normalizeHomepage(github?.homepage),
    paper: agent.paper,
    paperMeta: agent.paperMeta ?? null,
    category: agent.category,
    tags: agent.tags,
    language: github?.language ?? agent.language,
    stars: github?.stargazers_count ?? agent.stars,
    pushedAt: github?.pushed_at ?? agent.pushedAt,
    openIssues: github?.open_issues_count ?? agent.openIssues,
    archived: github?.archived ?? agent.archived ?? false,
    license: license ?? agent.license,
    description: github?.description ?? agent.description,
    status,
    autoStableExempt: agent.autoStableExempt ?? false,
    source: agent.source ?? "curated",
    sourceUrl: agent.sourceUrl ?? null,
  };
  if (agent.retiredReason !== undefined) out.retiredReason = agent.retiredReason;
  if (agent.retiredStars !== undefined) out.retiredStars = agent.retiredStars;
  return out;
}

// Stable slug order => deterministic diffs, and the daily workflow only
// commits when data actually changed. The file intentionally carries NO
// timestamp for the same reason.
export async function writeSnapshot(root: string, file: SnapshotFile): Promise<void> {
  file.agents.sort((a, b) => a.slug.localeCompare(b.slug));
  file.counts.total = file.agents.length;
  const path = snapshotPath(root);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(file, null, 2) + "\n");
}

export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "agent"
  );
}

/** Unique slug against the already-used ones, "-2" suffix on collision. */
export function uniqueSlug(base: string, used: Set<string>): string {
  let slug = base;
  while (used.has(slug)) slug = `${slug}-2`;
  used.add(slug);
  return slug;
}
