<div align="center">
  <h1>agentx：AgentX Hub 运维命令行</h1>
  <p><strong>在终端运维 AgentX Hub。</strong></p>
  <p>把注册表快照落进 Hub 数据库、审核评价、镜像到公共 Hub。</p>
  <p>
    <a href="./README.md">English</a> ·
    <strong>简体中文</strong>
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

> **v0.2.0 —— 新使命。** v0.1.x 的注册表策展命令已并入
> [awescholar](https://github.com/wehuman01/awescholar)（Python 版）：
> `awescholar updater add | enrich | backfill --agentx` 和
> `awescholar verify --agentx`。本 CLI 现在是 Hub **运维**补充——
> 承载那些必须接触 Hub 网站或其部署环境的命令，通用策展工具箱管不了它们。

> 两个工具，一条边界：

| 职责 | 归属 | 原因 |
|---|---|---|
| 注册表策展（`data/agents-snapshot.json`） | [awescholar](https://github.com/wehuman01/awescholar)（pip） | 通用：任何 AgentX 检出都能用，与文献流水线共享 |
| Hub 运维（数据库、评价、公共镜像） | **本 CLI**（npm） | 与 Hub 网站的脚本和 workflow 耦合——只做包装，绝不重新实现 |

## 安装

```bash
npm install -g agentx-hub-cli
```

免安装直接运行：

```bash
npx agentx-hub-cli --help
```

从源码运行：

```bash
git clone https://github.com/Webioinfo01/agentx-hub-cli
cd agentx-hub-cli && pnpm install && pnpm build
node dist/cli.js --help   # 或者：npm link  →  agentx
```

## 命令

```bash
agentx sync [--remote] [--dir <website>] [--repo <repo>] [--ref <ref>]
agentx moderate [--dir <website>] [--approve <id> | --reject <id>]
agentx mirror [--repo <repo>] [--ref <ref>]
```

- **`sync`** —— 把 `data/agents-snapshot.json` 落进 Hub 数据库。本地模式
  （默认）运行网站检出里的 `db:apply-snapshot`（与 Prisma schema 耦合的
  reconcile，和 server 启动时的自动 apply 共享同一份实现——永远只有一份
  实现）。`--remote` 则派发 Hub 仓库的 `sync-db` workflow：同样的代码，
  用仓库的生产 secrets 运行，不需要本地检出。
- **`moderate`** —— 操作待审核的 verified-run 评价队列。裸 `agentx
  moderate` 列出队列；`--approve/--reject <id>` 做裁定。纯透传到网站的
  `reviews:moderate` 脚本。
- **`mirror`** —— 派发 Hub 仓库的 `sync-public` workflow：把面向用户的
  内容按允许清单桥接到公共
  [agentx-hub](https://github.com/Webioinfo01/agentx-hub) 仓库。

## 配置

没有配置文件。选项来自命令行标志和环境变量：

| 变量 | 使用者 | 作用 |
|---|---|---|
| `AGENTX_WEBSITE_DIR` | `sync`、`moderate` | 本地命令的默认 Hub 网站检出（不默认当前目录） |
| `AGENTX_HUB_REPO` | `sync --remote`、`mirror` | 默认 Hub 仓库（缺省 `Webioinfo01/agentx-hub-dev`） |
| `GITHUB_TOKEN`（或 `GH_TOKEN`） | `sync --remote`、`mirror` | 派发鉴权 |

## 开发

```bash
pnpm install
pnpm test    # vitest，每个模块一个测试文件
pnpm check   # tsc --noEmit
pnpm build   # tsup → dist/cli.js
```

贡献指南和发布流程见 [docs/CONTRIBUTING.md](./docs/CONTRIBUTING.md)。

## 许可证

[MPL-2.0](./LICENSE)
