## ADDED Requirements

### Requirement: figma_design 视图无视觉回归地迁入 renderer

All seven top-level views from `figma_design/src/app/components/` (`Sidebar`, `Dashboard`, `Decklist`, `Stats`, `Collection`, `Settings`, `OverlayView`) SHALL be present under `apps/desktop/src/renderer/src/components/` and render with the FIRESTONE theme (background `#0E0E14`, sidebar `#14141A`, accent `#F97316`) intact.

#### Scenario: Sidebar 渲染品牌名 FIRESTONE
- **WHEN** 启动 `pnpm --filter @hdt/desktop dev`
- **THEN** 渲染 DOM 中存在文本 "FIRESTONE" 且其父元素具有橙色（`text-orange-500` 或 hex 等价）样式

#### Scenario: 主题色被 Tailwind 正确编译
- **WHEN** 检查渲染产物的 CSS（DevTools Sources 面板查看注入的样式）
- **THEN** CSS 中存在背景色 `#0E0E14`、`#14141A`、`#1C1C24` 与强调色 `#F97316` 的规则

### Requirement: HashRouter 路由

The renderer SHALL use React Router v7 in `HashRouter` mode. Sidebar tab clicks SHALL update the URL hash. The supported routes are: `/tracker` (default), `/stats`, `/collection`, `/settings`, `/overlay`.

#### Scenario: 点击 Sidebar 切路由
- **GIVEN** 主窗口已启动，URL hash 为 `#/tracker`
- **WHEN** 用户点击 Sidebar 上的 "Stats" 项
- **THEN** URL hash 变为 `#/stats`，且主内容区渲染 `Stats` 组件

#### Scenario: 直接打开 hash 路由进入对应页面
- **GIVEN** 应用以 `--load-url file://.../index.html#/collection` 启动（开发态可手动改地址栏）
- **WHEN** 主窗口加载完毕
- **THEN** Sidebar 上 "Collection" 项处于激活态（橙色边条），主内容区渲染 `Collection` 组件

#### Scenario: 未匹配路由回落到默认
- **GIVEN** URL hash 为 `#/unknown`
- **WHEN** 主窗口加载该路由
- **THEN** 渲染 `Tracker` 视图（与 `/tracker` 同），且 URL hash 替换为 `#/tracker`

### Requirement: 顶部 ViewMode 切换保留

The top header SHALL retain the figma_design "Desktop App / In-Game Overlay" toggle. Selecting "In-Game Overlay" SHALL navigate to `/overlay` and hide the Sidebar; selecting "Desktop App" SHALL navigate back to the previous tab and show the Sidebar.

#### Scenario: 切到 Overlay 视图隐藏 Sidebar
- **GIVEN** 当前在 `/tracker`，Sidebar 可见
- **WHEN** 用户点击 "In-Game Overlay" 按钮
- **THEN** 路由变为 `/overlay`，Sidebar DOM 元素被卸载（不存在 `aside` 标签）

### Requirement: 渲染端依赖白名单

The renderer SHALL include only the dependencies necessary for the seven views: React 18, React Router v7, all `@radix-ui/react-*` components actually imported, `lucide-react`, `class-variance-authority`, `clsx`, `tailwind-merge`, `tw-animate-css`, `motion`, `recharts`, `sonner`, and the Tailwind v4 toolchain. Dependencies removed from `figma_design`'s 50+ list are: `@mui/*`, `canvas-confetti`, `embla-carousel-react`, `next-themes`, `react-day-picker`, `react-dnd*`, `react-popper`, `react-resizable-panels`, `react-responsive-masonry`, `react-slick`, `vaul`, `input-otp`, `cmdk`, `react-hook-form`, `@popperjs/core`, `date-fns`, `react-hook-form`.

#### Scenario: 不需要的依赖未被安装
- **WHEN** 在 `apps/desktop` 目录执行 `pnpm why @mui/material`
- **THEN** 输出 "no matches found"

#### Scenario: 渲染端构建后 bundle 不超过 2MB（gzip 前）
- **WHEN** 执行 `pnpm --filter @hdt/desktop build` 后查看 `out/renderer/assets/*.js`
- **THEN** 主 chunk 体积 ≤ 2MB（未压缩），其中不出现 MUI、cmdk、react-day-picker 等被裁剪的库标识

### Requirement: 渲染端冒烟测试

The renderer SHALL include a Vitest smoke test that mounts `<App />` with `MemoryRouter` and asserts the FIRESTONE brand text and default Tracker view render without throwing.

#### Scenario: 冒烟测试通过
- **WHEN** 执行 `pnpm --filter @hdt/desktop test`
- **THEN** Vitest 报告 1 个测试通过 0 失败，覆盖文件 `apps/desktop/src/renderer/tests/App.test.tsx`

### Requirement: window.hdt 类型定义

The renderer SHALL include an ambient type declaration `apps/desktop/src/renderer/src/env.d.ts` that types `window.hdt` so that `await window.hdt.app.getVersion()` is fully typed inside renderer code.

#### Scenario: typecheck 识别 window.hdt
- **GIVEN** renderer 中存在 `const v: string = await window.hdt.app.getVersion();`
- **WHEN** 执行 `pnpm typecheck`
- **THEN** 零类型错误（不报 "Property 'hdt' does not exist on type 'Window'"）
