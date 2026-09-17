// `agentx enrich-papers` — fill paperMeta on the snapshot via awescholar.
//
// For every agent that carries a precise paper clue — a DOI or arXiv ID in
// its paper/homepage URL, an arXiv mention or verbatim quoted title in its
// description — resolve it through `awescholar updater search` (Semantic
// Scholar) and store the record as `paperMeta`. Agents whose only clue is an
// arXiv ID whose DataCite DOI is not indexed fall back to resolving the
// title via the arXiv API and re-querying by title.
//
// Fills a missing `paper` link from the clue's canonical URL; an existing
// link is never overwritten. Agents that already have `paperMeta` are
// skipped, so re-runs only retry the misses (--force re-enriches all).
// `--only <slug-substring>` scopes the run to matching slugs (repeatable),
// like awescholar's --only — for adding one record without churning the rest.
//
// Env: SEMANTICSCHOLAR_API_KEY (optional but recommended — the anonymous
// pool rate-limits aggressively and shows up as "not found" misses).
// Requires the awescholar CLI on PATH (`pip install awescholar`).

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  DESCRIPTION_MATCH_THRESHOLD,
  type PaperClue,
  type PaperMeta,
  TITLE_MATCH_THRESHOLD,
  arxivIdToDoi,
  bestTitleMatch,
  cluePaperUrl,
  extractPaperClue,
} from "../lib/papers";
import { readSnapshot, writeSnapshot } from "../lib/snapshot";
import { awescholarSearch, type ScholarRecord } from "../lib/scholar";

export function enrichPapersUsage(): string {
  return [
    "Usage: agentx enrich-papers [options]",
    "",
    "Fill paperMeta from Semantic Scholar via awescholar.",
    "",
    "Options:",
    "  --force            re-enrich agents that already have paperMeta",
    "  --only <substring> scope to slugs containing <substring> (repeatable)",
    "  --root <dir>       AgentX repository root (default: the current directory)",
  ].join("\n");
}

function toMeta(r: ScholarRecord): PaperMeta {
  return {
    title: r.title,
    venue: r.venue ?? "",
    doi: r.doi ?? "",
    year: r.year ?? "",
    // Prefer the full ordered author list; older CLI records only carry
    // the corresponding author in `team`.
    authors: r.authors?.length ? r.authors.join(", ") : (r.team ?? ""),
    // S2 records carry no ordered author list, so the first author is
    // filled in later by a backfill pass on the website side.
    firstAuthor: "",
    paperUrl: r.paperUrl ?? "",
    citations: r.citations ?? null,
  };
}

/** Resolve arXiv IDs to titles via the arXiv API (id_list supports batches).
 *
 * The API rate-limits bursts (3s window, "Rate exceeded." text response, HTTP
 * 200) — retry each failed batch with backoff instead of silently giving up. */
async function arxivTitles(ids: string[], attempts = 3): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const res = await fetch(
      `https://export.arxiv.org/api/query?id_list=${ids.join(",")}&max_results=${ids.length}`,
    ).catch(() => null);
    if (res?.ok) {
      const xml = await res.text();
      // Atom: <entry><title>…</title> — one entry per id, in request order.
      const titles = [...xml.matchAll(/<title>([\s\S]*?)<\/title>/g)].map((m) =>
        m[1].replace(/\s+/g, " ").trim(),
      );
      if (!/Rate exceeded/i.test(xml)) {
        titles.shift(); // the first <title> is the feed's, not an entry's
        ids.forEach((id, i) => {
          if (titles[i] && !titles[i].startsWith("Error")) out.set(id, titles[i]);
        });
        return out;
      }
    }
    if (attempt < attempts) await new Promise((r) => setTimeout(r, 5_000 * attempt));
  }
  return out;
}

function addQuery(
  map: Map<string, { slugs: string[]; strict: boolean }>,
  value: string,
  slug: string,
  strict: boolean,
) {
  const entry = map.get(value);
  if (entry) entry.slugs.push(slug);
  else map.set(value, { slugs: [slug], strict });
}

export async function runEnrichPapers(argv: string[], root: string): Promise<void> {
  const force = argv.includes("--force");
  const unknown = argv.filter((a) => !["--force", "--root"].includes(a) && !a.startsWith("--only"));
  if (unknown.length > 0) throw new Error(enrichPapersUsage());
  const onlyArgs = argv.filter((_, i, a) => a[i - 1] === "--only" && a[i] && !a[i].startsWith("--"));

  const snapshot = await readSnapshot(root);
  const dir = await mkdtemp(join(tmpdir(), "agentx-enrich-"));

  try {
    const pending = snapshot.agents.filter(
      (a) =>
        (force || !a.paperMeta) &&
        a.status !== "archived" &&
        a.status !== "gone" &&
        (!onlyArgs.length || onlyArgs.some((o) => a.slug.includes(o))),
    );
    const clues = new Map<string, PaperClue>();
    let noClue = 0;
    for (const a of pending) {
      const clue = extractPaperClue(a);
      if (clue) clues.set(a.slug, clue);
      else noClue++;
    }
    const byKind = (kind: PaperClue["kind"]) =>
      [...clues].filter(([, c]) => c.kind === kind);
    console.log(
      `Enriching ${pending.length}/${snapshot.agents.length} agents — ` +
        `clues: ${byKind("doi").length} DOI, ${byKind("arxiv").length} arXiv, ` +
        `${byKind("title").length} title, ${noClue} without a precise clue.`,
    );
    if (clues.size === 0) return;

    // Pass 1: DOI lookups (paper-URL DOIs + arXiv IDs in DataCite DOI form).
    const doiQuery = new Map<string, { slugs: string[]; strict: boolean }>(); // query -> slugs
    for (const [slug, clue] of byKind("doi")) addQuery(doiQuery, clue.value, slug, false);
    for (const [slug, clue] of byKind("arxiv"))
      addQuery(doiQuery, arxivIdToDoi(clue.value), slug, false);
    const doiRecords = new Map<string, ScholarRecord>();
    if (doiQuery.size > 0) {
      const records = await awescholarSearch("doi", [...doiQuery.keys()], join(dir, "doi.json"));
      for (const r of records) if (r.doi) doiRecords.set(r.doi.toLowerCase(), r);
      console.log(`  awescholar --by doi: ${doiQuery.size} queries -> ${records.length} records`);
    }

    // Pass 2: agents whose DOI lookup missed -> retry by title. arXiv clues
    // get their title from the arXiv API; DOI clues try the description —
    // first a verbatim quoted title, then (strictly gated) the whole
    // description, which for paper-first repos is the title itself. S2's
    // title endpoint is a separate pool from its DOI endpoint, so one being
    // rate-limited does not imply the other is.
    const titleQuery = new Map<string, { slugs: string[]; strict: boolean }>();
    for (const [slug, clue] of byKind("title"))
      addQuery(titleQuery, clue.value, slug, false);
    const doiMissed = [...clues].filter(
      ([, clue]) =>
        (clue.kind === "arxiv" && !doiRecords.has(arxivIdToDoi(clue.value).toLowerCase())) ||
        (clue.kind === "doi" && !doiRecords.has(clue.value.toLowerCase())),
    );
    const arxivResolved = await arxivTitles(
      doiMissed.filter(([, c]) => c.kind === "arxiv").map(([, c]) => c.value),
    );
    let quotedFallbacks = 0;
    let descriptionFallbacks = 0;
    for (const [slug, clue] of doiMissed) {
      let title: string | undefined;
      let strict = true; // whole-description guesses need near-complete cover
      if (clue.kind === "arxiv") {
        title = arxivResolved.get(clue.value);
        strict = false; // arXiv API titles are the paper's own
      } else {
        // DOI clue: reuse the quoted-title extraction — the same description
        // that named the paper often carries its full title in quotes.
        const agent = snapshot.agents.find((a) => a.slug === slug);
        const quoted = extractPaperClue({ paper: "", description: agent?.description });
        if (quoted?.kind === "title") {
          title = quoted.value;
          quotedFallbacks++;
          strict = false; // verbatim quote, same bar as a normal title clue
        } else if (agent?.description) {
          // Last resort: a GitHub repo description that IS the paper title
          // (no quotes, single sentence). Treated as a strict guess.
          title = agent.description.split(/(?<=[.!?])\s/)[0].trim();
          descriptionFallbacks++;
        }
      }
      if (title) addQuery(titleQuery, title, slug, strict);
    }
    if (doiMissed.length > 0) {
      console.log(
        `  DOI/arXiv misses: ${doiMissed.length} — ${arxivResolved.size} via arXiv API, ` +
          `${quotedFallbacks} quoted / ${descriptionFallbacks} description titles as fallback`,
      );
    }
    const titleRecords: ScholarRecord[] =
      titleQuery.size > 0
        ? await awescholarSearch("title", [...titleQuery.keys()], join(dir, "title.json"))
        : [];
    if (titleQuery.size > 0) {
      console.log(`  awescholar --by title: ${titleQuery.size} queries -> ${titleRecords.length} records`);
    }

    // Merge: map each query value to its record, then each slug to metadata.
    const resolved = new Map<string, { clue: PaperClue; meta: PaperMeta }>();
    for (const [query, { slugs }] of doiQuery) {
      const record = doiRecords.get(query.toLowerCase());
      if (!record) continue;
      for (const slug of slugs) {
        const clue = clues.get(slug)!;
        resolved.set(slug, { clue, meta: toMeta(record) });
      }
    }
    for (const [query, { slugs, strict }] of titleQuery) {
      // Title clues match fuzzily: accept the record covering the query best.
      // Strict queries (whole-description guesses) need near-complete cover.
      const best = bestTitleMatch(query, titleRecords, strict ? DESCRIPTION_MATCH_THRESHOLD : TITLE_MATCH_THRESHOLD);
      if (!best) continue;
      const record = best as ScholarRecord;
      for (const slug of slugs) {
        const clue = clues.get(slug)!;
        resolved.set(slug, { clue, meta: toMeta(record) });
      }
    }

    let enriched = 0;
    let filledLink = 0;
    const misses: string[] = [];
    for (const a of snapshot.agents) {
      const hit = resolved.get(a.slug);
      if (!hit) {
        if (clues.has(a.slug)) misses.push(a.slug);
        continue;
      }
      a.paperMeta = hit.meta;
      if (!a.paper) {
        const url = cluePaperUrl(hit.clue, hit.meta);
        if (url) {
          a.paper = url;
          filledLink++;
        }
      }
      enriched++;
    }

    await writeSnapshot(root, snapshot);
    console.log(`\nDone. enriched=${enriched} paper-links-filled=${filledLink} ` +
      `unresolved=${misses.length} skipped=${snapshot.agents.length - pending.length}`);
    if (filledLink > 0) console.log("Newly filled paper links are listed in the snapshot diff.");
    if (misses.length > 0) {
      console.log(`Unresolved (re-run retries these): ${misses.join(", ")}`);
      console.log("Persistent misses are usually anonymous rate limits — set SEMANTICSCHOLAR_API_KEY.");
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
