// Primary categories answer one question: what does a user open this repo for.
// Tags are NOT a second capability axis: they carry only objective proper-noun
// attributions (institution, venue, companion product, named tech — Stanford,
// Nature-Biotechnology, MCP). There is no fixed tag vocabulary; registry
// filters derive from the data (tags occurring 3+ times).

export const CATEGORIES: Record<string, string> = {
  "autonomous-research": "Autonomous Research",
  "literature-writing": "Literature & Scientific Writing",
  "bio-omics": "Bioinformatics & Omics",
  "chem-drug": "Chemistry & Drug Discovery",
  "clinical-health": "Clinical & Healthcare",
  platforms: "Platforms & Infrastructure",
  orchestration: "Multi-Agent Orchestration",
  benchmarks: "Benchmarks",
  "safety-security": "Safety & Security",
  others: "Others",
};

export const CATEGORY_ORDER = Object.keys(CATEGORIES);

// Lifecycle policy constants shared with the refresh command. See
// transform.ts resolveRepoStatus for how they compose.
export const NURSERY_MAX_STARS = 30;
export const NURSERY_ARCHIVE_IDLE_DAYS = 180;
export const ESTABLISHED_ARCHIVE_IDLE_DAYS = 3 * 365;
export const AUTO_STABLE_MIN_STARS = 1000;
