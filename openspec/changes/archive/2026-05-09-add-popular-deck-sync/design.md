## Context

热门卡组数据当前是构建期静态种子（`packages/core/src/deck/popular-decks-seed.ts`），由
`data/hsguru-data-spider/` 下一个独立 Node 脚本人工抓 HSGuru → 手 commit → 发版。
DeckFinderTab 已经成熟（`add-deck-finder` 已合入），渲染层只关心 `popular-decks:list`
IPC 给它什么。本 change 在不改这条契约骨干的前提下，把"刷新"动作下放给用户。

约束：
- 不引入新 npm 依赖（HTTP 用 Electron 内置 `net.fetch`）
- 保留打包种子作为兜底——首次启动、网络失败、解析失败都能用
- 现有的 spider 脚本继续维护种子，本 change 不动它
- HSGuru 是第三方网站，没有公共 API，只能继续解析 HTML——必须容忍 DOM 结构变更

## Goals / Non-Goals

**Goals:**
- 用户在 DeckFinderTab 顶部按一下按钮，主进程拉 HSGuru，落盘到 userData，UI 自动刷新
- 同步过程对用户可见（进度条 + 当前阶段），失败有明确文案，不闷崩
- 缓存写入原子化、schemaVersion 化，损坏时优雅回退到种子
- 复用现有 spider 的解析逻辑（移植，不重写）；保留 spider 脚本作为种子来源

**Non-Goals:**
- 不做后台/定时自动同步——纯用户主动
- 不做多版本快照、回滚、diff 对比
- 不替换打包种子的生成方式（spider 仍是种子来源）
- 不引入数据库存储（一个 JSON 文件够用）
- 不做并发同步（同一时刻最多一个）

## Decisions

### Decision 1：HTTP 客户端

- **Context**：需要从主进程发 HTTPS 请求到 hsguru.com，并支持 abort、自定义 UA。
- **Options**：
  - A. Electron `net.fetch`（基于 Chromium 网络栈，自带代理/CA 处理）
  - B. Node `globalThis.fetch`（undici，从 Node 18 起内置）
  - C. 第三方库（axios / undici 显式依赖）
- **Choice**：A — Electron `net.fetch`
- **Rationale**：内置无新依赖，自动复用用户系统代理设置（炉石玩家很多在中国，需要走代理才能访问
  hsguru.com）。`net.fetch` API 与 `globalThis.fetch` 兼容，迁移成本为零。
  spider 用的是 Node `fetch`，但 spider 跑在用户自己的开发环境，能假设代理 OK；产品里不行。

### Decision 2：sync 取消机制

- **Context**：用户可能切换 Tab、关闭窗口或主动取消，长时间挂起的 HTTP 请求要能被中断。
- **Options**：
  - A. `AbortController` 贯穿 fetcher，每个 archetype 间检查 `signal.aborted`
  - B. 不可取消，等自然完成或超时
- **Choice**：A
- **Rationale**：spider 已经是顺序 + delay 模式（最长 ~30s），用户在 UI 等不及很正常；
  Electron 退出时也需要能干净中断。

### Decision 3：进度推送方式

- **Context**：渲染层要显示当前阶段+百分比+文案。主进程进度天然是事件流。
- **Options**：
  - A. `webContents.send('popular-decks:sync-progress', payload)` + 渲染端 `ipcRenderer.on`
  - B. 渲染端轮询 `popular-decks:sync-status`
  - C. Renderer Subject + Zustand store
- **Choice**：A
- **Rationale**：和现有 IPC 风格一致（`ipcMain.handle` 处理一次性请求，`webContents.send`
  推事件）。轮询太糙；C 不适合跨进程。preload 暴露 `onSyncProgress(cb): unsubscribe` 给渲染。

### Decision 4：持久化路径与文件格式

- **Context**：sync 结果要落盘，下次启动直接读。不要污染源码树。
- **Options**：
  - A. `<userData>/popular-decks/synced.json`，单文件 + `schemaVersion`
  - B. better-sqlite3（项目已有这个依赖）
  - C. localStorage（渲染层）
- **Choice**：A
- **Rationale**：30~150 个 deck record（约 80KB JSON）远不到要 SQL 的体量；JSON 调试友好；
  原子写靠 `write tmp + rename`。SQLite 现在主要给对局/卡组/设置用，引入新表是 overkill。
  localStorage 不行——主进程拿不到。
- **schemaVersion**：硬编码 `1`，将来字段变更直接 bump，老 cache 触发兜底回退种子。

### Decision 5：原子写

- **Context**：JSON 写一半进程崩了不能让下次启动读到半截文件。
- **Options**：
  - A. `fs.promises.writeFile(tmp) → fs.promises.rename(tmp, final)`
  - B. 直接 `writeFile(final)`
- **Choice**：A
- **Rationale**：Windows / macOS 的 `rename` 都是原子的（同一文件系统），符合 POSIX 约定。
  写失败时 `tmp` 留在那里下次会被覆盖，不影响生产文件。

### Decision 6：HSGuru 解析逻辑放在哪

- **Context**：spider 的解析函数 `parseLegendArchetypes` / `parseDeckVariants` /
  `decodeHtml` / `buildDeckUrls` 已经验证过；移植 vs 共享。
- **Options**：
  - A. 在 `apps/desktop/src/main/popular-decks-sync/parser.ts` 里**复刻** spider 的纯函数
    （HTML in → 结构化对象 out），spider 脚本独立保留
  - B. 把 spider 抽成一个 npm 子包 `@hdt/hsguru-scraper`，spider 和主进程共享
- **Choice**：A
- **Rationale**：spider 是 `.mjs`、生产代码是 `.ts`+strict；目标运行环境不同（Node CLI vs
  Electron main）。抽包要做 ESM 互操作 + 加 build 配置 + 测试桥接，工作量远超复刻。
  解析函数加起来 ~40 行，复刻 + 加单测更直接。Spider 仍然按现有方式独立维护，
  以后两边任何 DOM 变更各自修，互不卡。
- **代价**：DOM 结构变化时两处都要改。可接受——种子文件本来就要重建，时机重叠。

### Decision 7：HSGuru archetype label → PopularDeckArchetype 映射

- **Context**：HSGuru 的 archetype 字段是自由文本（"Aggro Hunter", "Tempo Mage",
  "Big Priest"...），种子把它压到 6 类（`Aggro|Midrange|Control|Combo|Tempo|Ramp`）。
- **Options**：
  - A. 关键字匹配表（"Aggro" → Aggro, "Tempo" → Tempo, "Combo" → Combo, ... 兜底 Midrange）
  - B. 基于 mana curve 的启发式
  - C. 让用户自己分类
- **Choice**：A
- **Rationale**：种子文件本来就是这么手工归类的；启发式有错的风险（高曲线不一定是 Control）；
  让用户分太重。映射表写在 `popular-deck-classifier.ts`，未知 label 兜底 `Midrange` 满足
  spec 不变量。

### Decision 8：新缓存与种子的"夹生"问题

- **Context**：sync 写入的 `synced.json` 字段集与种子可能略有差异（例如 `dustCost` 同步阶段算
  不出来——dust 需要 CardDb，要在 IPC enrich 时算）。
- **Options**：
  - A. 持久化 `dustCost: 0` 占位，IPC enrich 时按需重算（已有 `popular-decks-derived.ts`）
  - B. 同步时就把 CardDb 拉进来算 dust 然后落盘
- **Choice**：A
- **Rationale**：现在的 IPC enrich pipeline 已经在每次 list 时算 manaCurve / keyCards；
  把 dust 一起放过来更内聚，sync 模块只负责"从 HSGuru 拿 PopularDeck 半成品"，不掺 CardDb 依赖。
- **后续**：如果未来嫌每次 list 都重算 dust 慢，再加个 enrichedCacheKey 缓存层。

### Decision 9：节流与礼貌

- **Choice**：照搬 spider 的 1s/archetype 间隔；初始顺序请求（不并发）。
- **Rationale**：HSGuru 是一个站点维护者用爱发电的小站，本就没必要并发。20 archetype × 2s
  ≈ 40s 总耗时，UX 上靠进度条吸收。

### Decision 10：错误分类与文案

- 三类错误：网络（fetch reject / 非 2xx）、解析（HTML 结构变了，记录数 0）、写盘（IO 失败）。
- 都通过 `popular-decks:sync-start` 的 `{ ok: false, error: <code> }` 回到渲染，
  渲染映射到本地化文案；不暴露技术细节给用户。

## 文件结构

```
apps/desktop/src/main/popular-decks-sync/
├── index.ts                   # 公共入口：startSync, getStatus, loadCache
├── fetcher.ts                 # net.fetch 封装 + abort + delay
├── parser.ts                  # parseLegendArchetypes/parseDeckVariants（纯）
├── transformer.ts             # 原始 spider 输出 → PopularDeck
├── classifier.ts              # archetype label → PopularDeckArchetype 表
├── storage.ts                 # synced.json 原子读写 + 校验
├── ipc.ts                     # 三个 IPC 通道注册
├── parser.test.ts             # HTML fixture 单测
├── transformer.test.ts        # 转换 + 类型不变量
└── storage.test.ts            # 原子写、损坏缓存兜底

apps/desktop/src/main/popular-decks-ipc.ts   # MODIFIED：source 切换 + fetchedAt 字段
apps/desktop/src/preload/index.ts            # MODIFIED：syncStart/syncStatus/onSyncProgress
apps/desktop/src/renderer/src/components/
└── DeckFinderTab.tsx          # MODIFIED：加 sync 控制行 + 进度 UI

resources/locales/
├── en-US.json                 # 加 decks.finder.sync* 键
└── zh-CN.json                 # 同上
```

## Risks / Trade-offs

- **Risk**：HSGuru DOM 改版导致解析返回 0 条 → **Mitigation**：解析返回空时 `sync-start`
  返回 `{ ok: false, error: 'parse-failed' }`，UI 显示"暂时无法同步，仍可使用打包数据"，
  不污染缓存（不写文件）。同时记日志便于排查。
- **Risk**：用户没代理访问不到 hsguru.com → **Mitigation**：`net.fetch` 自动用系统代理；
  超时 45s（与 spider 一致）后报 `network-failed`；UI 文案明确"检查网络/代理"。
- **Risk**：synced.json 损坏 → **Mitigation**：schema 版本 + 完整字段校验，任一异常静默回退种子。
- **Risk**：用户在 sync 过程中关窗口 → **Mitigation**：主进程 `app.before-quit` 里 abort 当前
  controller；未完成的写盘留作 `synced.json.tmp`，下次启动忽略。
- **Risk**：法律/速率限制——hsguru 没明确 ToS 但被反爬封 IP 是潜在风险 → **Mitigation**：
  保持顺序 + 1s delay + 用户主动触发（不自动定时）。如果未来规模上来再考虑做缓存代理服务。
- **Trade-off**：复刻 spider 解析逻辑而非共享子包，DOM 改版要改两处——接受，工作量小于抽包。
- **Trade-off**：dustCost 同步时不算（IPC enrich 时算），每次 `list` 多一次循环——可接受
  （150 deck × 30 card = 4500 次 lookup，<1ms）。

## Migration Plan

1. 落 sync 模块代码 + IPC + UI；保留种子文件不改。
2. 首发版本 `synced.json` 不存在 → 走 seed 路径，行为与现状一致。
3. 用户点同步 → 写入 `synced.json` → 后续启动走 synced 路径。
4. 回滚策略：UI 上不做"清空缓存"按钮（YAGNI），用户重装/手删 userData 即清；如果出现严重问题，
   下版本可加 `popular-decks:reset-cache` IPC（不在本 change 范围）。

## Open Questions

- 是否需要在 settings 页加"上次同步时间 + 同步按钮"作为第二入口？— 暂不做；DeckFinderTab
  顶部一处足够。
- 是否暴露"sync 时跳过 dust 计算以省时间"开关？— 不做，dust 在 enrich 阶段算，sync 本身不涉及。
- 未来是否切到 hsreplay.net 数据源？— 不在本 change 范围；接口设计保留 source 字段为字符串
  联合便于未来扩展（目前只有 `'synced' | 'seed'`）。
