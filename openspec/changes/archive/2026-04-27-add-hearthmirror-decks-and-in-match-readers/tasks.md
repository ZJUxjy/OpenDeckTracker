## 1. R-17 完结：getDecks via custom_map

- [x] 1.1 在 `src/reflection/decks.rs` 顶部新增 `read_boxed_int` 私有
      helper（返回 `i32`，常量 `BOXED_INT_VALUE_OFFSET: usize = 0x10`，
      doc-comment 引用上游 `D:\code\hearthmirror-rs/hearthmirror/crates/
      hm-rpc/src/handler.rs::read_slot_count` + `debug_read_raw` 的探测
      记录）
- [x] 1.2 把 `decks.rs` 中遍历 `m_decks` 的 `dict::iter_entries(...)` 调用
      替换成 `crate::collections::custom_map::iter_entries(mem, map_ptr,
      MAX_DECK_BUCKETS)`；按 `value_ptr.is_null()` 跳过空 slot
- [x] 1.3 重写 `read_one_deck`：按 `field_paths.rs` 新加的
      `FLD_DECK_*` 常量读 8 个顶层字段（id/name/hero/format/type/season/
      cardback/createDate），并遍历 `m_slots: List<CollectionDeckSlot>`
      生成 `cards`；count 走 1.1 的 helper
- [x] 1.4 `field_paths.rs` 新增 `CollectionDeck` / `CollectionDeckSlot`
      字段名常量（共 ~10 个），保持 `FLD_DECK_*` 命名前缀
- [x] 1.5 单元测试：mock `MonoRuntime` + 三个 `CollectionDeckSlot` fixture
      验证 `read_boxed_int` 的 NULL→1 分支 + 真实 box→真值分支
- [x] 1.6 `cargo build --release --target i686-pc-windows-msvc` 通过
- [x] 1.7 实测：`cargo run --release --target i686-pc-windows-msvc
      --example dump_reflection`，要求 `getDecks` 从 `error overflow`
      变成 `ok decks=N`（N = 用户当前卡组数，应 > 0）
- [x] 1.8 提交 `feat(hearthmirror): close R-17 — getDecks via custom_map
      with boxed-int slot count`

## 2. getEditedDeck

- [x] 2.1 新文件 `src/reflection/edited_deck.rs`：复用 `decks.rs` 的
      `read_one_deck`（提到 `pub(super)` 或 module-shared util）
- [x] 2.2 走 `CollectionManager.s_instance.m_EditedDeck` 静态链；NULL →
      `Ok(None)`
- [x] 2.3 `lib.rs` 注册 `#[napi]` async export `getEditedDeck`
- [x] 2.4 `mod.rs` 注册 `pub mod edited_deck;`
- [x] 2.5 `dump_reflection` 例程添加 `getEditedDeck` 一栏（显示 deck name +
      card count，或 `null`）
- [x] 2.6 实测：在游戏内打开 "我的收藏" → 选中任意卡组 → `dump_reflection`
      应显示该卡组；返回主菜单 → 应显示 `null`

## 3. 修复 getGameType（ServiceLocator 路由）

- [x] 3.1 改写 `src/reflection/game_state.rs`（或拆出 `game_type.rs`）
      的 `getGameType`：通过 `runtime.get_service("GameMgr")` 拿
      MonoObject，读 `m_gameType` / `m_formatType` / `m_missionId`
      三个 i32（缺则各自 `null`）
- [x] 3.2 返回结构改为 `{ game_type: Option<i32>, format_type:
      Option<i32>, mission_id: Option<i32> }`（与 spec 对齐）
- [x] 3.3 实测：在主菜单 + 在对局中各跑一次 `dump_reflection`，确认
      字段从 `null/0` 变为非空

## 4. 修复 getMatchInfo（GameMgr + GameState 聚合）

- [x] 4.1 在 `src/reflection/match_info.rs` 重写 `get_match_info_internal`：
      - GameMgr 部分：复用 task 3 的 ServiceLocator 路径
      - GameState 部分：通过 `entity::read_game_state_singleton`
        + `entity::iter_player_map`（task 6 提供）
- [x] 4.2 `MatchPlayerResult` schema 与 spec 对齐：
      `id, name, side, standardRank=0, standardLegendRank=0, ...,
      cardbackId`（rank 字段保留 0 占位，TODO 注释指向后续 MedalInfo 联动）
- [x] 4.3 `split_local_opposing` helper：按 `m_local: bool` 分配 friendly
      vs opposing
- [x] 4.4 实测：在对局中跑 `dump_reflection`，`getMatchInfo` 应输出双方
      玩家的真实昵称 + side

## 5. 修复 getServerInfo（inline NetworkState struct walker）

- [x] 5.1 新增 `struct_field_addr(rt, host_addr, struct_offset,
      struct_class, field_name)` helper（放 `src/reflection/server.rs`
      私有，或 `src/mono/object.rs` 公开 — 按设计 D4 默认私有）
- [x] 5.2 在 `field_paths.rs` 加 `Network` / `NetworkState` /
      `GameServerInfo` 字段名常量（含全部 9 个 `<X>k__BackingField`）
- [x] 5.3 改写 `server.rs::get_server_info_internal`：
      - `runtime.get_service("Network")` → 拿 Network 对象
      - 在 Network 类上 `find_field("m_state")` 拿 struct offset
      - `find_class("Network+NetworkState")`，失败 fallback 到
        `find_class("NetworkState")`
      - 用 `struct_field_addr` 读 `<LastGameServerInfo>k__BackingField`
        的指针；NULL → 整体 `Ok(None)`
      - 反之 materialise 为 `GameServerInfo` MonoObject 读 9 个字段
- [x] 5.4 单元测试 `nested_class_resolution_fallback`：mock find_class
      使第一个名字失败、第二个成功 → 助手最终成功
- [x] 5.5 实测：在对局中跑 `dump_reflection`，`getServerInfo.address`
      应是真实 IP 字符串

## 6. 共享基础设施：tags.rs + entity.rs

- [x] 6.1 新文件 `src/reflection/tags.rs`：4 个子模块 `tags` / `zone` /
      `card_type` / `choice_type`，各自 `pub const` 列表与上游
      `protocol.rs::tags|zone|card_type|choice_type` 完全一致
- [x] 6.2 文件级 doc-comment 注明每组常量来自的 C# 枚举
      （`HearthDb.Enums.GameTag` / `TAG_ZONE` / `CardType` /
      `ChoiceType`）
- [x] 6.3 新文件 `src/reflection/entity.rs`，按设计 D1 暴露 6 个公开函数：
      `read_game_state_singleton(rt) -> Result<Option<MonoObject>>`,
      `iter_entity_map(rt, gs) -> Result<Vec<(i32, MonoObject)>>`,
      `iter_player_map(rt, gs) -> Result<Vec<(i32, MonoObject)>>`
      （供 task 4），
      `discover_player_ids(rt, gs) -> (Option<i32>, Option<i32>)`,
      `read_entity_tag(rt, entity, tag_key) -> Result<i32>`,
      `read_entity_controller(rt, entity) -> Result<i32>`,
      `read_entity_card_id(rt, entity) -> String`,
      `build_entity_result(rt, entity, id) -> Result<EntityResult>`
- [x] 6.4 `read_entity_tag` 的双 fallback：先试 `<Tags>k__BackingField`，
      NULL 则试 `m_tags`；TagMap → `m_values` → `Dictionary<int,int>`
      用 `dict::iter_entries(entry_size=16)` 遍历
- [x] 6.5 `iter_entity_map` 用 `custom_map::iter_entries`，跳 NULL
      value，把 `key.raw()` 当 entity_id (i32)
- [x] 6.6 `discover_player_ids` 走 `m_playerMap`，按 `Player.m_local: bool`
      分配 friendly/opposing
- [x] 6.7 `mod.rs` 注册 `pub mod tags; pub mod entity;`
- [x] 6.8 `field_paths.rs` 新增 `Player` / `Entity` / `EntityBase` /
      `TagMap` 字段名常量（`m_local`, `m_id`, `m_name`, `m_cardback`,
      `<Tags>k__BackingField`, `m_tags`, `m_values`, `<CardID>k__BackingField`,
      `m_cardIdInternal`, `m_realTimeZone`, `m_realTimeZonePosition`,
      `m_realTimeAttack`, `m_realTimeHealth`, `m_realTimeDamage`,
      `m_entityMap`, `m_playerMap`, `m_choicesMap`）
- [x] 6.9 单元测试 `entity::tests::tag_dict_lookup_finds_value` —
      fixture 化的 Dictionary，`read_entity_tag` 找到给定 key
- [x] 6.10 单元测试 `entity::tests::tag_dict_missing_returns_zero`

## 7. getBoardState

- [x] 7.1 新文件 `src/reflection/board_state.rs`：返回
      `{ friendly: Vec<EntityResult>, opposing: Vec<EntityResult> }`
- [x] 7.2 实现按设计 D1 走 entity.rs 的助手；过滤
      `zone == PLAY` && `controller == X` && `cardtype != ENCHANTMENT`
- [x] 7.3 排序：每个数组按 `zone_position` 升序
- [x] 7.4 `lib.rs` + `mod.rs` 注册
- [x] 7.5 实测：在对局中（友方上场两个随从）跑 `dump_reflection`，
      `getBoardState.friendly.length === 2`，且都不含附魔

## 8. getHandState

- [x] 8.1 新文件 `src/reflection/hand_state.rs`：
      `{ friendly_hand: Vec<HandCard>, opposing_hand_count: i32 }`
- [x] 8.2 friendly 报全字段，opposing 只报 count（信息泄露规避，按 spec D5）
- [x] 8.3 `lib.rs` + `mod.rs` 注册
- [x] 8.4 实测：起手 mulligan 后，`friendly_hand.length` 与
      `opposing_hand_count` 之和 == 9 或 10（炉石标准）

## 9. getDeckState

- [x] 9.1 新文件 `src/reflection/deck_state.rs`：
      `{ friendly_deck: Vec<InMatchDeckCard>, opposing_deck_count: i32 }`
- [x] 9.2 friendly 报全字段（自己卡组本就已知）
- [x] 9.3 `lib.rs` + `mod.rs` 注册
- [x] 9.4 实测：开局直接跑，`friendly_deck.length` 应为 30 - 起手张数

## 10. getOpponentSecrets

- [x] 10.1 新文件 `src/reflection/opponent_secrets.rs`：
      `{ secrets: Vec<SecretEntity>, count: i32 }`
- [x] 10.2 报全字段（含 cardId — HDT 历史行为，spec 已注明）
- [x] 10.3 `lib.rs` + `mod.rs` 注册
- [x] 10.4 实测：让对手出 2 张奥秘 → `count == 2`

## 11. getChoices

- [x] 11.1 新文件 `src/reflection/choices.rs`：
      `{ mulligan: Option<ChoiceGroup>, general: Option<ChoiceGroup> }`
- [x] 11.2 遍历 `GameState.m_choicesMap`，按 `<ChoiceType>k__BackingField`
      分发到 mulligan/general 槽
- [x] 11.3 `<Entities>k__BackingField` 当 `List<int>` 处理：
      取 `_items` 数组指针 + `_size`，按 `array_data + i*4` 读 i32
      （NOT pointer），再去 `m_entityMap` 反查 cardId
- [x] 11.4 添加 `resolve_entity_card_id(rt, gs, target_id) -> String`
      助手到 entity.rs（line 1847-1859 上游版本）
- [x] 11.5 `lib.rs` + `mod.rs` 注册
- [x] 11.6 实测：触发"发现"效果后跑 → `general.cards.length === 3`

## 12. isMulligan

- [x] 12.1 新文件 `src/reflection/mulligan.rs`：
      `{ mulligan: Option<bool> }`
- [x] 12.2 走 `MulliganManager.s_instance.mulliganChooseBanner`
      静态链；非 NULL = true，NULL = false，singleton 不存在 = None
- [x] 12.3 `field_paths.rs` 加 `CLS_MULLIGAN_MGR` + `FLD_MULLIGAN_BANNER`
- [x] 12.4 `lib.rs` + `mod.rs` 注册
- [x] 12.5 实测：在 mulligan 阶段跑 → `true`；其他时刻 → `false` 或 `null`

## 13. dump_reflection 例程升级

- [x] 13.1 添加 7 个新方法（getEditedDeck, getBoardState, getHandState,
      getDeckState, getOpponentSecrets, getChoices, isMulligan）的输出
      格式化分支
- [x] 13.2 修正 4 个老方法（getDecks, getMatchInfo, getGameType,
      getServerInfo）的格式化输出（之前是 `null`/`error` 占位）
- [x] 13.3 在末尾追加 "X OK / Y null / Z ERR" 总计行（直接计算，不依赖
      grep 后处理）

## 14. 实战验证（多场景）

- [x] 14.1 **场景 A：主菜单 / 已登录** — 跑 `dump_reflection`
      期望：`getBattleTag/AccountId/MedalInfo/Collection/Decks/EditedDeck=null/
      isSpectating/isGameOver/getGameType/MatchInfo/ServerInfo/isMulligan` 大部分有值；
      5 个 in-match 全 null
- [x] 14.2 **场景 B：编辑卡组中** — 进入"我的收藏"打开任意卡组
      期望：`getEditedDeck` 返回该卡组完整 `cards`；其余主菜单态保持
- [x] 14.3 **场景 C：天梯对局开局 / mulligan 阶段**
      期望：`isMulligan=true`，`getChoices.mulligan` 有 3-4 张牌，
      `getBoardState/getHandState/getDeckState/getOpponentSecrets` 都有
      合理初始值（手牌 3-4，牌库 26-27，场上 0，奥秘 0）
- [x] 14.4 **场景 D：天梯对局中盘**
      期望：`getBoardState` 双方场上随从数正确，
      `getHandState.friendly_hand` 真实手牌 + `opposing_hand_count` 正确，
      `getMatchInfo.localPlayer.name == 我的BattleTag`
- [x] 14.5 把 4 个场景的 `dump_reflection` 输出整理到
      `docs/spikes/0003-hearthmirror-reflection-runtime-validation.md`
      `## Run 11` 段，附状态对比表（Run 10 → Run 11）+
      "13 OK / 0 ERR — Phase 7 fully closed" 总结

## 15. 单元测试 + lint 收口

- [x] 15.1 `cargo test --release --target i686-pc-windows-msvc --lib` —
      新增的 entity 模块测试 + boxed_int 测试 + nested_class fallback
      测试全过；总用例数从 76 上升到 ~84
- [x] 15.2 `cargo clippy --release --target i686-pc-windows-msvc --lib --
      -D warnings` 通过
- [x] 15.3 `npx openspec validate add-hearthmirror-decks-and-in-match-readers
      --strict` 通过

## 16. 提交 + OpenSpec 收口

- [x] 16.1 拆 commit（推荐 4 个）：
      - `feat(hearthmirror): close R-17 — getDecks via custom_map`
      - `feat(hearthmirror): wire getMatchInfo/getGameType/getServerInfo
        through ServiceLocator`
      - `feat(hearthmirror): in-match observability (board/hand/deck/
        secrets/choices/mulligan + entity/tag infrastructure)`
      - `docs(spike-0003,openspec): record Run 11 — 13 OK after Phase 5+7`
      **RESOLVED: all implementation already committed on main (a811273, ca30358, b004386, b5f4365).**
- [x] 16.2 archive `add-hearthmirror-decks-and-in-match-readers`
      （`openspec-archive-change` 流程，独立于 R-16 的归档轨道）
