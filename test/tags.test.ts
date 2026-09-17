import { describe, expect, it } from "vitest";

import { canonicalVenue, findTagPolicyViolations, registeredTags, tagType } from "../src/lib/tags";

describe("tag policy", () => {
  it("flags marketing counts and generic descriptors", () => {
    expect(findTagPolicyViolations(["10x-faster"])).toEqual([
      "10x-faster — count-based marketing (no leading digits)",
    ]);
    expect(findTagPolicyViolations(["multi-agent"])).toEqual([
      "multi-agent — generic descriptor, belongs in category/description",
    ]);
    expect(findTagPolicyViolations(["Stanford"])).toEqual([]);
  });

  it("is case-sensitive: domains are generic, journals are venues", () => {
    expect(findTagPolicyViolations(["bioinformatics"])).toHaveLength(1);
    expect(tagType("Bioinformatics")).toBe("venue");
  });
});

describe("tagType", () => {
  it("types registered tags and rejects unknown ones", () => {
    expect(tagType("Stanford")).toBe("institution");
    expect(tagType("Karpathy")).toBe("team");
    expect(tagType("NeurIPS")).toBe("venue");
    expect(tagType("MCP")).toBe("tech");
    expect(tagType("Not-A-Tag")).toBeNull();
  });
});

describe("canonicalVenue", () => {
  it("folds alias spellings onto canonical venue tags", () => {
    expect(canonicalVenue("NeurIPS 2025")).toBe("NeurIPS");
    expect(canonicalVenue("The Lancet Digital Health")).toBe("Lancet-Digital-Health");
  });

  it("folds on punctuation-stripped, case-insensitive keys", () => {
    expect(canonicalVenue("arxiv.org")).toBe("arXiv");
    expect(canonicalVenue("  Methods and Protocols ")).toBe("Methods-and-Protocols");
  });

  it("passes unknown venue strings through untouched", () => {
    expect(canonicalVenue("Some Unknown Workshop Series")).toBe("Some Unknown Workshop Series");
  });

  it("keeps every canonical venue resolvable through its own name", () => {
    for (const [tag, type] of registeredTags()) {
      if (tagType(tag) === "venue") {
        expect(canonicalVenue(tag)).toBe(tag);
      }
      void type;
    }
  });
});
