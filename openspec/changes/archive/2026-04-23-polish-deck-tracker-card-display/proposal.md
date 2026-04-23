## Why

`add-deck-tracker-mvp` 已经把"实时显示牌库剩余卡牌 + 抽牌即时更新"
的功能链路打通，但 `LiveDeckPanel` 当前的展示形态还是 M2 的最小可用
版本（一个 cardId 合并成一行 `name x N`，剩余=0 时灰显，无图、无动画）。
跟原版 HDT WPF 客户端的视觉表现差距明显，也跟用户对"看一眼就知道还
剩什么、这次抽到的是哪张"的体感预期不符。

本 change 在不改动 `@hdt/core` 域模型与 `DeckTracker` 编排器的前提下，
把 LiveDeckPanel 的 UI/UX 升级到 HDT 同等水平：按法力值升序、每张实
体卡占一行、抽走有动画然后从列表里弹出（而不是灰显），并第一次把
卡牌真实美术图引入工程（卡片 hover 时弹出大图）。

跟 `DEVELOPMENT_PLAN.md` 的关系：这是 Phase 4「Deck Tracker 业务化」
里 R-23 (UI polish) 的兑现，也是为后续 Phase 6「覆盖层」准备图像资
源管线（CDN 接入 + 缓存策略）。

## What Changes

- **LiveDeckPanel 渲染模型从"按 cardId 聚合"改为"按实体卡（physical
  copy）展开"**：30 张牌 = 30 行（同 cardId 的多张牌相邻；不再有
  `Fireball x2` 这种合并行；删除 `originalCount/remainingCount` 列）。
- **行排序规则**：先按 `cost` 升序，同 cost 按 `name` 字母序，同名
  按 cardId 字典序（决定性排序，保证渲染稳定）。`cost` 缺失（hero
  power、unknown）时按 99 排到最后。
- **抽牌交互**：当 `remaining[cardId]` 减少时，对应的"最右一张"行
  播放 ~600ms 的"抽出"动画（淡出 + 向右滑出），动画结束后**从 DOM
  里移除**（`exit` 模式，不再灰显占位）。
- **"刚抽到"高亮**保留并强化：抽走前的瞬间该行短暂高亮 ~300ms 再
  开始 exit 动画，给用户视觉锚点。
- **卡牌 hover 大图**：鼠标悬停在某行上 ≥ 300ms 时，在面板左侧弹出
  该卡的渲染图（HearthstoneJSON `art.hearthstonejson.com` CDN，
  `render/latest/zhCN/256x/<cardId>.png`），鼠标移开立即关闭。
  - 引入 `useCardImageUrl(cardId)` hook 与 `<CardImagePopover>` 组件
    （内嵌懒加载、错误回退、in-flight de-dup）。
  - 主进程 `apps/desktop/src/renderer/index.html` CSP 的 `img-src`
    白名单加上 `https://art.hearthstonejson.com`。
  - 不下载、不缓存到磁盘 —— Electron 内建 HTTP 缓存即可，YAGNI。
- **新增 `@hdt/core` 工具 `expandDeckToCopies(deck): DeckCopy[]`**：
  把 `DeckSnapshot` 展开成单卡数组，给 renderer 用；同时维护
  `remaining` 视图（已抽走的不出现在数组里，对应 UI 的 pop 行为）。
  纯函数 + 单测，使 UI 端不需要重复这个聚合反演逻辑。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `deck-tracker-core`：渲染契约从"按 cardId 聚合"演化为"按 physical
  copy 展开"；新增 `expandDeckToCopies` 公共 API；`LiveDeckPanel`
  规约更新（排序规则、抽牌动画 + pop、hover 大图）。

## Impact

- **代码**：
  - `apps/desktop/src/renderer/src/components/LiveDeckPanel.tsx` 重写
    渲染分支。
  - `apps/desktop/src/renderer/src/components/CardImagePopover.tsx`（新）。
  - `apps/desktop/src/renderer/src/hooks/use-card-image-url.ts`（新）。
  - `apps/desktop/src/renderer/index.html` CSP 调整。
  - `packages/core/src/tracker/expand-copies.ts`（新） + 单测。
- **依赖**：`framer-motion`（已在 desktop 包里？若无则 ~38KB gzipped
  新增依赖；候选：自实现 CSS keyframe 动画以避免新依赖 —— 设计阶段
  在 design.md 选）。
- **网络**：首次 hover 会 fetch 大约 80–200KB 的 PNG；中文 locale
  优先，404 回退到 enUS。
- **CSP**：`img-src` 白名单需放行 `https://art.hearthstonejson.com`。
- **不影响**：`@hdt/hearthmirror`、`@hdt/hearthmirror-native`、
  `DeckTracker` 编排器、IPC schema、main 进程。本 change 是纯
  renderer + core 工具函数级别的工作。

## Non-goals

- 不做对手手牌/对手 secret 的可视化升级（仍由 `routes.tsx` 的右侧
  panel 静态显示）。
- 不在本 change 引入图像本地缓存或离线包；走 Electron HTTP 缓存。
- 不实现"展开/折叠合并视图"toggle —— 单一展开形态即新默认。
- 不重做空状态、错误态、footer 的视觉（保留 M2 当前样式）。
- 不引入 i18n locale 切换（hover 大图固定 zhCN，404 回退 enUS）。
- 不实现"抽牌动画期间 lock UI"等高保真动效，仅做基础 fade+slide。
