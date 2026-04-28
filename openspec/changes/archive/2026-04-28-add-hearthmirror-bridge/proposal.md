## Why

[ADR 0001](../../../docs/adr/0001-hearthmirror-bridge.md) 选定 64 位 napi-rs 同进程方案，spike 01 与 spike 02 已经把所有核心架构风险消除：

- ✅ napi-rs 3.x + Electron 33 + Node 22 工具链兼容（spike 01）
- ✅ 64 位 Rust 跨架构标准 `ReadProcessMemory` 读 32 位炉石可行（spike 01）
- ✅ Mono 运行时可定位（`mono-2.0-bdwgc.dll` + PE 导出表手写解析 + `mono_get_root_domain` 字节模式匹配）（spike 02）
- ✅ MonoDomain.loaded_images 偏移与 §7.2 一致；domain_assemblies 已知漂移，必须探测（spike 02）

是时候把 spike 代码升级为产品级 `packages/hearthmirror/`，让 UI 能拿到**真实的炉石 BattleTag、段位、卡牌收藏、对局信息**。当前 `Dashboard.tsx` 顶部的 "Game Running" / "Legend" / "PlayerOne" 等都是写死的 mock，本 change 完成后能切换到实时数据，这是从"骨架 + 真卡牌数据库"到"能看的炉石记牌器"的**关键转折点**。

## What Changes

新建两个包 + 一个 UI 集成示范：

- **`packages/hearthmirror/native/`**（Rust crate，napi-rs cdylib）
  - 沿用 spike 02 的进程/PE/反汇编经验
  - **新增**：偏移量探测（dump-and-validate 风格）、ECMA-335 disk metadata 读取、List/Dictionary 集合遍历、ServiceLocator
  - **新增**：12 个核心 IReflection 方法的 native 部分（在 Rust 端把 Mono 对象图遍历组装成 plain struct 返回 napi-rs）
- **`packages/hearthmirror/`**（TypeScript 包）
  - 高层 API：`HearthMirror` 类（生命周期 + 12 个 async 方法）
  - 类型定义：`Card` / `Deck` / `Collection` / `MatchInfo` / `MatchPlayer` / `BattleTag` / `AccountId` / `MedalInfo` / `MedalInfoData` / `ArenaInfo` / `BattlegroundsLobbyInfo` / `GameServerInfo` 等
  - 错误模型：`MirrorError` + `MirrorErrorCode` 枚举
- **`apps/desktop`** IPC + UI 集成
  - `apps/desktop/src/main/hearthmirror.ts` — 主进程会话管理（lazy connect + 自动重连 + 进程退出感知）
  - `apps/desktop/src/main/ipc.ts` — 新增 `hearthmirror:*` 通道（13 个：1 个 lifecycle + 12 个方法）
  - `apps/desktop/src/preload/index.ts` — 暴露 `window.hdt.hearthmirror.*` 命名空间
  - `apps/desktop/src/renderer/src/components/Dashboard.tsx` — 顶部 PlayerOne / Legend / Game Running 替换为真实 BattleTag / MedalInfo / `isAlive()`，mock fallback 保留

### 12 个核心 IReflection 方法（HearthSim HearthMirror 同名同义）

| # | Method | 业务用途 |
|---|---|---|
| 1 | `getBattleTag()` | 玩家 BattleTag（如 `Player#12345`） |
| 2 | `getAccountId()` | 暴雪账号 ID（hi/lo 64-bit pair） |
| 3 | `getGameType()` | 当前对局类型（Ranked/Casual/Arena/...） |
| 4 | `isSpectating()` | 当前是否在观战 |
| 5 | `isGameOver()` | 当前对局是否已结束 |
| 6 | `getMatchInfo()` | 双方 player 信息 + missionId/gameType/formatType |
| 7 | `getMedalInfo()` | 段位信息（标准/狂野/经典/扭曲四个赛季） |
| 8 | `getDecks()` | 已保存的所有卡组列表 |
| 9 | `getCollection()` | 卡牌收藏（dbfId + count + premium） |
| 10 | `getArenaDeck()` | 当前竞技场卡组（仅竞技场模式） |
| 11 | `getBattlegroundRatingInfo()` | 酒馆战棋段位 |
| 12 | `getServerInfo()` | 当前对局所在游戏服务器 |

### 渐进的内部 8 个 Phase（仅供实施排序，不切多 change）

apply 阶段按这个顺序推进，每个 Phase 完成后单独 commit，方便万一中途回滚：

| Phase | 内容 | 验证 |
|---|---|---|
| **A. Foundation** | `RemotePtr<u32>`、`OwnedProcessHandle`、`ScryError`、`ProcessMemory`、所有 unsafe 调用包成 `Result` | 单元测试用本进程内存验证读基础类型 |
| **B. Mono locate** | 沿用 spike 02：找 mono-2.0-bdwgc.dll → PE export → mono_get_root_domain → `MonoDomain*` | 集成测试需炉石主菜单 |
| **C. 偏移探测** | `MonoDomain` / `MonoImage` / `MonoClass` / `MonoClassField` 字段位置动态发现 | dump 0x100 字节做 pointer chasing |
| **D. ECMA-335 metadata** | disk 读 `Assembly-CSharp.dll` → `#~` stream → TypeDef / Field 表 → 类全名查找 | 单元测试读真实 Assembly-CSharp.dll |
| **E. 集合遍历** | `List<T>` (`_items` + `_size`)、`Dictionary<K,V>` (`_entries` + `_count`)、炉石自定义 `Map<K,V>` | mock 内存验证 |
| **F. ServiceLocator** | `Blizzard.T5.Services.ServiceManager.s_runtimeServices` 遍历 | 集成测试拿到 NetCache / NetworkManager 的 service 对象 |
| **G. 12 个 IReflection 方法** | 每个方法都按 spec 规定的签名实现，永不 throw，返回 `Result<T>` | 集成测试每方法单独验证 |
| **H. TypeScript API + IPC + UI 集成** | `HearthMirror` class、IPC handler、preload bridge、Dashboard 真实数据 | 主窗口顶部显示真实 BattleTag |

### Non-goals（本 change **不**做的事）

- ❌ 剩余 50+ 方法（`getFullCollection` 含 dust/gold、`getArenaState`、`getBattlegroundsHeroOptions`、`getBattlegroundsLobbyInfo`、`getMercenaries*`、`getSceneMgr*`、`getDeckPicker*`、`getOpponentBoard`、`getDiscover`、`getMulligan`、`getBrawlInfo`、`getDungeonInfo`、`getSeasonEndInfo`、`getRewardTrackData`、`getAchievements*` 等）—— 留给 `add-hearthmirror-extra-methods` change（每方法 ≈ 50–200 行 native + 一个类型，等正式有需求时增量做）。
- ❌ 不实现自动重连 watchdog（炉石进程消失时 IPC 仍 reject 即可，不主动重试）。
- ❌ 不实现内存页缓存 (`cache.rs` in Rewrite_Design.md) —— 当前 ReadProcessMemory 性能足够，过早优化。
- ❌ 不实现 prebuild 二进制分发（CI 矩阵）—— source-only + postinstall `napi build`，prebuild 留作 `add-hearthmirror-prebuilds` 独立 change。
- ❌ 不实现版本适配的"已知偏移量表"机制 —— 每次启动都做一次偏移探测（< 100 ms 一次性开销），不维护 `offsets.json`。
- ❌ 不实现 IL2CPP 兼容（炉石暂未迁移）。
- ❌ 不实现 e2e 测试（Playwright 等）—— 业务方法的集成测试需要炉石客户端，自动化不现实，靠人工 smoke + Phase H 的 dev mode 验证。
- ❌ 不集成到 `Decklist.tsx` / `Stats.tsx` / `Collection.tsx`（这些视图的真实数据流是 hearthwatcher + game-state 的事，不是 hearthmirror 单独能解决）—— 仅集成到 `Dashboard.tsx` 顶部 3 个字段（BattleTag / 段位 / Game Running 状态）作为示范。
- ❌ 不动 `Rewrite_Design.md`（已经在 ADR 0001 顶部 banner 标 superseded；本 change 只引用其 §7.2 偏移表作为参考）。

## Capabilities

### New Capabilities

- `hearthmirror-native`：Rust native crate 契约。包含 8 项 binding constraints（来自 ADR 0001 + spike 02 经验）：
  - `RemotePtr(u32)` newtype 强制远程指针类型隔离
  - 所有 unsafe API 包成 `Result<T, ScryError>`，永不 panic（CI clippy 门禁强制）
  - `#[napi]` 暴露面全部 `napi::Result<T>`
  - mono dll 名字 fallback 链 (`mono-2.0-bdwgc.dll` → `mono-2.0-sgen.dll` → `mono-2.0-boehm.dll`)
  - MonoDomain / MonoImage / MonoClass / MonoClassField 偏移量必须探测，禁止硬编码 §7.2
  - ECMA-335 元数据通过 `pelite` 读取磁盘 `Assembly-CSharp.dll`（不再手写 PE 解析）
  - List/Dictionary/Map 遍历必须有最大元素数限制（防止环引用导致死循环）
  - ServiceLocator 失败时返回 `None`，不 throw
- `hearthmirror-api`：TypeScript 高层 API 契约。`HearthMirror` 类生命周期 + 12 个核心方法签名 + `MirrorError` 错误模型。
- `hearthmirror-ipc`：主/渲染进程之间的契约。`window.hdt.hearthmirror.*` 暴露面（1 个 lifecycle + 12 个方法）+ 安全模型（仍是显式通道，无任意函数调用）+ 失败语义（IPC reject 一定在 renderer 侧成为 Promise rejection，不是 throw 不是 abort）。
- `hearthmirror-ui-integration`：渲染端 Dashboard 顶部 3 个字段切换到真实 hearthmirror 数据，mock fallback 保留。

### Modified Capabilities

- `desktop-shell`（来自 add-monorepo-skeleton）：preload 暴露面再扩展一个命名空间 `hdt.hearthmirror.*`。安全约束保持不变。
- `cards-ipc`（来自 add-card-database）：无功能变更，但 hearthmirror 的 IPC handler 与 cards 共享 main process，IPC handler 列表由 5 个增至 18 个。

## Impact

- **新建包**：`packages/hearthmirror/native/`（约 2000–3000 行 Rust）+ `packages/hearthmirror/`（约 800–1200 行 TypeScript + types）
- **新建文件**：约 30 个 Rust 模块文件 + 约 10 个 TS 文件
- **修改文件**：~6 个（apps/desktop main/ipc/preload/cards.ts、env.d.ts、Dashboard.tsx、package.json、根 package.json）
- **依赖**：
  - Rust 端新增 `pelite ^0.10`（PE 解析）、`uuid ^1`（如果 ServiceLocator 需要 GUID 比较；可能不需要）。**不**引入 `iced-x86`（spike 02 验证字节模式够用）。
  - TS 端无新依赖。
- **CI**：`.github/workflows/ci.yml` 在 `pnpm install` 后增加 `napi build` 步骤（在 hearthmirror/native 包内），约 30 秒额外时间。**不**做 prebuild 矩阵。
- **测试**：约 30 个新单元测试（loader / metadata / collections / 偏移探测 / 集合 / 12 方法的 mock 测试）+ 8 个集成测试（需要炉石主菜单运行）。
- **运行时**：主进程启动时**不**主动连接 hearthmirror（lazy on first IPC call），首次 IPC 触发约 100 ms 探测开销，后续单方法调用 < 5 ms（spike 02 推算）。
- **依赖关系**：本 change 完成后，`add-hearthwatcher` 和 `add-overlay-window` 都可以并行进展（hearthmirror 提供它们需要的"我是谁/对手是谁/段位多少"等基础信息）。
- **风险与缓解**：见 design.md 的 Risks 表。最大风险是"工作量大于预期" —— 缓解策略是内部 8 个 Phase 严格独立 commit，每个 Phase 跑完都先 push 一次，万一中途阻塞可以从任一 Phase 重新启动。
