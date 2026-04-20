## ADDED Requirements

### Requirement: 字段路径研究文档

The change SHALL produce `docs/superpowers/research/2026-04-20-hearthmirror-field-paths.md` listing, for each of the 12 IReflection methods:

1. The C# entry point in [HearthSim/HearthMirror](https://github.com/HearthSim/HearthMirror) (file path + commit SHA used as ground truth)
2. The full field traversal chain (e.g. `ServiceManager → NetCache.s_instance → m_netCacheValues[NetCacheBattleTag] → BattleTag`)
3. The collection types involved (`List<T>` / `Dictionary<K,V>` / custom `Map<K,V>` / scalar)
4. The Hearthstone client build number this chain was verified against

This document SHALL be committed before any reflection method implementation commit.

#### Scenario: 文档存在且每方法都有条目

- **WHEN** 检查 `docs/superpowers/research/2026-04-20-hearthmirror-field-paths.md`
- **THEN** 文档存在；含 12 个 `## <methodName>` 二级标题；每个标题下有 4 个必填子段（C# source / chain / collections / verified-against）

### Requirement: MonoObject 链式 helper

The `packages/hearthmirror/native/src/mono/object.rs` module SHALL expose at minimum:

- `MonoObject::read_string_field(&self, memory: &ProcessMemory, field_name: &str) -> Result<Option<String>, ScryError>`
- `MonoObject::read_int32_field(&self, memory: &ProcessMemory, field_name: &str) -> Result<i32, ScryError>` (default 0)
- `MonoObject::read_int64_field(&self, memory: &ProcessMemory, field_name: &str) -> Result<i64, ScryError>` (default 0)
- `MonoObject::read_bool_field(&self, memory: &ProcessMemory, field_name: &str) -> Result<bool, ScryError>` (default false)
- `MonoObject::read_object_field(&self, memory: &ProcessMemory, field_name: &str) -> Result<Option<MonoObject>, ScryError>`
- `MonoObject::read_pointer_field(&self, memory: &ProcessMemory, field_name: &str) -> Result<Option<RemotePtr>, ScryError>`

Each helper SHALL look up the field's offset by traversing `MonoClass.fields` linked list (and falling back to `MetadataReader::find_field_token` if the change `add-hearthmirror-metadata-reader` is merged); on field-not-found SHALL return the appropriate empty value (`Ok(None)` / `Ok(0)` / `Ok(false)`) without erroring.

#### Scenario: 字符串字段读到值

- **GIVEN** mock MonoObject + class + 一个 string field "Name" 偏移 0x10 指向 mock string "Test"
- **WHEN** `obj.read_string_field(memory, "Name")`
- **THEN** 返回 `Ok(Some("Test".to_string()))`

#### Scenario: 字段不存在返回 None 不报错

- **WHEN** `obj.read_object_field(memory, "NonExistentField")`
- **THEN** 返回 `Ok(None)`，不 `Err`

#### Scenario: NULL 指针字段返回 None

- **GIVEN** field 偏移 0x10 处的指针值为 0
- **WHEN** `obj.read_object_field(memory, "Foo")`
- **THEN** 返回 `Ok(None)`

### Requirement: 12 个反射方法返回真实数据（炉石运行时）

When Hearthstone is running and the user is logged into Battle.net, each of the 12 IReflection methods SHALL return business data (not null/false/0 stub) per the field paths recorded in the research document. Each method SHALL be a pure function over `(ProcessMemory, MonoRuntime, ServiceLocator)` (no global state mutation).

| Method | 主菜单 + 已登录时返回 |
|---|---|
| `getBattleTag` | `Some(BattleTag { name: "Player", fullBattleTag: "Player#12345" })` |
| `getAccountId` | `Some(AccountId { hi, lo })` 二者非 0 |
| `getGameType` | 非 0 整数（如 16 = Casual / 18 = Ranked） |
| `isSpectating` | 主菜单返回 false；观战中返回 true |
| `isGameOver` | 主菜单返回 false |
| `getMatchInfo` | 主菜单返回 None；对局中返回 `Some(MatchInfo { localPlayer, opposingPlayer, missionId, gameType, formatType, brawlSeasonId, mercenariesPVPSeasonId })` |
| `getMedalInfo` | `Some(MedalInfo { standard, wild, classic, twist })`，至少 standard 非 None |
| `getDecks` | `Some(Vec<Deck>)`，含至少 1 个有效 deck（每个 deck.cards.len() == 30） |
| `getCollection` | `Some(Vec<Card>)`，含 ≥ 1 张卡 |
| `getArenaDeck` | 非竞技场模式 None；竞技场内 `Some(ArenaInfo)` |
| `getBattlegroundRatingInfo` | `Some(BattlegroundRatingInfo { rating, leaderboard })` 或 None |
| `getServerInfo` | 对局中返回 `Some(GameServerInfo { address, port, gameHandle, version })`；非对局返回 None |

#### Scenario: getBattleTag 在登录后返回真实数据

- **GIVEN** Hearthstone 主菜单 + 用户已登录 Battle.net
- **WHEN** `cargo test -p hearthmirror-native get_battle_tag_integration`（运行时检测炉石进程）
- **THEN** 返回值为 `Some(BattleTag)`，`name.len() > 0`，`fullBattleTag.contains("#")`

#### Scenario: 所有方法在炉石未运行时返回 null/false/0

- **GIVEN** Hearthstone 进程不存在
- **WHEN** 通过 napi 调用任意 12 个方法
- **THEN** 对应 Promise resolve 为 `null` (Option 类型) 或 `false` (boolean) 或 `0` (number)，**永不 reject**

#### Scenario: 字段缺失（炉石版本漂移）静默返回 null + 可选 warn

- **GIVEN** mock 一个 NetCache MonoObject，但移除 `m_netCacheValues` 字段
- **WHEN** `getBattleTag` 被调用
- **THEN** 返回 `Ok(None)`；如设 `HM_LOG=1` 则 stderr 含 `field 'm_netCacheValues' not found`

### Requirement: 每个反射方法有 mock 单测

Each of the 10 reflection files (counting `game_state.rs` once for its 3 methods) SHALL have at least one `#[test]` that constructs a synthetic `MonoObject` graph with `ProcessMemory::stub()` (or equivalent in-memory fake) and asserts the expected return value. These tests SHALL run on every `cargo test` (no `#[ignore]`, no feature gate).

#### Scenario: cargo test 跑通所有 mock 单测

- **WHEN** 在 `packages/hearthmirror/native/` 下 `cargo test reflection`
- **THEN** 至少 10 个反射相关 mock 测试全部通过；运行总时长 < 5 秒

### Requirement: 集成测试运行时检测炉石进程

Integration tests for each method SHALL detect whether Hearthstone is running at test start. If not running, the test SHALL `eprintln!("SKIP: no Hearthstone process found"); return;` (or equivalent skip mechanism). When running, the test SHALL exercise the real method against the live process.

#### Scenario: 无炉石时集成测试 SKIP 而非 fail

- **GIVEN** 当前主机无 Hearthstone.exe 进程
- **WHEN** 跑 `cargo test reflection --release`
- **THEN** 集成测试段输出 `SKIP: no Hearthstone process found`，但 cargo 整体退出码为 0

### Requirement: 永不 panic 暴露面（继承 add-hearthmirror-bridge）

All 12 napi exported reflection functions SHALL satisfy `cargo clippy -- -D clippy::unwrap_used -D clippy::expect_used -D clippy::panic -D clippy::todo -D clippy::unreachable`.

#### Scenario: clippy 无违规

- **WHEN** `cargo clippy -p hearthmirror-native -- -D warnings -D clippy::unwrap_used -D clippy::expect_used -D clippy::panic -D clippy::todo -D clippy::unreachable`
- **THEN** 退出码 0

### Requirement: 修复 add-hearthmirror-bridge tasks.md 状态

After this change is merged, `openspec/changes/add-hearthmirror-bridge/tasks.md` items G.1 through G.10 (12 reflection methods) SHALL be marked `[x]` (checked) again, and any TODO comments inserted by the 2026-04-20 review SHALL be removed.

#### Scenario: G.1–G.10 全部勾选

- **WHEN** 检查 `openspec/changes/add-hearthmirror-bridge/tasks.md`
- **THEN** Phase G 下 12 个反射方法对应 checkbox 均为 `[x]`，无 `TODO: [add-hearthmirror-reflection-methods]` 注释残留
