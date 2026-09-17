<div align="center">
  <h1>agentx: AgentX 注册表命令行</h1>
  <p><strong>在终端维护 AgentX 研究 Agent 注册表。</strong></p>
  <p>按校验流水线添加研究 AI Agent，刷新指标，保持注册表有效。</p>
  <p>
    <a href="./README.md">English</a> ·
    <strong>简体中文</strong>
  </p>
  <p>
    <img src="https://img.shields.io/badge/version-0.1.0-7C3AED?style=flat-square" alt="Version">
    <img src="https://img.shields.io/badge/node-%E2%89%A520-0EA5E9?style=flat-square" alt="Node">
  </p>
  <p>
    <img src="https://img.shields.io/badge/status-alpha-c96a3d?style=flat-square" alt="Status">
    <img src="https://img.shields.io/badge/install-npm-22C55E?style=flat-square" alt="npm install">
    <img src="https://img.shields.io/badge/platform-terminal-334155?style=flat-square" alt="Platform">
    <img src="https://img.shields.io/npm/dm/%40mugpeng/agentx-cli?style=flat-square" alt="npm downloads">
    <img src="https://img.shields.io/github/stars/Webioinfo01/agentx-hub-cli?style=flat-square" alt="GitHub stars">
  </p>
</div>

> 在终端维护 AgentX 研究 Agent 注册表。

`agentx` 作用于一个 AgentX 仓库检出——即包含
`data/agents-snapshot.json` 的目录，也就是
[agentx-hub](https://github.com/Webioinfo01/agentx-hub) 背后的策展注册表。
它按校验流水线添加新 Agent（分类检查、标签政策、一次 GitHub 实时抓取），
刷新 GitHub 指标和生命周期状态，通过
[awescholar](https://github.com/Webioinfo01/awescholar) 补全论文元数据，
离线校验写入不变量。快照文件从不手改；这个 CLI 就是写入方。

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

## 快速开始

```bash
cd /path/to/agentx-hub

agentx validate
# Snapshot OK: 208 agents, counts consistent.

agentx add owner/repo --category bio-omics --tags "Stanford,Nature-Biotechnology"
# Added owner-repo (owner/repo) → category bio-omics, tags: Stanford, Nature-Biotechnology
```

`agentx add` 校验分类和标签政策，要求仓库在 GitHub 上存在，抓取一次实时
指标，按稳定 slug 顺序追加记录。之后运行 `agentx validate`，再提交快照。

## 配置

没有配置文件。选项来自命令行标志和环境变量：

| 变量 | 使用者 | 作用 |
|---|---|---|
| `GITHUB_TOKEN` | `add`、`snapshot` | GitHub API 限额从 60 提到 5,000 次/小时 |
| `SEMANTICSCHOLAR_API_KEY` | `enrich-papers`、`refresh-citations` | 避开 Semantic Scholar 匿名限流 |
| PATH 上的 `awescholar` | `snapshot`、`enrich-papers`、`refresh-citations` | 批量 GitHub 刷新和论文查询（`pip install awescholar`） |

所有命令都接受 `--root <dir>`——目标 AgentX 仓库，默认当前目录。

## 命令

```bash
agentx add owner/repo --category <slug> [--name "Foo"] [--tags "A,B"]
agentx add owner/repo --paper <url> [--homepage <url>] [--description "txt"]
agentx validate
agentx snapshot
agentx enrich-papers [--force] [--only <slug-substring>]
agentx refresh-citations
```

分类 slug：`autonomous-research`、`literature-writing`、`bio-omics`、
`chem-drug`、`clinical-health`、`platforms`、`orchestration`、`benchmarks`、
`safety-security`、`others`。标签只承载客观专有名词——机构、发表渠道、
团队、命名的技术；其余一律拒绝。单个命令的选项看
`agentx <command> --help`。

## 开发

```bash
pnpm install
pnpm test    # vitest，每个模块一个测试文件
pnpm check   # tsc --noEmit
pnpm build   # tsup → dist/cli.js
```

贡献指南、快照契约和发布流程见
[docs/CONTRIBUTING.md](./docs/CONTRIBUTING.md)。

## 许可证

[MPL-2.0](./LICENSE)
