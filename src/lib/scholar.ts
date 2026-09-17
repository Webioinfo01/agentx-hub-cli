// Shared wrapper around `awescholar updater search` for the paper commands.
// Runs one batch per call into a fresh JSON file and returns the records.

import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { promisify } from "node:util";

import { CliError } from "./cli-error";

const run = promisify(execFile);

// Semantic Scholar resolves one identifier per API call at roughly 10s each
// on the shared pool — larger batches blow past the per-call exec timeout.
const CHUNK = 10;

// Compatibility is detected by output shape, not version strings: awescholar
// >= 0.2.2 always writes these keys on every search record (values may be
// empty/null), older versions omit them entirely and downstream data would
// silently degrade.
const REQUIRED_KEYS = ["authors", "citations"] as const;

const UPGRADE_HINT = 'pip install -U "awescholar>=0.2.2"';

/** One awescholar record as written by `updater search --json-file`. */
export interface ScholarRecord {
  year: string;
  title: string;
  /** Corresponding/last author — the CLI's legacy summary field. */
  team: string;
  /** Full ordered author list (newer awescholar records). */
  authors?: string[];
  venue: string;
  paperUrl: string;
  doi: string;
  citations?: number | null;
}

/**
 * Run `awescholar updater search --by <by> <queries...>` for all queries and
 * return the aggregated records. Queries are chunked (10 per CLI call) so
 * rate-limited batches stay under the per-call timeout. Each chunk's file
 * must not pre-exist — awescholar appends to it, and an empty file is not
 * valid JSON to it — so a distinct name per chunk keeps appends clean. An
 * all-miss chunk writes no file at all, meaning zero records. Requires the
 * awescholar CLI on PATH.
 */
export async function awescholarSearch(
  by: "doi" | "title",
  queries: string[],
  outFile: string,
): Promise<ScholarRecord[]> {
  const records: ScholarRecord[] = [];
  for (let i = 0; i < queries.length; i += CHUNK) {
    const chunkFile = `${outFile}.${Math.floor(i / CHUNK)}`;
    await run(
      "awescholar",
      ["updater", "search", "--json-file", chunkFile, "--by", by, ...queries.slice(i, i + CHUNK)],
      { timeout: 300_000 },
    ).catch((err) => {
      if (err.code === "ENOENT") {
        throw new CliError(`awescholar CLI not found on PATH — install it with \`${UPGRADE_HINT}\``);
      }
      throw err;
    });
    const exists = await stat(chunkFile).then(
      () => true,
      () => false,
    );
    if (exists) {
      const raw = JSON.parse(await readFile(chunkFile, "utf8")) as unknown;
      if (Array.isArray(raw)) {
        const missing = REQUIRED_KEYS.filter((key) =>
          (raw as Record<string, unknown>[]).some((r) => !(key in r)),
        );
        if (missing.length > 0) {
          throw new CliError(
            `awescholar search records lack the ${missing.map((k) => `\`${k}\``).join(" and ")} field — ` +
              `the installed awescholar is too old. Upgrade with \`${UPGRADE_HINT}\``,
          );
        }
        records.push(...(raw as ScholarRecord[]));
      }
    }
  }
  return records;
}
