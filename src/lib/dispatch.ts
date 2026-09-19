// Dispatch a workflow in the hub repo through the GitHub Actions API.
// Runs the exact same code the website repo's CI runs, with its secrets —
// this CLI never carries credentials beyond the dispatch call itself.

import { CliError } from "./cli-error";

const API_BASE = "https://api.github.com";
const DEFAULT_HUB_REPO = "Webioinfo01/agentx-hub-dev";
const DEFAULT_REF = "main";

/** Workflow files (in the hub repo) behind each dispatch-style command. */
export const WORKFLOWS = {
  sync: "sync-db.yml",
  mirror: "sync-public.yml",
} as const;

export function hubRepo(explicit: string | undefined): string {
  return explicit ?? process.env.AGENTX_HUB_REPO ?? DEFAULT_HUB_REPO;
}

export function ref(explicit: string | undefined): string {
  return explicit ?? DEFAULT_REF;
}

export function githubToken(): string | undefined {
  return process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
}

interface DispatchDeps {
  fetch: typeof fetch;
  token: string | undefined;
}

export async function dispatchWorkflow(
  repo: string,
  workflow: string,
  workflowRef: string,
  deps: DispatchDeps = { fetch: globalThis.fetch.bind(globalThis), token: githubToken() },
): Promise<string> {
  const url = `${API_BASE}/repos/${repo}/actions/workflows/${workflow}/dispatches`;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "User-Agent": "agentx-cli",
  };
  if (deps.token) headers.Authorization = `Bearer ${deps.token}`;
  const response = await deps.fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ ref: workflowRef }),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new CliError(
      `GitHub refused the dispatch (HTTP ${response.status}): ${detail}`,
    );
  }
  return `Dispatched ${workflow} to ${repo} (ref ${workflowRef}).\nTrack: https://github.com/${repo}/actions/workflows/${workflow}`;
}
