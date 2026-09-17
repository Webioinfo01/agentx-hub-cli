import { describe, expect, it } from "vitest";

import { slugify, uniqueSlug } from "../src/lib/snapshot";

describe("slugify", () => {
  it("lowercases and dashes non-alphanumerics", () => {
    expect(slugify("MedClaw (zteyesreal)")).toBe("medclaw-zteyesreal");
  });

  it("keeps unicode letters and trims leading/trailing dashes", () => {
    expect(slugify("--Alpha! Beta--")).toBe("alpha-beta");
    expect(slugify("α-agente")).toBe("α-agente");
  });

  it("caps at 64 chars and never returns empty", () => {
    expect(slugify("a".repeat(100)).length).toBeLessThanOrEqual(64);
    expect(slugify("!!!")).toBe("agent");
  });
});

describe("uniqueSlug", () => {
  it("passes through free slugs and registers them", () => {
    const used = new Set<string>();
    expect(uniqueSlug("alpha", used)).toBe("alpha");
    expect(used.has("alpha")).toBe(true);
  });

  it("suffixes -2 on collision", () => {
    const used = new Set(["alpha"]);
    expect(uniqueSlug("alpha", used)).toBe("alpha-2");
  });
});
