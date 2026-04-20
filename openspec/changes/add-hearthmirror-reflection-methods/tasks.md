## 1. 字段路径研究（先于代码）

- [x] 1.1 fork / clone [HearthSim/HearthMirror](https://github.com/HearthSim/HearthMirror)，记录 `Reflection.cs` 当前 commit SHA
- [x] 1.2 创建 `docs/superpowers/research/2026-04-20-hearthmirror-field-paths.md`，模板：每方法 4 段（C# source / chain / collections / verified-against）
- [x] 1.3 填写 `getBattleTag` 字段链路：`ServiceManager → NetCache → m_netCacheValues[NetCacheBattleTag] → BattleTag`（参考 `Reflection.GetBattleTag`）
- [x] 1.4 填写 `getAccountId`：`NetCache → m_accountId → hi/lo`
- [x] 1.5 填写 `getMedalInfo`：`NetCache → m_netCacheValues[NetCacheMedalInfo] → standard/wild/classic/twist`
- [x] 1.6 填写 `getMatchInfo`：`GameMgr.s_instance → m_lastMatchInfo`（含 player1/player2/missionId/gameType/formatType）
- [x] 1.7 填写 `getGameType` / `isSpectating` / `isGameOver`：`GameState.Get() → m_gameType / m_isSpectator / m_gameOver`
- [x] 1.8 填写 `getDecks`：`CollectionManager → GetDecks() → List<Deck>`
- [x] 1.9 填写 `getCollection`：`CollectionManager → GetAccountCards() → List<NetCacheCard>`
- [x] 1.10 填写 `getArenaDeck`：`DraftManager.s_instance → GetDraftDeck()`
- [x] 1.11 填写 `getBattlegroundRatingInfo`：`BaconRatingMgr → m_lastRatingResponse`
- [x] 1.12 填写 `getServerInfo`：`Network.s_instance → m_currentServerInfo`
- [x] 1.13 提交：`docs(hearthmirror): record field paths for 12 IReflection methods`

## 2. mono::object 链式 helper（TDD）

- [x] 2.1 在 `packages/hearthmirror/native/src/mono/object.rs` 新增 6 个 helper（`read_string_field` / `read_int32_field` / `read_int64_field` / `read_bool_field` / `read_object_field` / `read_pointer_field`）的签名（占位返回 `unimplemented!()`）
- [x] 2.2 在 `mono/object.rs` 加 `#[cfg(test)] mod tests`，写 6 个失败测试覆盖：每个 helper 各 1 个 happy path + 1 个 NULL/missing 场景
- [x] 2.3 跑 `cargo test -p hearthmirror-native mono::object`，确认测试 fail
- [x] 2.4 实现 6 个 helper：用 `MonoClass::field_offset(field_name)` 找偏移；fallback 走 `MetadataReader::find_field_token`（如 metadata change 已 merge）
- [x] 2.5 跑测试通过；clippy 0 错误
- [x] 2.6 提交：`feat(hearthmirror): add MonoObject chained field readers`

## 3. 不依赖 metadata 的 8 个反射方法

- [x] 3.1 改写 `reflection/battle_tag.rs`：mock 单测先；实现走 ServiceLocator → NetCache → BattleTag 链；通过；提交
- [x] 3.2 改写 `reflection/account_id.rs`：同上
- [x] 3.3 改写 `reflection/medal_info.rs`：同上（注意 4 个赛季的子 MonoObject）
- [x] 3.4 改写 `reflection/game_state.rs`：3 个方法（`getGameType` / `isSpectating` / `isGameOver`）共享 GameState 解析；mock 单测覆盖三种状态
- [x] 3.5 改写 `reflection/match_info.rs`：MatchInfo + 2 个 MatchPlayer 子对象；mock 单测
- [x] 3.6 改写 `reflection/server.rs`：mock 单测
- [x] 3.7 改写 `reflection/battlegrounds.rs`：mock 单测
- [x] 3.8 改写 `reflection/arena.rs`：mock 单测
- [x] 3.9 跑 `cargo test -p hearthmirror-native reflection`，全绿
- [x] 3.10 提交：每方法 1 commit，message 格式 `feat(hearthmirror): implement <methodName> via service locator chain`

## 4. 依赖 metadata 的 4 个方法（等 add-hearthmirror-metadata-reader merge）

- [x] 4.1 等 [`add-hearthmirror-metadata-reader`](../add-hearthmirror-metadata-reader/) 完成并 archive
- [x] 4.2 改写 `reflection/decks.rs`：用 `MetadataReader::find_field_token` 定位 `Deck.Cards` (generic List`1) 字段；mock + iter list；提交
- [x] 4.3 改写 `reflection/collection.rs`：同上 NetCacheCard List；提交
- [x] 4.4 验证 `arena.rs` / `match_info.rs` 中的 generic 字段路径，必要时补 metadata fallback；提交
- [x] 4.5 跑 `cargo test -p hearthmirror-native reflection`，全绿

## 5. 集成测试

- [x] 5.1 在 `packages/hearthmirror/native/tests/integration_reflection.rs` 创建文件
- [x] 5.2 实现 `fn skip_if_no_hearthstone() -> bool`：枚举 32 位 process 名匹配 `Hearthstone.exe`，无则 println skip + return false
- [x] 5.3 为 12 个方法各加 1 个 `#[test]`，开头 `if !skip_if_no_hearthstone() { return; }`，调用对应 napi 函数（through `MonoRuntime::init() + service_locator + reflection::*`），断言返回值非桩
- [x] 5.4 在无炉石环境跑 `cargo test --test integration_reflection`，确认输出 `SKIP: no Hearthstone process found` × 12 且退出码 0
- [x] 5.5 提交：`test(hearthmirror): add integration tests for 12 reflection methods`

## 6. 验证 + 验收

- [x] 6.1 跑 `cargo test -p hearthmirror-native --all-features`，全绿
- [x] 6.2 跑 `cargo clippy -p hearthmirror-native -- -D warnings -D clippy::unwrap_used -D clippy::expect_used -D clippy::panic -D clippy::todo -D clippy::unreachable`，0 错误
- [x] 6.3 跑 `pnpm typecheck`、`pnpm lint`、`pnpm test`，全绿
- [x] 6.4 修订 `openspec/changes/add-hearthmirror-bridge/tasks.md`：把 G.1–G.10 的 checkbox 重新勾上 `[x]`，删除审查报告插入的 `TODO` 注释
- [x] 6.5 在 `openspec/changes/.NEXT.md` 把 `add-hearthmirror-reflection-methods` 状态标 `✓`
- [x] 6.6 跑 `openspec validate add-hearthmirror-reflection-methods --strict`，0 错误
- [x] 6.7 提交：`docs(hearthmirror): finalize reflection methods, restore tasks.md`

## 7. （可选）本地端到端验证

- [ ] 7.1 在有炉石的本地机上跑 `cargo test --test integration_reflection`，记录通过率与每方法耗时（写入 `docs/spikes/0003-hearthmirror-reflection-validation.md`）
- [ ] 7.2 启动 `pnpm dev`，开 DevTools console 跑 `await window.hdt.hearthmirror.getBattleTag()`，确认非 null
