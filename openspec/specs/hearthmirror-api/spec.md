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
