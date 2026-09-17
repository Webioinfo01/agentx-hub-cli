import { describe, expect, it } from "vitest";

import {
  arxivIdToDoi,
  bestTitleMatch,
  cluePaperUrl,
  extractPaperClue,
  venueTier,
} from "../src/lib/papers";

describe("extractPaperClue", () => {
  it("prefers a DOI in the paper URL", () => {
    expect(extractPaperClue({ paper: "https://doi.org/10.1038/s41586-026-00000-0" })).toEqual({
      kind: "doi",
      value: "10.1038/s41586-026-00000-0",
    });
  });

  it("maps Nature article pages to their DOI", () => {
    expect(extractPaperClue({ paper: "https://www.nature.com/articles/s43588-026-01049-y" })).toEqual({
      kind: "doi",
      value: "10.1038/s43588-026-01049-y",
    });
  });

  it("reads arXiv IDs from paper URLs and description mentions", () => {
    expect(extractPaperClue({ paper: "https://arxiv.org/abs/2505.20286v2" })).toEqual({
      kind: "arxiv",
      value: "2505.20286",
    });
    expect(
      extractPaperClue({ description: "Implementation of the paper arXiv 2505.20286" }),
    ).toEqual({ kind: "arxiv", value: "2505.20286" });
  });

  it("falls back to a verbatim quoted title", () => {
    expect(
      extractPaperClue({
        description: 'We built it for "Some Agents for Scientific Discovery" (2026).',
      }),
    ).toEqual({ kind: "title", value: "Some Agents for Scientific Discovery" });
  });

  it("returns null without a precise clue", () => {
    expect(extractPaperClue({ description: "A toolkit for bioinformatics." })).toBeNull();
    expect(extractPaperClue({})).toBeNull();
  });
});

describe("arxivIdToDoi / cluePaperUrl", () => {
  it("converts to the DataCite form", () => {
    expect(arxivIdToDoi("2505.20286")).toBe("10.48550/arXiv.2505.20286");
  });

  it("builds canonical URLs", () => {
    expect(cluePaperUrl({ kind: "doi", value: "10.1/x" }, null)).toBe("https://doi.org/10.1/x");
    expect(cluePaperUrl({ kind: "arxiv", value: "2505.20286" }, null)).toBe(
      "https://arxiv.org/abs/2505.20286",
    );
    expect(cluePaperUrl({ kind: "title", value: "x" }, { paperUrl: "https://a.b/c" } as never)).toBe(
      "https://a.b/c",
    );
  });
});

describe("bestTitleMatch", () => {
  const records = [
    { title: "Agent Laboratory: Using LLM Agents as Research Assistants" },
    { title: "Something Completely Different About Proteins" },
  ];

  it("matches a truncated clue against the best-covering record", () => {
    expect(bestTitleMatch("Agent Laboratory LLM Agents Research Assistants", records)?.title).toContain(
      "Agent Laboratory",
    );
  });

  it("requires a phrase and a covering ratio", () => {
    expect(bestTitleMatch("proteins", records)).toBeNull();
    expect(bestTitleMatch("unrelated words entirely absent from titles", records)).toBeNull();
  });
});

describe("venueTier", () => {
  it("classifies journals, conferences, and preprints", () => {
    expect(venueTier("Nature Communications")).toBe("journal");
    expect(venueTier("Findings of EMNLP 2025")).toBe("conference");
    expect(venueTier("arXiv")).toBe("preprint");
    expect(venueTier("bioRxiv")).toBe("preprint");
  });

  it("returns null for non-venues", () => {
    expect(venueTier("")).toBeNull();
    expect(venueTier("Project homepage blog")).toBeNull();
  });
});
