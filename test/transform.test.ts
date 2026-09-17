import { describe, expect, it } from "vitest";

import {
  freshnessStatus,
  idleDays,
  resolveLicenseSpdxId,
  resolveRepoStatus,
  resolveRetirement,
} from "../src/lib/transform";

const NOW = new Date("2026-09-17T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

describe("resolveRepoStatus", () => {
  it("never rederives protected statuses", () => {
    for (const status of ["stable", "no-repo"]) {
      expect(
        resolveRepoStatus({ currentStatus: status, archived: true, stars: 0, pushedAt: daysAgo(400), now: NOW }),
      ).toBe(status);
    }
  });

  it("maps owner-archived repos to gone", () => {
    expect(
      resolveRepoStatus({ currentStatus: "active", archived: true, stars: 100, pushedAt: daysAgo(1), now: NOW }),
    ).toBe("gone");
  });

  it("promotes peer-reviewed papers to stable before the idle rules", () => {
    expect(
      resolveRepoStatus({
        currentStatus: "active",
        archived: false,
        stars: 3,
        pushedAt: daysAgo(400),
        paperVenue: "Nature Biotechnology",
        now: NOW,
      }),
    ).toBe("stable");
  });

  it("promotes popular preprint-backed repos, honoring the curator veto", () => {
    const base = { currentStatus: "active", archived: false, pushedAt: daysAgo(10), paperVenue: "arXiv", now: NOW };
    expect(resolveRepoStatus({ ...base, stars: 1500 })).toBe("stable");
    expect(resolveRepoStatus({ ...base, stars: 900 })).toBe("active");
    expect(resolveRepoStatus({ ...base, stars: 1500, autoStableExempt: true })).toBe("active");
  });

  it("archives nursery repos past 180 idle days, established past 3 years", () => {
    const nursery = { currentStatus: "active", archived: false, stars: 10, paperVenue: "", now: NOW };
    expect(resolveRepoStatus({ ...nursery, pushedAt: daysAgo(181) })).toBe("archived");
    expect(resolveRepoStatus({ ...nursery, pushedAt: daysAgo(130) })).toBe("stale");

    const established = { ...nursery, stars: 500 };
    expect(resolveRepoStatus({ ...established, pushedAt: daysAgo(365) })).toBe("stale");
    expect(resolveRepoStatus({ ...established, pushedAt: daysAgo(3 * 365 + 1) })).toBe("archived");
  });

  it("keeps the current status when pushedAt is missing", () => {
    expect(
      resolveRepoStatus({ currentStatus: "stale", archived: false, stars: 10, pushedAt: null, now: NOW }),
    ).toBe("stale");
  });

  it("splits freshness at 120 idle days", () => {
    expect(freshnessStatus(daysAgo(119), NOW)).toBe("active");
    expect(freshnessStatus(daysAgo(121), NOW)).toBe("stale");
    expect(idleDays(daysAgo(10), NOW)).toBeCloseTo(10);
  });
});

describe("resolveLicenseSpdxId", () => {
  it("keeps real SPDX ids", () => {
    expect(resolveLicenseSpdxId("MIT", null)).toBe("MIT");
    expect(resolveLicenseSpdxId("Apache-2.0", "junk")).toBe("Apache-2.0");
  });

  it("recognizes standard license texts behind NOASSERTION", () => {
    const mit = "MIT License\n\nPermission is hereby granted, free of charge.";
    expect(resolveLicenseSpdxId("NOASSERTION", mit)).toBe("MIT");
    expect(
      resolveLicenseSpdxId("NOASSERTION", "Creative Commons Attribution 4.0 International Public License"),
    ).toBe("CC-BY-4.0");
    expect(resolveLicenseSpdxId("NOASSERTION", null)).toBeNull();
  });
});

describe("resolveRetirement", () => {
  it("clears metadata when a record returns to a live status", () => {
    expect(
      resolveRetirement({
        currentStatus: "archived",
        nextStatus: "active",
        archived: false,
        stars: 12,
        retiredReason: "idle",
        retiredStars: 12,
      }),
    ).toEqual({ retiredReason: null, retiredStars: null });
  });

  it("freezes reason and stars at the first retirement", () => {
    expect(
      resolveRetirement({
        currentStatus: "active",
        nextStatus: "archived",
        archived: true,
        stars: 42,
      }),
    ).toEqual({ retiredReason: "owner-archived", retiredStars: 42 });
    expect(
      resolveRetirement({
        currentStatus: "active",
        nextStatus: "gone",
        archived: false,
        notFound: true,
        stars: 42,
      }),
    ).toEqual({ retiredReason: "not-found", retiredStars: 42 });
  });

  it("keeps the frozen values on repeat visits", () => {
    expect(
      resolveRetirement({
        currentStatus: "archived",
        nextStatus: "archived",
        archived: true,
        stars: 50,
        retiredReason: "idle",
        retiredStars: 44,
      }),
    ).toEqual({ retiredReason: "idle", retiredStars: 44 });
  });
});
