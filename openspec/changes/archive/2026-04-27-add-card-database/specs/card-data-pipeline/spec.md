## ADDED Requirements

### Requirement: 下载脚本

The repository SHALL contain `scripts/download-cards.ts` that fetches the latest `cards.collectible.json` from HearthstoneJSON for at least the `enUS` and `zhCN` locales, writing them to `data/cards/cards.collectible.<locale>.json`. The script SHALL retry up to 3 times on network errors with exponential backoff (1 s, 2 s).

#### Scenario: 成功下载两个 locale
- **GIVEN** 网络正常 + HearthstoneJSON 上游可用
- **WHEN** 执行 `pnpm cards:download`
- **THEN** `data/cards/cards.collectible.enUS.json` 与 `data/cards/cards.collectible.zhCN.json` 都存在，每个文件大小 ≥ 1 MB

#### Scenario: 上游短时不可用时 retry
- **GIVEN** HearthstoneJSON 第 1 次返回 503，第 2 次返回 200
- **WHEN** 执行下载脚本
- **THEN** 脚本最终成功（exit code 0），stdout 含 "attempt 1/3 failed" 与 "attempt 2/3" 成功信息

#### Scenario: 上游持续不可用时明确失败
- **GIVEN** 3 次都返回 503
- **WHEN** 执行下载脚本
- **THEN** exit code 非 0，stderr 含具体 HTTP 状态码与建议手动重试的提示

### Requirement: 数据归属与策略文档

The `data/cards/` directory SHALL contain a `README.md` documenting the data source (HearthstoneJSON), license attribution, the fact that JSON files are NOT committed to git, and the command to refresh data (`pnpm cards:download`).

#### Scenario: README 章节齐全
- **WHEN** 读取 `data/cards/README.md`
- **THEN** 文件包含子串 "HearthstoneJSON"、"pnpm cards:download"、"not committed"

### Requirement: gitignore 排除 JSON 数据

The `.gitignore` SHALL exclude `data/cards/*.json` so that downloaded card data is never committed to the repository.

#### Scenario: gitignore 命中
- **GIVEN** 跑过 `pnpm cards:download` 后产生了 `data/cards/cards.collectible.enUS.json`
- **WHEN** `git status`
- **THEN** 该文件不出现在 untracked 列表中（已被 gitignore 排除）

### Requirement: CI 工作流自动下载

The `.github/workflows/ci.yml` SHALL invoke `pnpm cards:download` after `pnpm install --frozen-lockfile` and before `pnpm test`, so CI always runs against fresh data.

#### Scenario: CI 步骤顺序
- **WHEN** 检查 `.github/workflows/ci.yml`
- **THEN** `pnpm cards:download` 命令出现在 `pnpm install` 之后、`pnpm test` 之前
