## Why

记牌器主窗口和两个 overlay 当前用的都是浏览器/Windows 默认滚动条，宽度、配色、空闲态都跟我们的 FIRESTONE 深色 + 橙色主题脱节，尤其在 overlay（透明背景、紧贴炉石窗口）里默认灰白滚动条非常突兀。需要一套与现有主题 token 对齐的自定义滚动条样式。

## What Changes

- 新增一组滚动条主题 token（轨道色、滑块色、滑块 hover/active 态色、宽度、圆角），挂在现有 `console-theme-tokens` 体系下。
- 在 renderer 全局样式（Tailwind v4 layer 或 `globals.css`）中通过 `::-webkit-scrollbar` 系列伪元素 + `scrollbar-color/scrollbar-width` 把所有可滚动区域替换为自定义样式。
- overlay 内的滚动条额外按"半透明、收窄、空闲淡出"的口味做 variant，避免对 overlay 内容形成视觉干扰。
- 文档一笔：未来需要不同 variant（如非浏览器渲染的 list virtualization）时再扩展。

### Non-goals

- 不替换/接管原生滚动行为（不引入 simplebar / overlayscrollbars 等 JS 库），纯 CSS 实现。
- 不改任何滚动逻辑、内容布局或滚动容器结构。
- 不处理 macOS overlay scrollbar（项目主平台 Windows，且 macOS 不在本期目标）。
- 不调整非记牌器 UI（弹出菜单、tooltip、Radix 内嵌滚动）以外的样式 — 那部分若有特殊需求另起 change。

## Capabilities

### New Capabilities

- `custom-scrollbar`: 定义记牌器与 overlay 中所有可滚动区域的滚动条视觉规范（token、伪元素样式、overlay variant），并提供应用方式。

### Modified Capabilities

- `console-theme-tokens`: 新增滚动条相关 token（track / thumb / thumb-hover / thumb-active / width / radius），归入现有主题 token 集。

## Impact

- `apps/desktop/src/renderer/src/styles/globals.css`（或等价全局样式入口）：新增 `::-webkit-scrollbar*` 规则及对应 CSS 变量。
- `apps/desktop/src/renderer/src/styles/tokens.css`（或当前 token 定义文件）：新增滚动条 token。
- overlay 路由（`/overlay`、`/overlay-opponent`）的 root 容器或专属样式文件：应用 overlay variant。
- 不涉及 main / preload / 业务逻辑代码。
- 不引入新依赖。
