// Tag parsing + tag policy for agent records (stored as a JSON array of strings).

// Tag policy: tags carry objective proper-noun attributions only —
// institution (Stanford), publication venue (Nature-Biotechnology), companion
// product (MCP), named tech (LangChain). Capabilities and scenarios
// (multi-agent, bioinformatics, local-first) belong in the category or the
// description, never in tags.
//
// This denylist is a regression guard against re-importing generic tags from
// external directories (the claw4science import carried its tag layer over
// verbatim once already), not a complete ontology. Case-sensitive on purpose:
// "bioinformatics" is a domain, "Bioinformatics" is a journal.

const GENERIC_TAGS = new Set([
  // capability / architecture
  "multi-agent", "autonomous", "self-evolving", "self-evolution", "self-improving",
  "self-configuring", "self-debugging", "self-hosted", "multimodal", "multi-modal",
  "multi-llm", "multi-model", "multi-provider", "multi-provider-llm", "multi-domain",
  "multi-discipline", "multi-platform", "multi-mode", "multilingual", "bilingual",
  "cross-model", "end-to-end", "end-to-end-research", "full-lifecycle", "full-stack",
  "full-process", "human-in-the-loop", "tool-use", "rag", "llm", "llm-agent",
  "llm-training", "sub-agents", "agent-swarm", "swarm", "orchestrator",
  "agent-orchestration", "agent-harness", "agent-management", "agent-infrastructure",
  "agent-skill", "agent-skills", "coding-agent", "ai-assistant", "research-assistant",
  "workflow-assistant", "expert-agent", "copilot", "general-purpose", "generalist",
  "universal-llm", "long-horizon", "parallel-execution", "distributed",
  "co-discovery", "crowdsourced-discovery", "collective-evolution", "supervisor",
  "watchdog", "observability", "devops", "deployment", "container", "sandbox",
  "sandboxed", "isolated-execution", "runtime", "harness", "framework",
  "platform", "infrastructure", "dashboard", "web-dashboard", "web-ui", "gui",
  "desktop", "desktop-app", "desktop-workbench", "pwa", "voice", "conversational",
  "chat-based", "chat-integration", "canvas", "email", "monorepo", "local-models",
  "local-first", "local+cloud", "edge", "edge-cloud", "embedded", "iot",
  // domain / discipline
  "bioinformatics", "computational-biology", "biology", "biomedical", "biomedicine",
  "bioinformatics-mcp", "single-cell", "cell-type-annotation", "scrna-seq", "rna-seq",
  "multi-omics", "omics", "genomics", "metagenomics", "spatial-transcriptomics",
  "spatial-biology", "annotation", "multi-dataset-integration", "population-genetics",
  "drug-discovery", "drug-repurposing", "drug-target", "target-identification",
  "target-discovery", "pharma", "cheminformatics", "chemistry", "computational-chemistry",
  "molecular", "molecular-docking", "molecular-dynamics", "molecular-visualization",
  "protein-design", "protein-folding", "protein-engineering", "nanobody-design",
  "structural-biology", "therapeutic-reasoning", "precision-medicine", "clinical",
  "medical", "health", "wearable", "epidemiology", "neuroscience", "materials",
  "materials-science", "mathematics", "statistics", "remote-sensing", "tcm",
  "network-pharmacology", "disease-mechanism", "genetic-mutation", "genetic-perturbation",
  "gene-editing", "guide-rna", "nucleome", "scientific-research", "scientific-computing",
  "ai4science", "sciml", "education", "classroom", "pbl", "sleep-research",
  "real-world", "real-world-data", "sensitive-data", "autonomous-research",
  "autonomous-discovery", "autonomous-analysis", "auto-research", "deep-research",
  "research-agents", "research-ide", "research-studio", "lab-automation",
  "r&d-automation", "automation", "data-analysis", "data-driven", "simulation",
  "optimization", "optimization-loop", "learning-loop", "hypothesis",
  "hypothesis-generation", "hypothesis-testing", "hypothesis-evolution",
  "experiment-design", "equation-discovery", "symbolic-regression", "discovery",
  "innovation", "impact",
  // literature / writing
  "literature-analysis", "paper-generation", "paper-writing", "paper-review",
  "paper-reading", "paper-digest", "multi-paper", "idea-to-paper", "citation-analysis",
  "citation-verification", "peer-review", "report-generation", "report-writing",
  "daily-digest", "deadlines", "diagrams", "posters", "videos", "latex",
  "knowledge-graph", "knowledge-bases", "knowledge-management", "memory",
  "persistent-memory", "cross-session-memory", "memory-evolution", "skill-library",
  "skill", "skills", "markdown-skills", "skill-evolution", "blueprint", "vault",
  "task-management", "teams", "coordination", "command-center", "control-plane",
  "cluster-management", "github-issues", "web-tasks", "multi-day", "24/7-research",
  // evaluation / safety
  "benchmark", "benchmark-sota", "evaluation", "agentic-eval", "leaderboard",
  "security", "safety", "adversarial", "vulnerability", "prompt-injection",
  "audit", "audit-trail", "auditable", "scanner", "privacy", "hardening",
  "secure", "zero-hallucination", "validation-gated", "evidence-grading",
  "traceable", "transparent", "explainable", "reproducible", "reproducible-research",
  // qualities / marketing
  "open-source", "lightweight", "extensible", "customizable",
  "cost-efficient", "cost-saving", "low-cost", "high-performance", "performance",
  "fast", "fastest", "smallest", "tiny", "award-winning", "pioneer", "popular",
  "early-stage", "industrial", "enterprise", "alternative", "reimplementation",
  "beyond-openclaw", "claw-like", "indie", "one-person-company", "pi-for-everyone",
  // lineage / family (claw4science editorial grouping) — both casings, the
  // historical import used the CamelCase forms verbatim
  "fork-family", "fork", "openclaw", "openclaw-compatible", "openclaw-fork",
  "openclaw-native", "nanoclaw-fork", "nanobot-based", "picoclaw-compatible",
  "successor-coreagent", "OpenClaw", "OpenClaw-compatible", "OpenClaw-fork",
  "OpenClaw-native", "NanoClaw-fork", "NanoBot-based", "PicoClaw-compatible",
  "successor-CoreAgent", "beyond-OpenClaw", "Prism-alternative",
  // languages — they duplicate the language field
  "rust", "Rust", "go", "Go", "typescript", "TypeScript", "javascript",
  "JavaScript", "python", "Python", "zig", "Zig", "shell", "Shell",
  "pure-python", "python-r",
  // status words — they belong in the status field, not tags
  "stable", "active", "stale", "archived", "graveyard", "gone", "dormant",
  "removed", "account-deleted", "no-repo",
]);

/**
 * Return the tags that violate the objective-attribution policy, with a short
 * reason each. Empty array = policy clean.
 */
export function findTagPolicyViolations(tags: string[]): string[] {
  const problems: string[] = [];
  for (const t of tags) {
    if (/^[0-9]/.test(t)) problems.push(`${t} — count-based marketing (no leading digits)`);
    else if (GENERIC_TAGS.has(t)) problems.push(`${t} — generic descriptor, belongs in category/description`);
  }
  return problems;
}

// Tag types: the four attribution families the record page groups by.
// The registry is the curation vocabulary — `agentx add` rejects unregistered
// tags, and the snapshot validator refuses them outright.
//
//   institution — who is behind it (university, lab, company)
//   team        — the person behind it (lead maintainer or senior author)
//   venue       — where it was published (journal, conference, preprint server)
//   tech        — agent-relevant framework/protocol it builds on (whitelist;
//                 generic infra like Docker/LaTeX deliberately excluded)
//
// Naming standard, registry-wide: one entity = one tag, Kebab-case tokens
// ("&" stays inside proper nouns like Texas-A&M), no year suffixes — a
// venue is one identity forever (NeurIPS, not NeurIPS-2025), and the
// publication year lives in paperMeta.year. Free-text venue strings from
// enrichment map onto these tags through VENUE_ALIASES below.

export type TagType = "institution" | "team" | "venue" | "tech";

export const TAG_TYPE_LABEL: Record<TagType, string> = {
  institution: "Institution",
  team: "Team",
  venue: "Venue",
  tech: "Tech",
};

const TAG_TYPE: Record<string, TagType> = {
  Stanford: "institution",
  HKUDS: "institution",
  Alibaba: "institution",
  Princeton: "institution",
  SJTU: "institution",
  Tsinghua: "institution",
  Harvard: "institution",
  Microsoft: "institution",
  NIH: "institution",
  NVIDIA: "institution",
  "Sakana-AI": "institution",
  Argonne: "institution",
  Cambridge: "institution",
  CUHK: "institution",
  DeepMind: "institution",
  EPFL: "institution",
  Genentech: "institution",
  "HUST-BGI": "institution",
  MIT: "institution",
  "MIT-LAMM": "institution",
  "Renmin-University": "institution",
  "SNAP-Lab": "institution",
  Technion: "institution",
  "TIGER-AI-Lab": "institution",
  UChicago: "institution",
  "University-of-Michigan": "institution",
  "ur-whitelab": "institution",
  ZJUNLP: "institution",
  OpenBMB: "institution",
  "Allen-AI": "institution",
  "dynamo-team": "institution",
  "NUS-MIT-Berkeley": "institution",
  InternScience: "institution",
  "GBA-BI": "institution",
  "Nous-Research": "institution",
  "Medical-University-of-Vienna": "institution",
  "GENTEL-Lab": "institution",
  KAUST: "institution",
  HKUST: "institution",
  "Peking-University": "institution",
  "UW-Madison": "institution",
  "Candiolo-Cancer-Institute": "institution",
  "Texas-A&M": "institution",
  "Mayo-Clinic": "institution",
  "University-of-Macau": "institution",
  Vanderbilt: "institution",
  Anthropic: "institution",
  GAIR: "institution",
  NCBI: "institution",
  Karpathy: "team",
  "Christoph-Bock": "team",
  "James-Zou": "team",
  "Jure-Leskovec": "team",
  "Mengdi-Wang": "team",
  "David-Ha": "team",
  "Aviv-Regev": "team",
  "Marinka-Zitnik": "team",
  "Rachel-Caspi": "team",
  "Wenbin-Hu": "team",
  "Shuangjia-Zheng": "team",
  "Fuchou-Tang": "team",
  "Yanlin-Zhang": "team",
  "Huajun-Chen": "team",
  "Jun-Chen": "team",
  "Christina-Kendziorski": "team",
  "Xin-Gao": "team",
  "Le-Cong": "team",
  "Markus-Buehler": "team",
  "Christopher-Heeschen": "team",
  "Edwin-Cheung": "team",
  "Zifeng-Wang": "team",
  ICLR: "venue",
  NeurIPS: "venue",
  arXiv: "venue",
  bioRxiv: "venue",
  "Nature-Methods": "venue",
  "Nature-Biotechnology": "venue",
  "Nature-BME": "venue",
  "Nature-Communications": "venue",
  "Nature-Computational-Science": "venue",
  Bioinformatics: "venue",
  "Bioinformatics-Advances": "venue",
  "Briefings-in-Bioinformatics": "venue",
  "Cell-Reports-Methods": "venue",
  "Communications-Biology": "venue",
  "Digital-Discovery": "venue",
  "Genome-Biology": "venue",
  AgentRxiv: "venue",
  Nature: "venue",
  Science: "venue",
  "Advanced-Science": "venue",
  "Methods-and-Protocols": "venue",
  "Analytical-Chemistry": "venue",
  "Advanced-Intelligent-Systems": "venue",
  ICDMW: "venue",
  "IEEE-TBME": "venue",
  JCIM: "venue",
  "Plant-Communications": "venue",
  "Lancet-Digital-Health": "venue",
  MCP: "tech",
  A2A: "tech",
  LangGraph: "tech",
  LangChain: "tech",
  "Claude-Code": "tech",
};

/** Typed lookup; null for unregistered tags. */
export function tagType(tag: string): TagType | null {
  return TAG_TYPE[tag] ?? null;
}

// The one name-folding rule for publication venues: any free-text venue
// string — Semantic Scholar enrichment spellings, full names, abbreviations,
// spacing/casing drift — folds onto its canonical TAG_TYPE venue tag. Used
// wherever a venue string is displayed or compared, so one venue never
// appears under two names. Unknown strings pass through untouched.
//
// Keys are matched case-insensitively after stripping punctuation, so
// "ARXIV", "arxiv.org" and "ArXiv" all fold to the same entry.
export const VENUE_ALIASES: Record<string, string> = {
  // preprint servers
  "ArXiv": "arXiv",
  "arXiv.org": "arXiv",
  // conferences — full names and year-suffixed spellings
  "International Conference on Learning Representations": "ICLR",
  "ICLR 2026": "ICLR",
  "ICLR-2026": "ICLR",
  "Neural Information Processing Systems": "NeurIPS",
  "NeurIPS 2025": "NeurIPS",
  "NeurIPS-2025": "NeurIPS",
  "2024 IEEE International Conference on Data Mining Workshops (ICDMW)": "ICDMW",
  "ICDMW-2024": "ICDMW",
  // journals — abbreviations and full names
  "Nature Biomedical Engineering": "Nature-BME",
  "The Lancet Digital Health": "Lancet-Digital-Health",
  "Journal of chemical information and modeling": "JCIM",
  "IEEE transactions on bio-medical engineering": "IEEE-TBME",
  "Bioinform.": "Bioinformatics",
};

const VENUE_FOLD: Record<string, string> = (() => {
  const fold = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const map: Record<string, string> = {};
  for (const [tag, type] of Object.entries(TAG_TYPE)) {
    if (type === "venue") map[fold(tag)] = tag;
  }
  for (const [alias, canonical] of Object.entries(VENUE_ALIASES)) {
    map[fold(alias)] = canonical;
  }
  return map;
})();

/** Canonical venue tag for a free-text venue string; unknown input returns unchanged. */
export function canonicalVenue(venue: string): string {
  return VENUE_FOLD[venue.trim().toLowerCase().replace(/[^a-z0-9]/g, "")] ?? venue;
}

const TAG_TYPE_ORDER: readonly TagType[] = ["institution", "team", "venue", "tech"];

/** Canonical display order of tag types. */
export const TAG_TYPES: readonly TagType[] = TAG_TYPE_ORDER;

/** Registry contents, for tests that keep the data and registry in sync. */
export function registeredTags(): string[] {
  return Object.keys(TAG_TYPE);
}
