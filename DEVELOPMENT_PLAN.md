# HDT.js 开发计划 — 炉石传说记牌器 TypeScript 重写

## 1. 项目概述

用 **TypeScript + Electron** 重写 Hearthstone Deck Tracker (HDT)，构建一个现代化的炉石传说记牌器应用。

### 1.1 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 桌面框架 | **Electron** | 跨平台桌面应用，支持透明窗口覆盖 |
| UI 框架 | **React** + **TypeScript** | 组件化开发，类型安全 |
| 样式方案 | **Tailwind CSS** | 原子化 CSS，快速迭代 |
| 状态管理 | **Zustand** | 轻量级状态管理 |
| 内存读取 | **hearthmirror-native** (Rust) | 通过 FFI 读取炉石进程内存 |
| 日志解析 | **HearthWatcher** (TypeScript) | 解析炉石日志文件获取游戏事件 |
| 数据存储 | **better-sqlite3** | 本地 SQLite 数据库存储统计/卡组数据 |
| 卡牌数据 | **HearthDb.js** (TypeScript) | 炉石卡牌数据库，解析 Cards.json |
| 构建工具 | **electron-builder** | 打包分发 |
| 包管理 | **pnpm** workspaces | Monorepo 管理 |

### 1.2 目标平台

- Windows 10/11 (主要)
- 后续可扩展至 macOS

### 1.3 与原版 HDT 的功能对齐

原版 HDT 是 WPF (.NET Framework 4.7.2) 应用，主要功能：
- 卡组管理与编辑
- 游戏内覆盖层 (Overlay)
- 对局统计与分析
- 竞技场选牌
- 酒馆战棋支持
- HSReplay.net 集成
- 插件系统

---

## 2. Monorepo 项目结构

```
hdt-js/
├── package.json                    # workspace 根
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── electron-builder.yml
├── tailwind.config.ts
├── .eslintrc.cjs
├── .prettierrc
│
├── packages/
│   ├── core/                       # 核心业务逻辑 (纯 Node.js, 无 UI 依赖)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── game/               # 游戏状态管理
│   │       │   ├── game-state.ts       # 完整游戏状态模型
│   │       │   ├── entities.ts         # 卡牌/英雄/技能实体
│   │       │   ├── turn-tracker.ts     # 回合追踪
│   │       │   └── game-events.ts      # 游戏事件类型定义
│   │       ├── deck/               # 卡组管理
│   │       │   ├── deck-manager.ts     # 卡组 CRUD
│   │       │   ├── deck-validator.ts   # 卡组合法性验证
│   │       │   ├── deck-import.ts      # 从多种来源导入卡组
│   │       │   └── deck-code.ts        # 炉石卡组码编解码
│   │       ├── stats/              # 对局统计
│   │       │   ├── stats-manager.ts    # 统计数据管理
│   │       │   ├── winrate.ts          # 胜率计算
│   │       │   └── filters.ts          # 统计过滤器
│   │       ├── arena/              # 竞技场
│   │       │   ├── arena-tracker.ts    # 竞技场流程追踪
│   │       │   └── draft-helper.ts     # 选牌辅助
│   │       ├── battlegrounds/      # 酒馆战棋
│   │       │   ├── bg-tracker.ts       # 战棋流程追踪
│   │       │   ├── hero-tiers.ts       # 英雄强度评级
│   │       │   └── combat-sim.ts       # 战斗模拟 (BobsBuddy)
│   │       ├── collection/         # 卡牌收藏
│   │       │   └── collection-manager.ts
│   │       └── store/              # 数据持久化
│   │           ├── database.ts         # SQLite 数据库初始化
│   │           ├── migrations.ts       # 数据库迁移
│   │           ├── deck-store.ts       # 卡组表
│   │           ├── game-store.ts       # 对局记录表
│   │           └── settings-store.ts   # 设置表
│   │
│   ├── hearthdb/                  # 卡牌数据库
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── card-defs.ts            # CardDef 类型定义
│   │       ├── card-loader.ts          # 加载 Cards.json
│   │       ├── card-utils.ts           # 卡牌查找/过滤工具
│   │       ├── card-icons.ts           # 卡牌图标/资源路径
│   │       └── sets.ts                 # 卡包/系列定义
│   │
│   ├── hearthwatcher/             # 日志文件监听
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── log-watcher.ts          # 文件系统监听
│   │       ├── parsers/                # 各类型日志解析器
│   │       │   ├── power-parser.ts     # PowerTaskList (出牌/攻击等)
│   │       │   ├── loading-screen.ts   # 加载屏幕事件
│   │       │   ├── asset-parser.ts     # 卡牌资源加载
│   │       │   ├── rank-parser.ts      # 段位变化
│   │       │   ├── deck-parser.ts      # 卡组信息
│   │       │   └── arena-parser.ts     # 竞技场事件
│   │       └── events.ts               # 统一事件类型
│   │
│   ├── hearthmirror/              # 内存读取 (Rust FFI + TS 封装)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── native/                  # Rust native 库 (详见 Rewrite_Design.md)
│   │   │   └── ...
│   │   └── src/
│   │       ├── index.ts
│   │       ├── native.ts              # FFI 绑定
│   │       ├── session.ts             # 会话管理
│   │       ├── mirror.ts              # 镜像访问
│   │       ├── reflection.ts          # 60+ 业务方法
│   │       ├── types.ts
│   │       └── enums.ts
│   │
│   └── overlay/                   # 游戏内覆盖层 (独立渲染进程)
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts
│           ├── overlay-window.ts       # Electron 透明窗口管理
│           ├── position-tracker.ts    # 跟踪炉石窗口位置
│           ├── components/
│           │   ├── PlayerDeck.tsx         # 己方卡组列表
│           │   ├── OpponentDeck.tsx       # 对手已知卡牌
│           │   ├── TurnTimer.tsx          # 回合计时器
│           │   ├── MulliganGuide.tsx      # 换牌建议
│           │   ├── WinProbability.tsx     # 胜率预测
│           │   ├── BattlegroundsOverlay.tsx # 战棋覆盖层
│           │   ├── BobsBuddyPanel.tsx     # 战斗模拟面板
│           │   ├── MulliganPanel.tsx      # 换牌面板
│           │   ├── ExperienceCounter.tsx  # 经验值计数器
│           │   └── BoardMinionOverlay.tsx # 随从面板
│           └── hooks/
│               ├── use-hearthstone-window.ts
│               └── use-overlay-position.ts
│
├── apps/
│   └── desktop/                   # Electron 主应用
│       ├── package.json
│       ├── tsconfig.json
│       ├── main/                  # Electron 主进程
│       │   ├── index.ts               # 入口
│       │   ├── ipc-handlers.ts        # IPC 通信处理
│       │   ├── auto-updater.ts        # 自动更新
│       │   └── tray.ts                # 系统托盘
│       ├── preload/               # 预加载脚本
│       │   └── index.ts
│       └── renderer/              # React 渲染进程 (主窗口)
│           ├── index.html
│           ├── index.tsx
│           ├── App.tsx
│           ├── routes/
│           │   ├── index.tsx
│           │   ├── DeckPicker.tsx      # 卡组选择页
│           │   ├── DeckEditor.tsx      # 卡组编辑器
│           │   ├── Collection.tsx      # 卡牌收藏
│           │   ├── Stats.tsx           # 统计分析
│           │   ├── Arena.tsx           # 竞技场
│           │   ├── Battlegrounds.tsx   # 酒馆战棋
│           │   ├── Settings.tsx        # 设置
│           │   └── Plugins.tsx         # 插件管理
│           ├── components/
│           │   ├── layout/
│           │   │   ├── TitleBar.tsx        # 自定义标题栏
│           │   │   ├── Sidebar.tsx         # 侧边导航
│           │   │   └── Flyout.tsx          # 滑出面板
│           │   ├── cards/
│           │   │   ├── Card.tsx            # 单张卡牌
│           │   │   ├── CardList.tsx        # 卡牌列表
│           │   │   ├── CardTooltip.tsx     # 卡牌悬浮提示
│           │   │   ├── CardArt.tsx         # 卡牌美术图
│           │   │   ├── CardCostBadge.tsx   # 法力值标记
│           │   │   └── CardCounter.tsx     # 卡牌计数
│           │   ├── deck/
│           │   │   ├── DeckList.tsx        # 卡组列表视图
│           │   │   ├── DeckCard.tsx        # 卡组中的卡牌
│           │   │   ├── DeckPicker.tsx      # 卡组选择器
│           │   │   ├── DeckImportDialog.tsx # 导入对话框
│           │   │   ├── DeckExportDialog.tsx # 导出对话框
│           │   │   └── DeckNotes.tsx       # 卡组备注
│           │   ├── stats/
│           │   │   ├── WinRateChart.tsx     # 胜率图表
│           │   │   ├── MatchupChart.tsx     # 对战胜率图
│           │   │   ├── GameHistory.tsx      # 对局历史
│           │   │   ├── ClassStats.tsx       # 职业统计
│           │   │   └── StatsFilter.tsx      # 过滤器
│           │   └── common/
│           │       ├── SearchBar.tsx
│           │       ├── ClassIcon.tsx
│           │       ├── RarityGem.tsx
│           │       ├── ManaCrystal.tsx
│           │       └── Dialog.tsx
│           ├── hooks/
│           │   ├── use-deck.ts
│           │   ├── use-game.ts
│           │   ├── use-collection.ts
│           │   └── use-settings.ts
│           └── stores/
│               ├── deck-store.ts
│               ├── game-store.ts
│               ├── ui-store.ts
│               └── settings-store.ts
│
├── resources/                     # 静态资源
│   ├── icons/                     # 应用图标
│   ├── card-art/                  # 卡牌美术图缓存
│   ├── sounds/                    # 提示音效
│   └── locales/                   # 国际化文件
│       ├── zh-CN.json
│       └── en-US.json
│
├── data/                          # 卡牌数据
│   └── Cards.json                 # 炉石卡牌数据库
│
└── scripts/                       # 开发脚本
    ├── download-cards.ts          # 下载最新卡牌数据
    └── generate-types.ts          # 生成类型定义
```

---

## 3. 核心模块设计

### 3.1 HearthWatcher — 日志解析引擎

炉石传说会输出详细的日志文件（位于 `Hearthstone/Logs/` 目录），包含所有游戏事件。这是记牌器最稳定的数据来源。

**监听的日志文件**：

| 日志文件 | 内容 | 用途 |
|----------|------|------|
| `PowerTaskList.txt` | 出牌、攻击、死亡等所有游戏动作 | 核心游戏状态追踪 |
| `LoadingScreen.txt` | 对局开始/结束、模式切换 | 检测游戏状态变化 |
| `Asset.txt` | 卡牌资源加载 (美术、音效) | 检测对手卡牌 |
| `Rank.txt` | 段位变化 | 段位追踪 |
| `Decks.txt` | 当前使用卡组 | 卡组同步 |
| `ArenaDraft.txt` | 竞技场选牌 | 竞技场辅助 |
| `Battlegrounds.txt` | 酒馆战棋事件 | 战棋追踪 |
| `Achievements.txt` | 成就系统 | 可选 |

**日志解析架构**：

```
LogFileWatcher → LineBuffer → Parser → GameEvent → GameState
                                ↓
                         EventEmitter
                                ↓
                    ┌───────────┼───────────┐
                    │           │           │
                UI Store    Overlay     Stats Recorder
```

### 3.2 GameState — 游戏状态模型

```typescript
interface GameState {
  mode: GameMode;                    // 经典/竞技场/战棋/乱斗/竞技场
  phase: GamePhase;                  // 游戏前/换牌/对战中/游戏结束

  player: PlayerState;
  opponent: OpponentState;

  turnNumber: number;
  isPlayerTurn: boolean;
  turnTimer: number;                 // 秒

  entities: Map<number, Entity>;     // 所有实体 (卡牌/英雄/随从/技能)
  tags: Map<string, number>;         // 全局标签

  // 派生状态
  playerHandCount: number;
  opponentHandCount: number;
  playerDeckCount: number;
  opponentDeckCount: number;
}

interface PlayerState {
  hero: EntityReference;
  heroPower: EntityReference;
  weapon: EntityReference | null;
  heroClass: HeroClass;
  mana: number;
  maxMana: number;
  hand: EntityReference[];
  deck: EntityReference[];
  board: EntityReference[];
  secrets: EntityReference[];
  fatigue: number;
  health: number;
  armor: number;
}

interface OpponentState {
  hero: EntityReference;
  heroClass: HeroClass | null;       // 直到对手打出职业卡才确定
  handCount: number;                 // 只知道数量，不知道内容
  revealedCards: EntityReference[];  // 对手打出的牌 (用于追踪剩余牌库)
  deckCount: number;
  board: EntityReference[];
  secrets: Secret[];                 // 秘密触发后才揭示
  fatigue: number;
  health: number;
  armor: number;
}
```

### 3.3 DeckManager — 卡组管理

```typescript
interface Deck {
  id: string;
  name: string;
  class: HeroClass;
  format: Format;                    // 标准/狂野/经典
  type: DeckType;                    // 自定义/竞技场/酒馆战棋
  cards: DeckCard[];                 // 卡牌列表 (含数量)
  version: number;                   // 版本号 (编辑后递增)
  tags: string[];
  note: string;
  createdAt: number;
  updatedAt: number;
  lastUsedAt: number;
  selected: boolean;                 // 当前选中的卡组
}

interface DeckCard {
  id: string;                        // CardDbfId
  count: number;                     // 1 或 2
  note?: string;                     // 卡牌备注
}

// 卡组导入支持格式
type ImportSource =
  | { type: 'clipboard'; text: string }       // 剪贴板文本
  | { type: 'deckcode'; code: string }        // 炉石卡组码
  | { type: 'web'; url: string }              // 网页导入 (HSReplay, HearthPwn)
  | { type: 'json'; data: object }            // JSON 文件
  | { type: 'hearthstone' }                   // 从内存读取 (HearthMirror)
  | { type: 'id'; deckId: number }            // 模板卡组 ID
```

### 3.4 StatsManager — 对局统计

```typescript
interface GameRecord {
  id: string;
  deckId: string;
  deckVersion: number;
  mode: GameMode;
  format: Format;
  result: GameResult;                 // Win / Loss
  opponentClass: HeroClass;
  opponentDeckArchetype?: string;     // 对手卡组类型
  duration: number;                   // 秒
  turns: number;
  coin: boolean;                      // 是否后手
  rank?: RankInfo;
  notes?: string;
  replayPath?: string;
  tags: string[];
  playedAt: number;

  // 可选详情
  cardsPlayed?: string[];             // 打出的卡牌 ID
  mulligan?: MulliganRecord;
}

interface MulliganRecord {
  offered: string[];                  // 初始手牌
  kept: string[];                     // 保留的牌
  mulliganed: string[];               # 换掉的牌
}
```

---

## 4. UI 页面设计

### 4.1 主窗口布局

```
┌─────────────────────────────────────────────────┐
│  [HDT.js Logo]  卡组选择  │  搜索卡牌  │  设置 ⚙ │  ← 自定义标题栏
├──────────┬──────────────────────────────────────┤
│          │                                       │
│  卡组    │          主内容区域                     │
│  列表    │                                       │
│          │  (根据选中的卡组/页面显示)               │
│  ──────  │                                       │
│  战士 ⚔  │  ┌─────────────────────────────────┐  │
│  法师 🔮  │  │                                 │  │
│  牧师 ✝  │  │     当前选中卡组的详细视图         │  │
│  ...     │  │     或统计/设置页面               │  │
│          │  │                                 │  │
│  ──────  │  │                                 │  │
│  + 新建  │  └─────────────────────────────────┘  │
│  📥 导入 │                                       │
│          │                                       │
├──────────┴──────────────────────────────────────┤
│  状态栏: 炉石进程状态 │ 对局状态 │ 段位信息       │
└─────────────────────────────────────────────────┘
```

### 4.2 页面路由

| 路由 | 页面 | 说明 |
|------|------|------|
| `/` | 卡组选择器 | 按职业分类显示所有卡组，支持新建/导入/删除 |
| `/deck/:id` | 卡组详情 | 查看卡组内容，可编辑/导出/备注 |
| `/editor` | 卡组编辑器 | 搜索卡牌，构建/编辑卡组 |
| `/collection` | 卡牌收藏 | 查看所有卡牌，按职业/法力值/稀有度筛选 |
| `/stats` | 统计分析 | 胜率图表，对局历史，按职业/卡组过滤 |
| `/arena` | 竞技场 | 竞技场追踪，选牌辅助 |
| `/battlegrounds` | 酒馆战棋 | 战棋追踪，英雄评级 |
| `/settings` | 设置 | 应用设置，覆盖层设置，热键 |
| `/plugins` | 插件 | 插件管理 |

### 4.3 游戏内覆盖层 (Overlay)

覆盖层是一个独立的 Electron 透明窗口，始终显示在炉石窗口上方。

```
┌─────────────────────────────────────────────────┐
│                                                 │
│  ┌──────────┐                        ┌────────┐ │
│  │ 对手卡组  │                        │ 回合   │ │
│  │ ?:x  ?:x │        炉石传说         │ 计时器 │ │
│  │ ?:x  ?:x │        游戏窗口         │        │ │
│  │ ...      │                        │ 01:23  │ │
│  │ 剩余:x张 │                        └────────┘ │
│  └──────────┘                                   │
│                                                 │
│                                                 │
│  ┌──────────────────────────┐    ┌────────────┐ │
│  │ 己方卡组                  │    │ 胜率预测   │ │
│  │ 烈焰小鬼 x2   1          │    │            │ │
│  │ 食肉魔块 x1   3          │    │  58%       │ │
│  │ 恐惧战马 x2   2          │    │  /  42%    │ │
│  │ ...                     │    │            │ │
│  │ 剩余:x张                 │    └────────────┘ │
│  └──────────────────────────┘                   │
│                                                 │
└─────────────────────────────────────────────────┘
```

**覆盖层子组件**：

| 组件 | 位置 | 功能 |
|------|------|------|
| PlayerDeck | 底部左侧 | 己方卡组，已出牌标记为灰色，剩余张数 |
| OpponentDeck | 顶部左侧 | 对手已知卡牌，已打出标记，预测剩余 |
| TurnTimer | 右上角 | 回合计时器，己方/对方回合 |
| MulliganGuide | 中央 | 换牌建议 (基于 HSReplay 数据) |
| WinProbability | 右侧 | 实时胜率预测 (基于 BobsBuddy) |
| BattlegroundsOverlay | 战棋模式 | 英雄评级，随从面板，战斗模拟 |
| CountersOverlay | 底部中央 | 牌库/手牌/墓地计数器 |

---

## 5. 数据流架构

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  Hearthstone  │    │  Hearthstone  │    │  Hearthstone  │
│  Logs/        │    │  Process      │    │  Process      │
│  PowerTaskList│    │  Memory       │    │  Window       │
└──────┬───────┘    └──────┬───────┘    └──────┬───────┘
       │                   │                   │
       ▼                   ▼                   ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ HearthWatcher│    │ HearthMirror │    │ WindowTracker│
│ 日志解析     │    │ 内存读取     │    │ 窗口追踪     │
└──────┬───────┘    └──────┬───────┘    └──────┬───────┘
       │                   │                   │
       ▼                   ▼                   ▼
┌──────────────────────────────────────────────────────┐
│                    Core Layer                         │
│                                                        │
│  GameState          DeckManager       StatsManager    │
│  (实时游戏状态)     (卡组管理)         (统计记录)      │
│                                                        │
│  ArenaTracker       BGTracker         Collection      │
│  (竞技场追踪)       (战棋追踪)         (卡牌收藏)      │
└──────────┬──────────────┬──────────────┬───────────────┘
           │              │              │
           ▼              ▼              ▼
┌──────────────────────────────────────────────────────┐
│                  Zustand Stores                       │
│  game-store  │  deck-store  │  stats-store  │ ui-store│
└──────────┬──────────────┬──────────────┬─────────────┘
           │              │              │
     ┌─────┴─────┐  ┌────┴────┐  ┌─────┴─────┐
     ▼           ▼  ▼         ▼  ▼           ▼
┌─────────┐ ┌─────────┐ ┌─────────┐
│ Overlay  │ │ Main    │ │ Stats   │
│ Window   │ │ Window  │ │ Window  │
│ (游戏内) │ │ (主窗口)│ │ (统计)  │
└─────────┘ └─────────┘ └─────────┘
```

### Electron 进程间通信

```
Main Process (Node.js)
├── HearthWatcher (日志监听)
├── HearthMirror (内存读取)
├── Database (SQLite)
├── AutoUpdater
└── SystemTray
        │
        │ IPC (ipcRenderer / ipcMain)
        ▼
Renderer Process (React)
├── UI Components
├── Zustand Stores
└── Overlay Window (独立 BrowserWindow)
```

---

## 6. 实现阶段

### Phase 0: 项目初始化 (Week 1)

**目标**：搭建项目骨架，能够启动 Electron 窗口

- [ ] 初始化 pnpm monorepo workspace
- [ ] 配置 TypeScript (strict mode, path aliases)
- [ ] 配置 ESLint + Prettier
- [ ] 配置 Tailwind CSS
- [ ] 创建 Electron 主进程 + 渲染进程骨架
- [ ] 配置 electron-builder 打包
- [ ] 配置 Vite (渲染进程构建)
- [ ] 创建基本窗口布局 (标题栏 + 侧边栏 + 内容区)
- [ ] 设置热重载开发环境

**验证**：`pnpm dev` 启动应用，显示基本窗口

### Phase 1: 卡牌数据库 + 卡组管理 (Week 2-3)

**目标**：能够浏览卡牌、创建和编辑卡组

**HearthDb 包**：
- [ ] 解析 Cards.json (从 HearthDb 项目获取)
- [ ] CardDef 类型定义 (id, name, cost, attack, health, text, class, rarity, set, type)
- [ ] 卡牌查找工具 (按 ID、名称、职业、法力值、稀有度)
- [ ] 卡组码编解码算法
- [ ] 职业图标和稀有度颜色资源

**卡组管理**：
- [ ] DeckManager 核心 CRUD
- [ ] SQLite 卡组存储
- [ ] 卡组选择器页面 (按职业分类)
- [ ] 卡组编辑器 (搜索/过滤/添加/删除卡牌)
- [ ] 卡组合法性验证 (30张牌、同名≤2张、传说≤1张、职业限制)
- [ ] 卡组导入 (剪贴板文本、卡组码、JSON)
- [ ] 卡组导出 (卡组码、JSON)
- [ ] 卡组备注
- [ ] 卡牌 Tooltip 组件 (悬浮显示详情)

**验证**：能够搜索卡牌，创建卡组，导入/导出卡组码

### Phase 2: 日志解析 + 游戏状态追踪 (Week 3-5)

**目标**：能够通过日志追踪实时游戏状态

**HearthWatcher 包**：
- [ ] 日志文件监听 (fs.watch)
- [ ] 行缓冲和增量解析
- [ ] PowerTaskList 解析器 (最复杂)
  - [ ] CREATE_GAME / GAME_START
  - [ ] PLAY 卡牌 (从手牌打出)
  - [ ] DRAW 抽牌
  - [ ] HAND (手牌变化)
  - [ ] ATTACK 攻击
  - [ ] DEATH 死亡
  - [ ] HERO_POWER 英雄技能
  - [ ] SECRET 秘密
  - [ ] GAME_OVER 游戏结束
- [ ] LoadingScreen 解析器 (游戏模式检测)
- [ ] Asset 解析器 (对手卡牌检测)
- [ ] Rank 解析器 (段位变化)
- [ ] 统一事件系统

**GameState**：
- [ ] 实体管理 (Entity Map)
- [ ] 标签系统 (Tag 变更追踪)
- [ ] 己方/对方状态分离
- [ ] 牌库追踪 (预测对手剩余卡牌)
- [ ] 换牌阶段追踪
- [ ] 游戏结束检测和结果记录

**验证**：启动炉石传说，开始一局对战，日志解析正确更新 GameState

### Phase 3: 游戏内覆盖层 (Week 5-7)

**目标**：在炉石窗口上显示卡组和计时器

- [ ] 创建透明覆盖层 BrowserWindow
- [ ] 炉石窗口检测和位置追踪
- [ ] 覆盖层跟随炉石窗口移动/缩放
- [ ] 己方卡组面板 (PlayerDeck)
  - [ ] 卡牌列表，已打出标灰
  - [ ] 卡牌计数
  - [ ] 法力值曲线
- [ ] 对手卡组面板 (OpponentDeck)
  - [ ] 已知卡牌显示
  - [ ] 预测剩余牌库
- [ ] 回合计时器 (TurnTimer)
- [ ] 鼠标悬停 Tooltip
- [ ] 覆盖层显示/隐藏设置
- [ ] 覆盖层位置和大小设置

**验证**：覆盖层正确显示在炉石上方，实时更新卡组状态

### Phase 4: 对局统计 (Week 7-8)

**目标**：记录和展示对局统计数据

- [ ] 对局结果自动记录
- [ ] SQLite 对局记录存储
- [ ] 统计概览页面
  - [ ] 总胜率
  - [ ] 按职业胜率
  - [ ] 按模式胜率
- [ ] 胜率图表 (Recharts)
  - [ ] 时间趋势
  - [ ] 职业分布饼图
- [ ] 对局历史列表
  - [ ] 过滤器 (职业/模式/日期/卡组)
- [ ] 对战匹配分析
- [ ] 换牌数据记录

**验证**：打完几局后统计数据正确显示

### Phase 5: 竞技场支持 (Week 8-9)

**目标**：竞技场选牌辅助和追踪

- [ ] 竞技场模式检测
- [ ] 竞技场选牌追踪 (ArenaDraft 解析)
- [ ] 选牌建议面板 (基于 tier list)
- [ ] 竞技场卡组显示
- [ ] 竞技场胜场记录
- [ ] 竞技场奖励追踪
- [ ] 竞技场统计

**验证**：进入竞技场模式，选牌时显示建议

### Phase 6: 酒馆战棋支持 (Week 9-10)

**目标**：酒馆战棋模式支持

- [ ] 战棋模式检测
- [ ] 英雄选择追踪
- [ ] 英雄评级面板
- [ ] 随从面板 (BoardMinionOverlay)
- [ ] 战斗模拟集成 (BobsBuddy)
- [ ] 战棋经验值/回合数显示
- [ ] 战棋统计

**验证**：进入战棋模式，覆盖层显示战棋信息

### Phase 7: HearthMirror 内存读取集成 (Week 10-12)

**目标**：通过内存读取获取卡牌收藏等日志无法获取的数据

> 详见 `Rewrite_Design.md`

- [ ] Rust native 库构建 (i686-pc-windows-msvc)
- [ ] Mono 运行时解析
- [ ] FFI 绑定层
- [ ] TypeScript HearthMirror API
- [ ] 集成到主应用
  - [ ] 卡牌收藏读取
  - [ ] 当前卡组同步
  - [ ] 段位信息
  - [ ] BattleTag
  - [ ] 金币/竞技场次数
  - [ ] 模板卡组导入

**验证**：读取卡牌收藏，与实际游戏内收藏对比一致

### Phase 8: 完善与发布 (Week 12-14)

- [ ] 设置页面完善
  - [ ] 通用设置 (语言、启动行为)
  - [ ] 覆盖层设置 (位置、透明度、字体大小)
  - [ ] 热键设置
  - [ ] 统计设置 (自动记录、对战记录)
- [ ] 国际化 (中文/英文)
- [ ] 自动更新 (electron-updater)
- [ ] 系统托盘图标
- [ ] 错误报告和日志
- [ ] 性能优化
- [ ] electron-builder 打包配置
- [ ] Windows 安装包

---

## 7. 关键技术决策

### 7.1 为什么用 Electron 而不是 Tauri

| 因素 | Electron | Tauri |
|------|----------|-------|
| 覆盖层支持 | 成熟的透明窗口 API | 有限 |
| 32位 Node.js | ffi-napi 需要 x86 | Rust 原生支持 |
| 生态 | 丰富 (React DevTools 等) | 较新 |
| 包大小 | 较大 (~150MB) | 较小 (~10MB) |
| HearthMirror FFI | ffi-napi 成熟方案 | napi-rs 需要适配 |

选择 Electron 是因为覆盖层是核心功能，Electron 的透明窗口 API 最成熟。后续可以评估迁移到 Tauri。

### 7.2 日志解析 vs 内存读取

两种数据来源各有优劣，应该**优先使用日志，内存读取作为补充**：

| 数据 | 日志解析 | 内存读取 |
|------|----------|----------|
| 游戏动作 | ✅ 完整 | ✅ 完整 |
| 对手手牌 | ❌ 不可见 | ❌ 不可见 |
| 卡牌收藏 | ❌ 无 | ✅ 可读取 |
| 段位信息 | ⚠️ 部分 | ✅ 可读取 |
| 金币/竞技场次数 | ❌ 无 | ✅ 可读取 |
| 稳定性 | ✅ 高 (Blizzard 不常改日志格式) | ⚠️ 中 (版本更新可能导致偏移变化) |
| 开发难度 | 中 | 高 |

### 7.3 数据存储选择 SQLite

- 对局记录和卡组数据是结构化的关系数据
- SQLite 是嵌入式数据库，无需额外安装
- `better-sqlite3` 是同步 API，性能优秀
- 数据库文件可以直接复制备份

### 7.4 状态管理选择 Zustand

- 比 Redux 简洁，API 更直观
- 支持 selector，避免不必要的重渲染
- 支持中间件 (persist, devtools)
- 包体积小 (~1KB)

---

## 8. 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| 炉石更新改变日志格式 | 中 | 高 | HearthWatcher 模块化解析器，快速适配 |
| Mono 运行时偏移量变化 | 高 | 高 | 可配置偏移量表 + 运行时探测 |
| Electron 覆盖层性能 | 低 | 中 | 独立渲染进程，避免主窗口阻塞 |
| 32位 Node.js 生态兼容性 | 低 | 中 | ffi-napi 成熟支持 x86 |
| 炉石反作弊检测 | 低 | 高 | 只读内存，不修改，与 HDT 行为一致 |

---

## 9. 里程碑

| 里程碑 | 时间 | 交付物 |
|--------|------|--------|
| M0: 项目骨架 | Week 1 | 可运行的 Electron 空壳应用 |
| M1: 卡组管理 | Week 3 | 卡牌浏览、卡组创建/编辑/导入导出 |
| M2: 日志追踪 | Week 5 | 实时游戏状态追踪，自动检测游戏事件 |
| M3: 覆盖层 | Week 7 | 游戏内卡组和计时器显示 |
| M4: 统计系统 | Week 8 | 对局统计记录和可视化 |
| M5: 扩展模式 | Week 10 | 竞技场 + 酒馆战棋支持 |
| M6: 内存读取 | Week 12 | HearthMirror 集成，卡牌收藏 |
| M7: 发布版 | Week 14 | 可安装的 Windows 应用，自动更新 |
