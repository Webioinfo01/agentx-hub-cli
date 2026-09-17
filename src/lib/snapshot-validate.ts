// Offline validation for data/agents-snapshot.json — the mechanical backstop
// for "the snapshot is never hand-edited". Every writer (agentx add, the
// refresh, the enrichment passes) maintains these invariants; CI runs
// `agentx validate` so a bad merge or a manual edit fails loudly instead of
// drifting into the published site.
//
// Pure on purpose: no fs, no network, no DB — unit-testable and safe in any
// environment.

import { CATEGORIES } from "./categories";
import type { SnapshotFile } from "./snapshot";
import { findTagPolicyViolations, tagType } from "./tags";

// resolveRepoStatus (transform.ts) can emit every status below; "no-repo"
// only ever enters through a writer, but it is protected there, so it stays
// a legal stored value.
const VALID_STATUSES: ReadonlySet<string> = new Set([
  "active",
  "stale",
  "stable",
  "archived",
  "gone",
  "no-repo",
]);

// githubUrl is either null — no-repo records carry an external identity in
// repo ("anthropic.com/claude-science"), which is string-indistinguishable
// from a dotted GitHub owner — or the canonical URL built from repo. Writers
// (agentx add, the refresh pass-through) never produce anything else.
// Underscore is grandfathered: the legacy slugify ([^\w]+) kept it, and one
// such slug (paper_claw-pigeondan1) predates the current writer. Current
// writers only ever emit letters/digits/"-".
const SLUG = /^[\p{L}\p{N}_]+(?:-[\p{L}\p{N}_]+)*$/u;
const HTTP_URL = /^https?:\/\/\S+$/;

const RETIRED_REASONS: ReadonlySet<string> = new Set([
  "idle",
  "owner-archived",
  "not-found",
]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isInteger(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v);
}

/** All problems found, as human-readable lines; empty means the file is valid. */
export function validateSnapshotFile(file: unknown): string[] {
  const problems: string[] = [];

  if (!isPlainObject(file)) {
    return ["top level is not an object"];
  }
  const agents = (file as unknown as SnapshotFile).agents;
  if (!Array.isArray(agents)) {
    return ["agents is not an array"];
  }
  if (!isPlainObject(file.counts)) {
    return ["counts is not an object"];
  }

  // counts.gone counts the 404s of the last refresh run, NOT the agents
  // currently in status "gone" (owner-archived repos flip status without
  // being 404s), so only total is strictly derivable from the agents list.
  const { total, gone } = file.counts as Record<string, unknown>;
  if (total !== agents.length) {
    problems.push(`counts.total is ${String(total)}, but agents has ${agents.length} entries`);
  }
  if (!isInteger(gone) || gone < 0 || gone > agents.length) {
    problems.push(`counts.gone is ${String(gone)} — expected an integer in [0, ${agents.length}]`);
  }

  const where = (i: number, slug: unknown): string =>
    `agents[${i}]${typeof slug === "string" && slug ? ` (${slug})` : ""}`;

  const seenSlugs = new Map<string, number>();
  const seenRepos = new Map<string, number>();

  agents.forEach((agent, i) => {
    const spot = () => where(i, isPlainObject(agent) ? agent.slug : undefined);

    if (!isPlainObject(agent)) {
      problems.push(`${where(i, undefined)} is not an object`);
      return;
    }

    const { slug, name, repo, githubUrl } = agent;

    if (typeof slug !== "string" || !slug) {
      problems.push(`${spot()}: slug must be a non-empty string`);
    } else {
      if (!SLUG.test(slug)) {
        problems.push(`${spot()}: slug "${slug}" is not slug-shaped (lowercase words joined by "-")`);
      }
      if (slug.length > 64) {
        problems.push(`${spot()}: slug is ${slug.length} chars — writeSnapshot caps at 64`);
      }
      const dupAt = seenSlugs.get(slug);
      if (dupAt !== undefined) {
        problems.push(`${spot()}: duplicate slug — also at agents[${dupAt}]`);
      } else {
        seenSlugs.set(slug, i);
      }
    }

    if (typeof name !== "string" || !name.trim()) {
      problems.push(`${spot()}: name must be a non-empty string`);
    }

    if (typeof repo !== "string" || !repo.trim()) {
      problems.push(`${spot()}: repo must be a non-empty string`);
    } else {
      if (/\s/.test(repo)) {
        problems.push(`${spot()}: repo "${repo}" contains whitespace`);
      }
      const key = repo.toLowerCase();
      const dupAt = seenRepos.get(key);
      if (dupAt !== undefined) {
        problems.push(`${spot()}: duplicate repo ${repo} — also at agents[${dupAt}]`);
      } else {
        seenRepos.set(key, i);
      }

      if (githubUrl !== null && githubUrl !== undefined) {
        if (githubUrl !== `https://github.com/${repo}`) {
          problems.push(
            `${spot()}: githubUrl must be null or "https://github.com/${repo}", got ${JSON.stringify(githubUrl)}`,
          );
        }
      }
    }

    if (!CATEGORIES[agent.category as string]) {
      problems.push(`${spot()}: unknown category "${String(agent.category)}"`);
    }

    if (typeof agent.status !== "string" || !VALID_STATUSES.has(agent.status)) {
      problems.push(`${spot()}: status "${String(agent.status)}" is not one of ${[...VALID_STATUSES].join(", ")}`);
    }

    if (!isInteger(agent.stars) || agent.stars < 0) {
      problems.push(`${spot()}: stars must be a non-negative integer, got ${String(agent.stars)}`);
    }
    if (!isInteger(agent.openIssues) || agent.openIssues < 0) {
      problems.push(`${spot()}: openIssues must be a non-negative integer, got ${String(agent.openIssues)}`);
    }

    if (agent.pushedAt !== null && agent.pushedAt !== undefined) {
      if (typeof agent.pushedAt !== "string" || Number.isNaN(Date.parse(agent.pushedAt))) {
        problems.push(`${spot()}: pushedAt is not an ISO date string — ${String(agent.pushedAt)}`);
      }
    }

    for (const [field, value] of [["homepage", agent.homepage], ["paper", agent.paper]] as const) {
      if (value !== null && value !== undefined) {
        if (typeof value !== "string" || !HTTP_URL.test(value)) {
          problems.push(`${spot()}: ${field} must be null or an http(s) URL, got ${String(value)}`);
        }
      }
    }

    if (agent.tags !== undefined) {
      if (!Array.isArray(agent.tags) || agent.tags.some((t) => typeof t !== "string" || !t)) {
        problems.push(`${spot()}: tags must be an array of non-empty strings`);
      } else {
        for (const violation of findTagPolicyViolations(agent.tags)) {
          problems.push(`${spot()}: tag policy — ${violation}`);
        }
        const unregistered = agent.tags.filter((t) => tagType(t) === null);
        if (unregistered.length > 0) {
          problems.push(`${spot()}: unregistered tag(s) ${unregistered.join(", ")} — add to TAG_TYPE in src/lib/tags.ts first`);
        }
      }
    }

    const paperMeta = agent.paperMeta;
    if (paperMeta !== null && paperMeta !== undefined) {
      if (!isPlainObject(paperMeta)) {
        problems.push(`${spot()}: paperMeta must be an object or null`);
      } else {
        if (typeof paperMeta.title !== "string" || !paperMeta.title.trim()) {
          problems.push(`${spot()}: paperMeta.title must be a non-empty string`);
        }
        // null is legal: refresh-citations stores it for papers Semantic
        // Scholar does not index (bionemo-framework, STELLA).
        if (paperMeta.citations !== undefined && paperMeta.citations !== null && !isInteger(paperMeta.citations)) {
          problems.push(`${spot()}: paperMeta.citations must be an integer or null, got ${String(paperMeta.citations)}`);
        }
        for (const key of ["venue", "year", "authors", "firstAuthor", "doi", "paperUrl"] as const) {
          const v = paperMeta[key];
          if (v !== undefined && v !== null && typeof v !== "string") {
            problems.push(`${spot()}: paperMeta.${key} must be a string`);
          }
        }
      }
    }

    const retiredReason = agent.retiredReason;
    if (retiredReason !== undefined && retiredReason !== null) {
      if (!RETIRED_REASONS.has(retiredReason as string)) {
        problems.push(`${spot()}: retiredReason "${String(retiredReason)}" is not one of idle, owner-archived, not-found`);
      } else if (agent.status !== "archived" && agent.status !== "gone") {
        problems.push(`${spot()}: retiredReason set while status is "${String(agent.status)}" — only graveyard records carry it`);
      }
    }
    if (agent.retiredStars !== undefined && agent.retiredStars !== null && !isInteger(agent.retiredStars)) {
      problems.push(`${spot()}: retiredStars must be an integer, got ${String(agent.retiredStars)}`);
    }

    if (agent.sourceUrl !== undefined && agent.sourceUrl !== null) {
      if (typeof agent.sourceUrl !== "string" || !HTTP_URL.test(agent.sourceUrl)) {
        problems.push(`${spot()}: sourceUrl must be null or an http(s) URL`);
      }
    }
  });

  // writeSnapshot sorts by slug so diffs stay deterministic — a file that
  // drifted out of order was not written by the pipeline.
  const slugs = agents
    .filter(isPlainObject)
    .map((a) => a.slug)
    .filter((s): s is string => typeof s === "string");
  const sorted = [...slugs].sort((a, b) => a.localeCompare(b));
  if (slugs.some((s, i) => s !== sorted[i])) {
    problems.push("agents are not in stable slug order (writeSnapshot sorts by slug.localeCompare)");
  }

  return problems;
}
