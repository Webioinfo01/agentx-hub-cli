// `agentx snapshot` — refresh data/agents-snapshot.json in place.
//
// Two passes:
//   1. awescholar (Python CLI) refreshes the GitHub-derived fields on each
//      agent in place — stars, pushedAt, openIssues, language, description,
//      license (NOASSERTION-safe), homepage (filled only for an explicit
//      empty string), and the repo's archived flag. Strictly preserves
//      status, slug, paperMeta, category, tags, source, and the top-level
//      counts dict. See awescholar's `updater enrich --agentx`.
//   2. This command re-reads the just-written snapshot, applies the local
//      lifecycle policy (resolveRepoStatus / resolveRetirement) on the
//      refreshed data, and flips 404 → gone via a lightweight repoExists()
//      HEAD — one HEAD per agent, no GET body, no rate-limit risk.
//
// Env: GITHUB_TOKEN (optional but strongly recommended: 60 req/h
// unauthenticated vs. 5,000 req/h with a token).
// Requires the awescholar CLI on PATH (`pip install awescholar`).

import { execFileSync } from "node:child_process";

import { githubHeaders, repoExists, resolveRepoLicense } from "../lib/github";
import {
  mergeSnapshotAgent,
  readSnapshot,
  snapshotPath,
  uniqueSlug,
  writeSnapshot,
  type SnapshotAgent,
} from "../lib/snapshot";
import { resolveRepoStatus, resolveRetirement } from "../lib/transform";
import { CliError } from "../lib/cli-error";

export function snapshotUsage(): string {
  return [
    "Usage: agentx snapshot [options]",
    "",
    "  Refresh GitHub metrics and lifecycle statuses in place.",
    "",
    "Options:",
    "  --root <dir>  AgentX repository root (default: the current directory)",
  ].join("\n");
}

export async function runSnapshot(_argv: string[], root: string): Promise<void> {
  const headers = githubHeaders(process.env.GITHUB_TOKEN);
  if (!process.env.GITHUB_TOKEN) console.warn("No GITHUB_TOKEN — unauthenticated limit is 60 req/h.");

  // Pass 1: awescholar rewrites the snapshot on disk in place.
  try {
    execFileSync(
      "awescholar",
      ["updater", "enrich", "--archive", snapshotPath(root),
       "--agentx", "--no-backup"],
      { stdio: "inherit", env: process.env },
    );
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new CliError("awescholar CLI not found — install with `pip install awescholar`");
    }
    throw err;
  }

  // Pass 2: re-read and apply lifecycle policy + 404 detection.
  const current = await readSnapshot(root);

  const agents: SnapshotAgent[] = [];
  const usedSlugs = new Set<string>();
  const seenRepos = new Set<string>();
  let gone = 0;

  for (const a of current.agents) {
    // no-repo records (benchmark datasets, closed products) carry no GitHub
    // identity: nothing to fetch, and repoExists would 404 them into the
    // graveyard. Their curated fields pass through untouched, like the
    // skipped agents in pass 1.
    if (a.status === "no-repo") {
      agents.push(mergeSnapshotAgent(a, uniqueSlug(a.slug, usedSlugs), null, a.status, a.license));
      continue;
    }
    if (seenRepos.has(a.repo.toLowerCase())) {
      console.warn(`  duplicate repo in snapshot skipped: ${a.repo}`);
      continue;
    }
    seenRepos.add(a.repo.toLowerCase());
    const slug = uniqueSlug(a.slug, usedSlugs);

    // repoExists: false = 404 (definitely gone); null = transient (keep
    // previous status and metrics); true = alive for HEAD purposes.
    const exists = await repoExists(a.repo, headers);
    const notFound = exists === false;

    let status = a.status;
    if (notFound) {
      status = "gone";
      gone++;
      if (gone === 1) console.warn("  (404 repos are marked gone)");
    } else if (exists === true) {
      // The bulk fetched fields — including the archived flag — live on the
      // just-written agent from pass 1, so owner-archived repos go to the
      // graveyard in this same run.
      status = resolveRepoStatus({
        currentStatus: a.status,
        archived: a.archived ?? false,
        stars: a.stars,
        pushedAt: a.pushedAt ? new Date(a.pushedAt) : null,
        paperVenue: a.paperMeta?.venue ?? "",
        autoStableExempt: a.autoStableExempt ?? false,
      });
    }

    const retirement = resolveRetirement({
      currentStatus: a.status,
      nextStatus: status,
      archived: a.archived ?? false,
      notFound,
      stars: a.stars,
      retiredReason: a.retiredReason,
      retiredStars: a.retiredStars,
    });

    // License: awescholar wrote a real SPDX id when one was available and
    // skipped NOASSERTION; for the latter (a.license still null) we attempt
    // the /license text fallback here. Existing SPDX values stay untouched.
    const license = a.license === null && exists !== false
      ? await resolveRepoLicense(a.repo, { spdx_id: "NOASSERTION" }, headers)
      : a.license;

    agents.push({
      ...mergeSnapshotAgent(a, slug, null, status, license),
      ...retirement,
    });
    process.stdout.write(`\r  ${agents.length} processed`);
  }

  await writeSnapshot(root, { agents, counts: { total: agents.length, gone } });

  console.log(`\nSnapshot written: ${snapshotPath(root)} (agents=${agents.length} gone=${gone})`);
}
