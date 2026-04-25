# HDT.js 开发方向分析 — 基于原版 HDT 架构逆向

> 本文档通过逆向分析原版 Hearthstone Deck Tracker (C#) 的核心架构，明确其记录构筑对战模式下牌库、战场信息的完整机制，并与 HDT.js 当前开发进度做对比，给出下一阶段的开发路线建议。

---

## 1. 原版 HDT 核心架构

### 1.1 双源数据管道

原版 HDT 通过**两个互补的数据源**构建完整的记牌器体验：

```
                    ┌─────────────────────────────────────┐
                    │         Hearthstone.exe              │
                    └──────────┬──────────┬───────────────┘
                               │          │
                  ┌────────────┘          └────────────┐
                  ▼                                    ▼
    ┌──────────────────────┐             ┌──────────────────────┐
    │   日志文件解析        │             │   内存读取            │
    │   (HearthWatcher)    │             │   (HearthMirror)     │
    │                      │             │                      │
    │  Power.log ──────────┼── 主力      │  匹配信息 ✓          │
    │  LoadingScreen.log ──┼── 场景      │  游戏类型 ✓          │
    │  Arena.log           │             │  段位/排名 ✓         │
    │                      │             │  保存的卡组 ✓        │
    │  • 实体创建/标签变更  │             │  卡牌收藏 ✓          │
    │  • 抽牌/出牌/死亡    │             │  服务器信息 ✓        │
    │  • 区间转换(手/场/墓) │             │  场景/选牌状态 ✓     │
    │  • 回合/换牌追踪     │             │  BattleTag ✓         │
    └──────────┬───────────┘             └──────────┬───────────┘
               │                                    │
               ▼                                    ▼
    ┌──────────────────────┐             ┌──────────────────────┐
    │  GameV2.Entities     │             │  GameV2.MatchInfo    │
    │  Dictionary<int,     │             │  GameV2.CurrentGameType│
    │          Entity>     │             │  GameV2.CurrentFormat │
    │                      │             │  DeckList.ActiveDeck  │
    │  每个 Entity 有:     │             │                      │
    │  • Id, CardId        │             │  用于:               │
    │  • Tags (GameTag→int)│             │  • 识别当前卡组      │
    │  • Zone (手牌/场上   │             │  • 匹配元数据        │
    │         /牌库/墓地)  │             │  • 段位显示          │
    │  • Controller (谁)   │             │  • 卡组同步          │
    └──────────┬───────────┘             └──────────┬───────────┘
               │                                    │
               └────────────┬───────────────────────┘
                            ▼
                ┌──────────────────────┐
                │     Overlay / UI     │
                │                      │
                │  • 我的牌库剩余      │
                │  • 对手已出牌        │
                │  • 回合计时器        │
                │  • 胜率显示          │
                └──────────────────────┘
```

### 1.2 日志文件解析（核心数据源）

原版 HDT 的 `LogWatcherManager` 监听以下日志文件：

| 日志文件 | 内容 | 用途 |
|----------|------|------|
| `Power.log` | 所有游戏动作（出牌、攻击、抽牌、死亡、标签变更等） | **核心** — 游戏状态追踪的主要来源 |
| `LoadingScreen.log` | 场景切换（主菜单、构筑选牌、对战中、结算等） | 游戏阶段检测 |
| `Arena.log` | 竞技场选牌事件 | 竞技场追踪 |
| `Achievements.log` | 成就系统 | 可选 |

其中 **Power.log 是整个记牌器的灵魂**，它包含了构筑对战中所有牌局事件的完整时间线。

#### 1.2.1 日志读取架构

```
LogFileWatcher (后台线程, 100ms 轮询)
    │
    │  每次轮询: 读取自上次 offset 以来新增的行
    │  解析为 LogLine { Namespace, Time, Line, LineContent }
    │  应用 namespace 过滤器 (StartsWith / Contains)
    │
    ▼
LogWatcher (合并多个 LogFileWatcher, 按时间戳排序)
    │
    │  触发 OnNewLines 事件
    │
    ▼
LogWatcherManager.OnNewLines()
    │
    ├── Namespace == "Power"        → PowerHandler.Handle()
    ├── Namespace == "Arena"        → ArenaHandler.Handle()
    ├── Namespace == "LoadingScreen"→ LoadingScreenHandler.Handle()
    └── GameState.DebugPrintGame    → GameInfoHandler.Handle()
```

#### 1.2.2 Power.log 关键解析模式

`PowerHandler` 通过编译后的正则表达式匹配以下模式：

| 日志模式 | 事件 | 作用 |
|----------|------|------|
| `GameEntity EntityID=X` | CREATE_GAME | 创建游戏实体 |
| `Player EntityID=X PlayerID=Y` | PLAYER_ENTITY | 创建玩家实体 |
| `FULL_ENTITY - Updating id=X CardID=Z` | 实体创建 | 创建带卡牌 ID 的实体 |
| `SHOW_ENTITY` | 实体揭示 | 揭示隐藏的对手牌（出牌时） |
| `HIDE_ENTITY` | 实体隐藏 | 隐藏已知卡牌 |
| `CHANGE_ENTITY` | 实体变形 | 改变卡牌身份 |
| `TAG_CHANGE Entity=X tag=Y value=Z` | 标签变更 | **所有状态变化的核心** |
| `BLOCK_START BlockType=X` | 动作块开始 | 战吼、发现等嵌套动作 |
| `SHUFFLE_DECK` | 洗牌 | 重置牌库顺序信息 |

#### 1.2.3 ZONE 变化 — 记牌的灵魂

每张牌的生命周期都由 `TAG_CHANGE tag=ZONE` 事件驱动。原版 HDT 的 `TagChangeActions` 按源区间分发处理：

```
    ┌──────┐     ┌──────┐     ┌──────┐     ┌──────┐     ┌──────────┐
    │ DECK │────▶│ HAND │────▶│ PLAY │────▶│GRAVEY│     │ SECRET   │
    │ 牌库 │ 抽牌│ 手牌 │ 出牌│ 战场 │ 死亡│ ARD  │     │ 秘密区   │
    └──────┘     └──┬───┘     └──┬───┘     └──────┘     └──────────┘
                    │            │
                    │  换牌回牌库  │  弹回手牌
                    ▼            ▼
                  ┌──────┐     ┌──────┐
                  │ DECK │     │ HAND │
                  └──────┘     └──────┘
```

| 区间转换 | 含义 | 触发的追踪动作 |
|----------|------|---------------|
| DECK → HAND | 抽牌 | 记录抽牌，更新手牌计数 |
| DECK → GRAVEYARD | 疲劳/弃牌 | 记录疲劳伤害或弃牌 |
| HAND → PLAY | 出牌 | 记录出牌，更新战场 |
| HAND → DECK | 换牌回牌库 | 记录换牌选择 |
| HAND → SECRET | 打出秘密 | 记录秘密 |
| HAND → GRAVEYARD | 弃牌 | 记录弃牌 |
| PLAY → GRAVEYARD | 随从/武器死亡 | 记录死亡 |
| PLAY → HAND | 弹回手牌 | 更新手牌 |
| SECRET → GRAVEYARD | 秘密触发 | 揭示秘密内容 |
| PLAY → SETASIDE | 移出战场 | 暂存（如复活准备） |

#### 1.2.4 实体系统

原版 HDT 中每个游戏对象（卡牌、英雄、英雄技能、附魔等）都是一个 `Entity`：

```csharp
// Entity 的核心结构
class Entity {
    int Id;                    // 实体 ID（全局唯一）
    string CardId;             // 卡牌 ID（如 "EX1_116"），对手手牌为空
    string Name;               // 实体名称
    Dictionary<GameTag, int> Tags;  // 标签字典

    // 由 Tags 派生的关键属性
    bool IsInHand      => Tags[ZONE] == HAND;
    bool IsInPlay      => Tags[ZONE] == PLAY;
    bool IsInDeck      => Tags[ZONE] == DECK;
    bool IsInGraveyard => Tags[ZONE] == GRAVEYARD;
    bool IsInSecret    => Tags[ZONE] == SECRET;
    bool IsPlayer      => Tags[PLAYER_ID] == game.Player.Id;
}

// EntityInfo 追踪元数据
class EntityInfo {
    int Turn;              // 进入当前区间的回合数
    bool Hidden;           // 是否隐藏（对手手牌）
    bool Created;          // 是否为衍生牌
    bool Discarded;        // 是否被弃掉
    bool Mulliganed;       // 是否被换掉
    bool Stolen;           // 是否被偷走
    int OriginalController;// 原始控制者
    int DeckIndex;         // 牌库中的位置
    int CostReduction;     // 费用减少
}
```

### 1.3 内存读取（HearthMirror — 补充数据源）

原版 HDT 的 HearthMirror 使用 **双进程 IPC 架构**（JSON-RPC over Windows 匿名管道）：

```
HDT.exe (主进程)
    │
    │  创建匿名管道 → 启动 HearthMirror.exe 子进程
    │
    ▼
HearthMirror.exe (子进程)
    │
    │  通过 untapped-scry-dotnet.dll (C++/CLI)
    │  使用 ReadProcessMemory 读取炉石进程
    │
    │  MonoScry 解析 Unity Mono 运行时元数据
    │  ServiceLocator 模式查找游戏服务
    │
    ▼
Reflection.Client (透明代理)
    │  调用 GetMatchInfo() → 自动序列化为 JSON-RPC → 发送 → 反序列化响应
    │
    ▼
60+ 业务方法，关键数据包括:
    • GetMatchInfo()     — 玩家名、排名、游戏类型
    • GetDecks()         — 所有保存的卡组
    • GetCollection()    — 完整卡牌收藏
    • GetGameType()      — 游戏模式枚举
    • GetFormat()        — 标准/狂野/经典
    • GetSceneMgrState() — 当前 UI 场景
    • GetDeckPickerState()— 卡组选择器状态
    • GetServerInfo()    — 服务器地址
    • GetAccountId()     — 账号 ID
```

### 1.4 玩家牌库追踪原理

这是记牌器最有价值的功能。原版 HDT 的实现方式：

```
    对局开始
        │
        ▼
    ① 从 DeckList.ActiveDeck 获取选中的卡组（30 张牌的列表）
        │
        ▼
    ② Power.log FULL_ENTITY 创建所有实体
        │  → 对每个己方实体，记录 CardId
        │
        ▼
    ③ Power.log TAG_CHANGE ZONE 变化
        │  → 每次牌从 DECK 离开（抽牌/疲劳/弃牌）
        │  → 每次牌进入 HAND（对手牌隐藏 CardId）
        │  → 每次牌从 HAND 到 PLAY（出牌）
        │
        ▼
    ④ Player.GetDeckState() 计算:
        │  原始卡组 − 已知被移除的牌 = 剩余牌库
        │
        │  具体逻辑:
        │  • 已抽到/已出/已弃 = 从原始卡组中减去
        │  • 衍生牌（created=true）不计入
        │  • 偷来的牌标记 stolen=true
        │  • Zilliax 3000 等特殊侧边栏需特殊处理
        │
        ▼
    ⑤ Overlay 显示剩余牌库
```

### 1.5 对手牌追踪原理

```
    对局开始
        │
        ▼
    ① 对手的所有手牌: FULL_ENTITY 创建时 CardId 为空
        │  → 标记为 Hidden = true
        │
        ▼
    ② 对手出牌时:
        │  → SHOW_ENTITY 事件揭示 CardId
        │  → 从 Hand 区间移到 Play/Secret 区间
        │
        ▼
    ③ 对手牌追踪数据:
        │  • 已知牌: 通过 SHOW_ENTITY 揭示的卡牌
        │  • 预测牌: KnownCardIds 系统（如"暗影步"回手牌时的预测）
        │  • 牌库计数: 对手原始牌库数 − 已抽牌数
        │
        ▼
    ④ Player.OpponentCardList 计算显示列表
```

### 1.6 构筑模式完整事件流

```
场景: 玩家进入构筑排位赛

 ① LoadingScreen.log → "TOURNAMENT" 场景
    → HDT 知道玩家进入了构筑选牌界面

 ② HearthMirror → get_deck_picker_state()
    → 知道玩家选中了哪套牌
    → 设置 DeckList.ActiveDeck

 ③ LoadingScreen.log → "GAMEPLAY" 场景
    → 对局开始

 ④ HearthMirror → get_match_info()
    → 对手 BattleTag、排名、先后手

 ⑤ Power.log → CREATE_GAME
    → 初始化 GameEntity

 ⑥ Power.log → FULL_ENTITY × N
    → 创建所有实体（手牌、牌库、英雄等）
    → 己方手牌/牌库实体有 CardId
    → 对手手牌/牌库实体 CardId 为空（隐藏）

 ⑦ Power.log → TAG_CHANGE ZONE=HAND
    → 记录初始手牌（换牌前的起手）

 ⑧ Power.log → TAG_CHANGE MULLIGAN_STATE=DEALING → DONE
    → 换牌阶段
    → 记录哪些牌被换掉（回牌库）、哪些保留

 ⑨ Power.log → TAG_CHANGE TURN=1
    → 第一回合开始

 ⑩ Power.log → TAG_CHANGE ZONE=DECK→HAND
    → 每回合抽牌

 ⑪ Power.log → SHOW_ENTITY（对手出牌时）
    → 揭示对手打出的牌的 CardId

 ⑫ Power.log → TAG_CHANGE ZONE=HAND→PLAY
    → 出牌，更新战场

 ⑬ Power.log → TAG_CHANGE ZONE=PLAY→GRAVEYARD
    → 随从/武器死亡

 ...中局持续追踪...

 ⑭ Power.log → TAG_CHANGE STATE=COMPLETE
    → 对局结束

 ⑮ HearthMirror → get_match_info()
    → 确认最终结果

 ⑯ Stats → 记录对局结果到数据库
```

---

## 2. HDT.js 当前进度

### 2.1 已完成的模块

```
                    HDT.js 开发进度全景
    ═════════════════════════════════════════════════

    ✅ 已完成 (约 40%)
    ────────
    1. Monorepo 骨架
       • pnpm workspaces
       • electron-vite 构建
       • TypeScript strict mode
       • Vitest 测试框架

    2. Electron 桌面壳 (@hdt/desktop)
       • Main process + Preload + Renderer 三段式
       • 17 个 IPC handler
       • 基础 UI (Dashboard / Sidebar / Collection / Settings)
       • HearthMirror 三态指示器 (灰/黄/绿)

    3. 卡牌数据库 (@hdt/hearthdb)
       • 7,898 张可收藏卡，双 Map 索引 (dbfId + cardId)
       • 多条件搜索 (名称/费用/职业/稀有度/系列/类型/机制)
       • Deckstring 编解码 (HearthSim 标准)
       • IPC 集成 (cards:findByDbfId / deck:encode 等)

    4. HearthMirror Rust 桥接 (@hdt/hearthmirror + native)
       • Mono 运行时定位 (mono-2.0-bdwgc.dll)
       • 偏移探测系统 (iced-x86 反汇编 + JSON baseline)
       • 图像遍历 (MonoImage.class_cache hashtable walking)
       • ServiceLocator (Blizzard.T5.Services.ServiceManager)
       • 19 个 #[napi] 反射方法:
         - is_alive, get_battle_tag, get_account_id
         - get_game_type, is_spectating, is_game_over
         - get_match_info, get_medal_info, get_server_info
         - get_decks, get_collection, get_edited_deck
         - get_arena_deck, get_battleground_rating_info
         - is_mulligan
         - get_board_state, get_hand_state, get_deck_state
         - get_opponent_secrets, get_choices
       • 集合类型: CustomMap / List / GList / Dictionary
       • 真机验证通过 (spike 0003, 14 runs)
```

### 2.2 核心缺口

```
    ❌ 未开始
    ────────
    1. HearthWatcher — 日志文件解析
       → 记牌器的灵魂，完全没有
       → 无法追踪逐牌事件（抽牌/出牌/死亡/区间转换）
       → 无法追踪对手出牌时的 CardId 揭示

    2. GameState — 游戏状态机
       → 没有实体系统 (Entity Map)
       → 没有标签变更追踪
       → 没有区间转换逻辑
       → 没有 Player / Opponent 状态分离

    3. DeckManager — 卡组管理
       → 没有本地 SQLite 存储
       → 没有卡组编辑器 UI
       → 没有自动匹配当前卡组逻辑

    4. Overlay — 游戏内覆盖层
       → 没有透明 BrowserWindow
       → 没有炉石窗口位置追踪
       → OverlayView 只在主窗口内做演示

    5. Stats — 对局统计
       → 没有对局记录存储
       → 没有胜率计算
       → 没有统计图表

    6. 其他扩展模式
       → Arena / Battlegrounds / HSReplay 均未开始
```

### 2.3 能力对比矩阵

| 能力 | 原版 HDT 实现 | HDT.js 现状 | 缺口级别 |
|------|--------------|------------|---------|
| 实体系统 | `Entity` + `Tags` 字典 | 无 | **核心缺失** |
| ZONE 区间追踪 | TagChangeHandler 检测 ZONE 变化 | Rust 有 get_board/hand/deck_state 原语 | 有数据原语，无状态机 |
| 抽牌追踪 | Power.log TAG_CHANGE zone=HAND | 无日志解析 | **缺失** |
| 出牌追踪 | Power.log SHOW_ENTITY + ZONE 转换 | 无日志解析 | **缺失** |
| 换牌追踪 | Power.log mulligan 事件 | Rust is_mulligan() 可检测换牌阶段 | 部分 |
| 卡组识别 | DeckPickerWatcher + 自动匹配 | get_decks() + get_edited_deck() | 有数据，无自动匹配 |
| 对手追踪 | SHOW_ENTITY 揭示 CardId | 无日志解析 | **缺失** |
| 回合追踪 | TURN tag 变化 | 无 | **缺失** |
| 秘密追踪 | SECRET 区间 + 触发检测 | Rust get_opponent_secrets() | 有数据原语 |
| 场景检测 | LoadingScreen.log | Rust get_game_type() | 有，但不如日志精确 |
| 牌库剩余 | 原始卡组 − 已知移除 | 无 | **核心缺失** |
| 对局统计 | SQLite 对局记录 | 无 | 缺失 |
| 卡组管理 | 本地卡组 CRUD | 无 | 缺失 |

---

## 3. 开发方向建议

### 3.1 核心判断

基于对原版 HDT 的逆向分析，得出以下核心判断：

1. **日志解析是记牌器的灵魂**：原版 HDT 90% 的对战追踪价值来自 Power.log 解析，内存读取是锦上添花
2. **稳定性优势**：日志格式比 Mono 内存布局稳定得多——暴雪很少改日志格式，但每次 Unity 更新都可能改偏移量
3. **完整性优势**：Power.log 提供了完整的牌局时间线（每张牌从哪来、到哪去），这是纯内存轮询做不到的——轮询只能看到快照，看不到中间的区间转换
4. **对手牌追踪**：SHOW_ENTITY 事件在对手出牌时揭示 CardId，这是内存读取无法可靠获取的（对手手牌在内存中永远是隐藏的）
5. **HearthMirror 已成熟**：19 个反射方法经过 14 轮真机验证，足够支撑日志解析阶段的所有补充需求

### 3.2 推荐路线: "先能追踪"

**目标**：让记牌器能真正追踪构筑对战中的牌库和战场，实现核心价值。

```
    优先级        Change                     依赖           预估
    ──────        ───────                    ────           ────
    P0 (立即)  →  add-hearthwatcher          无外部依赖      大
                  • LogFileWatcher (100ms 轮询)
                  • Power.log 解析器
                  • LoadingScreen.log 解析器
                  • GameState 状态机

    P1 (紧跟)  →  add-deck-management        hearthdb (已有) 中
                  • SQLite 存储
                  • 卡组 CRUD
                  • 自动匹配当前卡组

    P2 (叠加)  →  add-overlay-window         watcher + deck  中
                  • 透明 BrowserWindow
                  • 炉石窗口位置追踪
                  • PlayerDeck / OpponentDeck

    P3 (后续)  →  add-stats                  hearthwatcher   中
                  • 对局记录存储
                  • 胜率图表
                  • 对局历史
```

### 3.3 为什么日志解析优先于继续扩展 HearthMirror

| 维度 | 日志解析 | 继续扩展 HearthMirror |
|------|---------|---------------------|
| **核心价值** | 逐牌追踪 = 记牌器存在的理由 | 更多元数据 = 锦上添花 |
| **稳定性** | 暴雪很少改日志格式 | Unity 更新可能导致偏移漂移 |
| **完整性** | 完整时间线（每张牌的完整生命周期） | 只有快照（轮询时刻的状态） |
| **对手信息** | SHOW_ENTITY 揭示出牌 | 内存中对手手牌永远隐藏 |
| **开发难度** | 中（正则匹配 + 状态机） | 高（Mono 内存布局已验证 14 轮） |
| **维护成本** | 低（日志格式很少变） | 高（每次 HS 更新需重新验证偏移） |

### 3.4 P0: add-hearthwatcher 详细设计建议

#### 3.4.1 包结构

```
packages/hearthwatcher/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts                    # 公共导出
    ├── log-watcher.ts              # 文件监听管理器
    ├── log-file-watcher.ts         # 单文件轮询读取器
    ├── log-line.ts                 # LogLine 类型定义
    ├── parsers/
    │   ├── power-parser.ts         # Power.log 解析 (核心)
    │   ├── loading-screen-parser.ts# LoadingScreen.log 解析
    │   └── arena-parser.ts         # Arena.log 解析 (可后续)
    ├── handlers/
    │   ├── power-handler.ts        # Power 事件分发
    │   ├── tag-change-handler.ts   # TAG_CHANGE 处理
    │   ├── tag-change-actions.ts   # ZONE 变化分派
    │   └── loading-screen-handler.ts
    ├── game/
    │   ├── game-state.ts           # 游戏状态机
    │   ├── entity.ts               # 实体模型
    │   ├── player.ts               # 玩家状态
    │   ├── opponent.ts             # 对手状态
    │   └── game-tag.ts             # GameTag 枚举
    └── events.ts                   # 统一事件类型
```

#### 3.4.2 实现步骤

**第一步：LogFileWatcher**

```
职责: 轮询 Hearthstone 日志目录的文件变化
机制:
  • 找到炉石日志目录 (通常 %LOCALAPPDATA%/Blizzard/Hearthstone/Logs/)
  • 对每个目标日志文件 (Power.log, LoadingScreen.log 等)
  • 100ms 轮询: 记录上次读取的 offset，只读新增行
  • 解析每行为 LogLine { namespace, time, content }
  • 应用过滤器 (namespace StartsWith / Contains)
  • 触发 OnNewLines 回调
```

**第二步：Power.log 解析器**

参考原版 HDT 的 `PowerHandler`，需要处理的核心模式（按优先级排序）：

| 优先级 | 模式 | 说明 |
|--------|------|------|
| P0 | `FULL_ENTITY` | 创建实体，获取 CardId |
| P0 | `TAG_CHANGE tag=ZONE` | 区间转换，记牌核心 |
| P0 | `SHOW_ENTITY` | 揭示隐藏实体（对手出牌） |
| P0 | `CREATE_GAME` | 游戏开始，初始化 |
| P1 | `TAG_CHANGE tag=TURN` | 回合计数 |
| P1 | `TAG_CHANGE tag=MULLIGAN_STATE` | 换牌阶段 |
| P1 | `TAG_CHANGE tag=CONTROLLER` | 控制者变化 |
| P2 | `BLOCK_START/END` | 嵌套动作块 |
| P2 | `HIDE_ENTITY` | 隐藏实体 |
| P2 | `CHANGE_ENTITY` | 实体变形 |
| P2 | `SHUFFLE_DECK` | 洗牌 |

**第三步：GameState 状态机**

```typescript
// 核心数据结构建议
interface Entity {
  id: number;
  cardId: string;           // 空 = 隐藏（对手手牌）
  tags: Map<GameTag, number>;
  info: EntityInfo;
}

interface EntityInfo {
  turn: number;             // 进入当前区间的回合
  hidden: boolean;          // 是否隐藏
  created: boolean;         // 是否衍生
  discarded: boolean;       // 是否弃牌
  mulliganed: boolean;      // 是否被换掉
  stolen: boolean;          // 是否被偷
  originalController: number;
  costReduction: number;
}

interface GameState {
  // 全局实体表
  entities: Map<number, Entity>;

  // 玩家分离
  playerId: number | null;       // 己方 PlayerID
  opponentId: number | null;     // 对方 PlayerID

  // 派生查询
  getPlayerHand(): Entity[];
  getPlayerBoard(): Entity[];
  getPlayerDeck(): Entity[];
  getOpponentHand(): Entity[];   // CardId 为空
  getOpponentBoard(): Entity[];
  getOpponentSecrets(): Entity[];

  // 牌库追踪
  getPlayerDeckState(originalDeck: DeckCard[]): DeckState;

  // 回合
  turnNumber: number;
  isMulliganDone: boolean;
  isGameOver: boolean;
}
```

**第四步：与现有 HearthMirror 数据融合**

```
    场景切换:
      LoadingScreen.log "TOURNAMENT"
        + HearthMirror get_game_type() 交叉验证

    卡组匹配:
      Power.log CREATE_GAME 检测到对局开始
        → HearthMirror get_decks() 获取保存的卡组列表
        → 用已揭示的己方手牌 CardId 匹配最可能的卡组
        → 设置 ActiveDeck

    匹配元数据:
      对局开始时
        → HearthMirror get_match_info()
        → 对手 BattleTag、排名、先后手
```

#### 3.4.3 与原版 HDT 的关键差异

| 方面 | 原版 HDT | HDT.js 建议 |
|------|---------|-------------|
| 语言 | C# (.NET Framework 4.7.2) | TypeScript (Node.js) |
| 日志轮询 | 后台线程 Thread + Sleep(100) | setInterval / setImmediate |
| 状态管理 | 全局单例 Core.Game | 模块化 GameState class |
| 事件系统 | C# events / delegates | EventEmitter / 回调 |
| 文件监听 | 自定义 LogFileWatcher | 可用 fs.watch + 轮询 fallback |
| 卡牌预测 | KnownCardIds 硬编码 100+ 张 | 第一版不实现，后续按需添加 |
| 正则表达式 | 编译的 Regex | RegExp（建议预编译） |

### 3.5 P1: add-deck-management 设计要点

可以与 hearthwatcher 并行开发（不依赖日志解析）：

```
    核心功能:
    • SQLite 数据库 (better-sqlite3)
    • 卡组 CRUD + 版本管理
    • 卡组合法性校验 (30 张、同名 ≤ 2、传说 ≤ 1)
    • 卡组导入 (deckstring / 剪贴板 / 从 HearthMirror get_decks() 同步)
    • 卡组导出 (deckstring / JSON)
    • 自动匹配当前卡组 (利用 HearthMirror 数据)

    UI:
    • 卡组选择器 (按职业分类)
    • 卡组编辑器 (搜索卡牌、构建卡组)
    • 法力值曲线图
```

### 3.6 P2: add-overlay-window 设计要点

依赖 hearthwatcher + deck-management 完成后：

```
    核心功能:
    • 独立透明 BrowserWindow (frameless, transparent)
    • 炉石窗口位置追踪 (FindWindow + GetWindowRect)
    • 覆盖层跟随炉石窗口移动/缩放
    • 鼠标穿透设置 (点击穿透到炉石窗口)

    UI 组件:
    • PlayerDeck — 己方牌库剩余 (已出标灰)
    • OpponentDeck — 对手已知卡牌
    • TurnTimer — 回合计时器
    • CardCount — 牌库/手牌/墓地计数
```

---

## 4. 两个数据源的协作模式

### 4.1 分工原则

```
    ┌─────────────────────────────────────────────────────────┐
    │                    数据源分工                            │
    ├─────────────────────────────────────────────────────────┤
    │                                                         │
    │  日志解析 (HearthWatcher) 负责:                         │
    │  ─────────────────────────────                          │
    │  • 逐牌事件追踪 (抽牌/出牌/死亡/弃牌)                  │
    │  • 对手卡牌揭示 (SHOW_ENTITY)                           │
    │  • 区间转换 (DECK ↔ HAND ↔ PLAY ↔ GRAVEYARD)          │
    │  • 回合变化                                             │
    │  • 换牌追踪                                             │
    │  • 游戏开始/结束检测                                    │
    │  • 实体创建和标签变更                                   │
    │                                                         │
    │  内存读取 (HearthMirror) 负责:                          │
    │  ─────────────────────────────                          │
    │  • 玩家身份 (BattleTag / AccountId)                     │
    │  • 匹配元数据 (排名/游戏类型/格式/对手信息)             │
    │  • 卡组列表 (保存的卡组 + 当前选中)                     │
    │  • 卡牌收藏                                             │
    │  • 场景状态 (当前 UI 模式)                              │
    │  • 竞技场数据                                           │
    │  • 战棋评分                                             │
    │                                                         │
    └─────────────────────────────────────────────────────────┘
```

### 4.2 实时对战中两个数据源的协作时序

```
时间 ──────────────────────────────────────────────────────▶

  场景切换        对局开始            中局追踪            对局结束
    │                │                  │                  │
    │  HearthMirror  │  HearthWatcher   │  HearthWatcher   │  HearthWatcher
    │  get_game_type │  CREATE_GAME     │  TAG_CHANGE      │  STATE=COMPLETE
    │  get_decks     │  FULL_ENTITY×N   │  ZONE=DECK→HAND  │
    │                │  TAG_CHANGE      │  SHOW_ENTITY     │  HearthMirror
    │                │  ZONE changes    │  TAG_CHANGE      │  get_match_info
    │                │                  │  ZONE=PLAY→GRAVE │  (确认结果)
    │                │                  │                  │
    │  ←─ 一次性 ──→│  ←──── 持续事件流 ────→│  ←─ 一次性 ─→│
```

### 4.3 为什么不能只用 HearthMirror 做对局追踪

虽然 HDT.js 的 HearthMirror 已经有 `get_board_state`、`get_hand_state`、`get_deck_state` 等对局内读取方法，但它们**无法替代日志解析**：

| 维度 | 内存轮询 | 日志解析 |
|------|---------|---------|
| 数据类型 | 快照（某一时刻的状态） | 事件流（每次变化的完整记录） |
| 对手手牌 | 永远看不到 CardId | 出牌时 SHOW_ENTITY 揭示 |
| 事件顺序 | 无法区分"抽牌后立即打出"和"一直在手里的牌" | 精确的时间线 |
| 状态恢复 | 断线重连后可能状态不一致 | 完整日志可重放 |
| 性能 | 高频轮询（4Hz × 150 实体 × 4 tag = 2400 reads/s） | 被动读取，只在有新行时触发 |
| 可靠性 | 依赖 Mono 偏移稳定性 | 依赖日志格式稳定性（更可靠） |

---

## 5. 风险与注意事项

### 5.1 日志解析的风险

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| 暴雪修改日志格式 | 低 | 高 | 模块化解析器，快速适配 |
| 日志文件路径变化 | 低 | 中 | 运行时探测 %LOCALAPPDATA% |
| 大量日志导致内存占用 | 低 | 中 | 设置行缓冲区上限（如 100,000 行） |
| 文件锁冲突 | 低 | 低 | 只读模式打开，异常时重试 |

### 5.2 实现建议

1. **先做最小可用版本**：只实现 FULL_ENTITY + TAG_CHANGE(ZONE) + SHOW_ENTITY + CREATE_GAME，就能覆盖 80% 的记牌需求
2. **KnownCardIds 预测系统不要一开始就做**：原版 HDT 积累了 100+ 张特殊卡牌的预测逻辑，这是多年的增量完善，不是第一版需要的
3. **GameState 保持纯数据**：状态机只负责维护实体表和派生查询，不依赖 UI 框架，方便测试
4. **利用已有的 HearthMirror**：场景检测、卡组匹配、匹配元数据都用 HearthMirror 获取，不重复造轮子

---

## 6. 下一步行动

### 6.1 立即可做

1. **创建 `add-hearthwatcher` change proposal**
   - 在 openspec 中走完整的 proposal → design → specs → tasks 流程
   - 参考本文档 §3.4 的包结构和实现步骤

2. **并行创建 `add-deck-management` change proposal**
   - 不依赖 hearthwatcher，可以同时开发
   - 利用已有的 hearthdb + HearthMirror get_decks()

### 6.2 开发顺序建议

```
Week 1-2:   add-hearthwatcher (核心: LogFileWatcher + PowerParser + GameState)
            add-deck-management (核心: SQLite + 卡组 CRUD)

Week 3:     add-hearthwatcher (完善: 对手追踪 + 回合追踪 + 换牌追踪)
            add-deck-management (完善: UI 卡组编辑器)

Week 4:     add-overlay-window
            (此时已有完整游戏状态 + 卡组管理 → 覆盖层可以显示真实数据)
```

### 6.3 建议的第一版 hearthwatcher 范围

**In Scope (第一版)**:
- LogFileWatcher: 100ms 轮询，增量读取
- Power.log: FULL_ENTITY, TAG_CHANGE (ZONE, TURN, MULLIGAN_STATE, CONTROLLER, PLAYER_ID), SHOW_ENTITY, CREATE_GAME
- LoadingScreen.log: 场景切换检测
- GameState: Entity Map + Player/Opponent 分离 + 牌库剩余计算
- 与 HearthMirror 的融合（卡组匹配、匹配元数据）

**Out of Scope (后续版本)**:
- KnownCardIds 卡牌预测系统
- Arena.log 解析
- BLOCK_START/END 嵌套动作
- HIDE_ENTITY / CHANGE_ENTITY
- 对局重放系统
- 断线重连恢复
