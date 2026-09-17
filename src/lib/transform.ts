// Pure lifecycle-policy helpers for the refresh and add commands.
// Kept free of side effects so they can be unit-tested directly.

import {
  AUTO_STABLE_MIN_STARS,
  ESTABLISHED_ARCHIVE_IDLE_DAYS,
  NURSERY_ARCHIVE_IDLE_DAYS,
  NURSERY_MAX_STARS,
} from "./categories";
import { venueTier } from "./papers";

/** Empty or whitespace-only homepages are represented consistently as null. */
export function normalizeHomepage(homepage: string | null | undefined): string | null {
  const normalized = homepage?.trim();
  return normalized || null;
}

const CREATIVE_COMMONS_LICENSES: Readonly<Record<string, string>> = {
  Attribution: "BY",
  "Attribution-ShareAlike": "BY-SA",
  "Attribution-NoDerivatives": "BY-ND",
  "Attribution-NonCommercial": "BY-NC",
  "Attribution-NonCommercial-ShareAlike": "BY-NC-SA",
  "Attribution-NonCommercial-NoDerivatives": "BY-NC-ND",
};

/**
 * Keeps GitHub's SPDX detection when present and recognizes standard Creative
 * Commons license titles when GitHub reports the raw file as NOASSERTION.
 */
export function resolveLicenseSpdxId(
  spdxId: string | null | undefined,
  licenseText: string | null | undefined,
): string | null {
  if (spdxId && spdxId !== "NOASSERTION") return spdxId;
  if (!licenseText) return null;
  if (/^MIT License\s*\n[\s\S]*Permission is hereby granted, free of charge/i.test(licenseText)) {
    return "MIT";
  }
  if (/Creative Commons Zero v1\.0 Universal/i.test(licenseText)) return "CC0-1.0";

  const match = /Creative Commons (Attribution(?:-(?:ShareAlike|NoDerivatives|NonCommercial)(?:-(?:ShareAlike|NoDerivatives))?)?) (\d\.\d) (?:International|Unported)\s+Public License/i.exec(
    licenseText,
  );
  if (!match) return null;

  const code = CREATIVE_COMMONS_LICENSES[match[1]];
  return code ? `CC-${code}-${match[2]}` : null;
}

/** Freshness from last push: stale after 120 idle days, active otherwise. */
export function freshnessStatus(pushedAt: Date, now = new Date()): string {
  return idleDays(pushedAt, now) > 120 ? "stale" : "active";
}

/** How many days since the last push. */
export function idleDays(pushedAt: Date, now = new Date()): number {
  return (now.getTime() - pushedAt.getTime()) / 86_400_000;
}

/**
 * Statuses the refresh job must never rederive:
 * - stable: an editorial (or auto-granted, sticky) verdict that quiet is
 *   expected — see qualifiesAutoStable for the automatic path
 * - no-repo: nothing to track
 * Everything else — including archived and gone — is derived from live
 * inputs each refresh, so recovery never needs a human edit.
 */
const PROTECTED_STATUSES: ReadonlySet<string> = new Set(["stable", "no-repo"]);

/**
 * The automatic stable promotion: a peer-reviewed companion paper (journal
 * or conference venue, any star count) or a popular preprint-backed repo
 * (stars above AUTO_STABLE_MIN_STARS). Records flagged autoStableExempt
 * never take this path — a curator's veto the pipeline cannot outvote.
 */
export function qualifiesAutoStable(stars: number, paperVenue: string): boolean {
  const tier = venueTier(paperVenue);
  if (tier === "journal" || tier === "conference") return true;
  return tier === "preprint" && stars > AUTO_STABLE_MIN_STARS;
}

/** Idle limit before a repo is considered abandoned, by star tier. */
export function archiveIdleLimit(stars: number): number {
  return stars < NURSERY_MAX_STARS
    ? NURSERY_ARCHIVE_IDLE_DAYS
    : ESTABLISHED_ARCHIVE_IDLE_DAYS;
}

/**
 * Unified refresh status policy shared by the snapshot command. In order:
 *
 * - Protected statuses are kept as-is: a stable verdict survives anything,
 *   no-repo has nothing to rederive.
 * - A repo archived by its owner is gone: the code may still be readable
 *   but it is frozen for good. Un-archiving the repo lifts this on the
 *   next refresh.
 * - The auto-stable paper rule promotes qualifying repos (unless exempt).
 *   It runs before the idle rules, so a peer-reviewed project that went
 *   quiet reads as stable, not archived.
 * - A repo idle past its tier's limit (180 days under the nursery star
 *   line, 3 years above) is archived — reversible by any fresh push.
 * - Everything else is freshness from pushedAt: active within 120 days,
 *   stale beyond. Missing pushedAt keeps the current status.
 *
 * Repos that vanish entirely (404) bypass this policy in the refresh
 * command and are written to "gone" directly.
 */
export function resolveRepoStatus({
  currentStatus,
  archived,
  stars,
  pushedAt,
  paperVenue = "",
  autoStableExempt = false,
  now = new Date(),
}: {
  currentStatus: string;
  archived: boolean;
  stars: number;
  pushedAt: Date | null;
  /** Venue of the companion paper (paperMeta.venue); "" when there is none. */
  paperVenue?: string;
  /** Curator veto against the automatic stable promotion. */
  autoStableExempt?: boolean;
  now?: Date;
}): string {
  if (PROTECTED_STATUSES.has(currentStatus)) return currentStatus;
  if (archived) return "gone";
  if (!autoStableExempt && qualifiesAutoStable(stars, paperVenue)) return "stable";
  if (!pushedAt) return currentStatus;
  if (idleDays(pushedAt, now) > archiveIdleLimit(stars)) return "archived";
  return freshnessStatus(pushedAt, now);
}

export type RetiredReason = "idle" | "owner-archived" | "not-found";

/**
 * Freezes the explanation and star count at the first retirement. A live
 * status clears both values so a recovered project leaves no stale memorial.
 */
export function resolveRetirement({
  currentStatus,
  nextStatus,
  archived,
  notFound = false,
  stars,
  retiredReason = null,
  retiredStars = null,
}: {
  currentStatus: string;
  nextStatus: string;
  archived: boolean;
  notFound?: boolean;
  stars: number;
  retiredReason?: string | null;
  retiredStars?: number | null;
}): { retiredReason: RetiredReason | null; retiredStars: number | null } {
  if (nextStatus !== "archived" && nextStatus !== "gone") {
    return { retiredReason: null, retiredStars: null };
  }
  const previousReason: RetiredReason | null =
    retiredReason === "idle" || retiredReason === "owner-archived" || retiredReason === "not-found"
      ? retiredReason
      : null;
  if (currentStatus === nextStatus && previousReason && retiredStars != null) {
    return { retiredReason: previousReason, retiredStars };
  }
  return {
    retiredReason: notFound ? "not-found" : archived ? "owner-archived" : "idle",
    retiredStars: stars,
  };
}
