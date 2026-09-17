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
  cli.ts               Entry: verb dispatch, help/version, global --root
  commands/            One file per verb; owns its flags and output
  lib/                 Registry policy and I/O clients, no CLI coupling
    categories.ts      Category slugs + lifecycle thresholds
    tags.ts            Tag policy denylist, TAG_TYPE registry, venue aliases
    transform.ts       Status/retirement/license resolution (pure)
    papers.ts          Paper clue extraction and title matching (pure)
    snapshot.ts        Snapshot types, read/write, slugs
    snapshot-validate.ts  The writer invariants, as one pure checker
    github.ts / scholar.ts  REST and awescholar CLI clients
test/                  One test file per module + the CI fixture repo
```

## The snapshot contract

- `data/agents-snapshot.json` under the `--root` directory is the only thing
  this CLI reads and writes. Writers sort agents by slug, keep the file
  timestamp-free, and set `counts.total`.
- `src/lib/snapshot-validate.ts` is the machine-checkable statement of "the
  snapshot is never hand-edited": shape, slug order and uniqueness, unique
  repos, registered categories and tags, canonical `githubUrl`, status
  vocabulary, graveyard metadata placement, `paperMeta` field types.
- The registry policy (categories, tag registry, venue aliases, status
  rules) is mirrored from the [agentx-hub](https://github.com/Webioinfo01/agentx-hub)
  website, which enforces the same rules over its own copy. **A policy change
  must land in both repos in the same change.** Until the website consumes
  the published package, neither side is "ahead"; `agentx validate` against
  the website checkout (CI does this) is the drift detector.
- Commands that talk to Python's awescholar (`snapshot`, `enrich-papers`,
  `refresh-citations`) fail with an install hint when the CLI is missing —
  they never degrade silently. The minimum is 0.2.2, enforced by output
  shape: search records without the `authors`/`citations` keys are rejected
  with `pip install -U "awescholar>=0.2.2"`.

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
  snapshot-contract changes.
