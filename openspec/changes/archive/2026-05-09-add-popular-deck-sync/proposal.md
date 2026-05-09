## Why

记牌器的"热门卡组"数据当前是通过 `data/hsguru-data-spider/` 里一个独立的 Node 脚本人工抓取
hsguru 网站、再 commit 进 `packages/core/src/deck/popular-decks-seed.ts` 这个静态种子文件
得到的。这意味着卡组数据的新鲜度完全取决于维护者什么时候记得跑脚本+发版本，用户拿到的永远是
打包那一刻的快照——而炉石环境每周都在变。

把同步动作搬进记牌器内部，让用户自己点一下就刷新，是修复这个时效性缺口的最小可行方式：
不破坏现有"打包带种子"的体验（首次启动仍可用），但允许用户主动获取最新数据并持久化。

跟 DEVELOPMENT_PLAN.md 的关系：DEVELOPMENT_PLAN 把"meta 卡组浏览"列在 Phase 4，本 change
是该能力上线后的第一个增量——把数据从"打包静态"升级为"用户可刷新"，不是新模块。

## What Changes

- 新增主进程 hsguru 抓取器（移植 `data/hsguru-data-spider/src/fetch-legend-top20.mjs` 的
  解析逻辑到 `apps/desktop/src/main/popular-decks-sync/`），通过 Electron 的 `net.fetch`
  调用，避免渲染进程跨域问题
- 新增 IPC 通道：
  - `popular-decks:sync-start` — 触发一次同步（请求/响应模式，返回最终结果摘要）
  - `popular-decks:sync-progress` — 主→渲染单向事件，推送阶段/百分比/当前 archetype
  - `popular-decks:sync-status` — 查询当前是否在同步、上次成功时间
- 新增 userData 持久化：`<userData>/popular-decks/synced.json`（最近一次成功的快照 +
  `fetchedAt` 时间戳）
- 修改 `popular-decks:list` IPC handler：优先返回 synced.json 里的数据，缺失或解析失败
  时回退到 `POPULAR_DECKS_SEED`；返回值额外带 `source: 'synced' | 'seed'` 和
  `fetchedAt: string` 元信息字段
- 渲染层：DeckFinderTab 顶部新增"同步热门卡组"按钮 + 进度条 + 上次更新时间显示；
  同步过程中按钮禁用，完成后自动刷新列表
- i18n：在 `resources/locales/{en-US,zh-CN}.json` 的 `decks.finder.*` 下新增 sync
  按钮、进度文案、错误文案

### Non-goals

- 不做后台/定时自动同步——只在用户主动点按钮时触发（避免悄悄消耗带宽 + 给 hsguru 带流量）
- 不动现有的 `data/hsguru-data-spider/` 脚本——它仍是 fallback 种子的来源，本 change
  不替换、不删除
- 不引入新的 HTTP 库——复用 Electron 内置 `net.fetch`
- 不改变 `PopularDeck` 类型形状——sync 输出必须满足现有 `deck-finder` 规约（同样的字段、同样
  的 deckstring 解码不变量）；只是来源换了
- 不持久化历史快照（多版本对比、回滚等）——只保留最近一次

## Capabilities

### New Capabilities

- `popular-deck-sync`: 用户主动触发的 hsguru 热门卡组同步流程——主进程抓取/解析/落盘 + IPC 进度
  推送 + 渲染层的按钮+进度 UI

### Modified Capabilities

- `deck-finder-ipc`: `popular-decks:list` handler 的数据源从"只读 seed 常量"改为"synced
  缓存优先、seed 兜底"，并在响应里追加 `source` 和 `fetchedAt` 字段

## Impact

- **代码**：
  - 新增 `apps/desktop/src/main/popular-decks-sync/`（fetcher + parser + transformer + storage）
  - 修改 `apps/desktop/src/main/popular-decks-ipc.ts`（数据源切换 + 新 IPC 通道）
  - 修改 `apps/desktop/src/preload/index.ts`（新增 `window.hdt.popularDecks.sync*` API）
  - 修改 `apps/desktop/src/renderer/src/components/DeckFinderTab.tsx`（同步按钮 + 进度
    UI + 上次更新时间）
  - 修改 `resources/locales/en-US.json` + `zh-CN.json`
- **数据/存储**：在 `app.getPath('userData')/popular-decks/synced.json` 新增运行时缓存文件
- **依赖**：无新增 npm 依赖
- **网络**：新增对 `hsguru.com` 的出站 HTTP 请求（仅在用户点击同步时）；脚本现有抓取速率
  （每 archetype 间 1s delay）保持，不去并发轰炸
- **测试**：core 层 deckstring 转换函数单测；main 层 fetch+parse 解析器单测（HTML fixture）；
  主→渲染 IPC 集成测试可选
- **风险**：hsguru DOM 结构变化会让解析失败——需要解析失败时优雅回退到 seed、向用户显示
  明确错误文案，而不是让 UI 崩
