## Why

`add-hearthmirror-bridge` 的 Phase G 标记 12 个 `IReflection` 方法已完成，但 [2026-04-20 代码审查 B1](../../../.worktrees/integrate-hearthmirror-rs/docs/superpowers/plans/2026-04-20-add-hearthmirror-bridge-code-review.md) 证实**全部为返回 `Ok(None)/Ok(false)/Ok(0)` 的桩**——桥接的全部业务价值（玩家 BattleTag / 段位 / 卡组 / 收藏 / 对局信息）目前 0% 兑现。

此 change 是 hearthmirror 桥接"从基础设施到能用"的临门一脚：把 12 个反射方法从桩升级为通过 `ServiceLocator` 链式遍历真实 Hearthstone 内存得到的实际数据。完成后，[`add-hearthmirror-renderer-status`](../add-hearthmirror-renderer-status/) 才有真实数据可消费，UI 顶部条才能显示玩家段位与 BattleTag。

依赖 [`add-hearthmirror-metadata-reader`](../add-hearthmirror-metadata-reader/) 提供的 `find_field_token` 完成字段偏移定位（部分 generic / static class 仅靠 `MonoClass.fields` 不可达）。

> 这是 [DEVELOPMENT_PLAN.md](../../../DEVELOPMENT_PLAN.md) Phase 4（Memory Bridge）的兑现 change；其前置 spike（spike 01 / 02）与基础设施（`add-hearthmirror-bridge` Phase A–F）已完成。

## What Changes

按 12 个方法 × 1 commit 的方式增量推进（每个方法独立可测、可回滚）。

- **新增字段路径研究表**：`docs/superpowers/research/2026-04-20-hearthmirror-field-paths.md`，从 [HearthSim/HearthMirror](https://github.com/HearthSim/HearthMirror) 与 [HDT 主仓](https://github.com/HearthSim/Hearthstone-Deck-Tracker) 提取每个方法的 service 入口与字段链路（namespace.class.field 全名）。**这是先写计划阶段的输出，先于任何实现 commit**。
- **改写**以下 12 个文件，从桩升级为真实实现：
  - `packages/hearthmirror/native/src/reflection/battle_tag.rs` (`getBattleTag`)
  - `packages/hearthmirror/native/src/reflection/account_id.rs` (`getAccountId`)
  - `packages/hearthmirror/native/src/reflection/match_info.rs` (`getMatchInfo`)
  - `packages/hearthmirror/native/src/reflection/medal_info.rs` (`getMedalInfo`)
  - `packages/hearthmirror/native/src/reflection/decks.rs` (`getDecks`)
  - `packages/hearthmirror/native/src/reflection/collection.rs` (`getCollection`)
  - `packages/hearthmirror/native/src/reflection/arena.rs` (`getArenaDeck`)
  - `packages/hearthmirror/native/src/reflection/battlegrounds.rs` (`getBattlegroundRatingInfo`)
  - `packages/hearthmirror/native/src/reflection/server.rs` (`getServerInfo`)
  - `packages/hearthmirror/native/src/reflection/game_state.rs`（`getGameType` + `isSpectating` + `isGameOver`）
- **新增** `MonoObject::read_object_field` / `read_string_field` / `read_int32_field` / `read_pointer_field` 等链式遍历辅助（如已存在则统一签名）
- **回归** `tasks.md` 与 README 中关于 G.1–G.10 的状态 checkbox 表述（在 `add-hearthmirror-bridge` 已被审查报告标为不完整，本 change 完成时同步勾回 ✓）
- **测试策略**：每个方法 1 个 mock 单测（构造 fake MonoObject 链）+ 1 个集成测试（炉石主菜单运行下，由 `cargo test --features hearthstone-running` 启动）

### Non-goals

- **不**重写 metadata reader（在 [`add-hearthmirror-metadata-reader`](../add-hearthmirror-metadata-reader/) 中处理）
- **不**改动并发模型（[code review I2](../../../.worktrees/integrate-hearthmirror-rs/docs/superpowers/plans/2026-04-20-add-hearthmirror-bridge-code-review.md) 的 `Mutex` + `block_on` 重构留给单独 change）
- **不**实现 12 个方法之外的扩展反射 API（如 SecretsManager / GameMgr 内部状态等）
- **不**在 renderer 接入数据（在 [`add-hearthmirror-renderer-status`](../add-hearthmirror-renderer-status/) 中处理）
- **不**改动 napi 函数签名或 TS API；只填充内部实现
- **不**修复 `iced-x86` 决策冲突（code review I1，单独 change）

## Capabilities

### New Capabilities

- `hearthmirror-reflection-methods`: 12 个 IReflection 方法的业务级行为契约（每个方法的字段链路、null fallback 语义、字段缺失降级行为）

### Modified Capabilities

（无——同上，等 `add-hearthmirror-bridge` 归档后再视情况合并）

## Impact

- **代码**：`packages/hearthmirror/native/src/reflection/` 下 10 个文件实质改写；`packages/hearthmirror/native/src/mono/object.rs` 新增辅助方法
- **依赖**：[`add-hearthmirror-metadata-reader`](../add-hearthmirror-metadata-reader/)（必须先完成）
- **测试**：每个反射文件 + 1 mock + 1 integration（feature gate）
- **文档**：`docs/superpowers/research/2026-04-20-hearthmirror-field-paths.md` 新增；`openspec/changes/add-hearthmirror-bridge/tasks.md` 中 G.1–G.10 在 archive 前回填为 `[x]`
- **解锁**：[`add-hearthmirror-renderer-status`](../add-hearthmirror-renderer-status/) 可消费真实数据
- **风险**：字段路径在炉石版本更新时会漂移；需要把 `mono/offsets.rs` 的 `bundled_unity_2021_3.json` 思路扩展到 reflection 层（见 design）
