## Why

仓库目前还没有任何可运行的代码，只有两份大型设计文档（`DEVELOPMENT_PLAN.md`、`Rewrite_Design.md`）和一份独立的 `figma_design/` 工程。所有后续 Phase（日志解析、卡组管理、内存读取、覆盖层、统计等）都需要先有一个**统一的、可启动的、有 CI/打包/Lint 配置的 monorepo 骨架**作为载体；否则每个 Phase 的工作都会被环境问题阻塞，且 figma_design 与正式应用永远割裂。

本 change 对应 `DEVELOPMENT_PLAN.md` 的 **Phase 0**（项目初始化），但额外修正了一个已过时的技术假设：原计划提到的 `ffi-napi` 已被弃用、在 Node.js ≥ 18 的 Windows 上无法编译；本 change **不**引入任何 FFI 选型，而是把内存读取相关的所有动作推迟到后续专门的 change（`add-hearthmirror-bridge`）。

## What Changes

- 初始化 git 仓库（main 分支、`.gitignore`、`.gitattributes`、`.editorconfig`）。
- 引入 pnpm workspaces，建立 monorepo 目录结构（`apps/`、`packages/`、`resources/`、`data/`、`scripts/`）。
- 创建 `apps/desktop` Electron 应用：`main`（主进程）、`preload`（预加载脚本）、`renderer`（React 渲染进程）三段式。
- 把现有 `figma_design/src/app/**` 的 UI 实现迁入 `apps/desktop/renderer/`，删除独立的 `figma_design/` 目录（保留 `figma_design/ATTRIBUTIONS.md` 与 `figma_design/guidelines/Guidelines.md` 到 `docs/figma/`）。
- 配置 Vite（renderer 构建）+ tsup（main / preload 构建）+ electron-builder（打包）。
- 配置 TypeScript strict 模式（含 `noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`），跨包路径别名 `@hdt/*`。
- 配置 Tailwind CSS v4 + Radix UI + lucide-react，沿用 figma_design 的 FIRESTONE 主题色（`#0E0E14` / `#14141A` / `#F97316`）。
- 配置 ESLint（`eslint-config-airbnb-base` 衍生 + `@typescript-eslint`）+ Prettier。
- 配置 Vitest（单元测试）骨架与一个示例测试。
- 配置 GitHub Actions CI：在 PR 上跑 `pnpm install` / `pnpm lint` / `pnpm typecheck` / `pnpm test`。
- README 中写明开发命令：`pnpm dev`（启动 Electron + 热重载）、`pnpm build`、`pnpm lint`、`pnpm test`、`pnpm package`。

### Non-goals（本 change **不**做的事）

- ❌ 不实现任何业务逻辑（卡组管理、日志解析、内存读取、统计等都不做）。
- ❌ 不引入 `better-sqlite3`、`zustand`、`react-router` 等业务依赖（除非 figma_design 已经依赖且必须保留运行）。
- ❌ 不做内存读取相关的任何决策与代码（FFI 方案/Rust crate/IPC 协议全部留给后续 change）。
- ❌ 不做覆盖层独立 BrowserWindow（保留 figma_design 中的 OverlayView 仅作为主窗口内的演示视图）。
- ❌ 不做 i18n、自动更新、系统托盘、热键、插件系统。
- ❌ 不做 Cards.json 下载脚本（推迟到 `add-card-database` change）。
- ❌ 不实现 Phase 1 及以后的任何能力。

## Capabilities

### New Capabilities

- `monorepo-workspaces`：pnpm workspaces 拓扑、跨包依赖与发布约束、统一的 TS / ESLint / Prettier / Vitest 配置基线。
- `desktop-shell`：Electron 应用骨架的可启动性 —— 主进程窗口生命周期、preload 暴露最小 API（仅 `app:getVersion`）、单实例锁、安全默认值（`contextIsolation: true` / `nodeIntegration: false`）。
- `renderer-ui-shell`：基于 figma_design 的 React 渲染壳 —— 路由（Sidebar 切换 Tracker / Stats / Collection / Settings）、Tailwind v4 主题、Radix 组件库、占位的 Dashboard / Decklist / OverlayView 视图能正确渲染。
- `build-and-tooling`：可重复执行的开发与发布流程 —— `pnpm dev` 一键起开发环境、`pnpm package` 产出 Windows 可安装包、CI 在 PR 上自动验收。

### Modified Capabilities

（本仓库尚无任何已存在的 spec，所以无修改项。）

## Impact

- **代码**：从零创建 `apps/desktop/`、`packages/` 子目录、根级配置文件（`pnpm-workspace.yaml`、`tsconfig.base.json`、`package.json`、`.eslintrc.cjs`、`.prettierrc`、`electron-builder.yml`）。
- **目录变更**：`figma_design/` 目录被拆分迁移 —— 源码进入 `apps/desktop/renderer/`，文档进入 `docs/figma/`，原目录删除。
- **依赖**：新增 Electron、Vite、tsup、electron-builder、Tailwind v4、Radix 一组、lucide-react、Vitest、ESLint、Prettier、`@typescript-eslint`、`react`、`react-dom`、`react-router`。**不**新增 sqlite、ffi、koffi、napi-rs、Rust 工具链。
- **CI/CD**：新增 `.github/workflows/ci.yml`，触发 PR 与 push 到 main。
- **现有文档**：`DEVELOPMENT_PLAN.md` 与 `Rewrite_Design.md` 不动（作为历史/参考保留）；后续 change 应在 `Decisions` 中显式说明跟它们的偏差。
- **平台**：Windows x64 为主；Electron 配置上保留 macOS/Linux 的开发环境可启动性，但发布只产 Windows 包。
