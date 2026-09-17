// `agentx refresh-citations` — refresh the `citations` field (Semantic
// Scholar citationCount) on every agent that already has a `paperMeta`
// record. Nothing else is touched — full re-enrichment (enrich-papers
// --force) would clobber fields that later backfills filled in, so this
// stays surgical.
//
// Lookups go DOI-first (exact); agents whose DOI is an unindexed DataCite
// arXiv DOI, or that carry no DOI, fall back to a title lookup matched
// against the stored title. Records with a citation count already set are
// re-queried too — counts drift, and this command exists to refresh them.
//
// Env: SEMANTICSCHOLAR_API_KEY (optional but recommended — the anonymous
// pool rate-limits aggressively and shows up as "not found" misses).
// Requires the awescholar CLI on PATH (`pip install awescholar >= 0.2.2`).

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { bestTitleMatch } from "../lib/papers";
import { readSnapshot, writeSnapshot } from "../lib/snapshot";
import { awescholarSearch } from "../lib/scholar";

export function refreshCitationsUsage(): string {
  return [
    "Usage: agentx refresh-citations [options]",
    "",
    "Refresh paperMeta.citations from Semantic Scholar.",
    "",
    "Options:",
    "  --root <dir>  AgentX repository root (default: the current directory)",
  ].join("\n");
}

export async function runRefreshCitations(argv: string[], root: string): Promise<void> {
  const unknown = argv.filter((a) => a.startsWith("-") && a !== "--root");
  if (unknown.length > 0) throw new Error(refreshCitationsUsage());

  const snapshot = await readSnapshot(root);
  const dir = await mkdtemp(join(tmpdir(), "agentx-cites-"));

  try {
    const withPaper = snapshot.agents.filter(
      (a) => a.paperMeta && a.status !== "archived" && a.status !== "gone",
    );
    console.log(`Refreshing citations for ${withPaper.length} agents with a paper record.`);
    if (withPaper.length === 0) return;

    // Pass 1: DOI lookups — exact, one batch.
    const doiToSlugs = new Map<string, string[]>();
    for (const a of withPaper) {
      const doi = a.paperMeta!.doi?.trim();
      if (!doi) continue;
      const slugs = doiToSlugs.get(doi.toLowerCase());
      if (slugs) slugs.push(a.slug);
      else doiToSlugs.set(doi.toLowerCase(), [a.slug]);
    }
    const citations = new Map<string, number>();
    const doiRecords =
      doiToSlugs.size > 0
        ? await awescholarSearch("doi", [...doiToSlugs.keys()], join(dir, "doi.json"))
        : [];
    for (const r of doiRecords) {
      if (typeof r.citations !== "number" || !r.doi) continue;
      citations.set(r.doi.toLowerCase(), r.citations);
    }
    console.log(`  awescholar --by doi: ${doiToSlugs.size} queries -> ${doiRecords.length} records`);

    // Pass 2: DOI misses and no-DOI records — retry by stored title.
    const missed = withPaper.filter(
      (a) => !a.paperMeta!.doi?.trim() || !citations.has(a.paperMeta!.doi.trim().toLowerCase()),
    );
    const titleQuery = new Map<string, string[]>();
    for (const a of missed) {
      const title = a.paperMeta!.title;
      const slugs = titleQuery.get(title);
      if (slugs) slugs.push(a.slug);
      else titleQuery.set(title, [a.slug]);
    }
    const titleRecords =
      titleQuery.size > 0
        ? await awescholarSearch("title", [...titleQuery.keys()], join(dir, "title.json"))
        : [];
    if (titleQuery.size > 0) {
      console.log(
        `  awescholar --by title: ${titleQuery.size} queries -> ${titleRecords.length} records`,
      );
    }
    // The query is the stored S2 title, so the true record matches at ~1.0;
    // the default threshold only filters lookalikes.
    const titleHits = new Map<string, number>();
    for (const [title, slugs] of titleQuery) {
      const best = bestTitleMatch(title, titleRecords);
      const n = (best as { citations?: number | null } | null)?.citations;
      if (best && typeof n === "number") {
        for (const slug of slugs) titleHits.set(slug, n);
      }
    }

    let updated = 0;
    let unchanged = 0;
    const misses: string[] = [];
    for (const a of withPaper) {
      const meta = a.paperMeta!;
      let n: number | undefined;
      const doi = meta.doi?.trim().toLowerCase();
      if (doi && citations.has(doi)) n = citations.get(doi);
      else n = titleHits.get(a.slug);
      if (typeof n !== "number") {
        misses.push(a.slug);
        continue;
      }
      if (meta.citations === n) {
        unchanged++;
        continue;
      }
      meta.citations = n;
      updated++;
    }

    if (updated > 0) await writeSnapshot(root, snapshot);
    console.log(
      `\nDone. citations updated=${updated} already-current=${unchanged} ` +
        `unresolved=${misses.length}`,
    );
    if (misses.length > 0) {
      console.log(`Unresolved (kept previous value): ${misses.join(", ")}`);
      console.log("Persistent misses are usually anonymous rate limits — set SEMANTICSCHOLAR_API_KEY.");
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
