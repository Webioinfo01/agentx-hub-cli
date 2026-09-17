# Changelog

## v0.1.2

Batch intake from the literature pipeline, and an explicit awescholar
compatibility gate.

### Highlights

- `agentx add --from-json <file>` — batch intake of an
  `awescholar render agentx` candidate file (snapshot-shaped
  `{"agents": [...]}` or a bare record array). The file is data, not
  decisions: every record passes the same category/tag validation and one
  live GitHub fetch (stale metrics in the file are ignored),
  already-registered repos are skipped with a notice, and the batch is
  all-or-nothing — nothing is written unless every new record passes.
- awescholar compatibility is detected by output shape, not version
  strings: search records missing the `authors`/`citations` keys (installs
  older than 0.2.2) fail with a `pip install -U "awescholar>=0.2.2"` hint,
  and a missing binary now raises the same hint as a CliError — no silent
  degradation in `snapshot`, `enrich-papers`, or `refresh-citations`.

## v0.1.1

Rename the npm package to `agentx-hub-cli` (unscoped) for consistency with
the project's other tooling. The CLI entry remains `agentx`.

## v0.1.0

First release. `agentx` is the standalone operator CLI for an AgentX
registry checkout — the validated writer for `data/agents-snapshot.json`,
extracted from the [agentx-hub](https://github.com/Webioinfo01/agentx-hub)
website's maintenance scripts so any checkout can be maintained from the
terminal.

### Highlights

- `agentx add owner/repo --category <slug>` — the validated entry point for
  new records: category and tag-policy checks, one live GitHub fetch for
  metrics and license, stable slug order.
- `agentx validate` — the offline writer-invariants gate (shape, slug order,
  registered categories/tags, canonical URLs, statuses, paperMeta types);
  output is byte-compatible with the website's CI gate.
- `agentx snapshot` — refresh GitHub metrics via awescholar, then re-derive
  lifecycle statuses locally and map 404 repos to gone.
- `agentx enrich-papers` / `agentx refresh-citations` — companion-paper
  metadata and citation counts from Semantic Scholar via awescholar.
- Zero runtime dependencies; single-file bundle on the Node standard library.
