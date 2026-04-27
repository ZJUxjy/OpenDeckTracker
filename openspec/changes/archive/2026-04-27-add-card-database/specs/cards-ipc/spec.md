## ADDED Requirements

### Requirement: 主进程加载 CardDb

The Electron main process SHALL load `data/cards/cards.collectible.enUS.json` lazily on first access, caching the resulting `CardDb` for the lifetime of the application. If loading fails, IPC handlers SHALL return `null` (for find* / search) or reject with an Error message containing "cards database not loaded" (for IPC handlers that fundamentally need the DB).

#### Scenario: 启动后立即可查
- **GIVEN** `pnpm cards:download` 已执行
- **WHEN** 启动 `pnpm dev`，Electron 主窗口出现后从 DevTools 调用 `await window.hdt.cards.findByDbfId(1746)`
- **THEN** 返回 `{ id: 'EX1_008', dbfId: 1746, name: 'Argent Squire', ... }`（具体值见真实数据）

#### Scenario: 缺失数据文件时优雅降级
- **GIVEN** `data/cards/cards.collectible.enUS.json` 不存在
- **WHEN** 渲染端调用 `await window.hdt.cards.findByDbfId(1746)`
- **THEN** 返回 `null`（不 reject），主进程 stderr 打印明确错误且不崩溃

### Requirement: window.hdt.cards 暴露面

The preload script SHALL expose `window.hdt.cards` with three async methods: `findByDbfId(dbfId: number): Promise<CardDef | null>`, `findById(id: string): Promise<CardDef | null>`, `search(filter: SearchFilter): Promise<CardDef[]>`.

#### Scenario: 渲染端类型化调用
- **WHEN** 在 renderer 写 `const card: CardDef | null = await window.hdt.cards.findByDbfId(1746)`
- **THEN** TypeScript 类型检查通过（`window.hdt.cards.findByDbfId` 类型为 `(dbfId: number) => Promise<CardDef | null>`）

#### Scenario: 暴露面只读
- **WHEN** 渲染端尝试 `window.hdt.cards = {}`
- **THEN** TypeScript 类型 readonly 阻止赋值（且运行时 contextBridge frozen object 也不允许）

### Requirement: window.hdt.deck 暴露面

The preload script SHALL expose `window.hdt.deck` with two methods: `encode(blueprint: DeckBlueprint): Promise<string>`, `decode(deckstring: string): Promise<DeckBlueprint>`. Both delegate to `@hdt/hearthdb` via IPC.

#### Scenario: encode/decode round-trip 经 IPC
- **GIVEN** 一个合法 blueprint
- **WHEN** `const s = await window.hdt.deck.encode(b); const b2 = await window.hdt.deck.decode(s);`
- **THEN** `b2` 与 `b` 深度相等

#### Scenario: 解码非法 deckstring 在渲染端拿到 reject
- **WHEN** `await window.hdt.deck.decode('garbage')`
- **THEN** Promise reject 一个 Error，可被 try/catch 捕获

### Requirement: 渲染端 fallback

The renderer's `Decklist.tsx` SHALL gracefully fall back to mock card data (current `mockDecks.ts`) when `window.hdt.cards.findByDbfId` returns `null`, without throwing or showing white screen.

#### Scenario: 数据库未就绪时不白屏
- **GIVEN** `data/cards/cards.collectible.enUS.json` 缺失
- **WHEN** 启动 `pnpm dev`
- **THEN** Decklist 区域仍渲染 mock 卡牌列表（不空白），FIRESTONE 主题视觉无回归

## MODIFIED Requirements

### Requirement: Preload 仅暴露最小 IPC 表面

The preload script SHALL use `contextBridge.exposeInMainWorld('hdt', api)` to expose the following namespaces:

- `hdt.app.getVersion(): Promise<string>` (from `add-monorepo-skeleton`)
- `hdt.cards.findByDbfId / findById / search` (this change)
- `hdt.deck.encode / decode` (this change)

No other top-level property on `hdt` SHALL be exposed in this change.

#### Scenario: window.hdt.app.getVersion 仍工作
- **GIVEN** 主窗口已启动
- **WHEN** 在 DevTools Console 执行 `await window.hdt.app.getVersion()`
- **THEN** 返回值为 `apps/desktop/package.json` 中的 `version` 字符串

#### Scenario: 未声明的 API 仍不可访问
- **GIVEN** 主窗口已启动
- **WHEN** 在 DevTools Console 执行 `window.hdt.fs` 或 `window.hdt.exec`
- **THEN** 返回 `undefined`

#### Scenario: 新增 cards 与 deck 命名空间存在
- **WHEN** 在 DevTools Console 执行 `Object.keys(window.hdt)`
- **THEN** 数组至少包含 `'app'`、`'cards'`、`'deck'`
