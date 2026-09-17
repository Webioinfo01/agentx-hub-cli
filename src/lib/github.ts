// Shared GitHub REST access for the add and snapshot commands.

import { resolveLicenseSpdxId } from "./transform";

export interface GhLicense {
  spdx_id: string;
}

export interface GhRepo {
  full_name: string;
  stargazers_count: number;
  pushed_at: string | null;
  open_issues_count: number;
  language: string | null;
  description: string | null;
  homepage: string | null;
  license: GhLicense | null;
  archived: boolean;
}

interface GhLicenseFile {
  content: string;
  encoding: string;
}

export function githubHeaders(token: string | undefined): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// null data + notFound=true means the repo is gone (404); data null without
// notFound is a transient failure (network/rate limit) and must not be treated
// as removal.
export async function fetchRepo(
  repo: string,
  headers: Record<string, string>,
): Promise<{ data: GhRepo | null; notFound: boolean }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`https://api.github.com/repos/${repo}`, { headers }).catch(() => null);
    if (!res) {
      await sleep(1000 * (attempt + 1));
      continue;
    }
    if (res.status === 403 || res.status === 429) {
      console.error(`Rate limited at ${repo}. ${headers.Authorization ? "" : "Set GITHUB_TOKEN."}`);
      return { data: null, notFound: false };
    }
    if (res.status === 404) return { data: null, notFound: true };
    if (!res.ok) {
      console.warn(`  ${res.status} ${repo}`);
      return { data: null, notFound: false };
    }
    return { data: (await res.json()) as GhRepo, notFound: false };
  }
  return { data: null, notFound: false };
}

// Lightweight HEAD existence check — true = 200/3xx, false = 404 (repo gone),
// null = transient failure (do not flip status on these). Use this only when
// the body fields have already been refreshed by an earlier pass.
export async function repoExists(
  repo: string,
  headers: Record<string, string>,
): Promise<boolean | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`https://api.github.com/repos/${repo}`, {
      method: "HEAD",
      headers,
    }).catch(() => null);
    if (!res) {
      await sleep(1000 * (attempt + 1));
      continue;
    }
    if (res.status === 403 || res.status === 429) {
      console.error(`Rate limited at ${repo}. ${headers.Authorization ? "" : "Set GITHUB_TOKEN."}`);
      return null;
    }
    if (res.status === 404) return false;
    return true;
  }
  return null;
}

async function fetchRepoLicenseText(
  repo: string,
  headers: Record<string, string>,
): Promise<string | null> {
  const res = await fetch(`https://api.github.com/repos/${repo}/license`, { headers }).catch(() => null);
  if (!res || !res.ok) return null;

  const file = (await res.json()) as GhLicenseFile;
  if (file.encoding !== "base64" || !file.content) return null;
  return Buffer.from(file.content, "base64").toString("utf8");
}

/** Resolve GitHub's NOASSERTION licenses without probing repos with no license metadata. */
export async function resolveRepoLicense(
  repo: string,
  license: GhLicense | null,
  headers: Record<string, string>,
): Promise<string | null> {
  const detected = resolveLicenseSpdxId(license?.spdx_id, null);
  if (detected) return detected;
  if (license?.spdx_id !== "NOASSERTION") return null;
  return resolveLicenseSpdxId(license?.spdx_id, await fetchRepoLicenseText(repo, headers));
}
