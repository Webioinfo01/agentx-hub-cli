// `agentx add owner/repo --category <slug>` — the only supported entry point
// for new registry records (the snapshot file is never hand-edited).
//
// `agentx add --from-json <file>` batch-intakes a candidate file as written
// by `awescholar render agentx` (snapshot-shaped `{agents: [...]}` or a bare
// array). The file is data, not decisions: categories and tags are re-checked
// here, metrics re-fetched live, and already-registered repos skipped — the
// whole batch is all-or-nothing, nothing is written unless every new record
// passes.
//
// Validates the category, the repo (must exist on GitHub) and the tag policy,
// fetches live metrics once, then appends to the snapshot in stable slug
// order. Follow up with `agentx validate`.
//
// Env: GITHUB_TOKEN (optional; one request per invocation, so the
// unauthenticated limit is fine for occasional use).

import { readFile } from "node:fs/promises";

import { fetchRepo, githubHeaders, resolveRepoLicense } from "../lib/github";
import { readSnapshot, slugify, uniqueSlug, writeSnapshot, type SnapshotAgent } from "../lib/snapshot";
import { CATEGORIES } from "../lib/categories";
import { findTagPolicyViolations, tagType } from "../lib/tags";
import { normalizeHomepage, resolveRepoStatus } from "../lib/transform";
import { CliError } from "../lib/cli-error";

export function addUsage(): string {
  return [
    "Usage: agentx add owner/repo --category <slug> [options]",
    "       agentx add --from-json <file> [options]",
    "",
    "  Add agents to the snapshot (validated, live metrics). The --from-json",
    "  form batch-intakes an `awescholar render agentx` candidate file:",
    "  a snapshot-shaped {\"agents\": [...]} object or a bare record array.",
    "",
    "Options:",
    "  --from-json <file>  batch intake from a candidate JSON file",
    "  --category <slug>   required (single form) — one of the registered category slugs",
    '  --name "Foo"        display name (default: repo name segment)',
    '  --tags "A,B"        objective attributions only (see the tag policy in src/lib/tags.ts)',
    "  --paper <url>       peer-reviewed paper link",
    "  --homepage <url>    project homepage",
    '  --description "txt" one-line summary (default: the GitHub repo description)',
    "  --root <dir>        AgentX repository root (default: the current directory)",
  ].join("\n");
}

/** One candidate record, shared by the single-add args and --from-json files. */
interface IntakeRecord {
  repo: string;
  category?: string;
  name?: string;
  tags?: string[];
  paper?: string | null;
  homepage?: string | null;
  description?: string | null;
  source?: string;
  sourceUrl?: string | null;
}

interface AddArgs {
  fromJson?: string;
  repo: string;
  root: string;
  category?: string;
  name?: string;
  tags?: string;
  paper?: string;
  homepage?: string;
  description?: string;
}

export function parseAddArgs(argv: string[], root: string): AddArgs {
  const args: AddArgs = { repo: "", root };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]!;
    if (!key.startsWith("--")) {
      // One repo positional in the single form; none alongside --from-json.
      if (args.fromJson || args.repo) throw new CliError(addUsage());
      args.repo = key;
      continue;
    }
    const value = argv[++i];
    const known = ["--from-json", "--category", "--name", "--tags", "--paper", "--homepage", "--description", "--root"];
    if (!value || !known.includes(key)) throw new CliError(addUsage());
    if (key === "--root") {
      args.root = value;
    } else if (key === "--from-json") {
      args.fromJson = value;
    } else {
      args[key.slice(2) as "category" | "name" | "tags" | "paper" | "homepage" | "description"] = value;
    }
  }
  if (!args.fromJson && !args.repo) throw new CliError(addUsage());
  return args;
}

/** Parse a candidate file: awescholar's `{agents: [...]}` export or a bare array. */
function parseIntakeFile(path: string, rawJson: string): IntakeRecord[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (err) {
    throw new CliError(`${path} is not valid JSON: ${(err as Error).message}`);
  }
  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { agents?: unknown }).agents)
      ? (parsed as { agents: unknown[] }).agents
      : null;
  if (!list) {
    throw new CliError(`${path}: expected {"agents": [...]} or a top-level record array.`);
  }
  if (list.length === 0) {
    throw new CliError(`${path} contains no candidate agents.`);
  }
  return list.filter((r): r is IntakeRecord => !!r && typeof r === "object" && typeof (r as IntakeRecord).repo === "string");
}

/**
 * Validate one intake record against the registry rules and build its
 * SnapshotAgent from a live GitHub fetch (metrics are never trusted from the
 * candidate file — it is a review queue, not a data source). Throws CliError
 * on any violation; `usedSlugs` grows with each built agent so batches stay
 * collision-free.
 */
async function agentFromIntake(
  rec: IntakeRecord,
  usedSlugs: Set<string>,
  headers: Record<string, string>,
): Promise<SnapshotAgent> {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(rec.repo)) {
    throw new CliError(`Not an owner/repo pair: ${rec.repo}`);
  }
  const category = rec.category ?? "";
  if (!CATEGORIES[category]) {
    throw new CliError(`Unknown category "${category}" for ${rec.repo}. Valid slugs: ${Object.keys(CATEGORIES).join(", ")}`);
  }
  const tags = rec.tags ?? [];
  const tagProblems = findTagPolicyViolations(tags);
  if (tagProblems.length > 0) {
    const lines = tagProblems.map((p) => `  - ${p}`);
    throw new CliError(
      `Tag policy violations for ${rec.repo} (tags are objective proper-noun attributions only):\n${lines.join("\n")}`,
    );
  }
  const unregistered = tags.filter((t) => !tagType(t));
  if (unregistered.length > 0) {
    throw new CliError(
      `Unregistered tags on ${rec.repo}: ${unregistered.join(", ")}. Add them to TAG_TYPE in src/lib/tags.ts first.`,
    );
  }

  const { data: gh, notFound } = await fetchRepo(rec.repo, headers);
  if (notFound) {
    throw new CliError(`${rec.repo} not found on GitHub (404).`);
  }
  if (!gh) {
    throw new CliError(`Could not fetch ${rec.repo} (network or rate limit). Retry, or set GITHUB_TOKEN.`);
  }

  const name = rec.name || rec.repo.split("/")[1]!;
  const agent: SnapshotAgent = {
    slug: uniqueSlug(slugify(name), usedSlugs),
    name,
    repo: gh.full_name,
    githubUrl: `https://github.com/${gh.full_name}`,
    homepage: normalizeHomepage(rec.homepage ?? undefined) ?? normalizeHomepage(gh.homepage),
    paper: rec.paper || null,
    category,
    tags,
    language: gh.language,
    stars: gh.stargazers_count,
    pushedAt: gh.pushed_at,
    openIssues: gh.open_issues_count,
    license: await resolveRepoLicense(rec.repo, gh.license, headers),
    description: rec.description || gh.description,
    status: resolveRepoStatus({
      currentStatus: "active",
      archived: gh.archived,
      stars: gh.stargazers_count,
      pushedAt: gh.pushed_at ? new Date(gh.pushed_at) : null,
    }),
    source: rec.source || "manual",
    sourceUrl: rec.sourceUrl || null,
  };
  return agent;
}

export async function runAdd(argv: string[], root: string): Promise<void> {
  const args = parseAddArgs(argv, root);

  if (args.fromJson) {
    await runAddFromJson(args.fromJson, args.root);
    return;
  }

  const tags = [...new Set(
    (args.tags ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  )];
  const record: IntakeRecord = {
    repo: args.repo,
    category: args.category,
    name: args.name,
    tags,
    paper: args.paper,
    homepage: args.homepage,
    description: args.description,
    source: "manual",
    sourceUrl: null,
  };

  const snapshot = await readSnapshot(args.root);
  if (snapshot.agents.some((a) => a.repo.toLowerCase() === record.repo.toLowerCase())) {
    throw new CliError(`${record.repo} is already in the snapshot.`);
  }

  const headers = githubHeaders(process.env.GITHUB_TOKEN);
  const usedSlugs = new Set(snapshot.agents.map((a) => a.slug));
  const agent = await agentFromIntake(record, usedSlugs, headers);

  snapshot.agents.push(agent);
  await writeSnapshot(args.root, snapshot);

  console.log(`Added ${agent.slug} (${agent.repo}) → category ${agent.category}${agent.tags.length ? `, tags: ${agent.tags.join(", ")}` : ""}`);
  console.log("Next: agentx validate      # offline snapshot check");
  console.log("      git add data/agents-snapshot.json && git commit");
}

async function runAddFromJson(path: string, root: string): Promise<void> {
  const records = parseIntakeFile(path, await readFile(path, "utf8"));

  const snapshot = await readSnapshot(root);
  const registered = new Set(snapshot.agents.map((a) => a.repo.toLowerCase()));
  const fresh = records.filter((r) => {
    if (registered.has(r.repo.toLowerCase())) {
      console.log(`${r.repo} already in the snapshot, skipped`);
      return false;
    }
    return true;
  });
  if (fresh.length === 0) {
    console.log(`Nothing new in ${path}: all ${records.length} candidate repos are already registered.`);
    return;
  }

  const headers = githubHeaders(process.env.GITHUB_TOKEN);
  const usedSlugs = new Set(snapshot.agents.map((a) => a.slug));
  // All-or-nothing: every record is validated and fetched before the single
  // write, so a mid-batch failure leaves the snapshot untouched.
  const added: SnapshotAgent[] = [];
  for (const rec of fresh) {
    added.push(await agentFromIntake(rec, usedSlugs, headers));
  }

  snapshot.agents.push(...added);
  await writeSnapshot(root, snapshot);

  console.log(`Added ${added.length} agent${added.length === 1 ? "" : "s"} from ${path}:`);
  for (const a of added) {
    console.log(`  ${a.slug} (${a.repo}) → category ${a.category}`);
  }
  const skipped = records.length - added.length;
  if (skipped > 0) console.log(`Skipped ${skipped} already-registered repo${skipped === 1 ? "" : "s"}.`);
  console.log("Next: agentx validate      # offline snapshot check");
  console.log("      git add data/agents-snapshot.json && git commit");
}
