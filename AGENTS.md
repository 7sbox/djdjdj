# AGENTS.md

面向在本仓库（`7sbox/djdjdj`）里工作的代理的说明。

## Agent skills

### Issue tracker

议题与规格说明都存在 GitHub Issues（`7sbox/djdjdj`），用 `gh` CLI 读写。See `docs/agents/issue-tracker.md`.

### Triage labels

沿用默认五角色词汇：`needs-triage`、`needs-info`、`ready-for-agent`、`ready-for-human`、`wontfix`；寻路另用 `wayfinder:map` / `wayfinder:research` / `wayfinder:prototype` / `wayfinder:grilling` / `wayfinder:task`。See `docs/agents/triage-labels.md`.

### Domain docs

single-context：根目录一份 `GLOSSARY.md`，架构决定放 `docs/adr/`。See `docs/agents/domain.md`.

### Repo access

协作者角色、`write` 权限边界、`main` 分支保护（必须走 PR、1 个批准、禁强推）。See `docs/agents/collaborators.md`.
