## Context

记牌器主窗口（renderer）和两个 overlay (`/overlay`、`/overlay-opponent`) 共享同一份样式入口（`apps/desktop/src/renderer/src/styles/`）。当前 token 体系由 `theme.css` 中的 "Console theme tokens" 块（`--bg/--bg-2/--bg-3/--border/--border-hi/--text/--text-dim/--accent/...`）作为 single source of truth。所有可滚动区域（`overflow-y-auto`、`overflow-x-auto`）目前回落到 Chromium 默认滚动条样式：浅灰、宽度 ~17px、空闲态常驻 —— 跟深色 + 强调色（`--accent: #22d3ee`）的整体调性脱节，在透明 overlay 上尤其突兀。

主流程：

- Tailwind v4，全局样式合入 `styles/index.css`，token 在 `theme.css` 内。
- 主窗口和 overlay 共用一份入口样式（看 routes.tsx），所以单一全局规则自然命中所有渲染端。
- Electron Chromium 内核稳定支持 `::-webkit-scrollbar` 系列伪元素 + `scrollbar-color/scrollbar-width`（后者是 Firefox/规范，前者是 WebKit/Blink，Electron 用 Blink）。

## Goals / Non-Goals

**Goals:**

- 把所有可滚动容器的滚动条统一替换为符合 console theme 的视觉（深色轨道、accent 滑块、收窄宽度、圆角）。
- 主窗口和 overlay 用同一套 token，仅在 overlay 路由下覆盖少量值（更窄、半透明、空闲淡出）。
- 仅 CSS 改动，零 JS 依赖、零容器结构变化。

**Non-Goals:**

- 不引入 simplebar / overlayscrollbars / react-custom-scrollbars 等运行时滚动方案。
- 不接管 Radix popover/select 等内部组件自带的滚动样式（它们如果穿透到默认 scrollbar，会被全局规则一并接住，但不专门定制）。
- 不为 macOS overlay scrollbar API 做适配（项目主平台 Windows）。
- 不改任何滚动容器的标记或 overflow 配置。

## Decisions

### Decision 1: 实现方式 — 纯 CSS（`::-webkit-scrollbar*`）

- **Context**: Electron 33（基于 Blink）渲染所有 renderer 内容，不会出现 Firefox 等其他内核。
- **Options**:
  1. JS 库（simplebar、overlayscrollbars）：能拿到一致行为、动画曲线可控，但要包一层容器、跟 virtualization 不友好。
  2. 纯 `::-webkit-scrollbar*` + `scrollbar-color/scrollbar-width`：零依赖，命中所有容器。
  3. 混合：仅 overlay 用 JS 库。
- **Choice**: 选 2。
- **Rationale**: 我们只跑在 Blink，伪元素 100% 可用；不动 DOM 结构，对未来引入 list virtualization 也无副作用；零运行时开销契合 overlay "尽量不抢资源" 的诉求。

### Decision 2: Token 归属 — 复用 `console-theme-tokens`，新增 5 个 token

- **Context**: 现有 token 已分组（背景层、文本层、强调色层）。滚动条颜色与背景/边框/强调色强相关，没必要单开 layer。
- **Options**:
  1. 在 `theme.css` 的 console theme tokens 块里追加 `--scrollbar-*` 系列。
  2. 新建 `styles/scrollbar.css`，自带 token + 规则。
- **Choice**: 选 1（token 在 `theme.css`），规则放在新文件 `styles/scrollbar.css` 并由 `index.css` 引入。
- **Rationale**: token 集中管理便于后期主题切换；规则单独成文件方便审阅和后续 variant 扩展。

新增 token：

- `--scrollbar-track`：等同 `--bg-2`（轨道，与最常见容器背景拉开 1 阶层级）。
- `--scrollbar-thumb`：`#2a3543`（即 `--border-hi`，静态滑块颜色）。
- `--scrollbar-thumb-hover`：`--text-mute`（hover 提亮一档）。
- `--scrollbar-thumb-active`：`--accent`（按下/拖拽时显强调色）。
- `--scrollbar-size`：`8px`（主窗口）。

overlay variant 通过 root 选择器（`html[data-route^="/overlay"]` 或 `body.overlay`）覆盖：

- `--scrollbar-size`：`6px`。
- `--scrollbar-track`：`transparent`。
- `--scrollbar-thumb`：`rgba(42,53,67,0.55)`（在透明背景上半透明）。

### Decision 3: 应用方式 — 全局规则 + scope 覆盖

- **Context**: 想保证默认所有 `overflow:auto/scroll` 容器都吃到样式，又不影响 Radix portal 出去的菜单（它们也是 renderer 内的，但希望一致）。
- **Options**:
  1. 全局 `*::-webkit-scrollbar { ... }` 规则。
  2. 加一个 `.themed-scrollbar` class 到需要的容器上。
- **Choice**: 选 1（全局），overlay 单独 scope 一层。
- **Rationale**: 改动量小、零回归；Radix 内嵌滚动同样受益；后期若有"想保留默认滚动条"的特例，再用 `.native-scrollbar` 反向 escape hatch（本期不实现，留给 follow-up）。

### Decision 4: overlay 的 scope 锚点

- **Context**: overlay 路由是 `/overlay` 和 `/overlay-opponent`，由 React Router 渲染。需要一个能在样式表里锁定的稳定标记。
- **Options**:
  1. `body[data-overlay="true"]`：在 overlay 路由的根组件 `useEffect` 里设置。
  2. `html[data-route^="/overlay"]`：依赖 router 钩子同步 dataset。
  3. 在 overlay 根 `<div>` 上加 class，再用后代选择器。
- **Choice**: 选 1。
- **Rationale**: overlay 已经有独立的 `OverlayView` / `OpponentOverlayView` 根组件可以直接挂 `useEffect`；放在 body 上选择器最简洁；同 BrowserWindow 内不会被打断（每个 overlay 是独立 window，body 全局唯一）。

## Risks / Trade-offs

- [Risk] Radix 内置滚动（hover-card、dropdown 长列表）也会被改色 → Mitigation：与主题一致是想要的效果；如果某些组件视觉异常，加 `.native-scrollbar` escape hatch（follow-up）。
- [Risk] `scrollbar-width: thin` 可能在某些 Chromium 版本下与 `::-webkit-scrollbar` 同时设置时表现奇怪 → Mitigation：仅在 Blink 上跑，先用 webkit 伪元素，`scrollbar-width` 仅作 fallback；通过本地手测验证。
- [Trade-off] overlay 滑块半透明在亮背景（极少见，比如某些英雄战吼背景）下可见度下降 → 接受，overlay 内容自带半透明蒙版，不会全亮。
- [Risk] 主题切换（如未来引入 light theme）时滚动条 token 没跟着翻 → 当前唯一的 light 主题片段（shadcn legacy 块）已声明为 unused；后期若启用 light，需要同步加滚动条 light 值。

## 受影响目录树

```
apps/desktop/src/renderer/src/styles/
├── fonts.css
├── index.css         (+ @import "./scrollbar.css";)
├── tailwind.css
├── theme.css         (+ 新增 5 个 --scrollbar-* token)
└── scrollbar.css     (新增 — 全局 + overlay scope 规则)
```

overlay 入口加一行 `useEffect` 在 mount 时设置 `document.body.dataset.overlay = 'true'`：

```
apps/desktop/src/renderer/src/components/
├── OverlayView.tsx           (+ effect)
└── OpponentOverlayView.tsx   (+ effect)
```

## Migration Plan

无数据迁移。落地步骤：

1. 加 token，加 `scrollbar.css`，在 `index.css` 引入。
2. 给两个 overlay 根组件挂 body data attr。
3. `pnpm dev` 本地肉眼验收：主窗口列表、overlay 卡牌列表、Radix dropdown 滚动均吃到样式。
4. 回滚：纯 CSS + 一行 effect，单 commit revert 即可。

## Open Questions

无。
