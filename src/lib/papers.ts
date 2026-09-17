// Paper metadata helpers: clue extraction for `agentx enrich-papers` and
// title matching for `agentx refresh-citations`. Pure functions, kept free
// of side effects so they can be unit-tested directly.
//
// Enrichment resolves one clue per agent through awescholar's
// `updater search` (Semantic Scholar) and stores the resulting record
// subset as `paperMeta` on the snapshot agent. Only precise clues are
// extracted — a resolvable identifier or a verbatim quoted title — so a
// match never depends on fuzzy guessing from the agent name.

/** Metadata subset of an awescholar paper record, stored as JSON on the agent. */
export interface PaperMeta {
  title: string;
  venue: string;
  doi: string;
  year: string;
  /** Full author list in paper order. */
  authors: string;
  firstAuthor: string;
  paperUrl: string;
  /** Semantic Scholar citationCount; null when the record predates it. */
  citations?: number | null;
}

export type PaperClue =
  | { kind: "doi"; value: string }
  | { kind: "arxiv"; value: string }
  | { kind: "title"; value: string };

// arXiv IDs: new style 2505.20286 (with optional version), old style cs/0301012.
const ARXIV_URL = /arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5}|[a-z-]+\/\d{7})(?:v\d+)?/i;
const DOI_URL = /doi\.org\/(10\.[^\s?#)]+)/i;
// Nature article pages carry the DOI suffix verbatim:
// nature.com/articles/s43588-026-01049-y ↔ 10.1038/s43588-026-01049-y.
const NATURE_URL = /(?:^|\.)nature\.com\/articles\/((?:10\.\d{4,5}\/)?[^\s?#)]+)/i;
const ARXIV_MENTION = /arxiv[:\s](\d{4}\.\d{4,5})/i;
const ANY_QUOTE = /["\u201c\u201d]/;

/**
 * The single most precise paper clue an agent record carries, in priority
 * order: DOI in the paper URL, arXiv ID in the paper URL, arXiv mention in
 * the description, arXiv in the homepage, verbatim quoted title in the
 * description. Returns null when nothing precise is available.
 */
export function extractPaperClue(agent: {
  paper?: string | null;
  homepage?: string | null;
  description?: string | null;
}): PaperClue | null {
  const paper = agent.paper ?? "";
  let m = DOI_URL.exec(paper);
  if (m) return { kind: "doi", value: m[1].replace(/[.,;]+$/, "") };
  m = NATURE_URL.exec(paper);
  if (m) return { kind: "doi", value: m[1].startsWith("10.") ? m[1] : `10.1038/${m[1]}` };
  m = ARXIV_URL.exec(paper);
  if (m) return { kind: "arxiv", value: m[1] };
  m = ARXIV_MENTION.exec(agent.description ?? "");
  if (m) return { kind: "arxiv", value: m[1] };
  m = ARXIV_URL.exec(agent.homepage ?? "");
  if (m) return { kind: "arxiv", value: m[1] };
  // Split on quote characters and take the segments BETWEEN pairs — a
  // plain regex over quoted spans mis-pairs when a short quoted word
  // precedes the real title.
  const segments = (agent.description ?? "").split(ANY_QUOTE);
  for (let i = 1; i < segments.length; i += 2) {
    const title = segments[i].trim();
    // A citable title has spaces; skip quoted URLs and short fragments.
    if (title.length < 12 || !title.includes(" ") || title.includes("http")) continue;
    return { kind: "title", value: title };
  }
  return null;
}

/** arXiv ID → its DataCite DOI form, the only ID form S2 resolves for preprints. */
export function arxivIdToDoi(id: string): string {
  return `10.48550/arXiv.${id}`;
}

/** Canonical URL for a resolved clue, used to fill a missing `paper` link. */
export function cluePaperUrl(clue: PaperClue, meta: PaperMeta | null): string | null {
  if (clue.kind === "doi") return `https://doi.org/${clue.value}`;
  if (clue.kind === "arxiv") return `https://arxiv.org/abs/${clue.value}`;
  return meta?.paperUrl || null;
}

function titleTokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const t of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    // Naive plural folding — "Agents" and "Agent" must count as the same
    // word when matching S2 titles against truncated clues.
    out.add(t.length > 3 && t.endsWith("s") && !t.endsWith("ss") ? t.slice(0, -1) : t);
  }
  return out;
}

/**
 * How much of the clue title is covered by the record title:
 * |clue ∩ record| / |clue|. 1 when every clue word appears in the record —
 * the expected shape, since clues are usually exact or truncated titles.
 */
export function titleMatchRatio(clue: string, title: string): number {
  const clueTokens = titleTokens(clue);
  if (clueTokens.size === 0) return 0;
  const record = titleTokens(title);
  let hit = 0;
  for (const t of clueTokens) if (record.has(t)) hit++;
  return hit / clueTokens.size;
}

/** Acceptance threshold for matching an S2 title-search result to a clue. */
export const TITLE_MATCH_THRESHOLD = 0.7;

/**
 * Stricter threshold for whole-description clues: a GitHub repo description
 * used as the paper title is a guess, so only a near-complete cover counts.
 */
export const DESCRIPTION_MATCH_THRESHOLD = 0.9;

/**
 * Best S2 title-search record covering the query, null when none clears the
 * threshold. Whole-description clues use the stricter bar.
 */
export function bestTitleMatch(
  query: string,
  records: { title: string }[],
  threshold = TITLE_MATCH_THRESHOLD,
): { title: string } | null {
  // A one-word "query" trivially scores 1.0 against any record containing
  // it — too weak to identify a paper. Require a phrase.
  if (titleTokens(query).size < 3) return null;
  return (
    records
      .map((r) => ({ r, ratio: titleMatchRatio(query, r.title) }))
      .filter((x) => x.ratio >= threshold)
      .sort((a, b) => b.ratio - a.ratio)[0]?.r ?? null
  );
}

// --- Venue tier --------------------------------------------------------------
//
// The tier is derived from the enriched venue string (Semantic Scholar's
// record): it answers "what kind of publication is this" for the auto-stable
// promotion rule in transform.ts.

export type VenueTier = "journal" | "conference" | "preprint";

const PREPRINT_SERVER =
  /arxiv|biorxiv|medrxiv|chemrxiv|agentrxiv|ssrn|preprints?\.org|\bosf\b/i;
const NON_VENUE = /\bblog\b|website|homepage|github/i;
const CONFERENCE_HINT =
  /conference|symposium|workshop|proceedings|neural information processing systems|findings of|\bICLR\b|\bNeurIPS\b|\bICML\b|\bCVPR\b|\bACL\b|\bEMNLP\b|\bNAACL\b|\bAAAI\b|\bIJCAI\b|\bICDMW\b/i;

/**
 * Publication tier of a venue string, or null when it names no real venue
 * (empty, or a non-venue source like a company blog). Classification is
 * pattern-based and deliberately conservative: anything unrecognized that
 * is not a preprint server counts as a journal.
 */
export function venueTier(venue: string): VenueTier | null {
  const v = venue.trim();
  if (!v || NON_VENUE.test(v)) return null;
  if (PREPRINT_SERVER.test(v)) return "preprint";
  if (CONFERENCE_HINT.test(v)) return "conference";
  return "journal";
}
