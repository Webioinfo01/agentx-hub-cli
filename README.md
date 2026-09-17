<div align="center">
  <h1>agentx: AgentX Registry CLI</h1>
  <p><strong>Maintain an AgentX research-agent registry from the terminal.</strong></p>
  <p>Add research AI agents with live GitHub metrics, refresh the registry, and keep it valid.</p>
  <p>
    <strong>English</strong> ·
    <a href="./README_cn.md">简体中文</a>
  </p>
  <p>
    <img src="https://img.shields.io/badge/version-0.1.0-7C3AED?style=flat-square" alt="Version">
    <img src="https://img.shields.io/badge/node-%E2%89%A520-0EA5E9?style=flat-square" alt="Node">
  </p>
  <p>
    <img src="https://img.shields.io/badge/status-alpha-c96a3d?style=flat-square" alt="Status">
    <img src="https://img.shields.io/badge/install-npm-22C55E?style=flat-square" alt="npm install">
    <img src="https://img.shields.io/badge/platform-terminal-334155?style=flat-square" alt="Platform">
    <img src="https://img.shields.io/npm/dm/%40webioinfo/agentx-cli?style=flat-square" alt="npm downloads">
    <img src="https://img.shields.io/github/stars/Webioinfo01/agentx-cli?style=flat-square" alt="GitHub stars">
  </p>
</div>

> Maintain an AgentX research-agent registry from the terminal.

`agentx` operates on an AgentX repository checkout — a directory holding
`data/agents-snapshot.json`, the curated registry behind
[agentx-hub](https://github.com/Webioinfo01/agentx-hub). It adds new agents
through the validated pipeline (category check, tag policy, one live GitHub
fetch), refreshes GitHub metrics and lifecycle statuses, fills companion-paper
metadata via [awescholar](https://github.com/Webioinfo01/awescholar), and
validates the writer invariants offline. The snapshot file is never
hand-edited; this CLI is the writer.

## Install

```bash
npm install -g @webioinfo/agentx-cli
```

Or run it without installing:

```bash
npx @webioinfo/agentx-cli --help
```

From source:

```bash
git clone https://github.com/Webioinfo01/agentx-cli
cd agentx-cli && pnpm install && pnpm build
node dist/cli.js --help   # or: npm link  →  agentx
```

## Quick Start

```bash
cd /path/to/agentx-hub

agentx validate
# Snapshot OK: 208 agents, counts consistent.

agentx add owner/repo --category bio-omics --tags "Stanford,Nature-Biotechnology"
# Added owner-repo (owner/repo) → category bio-omics, tags: Stanford, Nature-Biotechnology
```

`agentx add` validates the category and tag policy, must find the repo on
GitHub, fetches live metrics once, and appends the record in stable slug
order. Finish with `agentx validate`, then commit the snapshot.

## Config

No config file. Options come from flags and the environment:

| Variable | Used by | What it does |
|---|---|---|
| `GITHUB_TOKEN` | `add`, `snapshot` | Raises the GitHub API limit from 60 to 5,000 req/h |
| `SEMANTICSCHOLAR_API_KEY` | `enrich-papers`, `refresh-citations` | Avoids anonymous Semantic Scholar rate limits |
| `awescholar` on PATH | `snapshot`, `enrich-papers`, `refresh-citations` | Bulk GitHub refresh and paper lookups (`pip install awescholar`) |

Every command accepts `--root <dir>` — the AgentX repository to operate on,
default: the current directory.

## Commands

```bash
agentx add owner/repo --category <slug> [--name "Foo"] [--tags "A,B"]
agentx add owner/repo --paper <url> [--homepage <url>] [--description "txt"]
agentx validate
agentx snapshot
agentx enrich-papers [--force] [--only <slug-substring>]
agentx refresh-citations
```

Category slugs: `autonomous-research`, `literature-writing`, `bio-omics`,
`chem-drug`, `clinical-health`, `platforms`, `orchestration`, `benchmarks`,
`safety-security`, `others`. Tags carry objective proper-noun attributions
only — institution, venue, team, named tech; the CLI rejects anything else.
Run `agentx <command> --help` for a command's options.

## Development

```bash
pnpm install
pnpm test    # vitest, one file per module
pnpm check   # tsc --noEmit
pnpm build   # tsup → dist/cli.js
```

Contributing, the snapshot contract, and the release flow live in
[docs/CONTRIBUTING.md](./docs/CONTRIBUTING.md).

## License

[MPL-2.0](./LICENSE)
