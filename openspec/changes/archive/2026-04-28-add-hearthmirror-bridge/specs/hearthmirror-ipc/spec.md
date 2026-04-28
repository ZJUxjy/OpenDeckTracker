## ADDED Requirements

### Requirement: 主进程 lazy 会话管理

The Electron main process SHALL contain `apps/desktop/src/main/hearthmirror.ts` that lazily creates a single `HearthMirror` instance on first IPC call. The instance SHALL be reused across IPC calls. If the instance throws during a method, subsequent IPC calls SHALL still work (the `HearthMirror` instance internally handles per-call failures).

#### Scenario: 首次 IPC 触发连接
- **GIVEN** 主进程刚启动
- **WHEN** 渲染端首次调用 `await window.hdt.hearthmirror.isAlive()`
- **THEN** 主进程实例被创建，`HearthMirror.connect()` 被触发；后续 IPC 不再重新连接

#### Scenario: 连续 IPC 共享实例
- **WHEN** 渲染端连续调用 `getBattleTag()` + `getMedalInfo()`
- **THEN** 内部 native module 仅 require 一次，仅一次 mono runtime locate + offset probe

### Requirement: window.hdt.hearthmirror 暴露面

The preload script SHALL expose `window.hdt.hearthmirror` with 13 async methods (1 lifecycle + 12 reflection):

```typescript
window.hdt.hearthmirror.isAlive(): Promise<boolean>;
window.hdt.hearthmirror.getBattleTag(): Promise<BattleTag | null>;
window.hdt.hearthmirror.getAccountId(): Promise<AccountId | null>;
window.hdt.hearthmirror.getGameType(): Promise<number>;
window.hdt.hearthmirror.isSpectating(): Promise<boolean>;
window.hdt.hearthmirror.isGameOver(): Promise<boolean>;
window.hdt.hearthmirror.getMatchInfo(): Promise<MatchInfo | null>;
window.hdt.hearthmirror.getMedalInfo(): Promise<MedalInfo | null>;
window.hdt.hearthmirror.getDecks(): Promise<Deck[] | null>;
window.hdt.hearthmirror.getCollection(): Promise<Card[] | null>;
window.hdt.hearthmirror.getArenaDeck(): Promise<ArenaInfo | null>;
window.hdt.hearthmirror.getBattlegroundRatingInfo(): Promise<BattlegroundRatingInfo | null>;
window.hdt.hearthmirror.getServerInfo(): Promise<GameServerInfo | null>;
```

#### Scenario: DevTools 能直接调用
- **GIVEN** 主窗口已启动
- **WHEN** DevTools console 输入 `await window.hdt.hearthmirror.isAlive()`
- **THEN** 返回 `true`（炉石运行时）或 `false`（炉石未运行），不 throw

#### Scenario: 暴露面只增不减
- **WHEN** `Object.keys(window.hdt)`
- **THEN** 数组至少包含 `'app'`, `'cards'`, `'deck'`, `'hearthmirror'`

### Requirement: IPC 失败语义 — 业务方法永不 reject

12 reflection methods routed through IPC SHALL never reject the Promise on the renderer side. They SHALL resolve to `null` (or `false`/`0` for boolean / number returns) when:
- 主进程 hearthmirror 未连接
- 炉石未运行
- 内部 mono / metadata / collection 任何步骤失败

Only `isAlive` MAY resolve to `false` instead of `null`. If main process IPC handler itself crashes, error is logged to main process stderr and Promise resolves to `null`/`false`.

#### Scenario: 炉石未运行时所有方法不 reject
- **GIVEN** 炉石未运行
- **WHEN** renderer 连续调用 12 个方法各一次
- **THEN** 12 次都 resolve（不 reject），结果分别为 `null` / `false` / `0`

#### Scenario: 主进程 IPC handler 内部异常被 swallow
- **GIVEN** mock 一个 native crate 抛 panic
- **WHEN** renderer 调用对应方法
- **THEN** Promise resolve 为 `null`（或 false/0），main 进程 stderr 有 `[hearthmirror:methodName]` 错误日志

### Requirement: env.d.ts 类型同步

The renderer's `apps/desktop/src/renderer/src/env.d.ts` SHALL ensure `window.hdt.hearthmirror` 的 13 个方法在 TypeScript 类型检查中可见且签名与 spec 一致。

#### Scenario: typecheck 识别 hearthmirror 命名空间
- **GIVEN** renderer 文件中 `const tag: BattleTag | null = await window.hdt.hearthmirror.getBattleTag()`
- **WHEN** `pnpm typecheck`
- **THEN** 零类型错误

## MODIFIED Requirements

### Requirement: Preload 仅暴露最小 IPC 表面

The preload script SHALL use `contextBridge.exposeInMainWorld('hdt', api)` to expose:
- `hdt.app.getVersion()` (from `add-monorepo-skeleton`)
- `hdt.cards.findByDbfId / findById / search` (from `add-card-database`)
- `hdt.deck.encode / decode` (from `add-card-database`)
- `hdt.hearthmirror.{isAlive, getBattleTag, ..., getServerInfo}` 共 13 个方法（**this change**）

No other top-level property on `hdt` SHALL be exposed.

#### Scenario: 已有暴露面保持
- **WHEN** DevTools console `await window.hdt.app.getVersion()`
- **THEN** 返回应用版本字符串

#### Scenario: cards 与 deck 子命名空间保持
- **WHEN** `await window.hdt.cards.findByDbfId(1746)` / `await window.hdt.deck.encode({...})`
- **THEN** 行为与 `add-card-database` change 定义的相同

#### Scenario: hearthmirror 子命名空间存在
- **WHEN** `Object.keys(window.hdt.hearthmirror)`
- **THEN** 数组长度 13，包含上述所有方法名
