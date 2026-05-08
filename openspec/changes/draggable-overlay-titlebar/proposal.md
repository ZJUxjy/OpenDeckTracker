## Why

两个 overlay (`/overlay`、`/overlay-opponent`) 当前由 `hearthstone-window-tracker` 强制贴在 Hearthstone 窗口左右两侧，用户无法手动微调位置。但显示器/分辨率/HUD 习惯各异，默认贴边位置经常压住自带 UI（金币条、回合计时、英雄技能弹窗）。需要让用户用鼠标拖拽顶部菜单栏（牌库 / 全局效果 / 关闭键这一栏）把 overlay 移到自己想要的位置，且后续 HS 窗口移动时 overlay 跟随移动但保留用户设定的偏移。

底层原因有两个：

1. 顶部菜单栏（`TrackerPanelTabs` 的 tablist `<div>`）没有挂 `-webkit-app-region: drag`，OS 根本识别不到这块是窗口拖拽热区。
2. 即使能拖动，`hearthstone-window-tracker` 每次 poll 都会调用 `setBounds` 把 overlay 重新对齐到 HS 窗口边沿，把用户的位移瞬间还原。

## What Changes

- 给 `TrackerPanelTabs` 的顶部 tablist 容器加 `-webkit-app-region: drag` 样式，tab pill 按钮和右上角关闭按钮保持 `no-drag`，确保点击行为不变。
- `OverlayWindowManager` 引入"用户偏移"概念：每次用户拖拽结束（`BrowserWindow` 的 `moved` 事件）记录当前实际位置与最近一次 tracker-派生位置的差值，存为该 overlay 的偏移；之后每次 tracker 派生新位置时，叠加此偏移再调用 `setBounds`。
- 偏移仅在内存中按 side 维护（player / opponent）。本次 change 不做磁盘持久化（首次实现以最小可用为目标）。
- 在 `create-game` / 新对局开始时不重置偏移（用户上局拖到的位置在下一局自动复用）。

### Non-goals

- 不做磁盘持久化（重启 Electron 后偏移清零，留待后续 `appearance-preferences`-style 接入设置存储的 change）。
- 不引入"重置到默认位置"按钮 — 用户拖回近似位置即可（follow-up 可加一键复位）。
- 不调整非 overlay 主窗口的拖拽行为（主窗口已有原生标题栏）。
- 不改变 overlay 的尺寸或 `resizable` 行为（仅位置）。
- 不实现"吸附到 HS 窗口边"或"对齐网格"。

## Capabilities

### New Capabilities

- `overlay-drag-positioning`: 定义用户拖拽 overlay 顶部菜单栏调整位置的交互、偏移记忆、与 HS 窗口跟踪器协作的合成逻辑。

### Modified Capabilities

- `overlay-window`: 现有规范里 overlay 位置完全由 tracker bounds 驱动，现在变成 tracker bounds + 用户偏移。

## Impact

- `apps/desktop/src/renderer/src/components/TrackerPanelTabs.tsx`：顶部 tablist 容器加 `app-region: drag`；tab pill 按钮和 effects badge 加 `app-region: no-drag`。
- `apps/desktop/src/renderer/src/components/OverlayView.tsx` / `OpponentOverlayView.tsx`：关闭按钮已经有 `no-drag`，但需要确认（已实现）。
- `apps/desktop/src/main/overlay-window.ts`：`OverlayWindowManager` 增加 `userOffset` 字段、订阅 `BrowserWindow` `moved` 事件、`setBounds` 公共 API 内部叠加偏移。
- `apps/desktop/src/main/overlay-window.test.ts`：补充偏移合成 / 拖拽事件 / tracker 跟随行为的单元测试。
- 不涉及 hearthwatcher、hearthmirror、core 业务逻辑，不改 IPC schema。
- 不引入新依赖。
