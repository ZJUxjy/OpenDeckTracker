# hearthmirror-api Specification

## Purpose

TBD - created by archiving change add-hearthmirror-bridge. Update Purpose after archive.
## Requirements
### Requirement: HearthMirror class

The `@hdt/hearthmirror` package SHALL export a `HearthMirror` class with lazy connection lifecycle and 12 reflection methods, all async. Methods SHALL return `Promise<T | null>` (where `null` = data unavailable, business-level), and SHALL only `reject` for fatal/programming errors.

#### Scenario: 构造时不连接
- **WHEN** `new HearthMirror()`
- **THEN** `instance.isConnected === false`，无 native call 发生

#### Scenario: 第一个方法调用时 lazy connect
- **WHEN** 第一次 `await instance.getBattleTag()`
- **THEN** 内部 `connect()` 被自动触发，`isConnected` 变为 `true`，方法返回 `BattleTag | null`

#### Scenario: disconnect 后调用方法 reject
- **GIVEN** 已 connect 的实例
- **WHEN** `await instance.disconnect()` 然后 `await instance.getBattleTag()`
- **THEN** 后者 reject 一个 `MirrorError`，code = `NotConnected`

### Requirement: 类型契约

The package SHALL export the following TypeScript interfaces (matching HearthSim HearthMirror naming):

- `BattleTag { name: string; fullBattleTag: string }`
- `AccountId { hi: bigint; lo: bigint }`
- `Card { dbfId: number; count: number; premium: number }`
- `Deck { id: number; name: string; hero: string; formatType: number; type: number; cards: Card[]; sideboards?: Record<string, Card[]> }`
- `MatchPlayer { id: number; name: string; accountId: AccountId; battleTag: BattleTag; standardRank: number; wildRank: number; classicRank: number; twistRank: number }`
- `MatchInfo { localPlayer: MatchPlayer; opposingPlayer: MatchPlayer; missionId: number; gameType: number; formatType: number }`
- `MedalInfoData { leagueId: number; starLevel: number; stars: number; legendRank: number; seasonId: number; seasonWins: number }`
- `MedalInfo { standard: MedalInfoData | null; wild: MedalInfoData | null; classic: MedalInfoData | null; twist: MedalInfoData | null }`
- `ArenaInfo { deck: Deck; wins: number; losses: number; rewards: ArenaReward[] }`
- `BattlegroundRatingInfo { rating: number; rank: number }`
- `GameServerInfo { address: string; port: number; auroraPassword: string; mission: number; clientHandle: number; gameHandle: number; version: string; resumable: boolean }`

Each interface SHALL be importable as `import type { BattleTag } from '@hdt/hearthmirror'`.

#### Scenario: 类型可被消费
- **WHEN** 在 renderer 写 `const tag: BattleTag | null = await window.hdt.hearthmirror.getBattleTag()`
- **THEN** TypeScript 类型检查通过

### Requirement: 错误模型

The package SHALL export `class MirrorError extends Error` and `enum MirrorErrorCode { ProcessNotFound, AccessDenied, MemoryReadFailed, ClassNotFound, FieldNotFound, Timeout, NotConnected, Unknown }`. All thrown / rejected errors from `HearthMirror` SHALL be `MirrorError` instances with a typed `code`.

#### Scenario: 类型守卫
- **WHEN** 在 try/catch 写 `} catch (e) { if (e instanceof MirrorError && e.code === MirrorErrorCode.NotConnected) ... }`
- **THEN** TypeScript 类型 narrowing 工作

### Requirement: 方法签名稳定

The 12 reflection methods SHALL have the exact signatures listed below. Future changes that add methods SHALL extend this set without modifying signatures (semver-compatible).

```typescript
async getBattleTag(): Promise<BattleTag | null>;
async getAccountId(): Promise<AccountId | null>;
async getGameType(): Promise<number>;             // GameType enum value
async isSpectating(): Promise<boolean>;
async isGameOver(): Promise<boolean>;
async getMatchInfo(): Promise<MatchInfo | null>;
async getMedalInfo(): Promise<MedalInfo | null>;
async getDecks(): Promise<Deck[] | null>;
async getCollection(): Promise<Card[] | null>;
async getArenaDeck(): Promise<ArenaInfo | null>;
async getBattlegroundRatingInfo(): Promise<BattlegroundRatingInfo | null>;
async getServerInfo(): Promise<GameServerInfo | null>;
```

#### Scenario: 签名编译期固定
- **WHEN** TypeScript 检查 `const fn: (() => Promise<BattleTag | null>) = hm.getBattleTag.bind(hm)`
- **THEN** 类型兼容

### Requirement: isAlive reflects bound-process liveness within one tick

`HearthMirror.isAlive()` SHALL return `false` within one invocation of the underlying napi `is_alive` after the bound Hearthstone process exits or is replaced by a different `Hearthstone.exe` instance. The `_connected` boolean tracked by the wrapper MUST stay in sync with the napi result on every call.

The contract makes no guarantee about the *source* of the staleness — process exit, ASLR base change, mono runtime tear-down — only that a `true → false` transition is observable on the next call after the underlying state changes.

#### Scenario: User exits Hearthstone

- **GIVEN** `mirror.isAlive()` previously returned `true`
- **WHEN** the user closes Hearthstone
- **AND** `mirror.isAlive()` is called next
- **THEN** the call returns `false`

#### Scenario: User restarts Hearthstone

- **GIVEN** `mirror.isAlive()` previously returned `true` against pid `P1`
- **WHEN** the user closes Hearthstone and starts it again so the new pid is `P2 != P1`
- **AND** `mirror.isAlive()` is called against the new instance
- **THEN** the call returns `true` (after the native layer transparently re-inits) and subsequent reflectors operate against `P2`

### Requirement: getHearthstoneWindow proxies to native

`@hdt/hearthmirror` SHALL expose
`mirror.getHearthstoneWindow(): Promise<HearthstoneWindow | null>`
on the existing `HearthMirror` class. The method SHALL connect
lazily like the other reflection methods, then forward to the
native binding.

`HearthstoneWindow` is the exported type
`{ x: number; y: number; width: number; height: number; minimized:
boolean; visible: boolean }`. All numeric fields are integer pixel
counts in virtual-screen coordinates.

The method MUST resolve to `null` (not reject) when:

- The native call returns no window (HS not running, or running
  pre-window).
- The native call throws (mirror not alive, native panic).

The method MUST NOT cache results — each call hits the native
binding fresh.

#### Scenario: Returns null when native returns null

- **GIVEN** Hearthstone is not running
- **WHEN** `mirror.getHearthstoneWindow()` is awaited
- **THEN** the resolved value is `null`

#### Scenario: Returns full bounds when native returns a window

- **GIVEN** Hearthstone is running with a 1920×1080 window at
  origin (0, 0)
- **WHEN** `mirror.getHearthstoneWindow()` is awaited
- **THEN** the resolved value is `{ x: 0, y: 0, width: 1920,
  height: 1080, minimized: false, visible: true }`

#### Scenario: Returns null when native throws

- **GIVEN** the native binding throws (mirror not alive)
- **WHEN** `mirror.getHearthstoneWindow()` is awaited
- **THEN** the resolved value is `null` (not a rejection)

