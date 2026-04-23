## Context

### 现状
`add-deck-tracker-mvp` 已经把 DeckTracker 编排器 / IPC / Zustand /
LiveDeckPanel 整条链路跑通。当前 `LiveDeckPanel` 的渲染合同
（`packages/core` → IPC snapshot → renderer）是：

```ts
// DeckTrackerSnapshot.deck 当前形状（M2）
{
  name: string,
  heroClass: string | null,
  original: { cardId: string, count: number }[],   // 按 cardId 聚合
  remaining: { cardId: string, count: number }[],  // 按 cardId 聚合
  extras: { cardId: string, count: number }[],
}
```

UI 直接把 `deck.original` map 成一行 `<CardRow cardId remainingCount
originalCount />`。`remaining === 0` 时加 `opacity-40 grayscale`。

### 驱动力
1. 原版 HDT（WPF）是"每张实体卡一行"的形态（双张同名卡叠在一起，但
   仍是两行） —— 用户看惯了，也能更直观体会"我 2 张火球还剩 1 张"。
2. "灰显 + 2/2 → 1/2"对色觉/专注度要求高；直接 pop 更接近 HDT 原版
   的即时反馈。
3. 卡牌美术图接入是 Overlay（Phase 6）和 Deck Import（Phase 3.5）的
   共同依赖，本 change 顺便把 CDN 管线和 CSP 白名单踩通。

### 约束
- 不动 `@hdt/core` 域模型、`DeckTracker` 编排器、Rust 反射层、IPC。
- `DeckTrackerSnapshot` schema 保持向后兼容 —— 展开成单卡是 renderer
  端的派生视图（`expandDeckToCopies` 纯函数，`@hdt/core` 提供）。
- 保留 `add-deck-tracker-mvp` 已经建好的测试 / 架构边界。

## Goals / Non-Goals

**Goals:**
- LiveDeckPanel 新渲染形态：每张实体卡一行，按 cost ↑ / name A-Z /
  cardId 字典序稳定排序。
- 抽牌时"最右一张"淡出 + 右滑 ~600ms 后从 DOM 移除（不再灰显占位）。
- 鼠标悬停在某行 ≥ 300ms 时弹出该卡的大图（HearthstoneJSON CDN）。
- 新增 `@hdt/core` 纯函数 `expandDeckToCopies`（UI 不实现反聚合）。
- 所有新代码有对应单元测试；LiveDeckPanel 补一个快照测试保住对比。

**Non-Goals:**
- 不改 IPC / Rust / core 域模型；snapshot schema 不变。
- 不做双栏布局、类别分组、mana 曲线 mini-chart 等"高阶 HDT 模仿"。
- 不下载/缓存卡图到本地磁盘；走 Electron 内建 HTTP 缓存。
- 不做 locale 切换（hover 图固定 zhCN，404 回退 enUS）。
- 不改对手区、footer、empty/error states 的视觉。

## Decisions

### D1 — 渲染模型：按实体卡展开（30 行）而非按 cardId 聚合

- **Context**：M2 UI 是聚合形态，产品希望向原版 HDT 对齐。
- **Options**：
  - (a) 合并 + toggle 切换（"展开 / 折叠"按钮）
  - (b) 直接改为纯展开形态
  - (c) 聚合形态保留，在行内并排显示 N 个小 pill 代表每张
- **Choice**：**(b) 纯展开形态**。
- **Rationale**：toggle 增加状态 + 偏好持久化 + 测试分支，YAGNI；
  行内 pill 视觉更差且空间不够。展开形态跟 HDT / Firestone 视觉一
  致；行数即 30 本身就是一种"deck size"的直观指标。
- **数据来源**：`expandDeckToCopies(original): CardCopy[]`（见 D3）。

### D2 — 排序规则：`cost ↑, name ↑, cardId ↑`

- **Context**：同 cost 的牌视觉上要稳定，避免 Tailwind transition
  过程中"位置跳跃"。
- **Options**：
  - (a) 只按 cost（不稳定，同 cost 内会随后端返回顺序跳）
  - (b) cost → name（若 name 相同——比如 2 张同卡——仍会共享行位但
    稳定）
  - (c) cost → name → cardId（100% 决定性）
- **Choice**：**(c)**。
- **Rationale**：同名双张会相邻且顺序确定，便于 pop 动画"永远最
  后一张退出"。`cost = undefined / null` 的（英雄技能、未收录）统
  一按 99 排到最后。
- **稳定性验证**：单测覆盖 `cost` 冲突 / `name` 冲突 / `cost` 缺失
  三种情形。

### D3 — `expandDeckToCopies` 放在 `@hdt/core` 而非 renderer

- **Context**：把 `{ cardId, count }[]` 反聚合为单卡数组是纯逻辑，
  未来 Overlay / Deck Import 可能也要用。
- **Options**：
  - (a) 写在 `LiveDeckPanel` 内 `useMemo`
  - (b) 做成 `apps/desktop/src/renderer/src/utils/` 工具
  - (c) 放 `@hdt/core/src/deck/expand-copies.ts`，renderer 通过
    `@hdt/core` 调用
- **Choice**：**(c)**。
- **Rationale**：`@hdt/core` 已有 `DeckSnapshot` / `computeRemaining`
  等纯函数邻居；与它们同目录方便测试和后续复用。Electron 已经把
  `@hdt/core` inlined（`electron.vite.config.ts.WORKSPACE_INLINE`），
  零配置变更。
- **签名**：
  ```ts
  interface DeckCopy {
    copyKey: string;       // 稳定 key: `${cardId}#${ordinal}` (0-indexed)
    cardId: string;
    ordinal: number;       // 0..count-1
  }
  function expandDeckToCopies(
    deck: { cardId: string, count: number }[],
  ): DeckCopy[];
  ```

### D4 — "pop" 而非灰显：用 AnimatePresence 还是 CSS?

- **Context**：原生 React 不自带"退场动画"；常见方案：
  - (a) `framer-motion`（已在 pnpm-lock 里作为 transitive dep，约
    38KB gzipped；API 成熟，`AnimatePresence` 即开即用）
  - (b) `react-transition-group`（API 老，新增直接 dep 但体量 ~6KB）
  - (c) 自实现：CSS keyframe + React state `exiting: Set<copyKey>`，
    动画结束时 `onAnimationEnd` 从列表里移除
- **Choice**：**(c) 自实现 CSS + `onAnimationEnd`**。
- **Rationale**：
  - YAGNI：一次性的 fade+slide，不需要 spring / gesture / layout
    animation。自实现 ~40 LoC。
  - 不新增直接 dep，控制 bundle 体积（electron renderer 首屏比较敏感）。
  - 退场逻辑简单：`diff prev snapshot` 找出消失的 copyKey，在该 key
    对应的 DOM 上附加 `.animate-deck-exit` className，`onAnimationEnd`
    调用 `setExitingKeys(s => s.delete(key))` 触发真正 unmount。
  - 有回退：若 `prefers-reduced-motion: reduce`，CSS 降级为 50ms
    直接淡出（尊重系统设置）。
- **动画细节**（Tailwind v4 arbitrary + CSS module 或 `tailwind.config` 扩展）：
  ```css
  @keyframes deckExit {
    0%   { opacity: 1; transform: translateX(0); }
    20%  { opacity: 1; transform: translateX(0); background: rgba(251,146,60,0.25); }
    100% { opacity: 0; transform: translateX(40px); max-height: 0; padding: 0; border: 0; }
  }
  .animate-deck-exit { animation: deckExit 600ms forwards ease-out; }
  @media (prefers-reduced-motion: reduce) {
    .animate-deck-exit { animation: deckExit 50ms forwards linear; }
  }
  ```

### D5 — 抽牌检测：谁是"最后抽走的那一张"？

- **Context**：snapshot 只给 `remaining: { cardId, count }`。当
  `count` 从 2 → 1 时，我们展开后有 `cardId#0` 和 `cardId#1` 两个
  copy —— 哪一个被"抽走"了？
- **Options**：
  - (a) 约定"最后一个 ordinal 先退场" —— 总是把 `max(ordinal)` 对
    应的行标记为 exiting。
  - (b) 把"被抽到的 cardId"通过 DeckTracker event 推给 renderer，
    精确到 entityId。
- **Choice**：**(a) 最右一张退场**。
- **Rationale**：本 change 明确只做 UI polish，不动 IPC / core。而
  "固定退场最后一张"是视觉上完全合理的选择 —— 同名双张在 HDT 里就
  是对称的、不区分的。(b) 是 M3 log-stream 合入后的更精确方案，放
  到后续 change。
- **算法**（伪代码）：
  ```ts
  const prevRemainingByCardId = usePrev(remainingByCardId);
  const exitingKeys = new Set<string>();
  for (const [cardId, remaining] of remainingByCardId) {
    const prev = prevRemainingByCardId.get(cardId) ?? remaining;
    const delta = prev - remaining; // > 0 → 抽走了 delta 张
    for (let i = 0; i < delta; i++) {
      // 退场 copy 是原 original 视图里最靠后的那几张
      const ordinal = prev - 1 - i;
      exitingKeys.add(`${cardId}#${ordinal}`);
    }
  }
  ```

### D6 — 卡牌大图 URL 选型：HearthstoneJSON CDN

- **Context**：需要一个稳定、免费、不用鉴权、支持 cardId 查询的
  卡图源。
- **Options**：
  - (a) HearthstoneJSON `art.hearthstonejson.com/v1/render/latest/{locale}/{size}/{cardId}.png`
  - (b) Blizzard 官方 `bnetcmsus-a.akamaihd.net/...`（需发布后才能拿，
    beta card 缺失）
  - (c) Out-of-the-Cards `hearthstone.blizzard.com` SEO 图（无 cardId
    索引）
- **Choice**：**(a) HearthstoneJSON render CDN**。
- **Rationale**：
  - 跟卡牌数据源同平台（HearthstoneJSON），维护方 HearthSim = 前 HDT
    team，不会失维。
  - `latest/` 自动跟版本，新增卡无需手动更新 pipeline。
  - 支持 `zhCN` 本地化，匹配用户语言。
  - 免费、无 token、直连；Electron renderer 侧通过 `<img src>` 标签
    就能用。
- **URL 模板**：`https://art.hearthstonejson.com/v1/render/latest/zhCN/256x/${cardId}.png`
- **CSP 修改**：`index.html` 的 `img-src` 白名单加
  `https://art.hearthstonejson.com`。
- **错误回退**：`<img onError>` 触发时，把 locale 从 `zhCN` 换成
  `enUS`；第二次失败则显示一个"卡图缺失"占位。

### D7 — Hover 延迟 + 去抖：300ms 悬停阈值

- **Context**：鼠标滑过列表时不该每次都 fetch 大图（浪费带宽 + UI
  闪烁）。
- **Options**：
  - (a) 无延迟，`onMouseEnter` 立即弹出
  - (b) `setTimeout(300ms)` 悬停才弹出
  - (c) `setTimeout(500ms)`（保守）
- **Choice**：**(b) 300ms**。
- **Rationale**：与 VSCode / Chrome devtools 的 tooltip 经验值一致；
  低到足以响应"有意停留"的意图，高到足以过滤滑动。
- **实现**：`<CardRow onMouseEnter>` 里 `window.setTimeout` 开一个
  ref，`onMouseLeave` 里 `clearTimeout` + hide。挂到面板级的单一
  `<CardImagePopover>` 状态（`{ cardId, anchorRect } | null`），
  避免每行都挂一套弹出层 DOM。

### D8 — Popover 定位：面板左侧浮动，`fixed`

- **Context**：面板是 `280px` 宽的右侧固定列；卡图大约 `280 × 400px`
  的 PNG。
- **Options**：
  - (a) 就地覆盖 `<CardRow>`（会挤占文字）
  - (b) 面板左侧浮动 (`position: fixed; right: 300px; top: hoverY`)
  - (c) 全屏中央 modal（太重）
- **Choice**：**(b) 左侧浮动**。
- **Rationale**：不遮挡用户正在看的牌列；定位简单（`position: fixed`
  + 计算 `top/right`）；脱离文档流不需 scroll 协调。
- **边界处理**：接近顶部 / 底部时 `Math.max/min` 夹在 viewport 内
  8px 边距。
- **z-index**：面板是 shadow-xl；popover 用 `z-50`。

## Risks / Trade-offs

- **[Risk] CDN 抖动或 404 → Mitigation**：`onError` 做 `zhCN → enUS`
  回退，第二次失败显示占位 "卡图加载失败"；面板其它功能不受影响。
- **[Risk] CSP 放行了 `hearthstonejson.com` → Mitigation**：仅放行
  `https://art.hearthstonejson.com`（不含 api、data、scripts 子
  域），影响面最小；脚本和 connect 源仍是 `'self'`。
- **[Risk] 每张实体卡 30 行，若卡组是 40 张（battlegrounds）或未来
  callout 更多数据会撑爆面板 → Mitigation**：面板已经 `overflow-y:
  auto`；单测加"40 卡" fixture 保住滚动可用。
- **[Risk] 抽牌快连点时多张 exit 动画并发 → Mitigation**：
  `animate-deck-exit` 用独立 DOM key，多动画天然并行；
  `exitingKeys` 是 Set 无上限。DOM 节点在 `onAnimationEnd` 里才从
  React state 移除，600ms 内的连续抽牌不会丢帧。
- **[Risk] 热重载时 `prevRemainingRef` 可能错判所有卡"都在抽" →
  Mitigation**：初次 mount 时 `prev = current`，避免虚假 diff；
  由 `use-deck-copies.ts` hook 内的初始化逻辑保证。
- **[Trade-off] 不缓存图到磁盘**：首次启动 / 换卡组会看到 100ms
  级别的 PNG 下载等待。可接受（对标 Firestone 也是 CDN 直读），且
  为 Overlay 时单独考虑本地缓存留好口子（不在本 change 范围）。

## Migration Plan

1. `packages/core`：新增 `src/deck/expand-copies.ts` + 单测。
   不影响现有 API，零迁移成本。
2. `apps/desktop/renderer`：
   - 扩 CSS（Tailwind v4 `@theme` 加 keyframe 或引入 CSS module）。
   - 改写 `LiveDeckPanel.tsx` → `CardCopyRow` + `CardImagePopover`。
   - 新 hook `use-card-image-url.ts`、`use-deck-copies.ts`（用于
     diff-based exit 探测）。
3. `apps/desktop/src/renderer/index.html`：CSP 修一行。
4. 单测 + typecheck 绿灯，提交 `feat(deck-tracker): deck panel
   polish - per-copy rows, draw animation, hover card art`.

**Rollback**：纯 renderer + core 工具函数的修改，`git revert` 即回
退；因未改 schema / IPC / Rust，不存在二次兼容问题。

## Open Questions

- **OQ1 — 对手区要不要同步升级?** 本 change 已明确 Non-goal，但如
  果复用 `expandDeckToCopies` 和 `CardImagePopover`，未来对手手牌/
  board 的 hover 图可无缝接入。记录在 `docs/development-direction.md`。
- **OQ2 — Hover 大图是否展示卡牌描述文本**：本 change 只展示 PNG。
  未来如果要做"HDT-style 双栏 card + text"，`CardImagePopover`
  可扩展成 `CardTooltip`。不在本 change 范围。
