<div align="center">
  <h1>agentx: AgentX Hub Operations CLI</h1>
  <p><strong>Operate the AgentX hub from the terminal.</strong></p>
  <p>Sync the registry snapshot into the hub database, moderate reviews, mirror to the public hub.</p>
  <p>
    <strong>English</strong> ·
    <a href="./README_cn.md">简体中文</a>
  </p>
  <p>
    <img src="https://img.shields.io/badge/version-0.2.0-7C3AED?style=flat-square" alt="Version">
    <img src="https://img.shields.io/badge/node-%E2%89%A520-0EA5E9?style=flat-square" alt="Node">
  </p>
  <p>
    <img src="https://img.shields.io/badge/status-alpha-c96a3d?style=flat-square" alt="Status">
    <img src="https://img.shields.io/badge/install-npm-22C55E?style=flat-square" alt="npm install">
    <img src="https://img.shields.io/badge/platform-terminal-334155?style=flat-square" alt="Platform">
    <img src="https://img.shields.io/npm/dm/agentx-hub-cli?style=flat-square" alt="npm downloads">
    <img src="https://img.shields.io/github/stars/Webioinfo01/agentx-hub-cli?style=flat-square" alt="GitHub stars">
  </p>
</div>

> **v0.2.0 — new mission.** The v0.1.x registry-curation commands moved into
> [awescholar](https://github.com/wehuman01/awescholar) (Python):
> `awescholar updater add | enrich | backfill --agentx` and
> `awescholar verify --agentx`. This CLI is now the hub **operations**
> supplement — the commands that need the hub website or its deployments,
> which a generic curation toolkit cannot own.

> Two tools, one boundary:

| Concern | Lives in | Why |
|---|---|---|
| Registry curation (`data/agents-snapshot.json`) | [awescholar](https://github.com/wehuman01/awescholar) (pip) | Generic: works on any AgentX checkout, shared with the literature pipeline |
| Hub operations (database, reviews, public mirror) | **this CLI** (npm) | Coupled to the hub website's scripts and workflows — it wraps them, never reimplements them |

## Install

```bash
npm install -g agentx-hub-cli
```

Or run it without installing:

```bash
npx agentx-hub-cli --help
```

From source:

```bash
git clone https://github.com/Webioinfo01/agentx-hub-cli
cd agentx-hub-cli && pnpm install && pnpm build
node dist/cli.js --help   # or: npm link  →  agentx
```

## Commands

```bash
agentx sync [--remote] [--dir <website>] [--repo <repo>] [--ref <ref>]
agentx moderate [--dir <website>] [--approve <id> | --reject <id>]
agentx mirror [--repo <repo>] [--ref <ref>]
```

- **`sync`** — land `data/agents-snapshot.json` in the hub database. Local
  mode (default) runs the website checkout's own `db:apply-snapshot`
  (Prisma-coupled reconcile, shared with the server's boot apply — exactly
  one implementation). `--remote` dispatches the hub repo's `sync-db`
  workflow instead: same code, run with the repository's production
  secrets, no local checkout needed.
- **`moderate`** — operate the pending verified-run review queue. Bare
  `agentx moderate` lists it; `--approve/--reject <id>` decides. Pure
  passthrough to the website's `reviews:moderate` script.
- **`mirror`** — dispatch the hub repo's `sync-public` workflow: the
  allowlisted bridge that mirrors user-facing content to the public
  [agentx-hub](https://github.com/Webioinfo01/agentx-hub) repo.

## Config

No config file. Options come from flags and the environment:

| Variable | Used by | What it does |
|---|---|---|
| `AGENTX_WEBSITE_DIR` | `sync`, `moderate` | Default hub website checkout for local commands (no silent cwd default) |
| `AGENTX_HUB_REPO` | `sync --remote`, `mirror` | Default hub repo (default: `Webioinfo01/agentx-hub-dev`) |
| `GITHUB_TOKEN` (or `GH_TOKEN`) | `sync --remote`, `mirror` | Dispatch authentication |

## Development

```bash
pnpm install
pnpm test    # vitest, one file per module
pnpm check   # tsc --noEmit
pnpm build   # tsup → dist/cli.js
```

Contributing and the release flow live in
[docs/CONTRIBUTING.md](./docs/CONTRIBUTING.md).

## License

[MPL-2.0](./LICENSE)
