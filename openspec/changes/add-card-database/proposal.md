## Why

UI 渲染端目前只有 `mockDecks.ts` 里硬编码的几张占位卡牌，没法做任何真实卡牌交互（搜索、过滤、卡组导入导出、悬停 tooltip 显示真实数值）。同时 `add-hearthmirror-bridge` 后续要把"读到的 DBF ID"翻译成卡牌名/法力值/职业等，必须先有一个能按 ID 查卡的本地数据库。

本 change 给 monorepo 引入第一个**真实业务数据源** —— 卡牌数据库 + 卡组码编解码。完成后 UI 立即从"假数据演示"升级到"真卡牌 + 真 import/export"的可玩状态，且为后续所有 hearthmirror / deck-management / arena / battlegrounds 系列 change 铺好数据基础。

数据源选 [HearthstoneJSON](https://hearthstonejson.com/)（HearthSim 官方维护的静态 JSON 镜像，每个版本一更，结构稳定 12+ 年），不直接解析炉石客户端的 DBF/XML（那需要复杂的 .unitypack 工具链，YAGNI）。

## What Changes

- 新建 `packages/hearthdb`（pnpm workspace 包，name `@hdt/hearthdb`），暴露：
  - `CardDef` TypeScript 类型（HearthstoneJSON `cards.collectible.json` 的强类型化封装，含 `id` / `dbfId` / `name` / `cost` / `attack` / `health` / `cardClass` / `rarity` / `set` / `type` / `text` / `mechanics` / `cardSet` 等）。
  - `loadCards(jsonPath: string): Promise<CardDb>` — 一次性把 Cards.json 读进内存，构建以 `dbfId` 与 `cardId` 为 key 的双索引。
  - `CardDb` 实例方法：`findByDbfId(dbfId): CardDef | undefined`、`findById(cardId): CardDef | undefined`、`search(filter): CardDef[]`（filter 含 `query` / `cost` / `cardClass` / `rarity` / `set` / `type` / `mechanic`）。
  - `encodeDeck(deck: DeckBlueprint): string`、`decodeDeck(deckstring: string): DeckBlueprint` —— 实现 [HearthSim 官方 deckstring 格式](https://hearthsim.info/docs/deckstrings)（base64 + varint 编码，含 heroes / 1-copy / 2-copy / n-copy 4 段，按 DBF ID 升序）。
  - 完整 Vitest 单元测试覆盖：加载、查找、过滤、deckstring 编/解码（含 round-trip 与已知 fixture）。
- 新建 `scripts/download-cards.ts` —— 从 HearthstoneJSON 拉最新 `enUS` 与 `zhCN` 的 `cards.collectible.json`，存到 `data/cards/`。
- 新建 `data/cards/.gitkeep` 与 `data/cards/README.md` 说明数据来源、本地与 CI 的处理策略（默认不 commit Cards.json，开发与 CI 各自跑下载脚本）。
- `apps/desktop/src/main/ipc.ts` 新增 IPC handlers：`cards:findByDbfId`、`cards:findById`、`cards:search`、`deck:encode`、`deck:decode`，背后委托给 `@hdt/hearthdb`。主进程启动时从 `data/cards/cards.collectible.enUS.json` 加载到内存（约 20 MB JSON → 约 50 MB 内存常驻）。
- `apps/desktop/src/preload/index.ts` 在 `window.hdt` 命名空间下加 `cards.*` 与 `deck.*` 子命名空间，暴露上述 IPC。
- `apps/desktop/src/renderer/src/env.d.ts` 同步类型，让 renderer 能 typed 调用 `await window.hdt.cards.findByDbfId(123)`。
- `apps/desktop/src/renderer/src/data/mockDecks.ts` 升级为**真实**卡组（用真实 dbfId / cardId），`Decklist.tsx` 通过 `window.hdt.cards.findByDbfId` 在挂载时查回 `CardDef` 显示真实卡名/法力值（保留 fallback 到 mock 数据，以防主进程未加载完）。
- `apps/desktop/src/renderer/src/components/Collection.tsx` 替换硬编码的卡包列表为从 `cards.collectible.json` 派生的真实 set 统计（按 `set` 字段聚合）。
- README 更新："首次运行 `pnpm dev` 前先跑 `pnpm cards:download`"。
- 根 `package.json` 加新脚本：`cards:download`（执行 `tsx scripts/download-cards.ts`）。

### Non-goals（本 change **不**做的事）

- ❌ 不做卡组管理（CRUD、SQLite、卡组列表 UI）—— 留给 `add-deck-management`。
- ❌ 不做 hearthmirror 集成（DBF ID 查卡是支持，但不主动 spawn hearthmirror native 模块）。
- ❌ 不解析非可收藏卡（token、英雄技能、被动效果等都在 `cards.json` 而非 `cards.collectible.json`）—— YAGNI。
- ❌ 不下载卡牌美术图（约几 GB）—— 后续 `add-card-art-cache` change 处理。
- ❌ 不做卡组分享 URL（HSReplay / 长链接）—— 仅做 deckstring 这种短码。
- ❌ 不做酒馆战棋/雇佣兵/竞技场专属卡牌结构（这些大多在 `cards.collectible.json` 内但需要专属 metadata，留给后续）。
- ❌ 不实现 sideboard 编解码（巫师群英会等模式才用，YAGNI；现在只支持 4 段标准 deckstring）。
- ❌ 不做 i18n 切换 UI（数据库本身支持多 locale，但 renderer 始终用 enUS；i18n 切换留给专门 change）。
- ❌ 不引入 `better-sqlite3`（卡牌数据是只读的、内存常驻足够，不需要数据库）。
- ❌ 不引入 `zod` 等运行时校验库（`cards.collectible.json` 由 HearthSim 维护，schema 极稳定，TypeScript 类型断言够用；如果未来字段缺失，按"已知坑"列入 add-card-database-v2）。

## Capabilities

### New Capabilities

- `card-database`：本地 Cards.json 的内存数据库 —— 加载、按 ID/DBF ID 查找、按多条件过滤搜索。是其它所有"涉及具体卡牌"capability 的基础。
- `deck-codec`：HearthSim 标准 deckstring 编解码 —— 把卡组在"DBF ID 数组"与"短字符串"之间互转，是导入导出/分享/HearthMirror 内存读卡组的通用格式。
- `card-data-pipeline`：开发时下载流程 —— 从 HearthstoneJSON 拉取最新 `cards.collectible.json` 到 `data/cards/`，文档记录数据归属与更新策略。
- `cards-ipc`：主进程到渲染进程的卡牌 IPC 桥 —— 在 `window.hdt.cards.*` 与 `window.hdt.deck.*` 暴露查询/编解码 API。

### Modified Capabilities

- `desktop-shell`（来自 `add-monorepo-skeleton`）：preload 暴露面从只有 `window.hdt.app.getVersion()` 扩展到额外含 `window.hdt.cards.*` 与 `window.hdt.deck.*` 子命名空间。安全模型保持不变（仍是 `contextIsolation: true` + `sandbox: true` + 仅显式 IPC 通道，无任意函数调用）。
- `renderer-ui-shell`（来自 `add-monorepo-skeleton`）：`Decklist.tsx` 与 `Collection.tsx` 从硬编码 mock 数据切换到通过 `window.hdt.cards.*` 查询真实数据，并保留 mock fallback 防止主进程未就绪时白屏。

## Impact

- **新建包**：`packages/hearthdb`（约 600–900 行 TS：types + loader + indices + search + deckstring codec + tests）。
- **新建脚本**：`scripts/download-cards.ts`（约 60 行，用 fetch + `fs.writeFile`）。
- **新建数据目录**：`data/cards/.gitkeep` + `data/cards/README.md`（实际 JSON 不入库）。
- **修改文件**（约 10 个）：
  - `apps/desktop/src/main/ipc.ts`、`src/main/index.ts`（启动时加载 cards.json）
  - `apps/desktop/src/preload/index.ts`（contextBridge 扩展）
  - `apps/desktop/src/renderer/src/env.d.ts`、`components/Decklist.tsx`、`components/Collection.tsx`、`data/mockDecks.ts`
  - 根 `package.json`、`README.md`、`.gitignore`（加 `data/cards/*.json`）
- **依赖**：仅新增 `tsx`（dev dep，跑 `scripts/download-cards.ts`）。**不**新增 zod / better-sqlite3 / hearthstonejson-client 等。
- **CI**：`.github/workflows/ci.yml` 在 `pnpm install` 之后增加一步 `pnpm cards:download`，确保 build 与 test 能跑（CI 上每次重新拉，约 2 MB / 3 秒）。
- **运行时性能**：主进程启动时一次性 ~50 ms 加载 + 索引构建；查询 O(1)（按 ID）或 O(n) 的简单过滤（n ~ 5000 张可收藏卡）。
- **风险**：HearthstoneJSON API 偶尔停机（24 小时内一般会自愈），CI 应有 retry；本 change 范围内仅做基础 retry（fetch 失败重试 3 次），robust 化留给后续。
