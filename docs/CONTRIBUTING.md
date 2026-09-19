# Contributing to agentx-cli

## Engineering Taste

- **Simple:** make the smallest change that solves the real problem.
- **Clear:** optimize for the next reader, not for cleverness.
- **Decoupled:** keep boundaries clean, but don't add abstractions without a real need.
- **Honest:** make complexity, state, side effects, assumptions, and failure modes visible; don't hide complexity and don't create extra complexity.
- **Focused:** preserve boundaries between modules, and keep top-level convenience commands minimal.
- **Durable:** choose behavior that is easy to maintain, test, and extend.
- **First principles:** identify the real problem, hard constraints, and known facts before reaching for patterns, abstractions, or prior solutions.

## Development setup

```bash
pnpm install
pnpm test    # vitest
pnpm check   # tsc --noEmit
pnpm build   # tsup → dist/cli.js
node dist/cli.js --help
```

Requires Node ≥ 20 and pnpm. No runtime dependencies — the CLI ships as a
single bundled file on the Node standard library.

## Project layout

```
src/
  cli.ts               Entry: verb dispatch, help/version
  commands/            One file per verb; owns its flags and output
  lib/
    website.ts         Resolve the hub website checkout (--dir / env, markers)
    dispatch.ts        GitHub Actions workflow dispatch (fetch, no deps)
    pnpm.ts            Run a pnpm script in the website checkout
    cli-error.ts       User-facing error type; cli.ts prints and exits 1
test/                  One test file per module
```

## The operations contract

- The apply/moderation logic lives in the hub website repo and never here:
  local commands (`sync`, `moderate`) run the website checkout's own pnpm
  scripts (`db:apply-snapshot`, `reviews:moderate`), so the Prisma-coupled
  reconcile stays a single implementation shared with the server's boot
  apply. This CLI is a dispatcher, not a re-implementation.
- Dispatch commands (`sync --remote`, `mirror`) trigger the hub repo's
  `sync-db.yml` / `sync-public.yml` workflows — same code, run with the
  repository's secrets. The workflow filenames and the default hub repo
  (`Webioinfo01/agentx-hub-dev`) are the contract with the website repo;
  renaming either is a breaking change.
- Registry curation (add/enrich/backfill/validate over
  `data/agents-snapshot.json`) is not this CLI's job — it lives in
  [awescholar](https://github.com/wehuman01/awescholar)
  (`updater add/enrich/backfill --agentx`, `verify --agentx`).

## Release

- `docs/CHANGELOG.md` carries one `## vX.Y.Z` section per release, newest
  first. Update it in the same PR as the behavior change.
- Publishing uses npm **trusted publishing** (OIDC) — no npm token is stored
  anywhere. One-time setup:
  1. On npmjs.com, pre-register the package with a trusted publisher:
     package name `agentx-hub-cli`, GitHub repo `Webioinfo01/agentx-hub-cli`,
     workflow filename `release.yml`, environment `npm`.
  2. On GitHub, the `npm` environment exists in this repo (Settings →
     Environments), optionally with a `v*` tag protection rule so only tag
     builds can publish.
- Cut a release: bump `version` in `package.json`, add the matching
  `## vX.Y.Z` changelog section, commit, then
  `git tag vX.Y.Z && git push --tags`. The workflow builds, tests, publishes
  through the OIDC exchange (provenance attached automatically), and creates
  the GitHub Release from the changelog section.
- Version bumps: patch for fixes, minor for new commands or flags, major for
  contract changes (workflow filenames, default hub repo, flag removals).
