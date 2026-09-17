// `agentx add owner/repo --category <slug>` — the only supported entry point
// for new registry records (the snapshot file is never hand-edited).
//
// Validates the category, the repo (must exist on GitHub) and the tag policy,
// fetches live metrics once, then appends to the snapshot in stable slug
// order. Follow up with `agentx validate`.
//
// Env: GITHUB_TOKEN (optional; one request per invocation, so the
// unauthenticated limit is fine for occasional use).

import { fetchRepo, githubHeaders, resolveRepoLicense } from "../lib/github";
import { readSnapshot, slugify, uniqueSlug, writeSnapshot, type SnapshotAgent } from "../lib/snapshot";
import { CATEGORIES } from "../lib/categories";
import { findTagPolicyViolations, tagType } from "../lib/tags";
import { normalizeHomepage, resolveRepoStatus } from "../lib/transform";
import { CliError } from "../lib/cli-error";

export function addUsage(): string {
  return [
    "Usage: agentx add owner/repo --category <slug> [options]",
    "",
    "  Add an agent to the snapshot (validated, live metrics).",
    "",
    "Options:",
    "  --category <slug>   required — one of the registered category slugs",
    '  --name "Foo"        display name (default: repo name segment)',
    '  --tags "A,B"        objective attributions only (see the tag policy in src/lib/tags.ts)',
    "  --paper <url>       peer-reviewed paper link",
    "  --homepage <url>    project homepage",
    '  --description "txt" one-line summary (default: the GitHub repo description)',
    "  --root <dir>        AgentX repository root (default: the current directory)",
  ].join("\n");
}

interface AddArgs {
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
  const args: AddArgs = { repo: argv[0] ?? "", root };
  if (!args.repo || args.repo.startsWith("--")) throw new CliError(addUsage());
  for (let i = 1; i < argv.length; i++) {
    const key = argv[i];
    const value = argv[++i];
    const known = ["--category", "--name", "--tags", "--paper", "--homepage", "--description", "--root"];
    if (!value || !known.includes(key)) throw new CliError(addUsage());
    if (key === "--root") {
      args.root = value;
      continue;
    }
    args[key.slice(2) as "category" | "name" | "tags" | "paper" | "homepage" | "description"] = value;
  }
  return args;
}

export async function runAdd(argv: string[], root: string): Promise<void> {
  const args = parseAddArgs(argv, root);

  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(args.repo)) {
    throw new CliError(`Not an owner/repo pair: ${args.repo}`);
  }
  const category = args.category ?? "";
  if (!CATEGORIES[category]) {
    throw new CliError(`Unknown category "${category}". Valid slugs: ${Object.keys(CATEGORIES).join(", ")}`);
  }
  const tags = [...new Set(
    (args.tags ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  )];
  const tagProblems = findTagPolicyViolations(tags);
  if (tagProblems.length > 0) {
    const lines = tagProblems.map((p) => `  - ${p}`);
    throw new CliError(
      `Tag policy violations (tags are objective proper-noun attributions only):\n${lines.join("\n")}`,
    );
  }
  const unregistered = tags.filter((t) => !tagType(t));
  if (unregistered.length > 0) {
    throw new CliError(
      `Unregistered tags: ${unregistered.join(", ")}. Add them to TAG_TYPE in src/lib/tags.ts first.`,
    );
  }

  const snapshot = await readSnapshot(args.root);
  if (snapshot.agents.some((a) => a.repo.toLowerCase() === args.repo.toLowerCase())) {
    throw new CliError(`${args.repo} is already in the snapshot.`);
  }

  const headers = githubHeaders(process.env.GITHUB_TOKEN);
  const { data: gh, notFound } = await fetchRepo(args.repo, headers);
  if (notFound) {
    throw new CliError(`${args.repo} not found on GitHub (404).`);
  }
  if (!gh) {
    throw new CliError(`Could not fetch ${args.repo} (network or rate limit). Retry, or set GITHUB_TOKEN.`);
  }

  const name = args.name ?? args.repo.split("/")[1]!;
  const usedSlugs = new Set(snapshot.agents.map((a) => a.slug));
  const agent: SnapshotAgent = {
    slug: uniqueSlug(slugify(name), usedSlugs),
    name,
    repo: gh.full_name,
    githubUrl: `https://github.com/${gh.full_name}`,
    homepage: normalizeHomepage(args.homepage) ?? normalizeHomepage(gh.homepage),
    paper: args.paper ?? null,
    category,
    tags,
    language: gh.language,
    stars: gh.stargazers_count,
    pushedAt: gh.pushed_at,
    openIssues: gh.open_issues_count,
    license: await resolveRepoLicense(args.repo, gh.license, headers),
    description: args.description ?? gh.description,
    status: resolveRepoStatus({
      currentStatus: "active",
      archived: gh.archived,
      stars: gh.stargazers_count,
      pushedAt: gh.pushed_at ? new Date(gh.pushed_at) : null,
    }),
    source: "manual",
    sourceUrl: null,
  };

  snapshot.agents.push(agent);
  await writeSnapshot(args.root, snapshot);

  console.log(`Added ${agent.slug} (${agent.repo}) → category ${category}${tags.length ? `, tags: ${tags.join(", ")}` : ""}`);
  console.log("Next: agentx validate      # offline snapshot check");
  console.log("      git add data/agents-snapshot.json && git commit");
}
