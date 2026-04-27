## Context

HDT.js 当前是一个**空仓库**（除两份长设计文档与一个独立的 `figma_design/` Vite 工程外没有可执行代码），尚未做 git 初始化。`figma_design/` 只能在自己的工程内 `vite build`，无法直接作为 Electron 渲染端运行；它依赖 React 18 / Tailwind CSS v4 (`@tailwindcss/vite`) / Radix 全家桶 / lucide-react / motion / recharts / next-themes 等。

本 change 必须解决三个相互纠缠的问题：

1. **monorepo 物理结构**：把多个独立 npm 包组织在一个仓库，跨包导入要正确解析（开发态走源码、生产态走构建产物）。
2. **Electron 三段式构建**：main / preload / renderer 三个运行环境的 TS 编译目标、模块格式、HMR 行为完全不同，工具链必须分别处理。
3. **figma_design 的整合**：要在不破坏其视觉效果（Tailwind v4 主题色、Radix 默认样式）的前提下，把它从一个独立 Vite 工程迁移成 Electron renderer。

约束：

- Windows 10/11 x64 是主平台；Node.js ≥ 20 LTS。
- 必须使用 pnpm（已在 `figma_design/package.json` 中通过 `pnpm.overrides` 声明）。
- TypeScript 必须 `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`。
- 不引入任何业务依赖（见 proposal Non-goals）。

## Goals / Non-Goals

**Goals:**

- `pnpm install && pnpm dev` 一条命令启动 Electron 主窗口，热重载（renderer Fast Refresh + main 自动 relaunch）。
- 渲染端能正确加载 figma_design 的所有视图（Sidebar / Dashboard / Decklist / Stats / Collection / Settings / OverlayView），FIRESTONE 主题视觉零回归。
- `pnpm typecheck` 在 strict 配置下零错误。
- `pnpm lint` 在 ESLint flat config 下零错误。
- `pnpm test` 跑 Vitest 单元测试通过。
- `pnpm package` 产出 Windows 安装包（.exe，可双击安装；不要求签名）。
- 安全默认值生效：渲染进程无 Node、`contextIsolation: true`、`sandbox: true`、严格 CSP。
- GitHub Actions CI 在 PR 上跑 install / lint / typecheck / test 全绿。
- 完整代码 ≤ 30 个新文件（不含 figma_design 迁移过来的 ~70 个组件）。

**Non-Goals:**

- 不实现任何业务逻辑（包括但不限于卡组管理、日志解析、内存读取、统计、覆盖层独立窗口、自动更新、托盘）。
- 不引入 Rust 工具链。
- 不引入数据库（SQLite）。
- 不签名安装包。
- 不发布到任何 release channel。
- 不解决 Tailwind v4 与某些 Radix 主题在 Electron CSP 下的潜在冲突（若出现，记入 Open Questions，不在本 change 内修复）。

## Decisions

### D1: 包管理与 Monorepo 拓扑 → pnpm workspaces（不引入 Nx/Turbo）

- **Context**: 仓库需要管理一个 app（`apps/desktop`）和多个 lib（`packages/*`），跨包内部依赖必须 hot-link，发布时需要 tree-shake。
- **Options**:
  - (a) npm workspaces：原生但缓存与软链不如 pnpm 严格。
  - (b) Yarn Berry：PnP 模式与 Electron / Vite 兼容性有坑。
  - (c) **pnpm workspaces**：硬链接 + 严格隔离，已被 figma_design 暗示采用。
  - (d) pnpm + Turborepo / Nx：能加速 CI，但当前包数量少（≤6），引入复杂度不划算。
- **Choice**: **pnpm workspaces，不加任何任务编排器**。
- **Rationale**: 单包 ≤ 10 个时 `pnpm -r` 已经够用；后续若 CI 时间 > 5 分钟再评估引入 Turborepo。锁定 pnpm 版本通过根 `package.json` 的 `packageManager: "pnpm@9.x"` + Corepack。
- **Workspace 范围**：`apps/*`、`packages/*`，**不**把 `figma_design/` 纳入（它会被删除）。

### D2: Electron 构建工具组合 → electron-vite

- **Context**: main / preload / renderer 三段式 + HMR 是 Electron 项目的工程化痛点。
- **Options**:
  - (a) **electron-vite**（@1.x，活跃维护，2025 年 7k+ 周下载）：开箱即用 main / preload / renderer 三入口、内置 HMR、preload 用 ESM、main 自动 relaunch。
  - (b) Electron Forge + `@electron-forge/plugin-vite`：官方加持，但配置链路更长，文档分散。
  - (c) 手搓 Vite + tsup + concurrently + electronmon：灵活但维护成本高。
- **Choice**: **electron-vite**。
- **Rationale**: 单一配置文件 `electron.vite.config.ts`，与 vanilla Vite 配置兼容（figma_design 的 vite.config.ts 可几乎原样保留为 renderer 部分）。Electron Forge 适合需要复杂打包流水线的项目，本 change 只要 `electron-builder` 出 .exe，没必要引入 Forge。
- **版本核对**（2026-04）：`electron-vite@2.x` + `electron@latest stable`（具体写在 `package.json` 的 `^` 范围内，由 pnpm 解析）+ `electron-builder@25.x`。

### D3: 模块系统 → ESM-first（main + preload + renderer 全部 ESM）

- **Context**: Electron 28+ 已稳定支持 main / preload 使用 ESM。混用 CJS/ESM 在 monorepo 中频繁踩坑。
- **Options**:
  - (a) main CJS + renderer ESM（旧主流）。
  - (b) **全 ESM**（main / preload / renderer / packages 都 `"type": "module"`）。
- **Choice**: **全 ESM**。
- **Rationale**: TypeScript 5 + Node 20 + Electron 28+ 已成熟；避免后续引入 better-sqlite3（CJS）时的 dual-package hazard，留待该包真正引入时再做局部 wrapper。

### D4: TypeScript 拓扑 → 单一 `tsconfig.base.json` + 每包 `tsconfig.json` extends（不用 project references）

- **Context**: 跨包类型解析有两条路：project references（`tsc --build`）或 path mapping。
- **Options**:
  - (a) **path mapping**：根 `tsconfig.base.json` 写 `"paths": { "@hdt/core": ["./packages/core/src/index.ts"], ... }`，开发态直接走源码。
  - (b) project references：每包独立编译，IDE 智能更准但配置繁琐。
- **Choice**: **(a) path mapping**，包数量 < 10 时性价比最高。
- **Rationale**: Vite / Vitest / electron-vite 都直接消费 path mapping；后续包数 > 10 或 CI 编译慢时再迁 project references。
- **Strict 配置**：`strict: true` + `noUncheckedIndexedAccess: true` + `exactOptionalPropertyTypes: true` + `noImplicitOverride: true` + `noFallthroughCasesInSwitch: true`。

### D5: UI 路由 → 渲染端用 React Router v7（不再用 figma_design 当前的 useState 切 tab）

- **Context**: 现有 figma_design 用 `useState('tracker')` 切视图，无浏览器历史、无深链接、无可测试的路由层。
- **Options**:
  - (a) 沿用 useState（最少改动）。
  - (b) **React Router v7**（已在 figma_design 的 dependencies 中声明 `react-router@7.13.0`，但未实际使用）。
  - (c) TanStack Router（类型最强但学习曲线陡）。
- **Choice**: **React Router v7（HashRouter）**。
- **Rationale**: Electron file:// 加载下 BrowserRouter 不可用，HashRouter 简单可靠。Sidebar 与 OverlayView 切换可分别映射到 `/tracker`、`/stats`、`/collection`、`/settings`、`/overlay`。

### D6: 状态共享 → 不引入 Zustand（推迟到 add-deck-management change）

- **Context**: proposal 已说明本 change 不实现业务逻辑。
- **Choice**: 渲染端只用 React 自身 useState/useReducer + Context，**不引入 Zustand**。
- **Rationale**: YAGNI；Zustand 应与第一个真正需要跨视图共享的状态（卡组）一同进入。

### D7: 进程间通信 → preload 暴露 `window.hdt` 命名空间，本 change 仅含 `app.getVersion()`

- **Context**: Electron 安全模型要求 `contextIsolation: true`、`nodeIntegration: false`，IPC 必须经 preload 中转。
- **Options**:
  - (a) `contextBridge.exposeInMainWorld('hdt', { app: { getVersion: () => ipcRenderer.invoke('app:getVersion') }})`（最小可用）。
  - (b) 用 `electron-trpc` / `electron-ipc-router` 等 RPC 框架（重）。
- **Choice**: **(a)**，本 change 仅有一个 `app:getVersion` 通道。
- **Rationale**: 通道设计在后续 change 真正需要多通道时再做（届时再决定要不要上 RPC 框架）。

### D8: 安全默认值

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- `webSecurity: true`
- 严格 CSP：`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://images.unsplash.com; connect-src 'self'`（unsplash 临时允许，因 figma_design OverlayView 用了 unsplash 占位图，后续替换为本地资源后收紧）。
- 禁用远程模块、禁用 webview、禁用导航（拦截 `will-navigate` 与 `will-attach-webview`）。

### D9: 测试 → Vitest 作为唯一单元测试运行器

- **Options**: Jest / Vitest / Node test runner。
- **Choice**: **Vitest**，与 Vite 同源，速度快，TS 友好。
- **Rationale**: E2E（Playwright）推迟到 add-overlay-window change 引入。

### D10: ESLint → flat config（`eslint.config.js`） + `@typescript-eslint` + `eslint-plugin-react` + `eslint-plugin-react-hooks` + `eslint-config-prettier`

- **Choice**: ESLint 9 flat config，统一在根目录。
- **Rationale**: 老旧 .eslintrc.cjs 已 deprecated；flat config 让跨包共享配置更简单。

### D11: figma_design 迁移策略

- 把 `figma_design/src/app/**` 完整移动到 `apps/desktop/renderer/src/`。
- 把 `figma_design/src/styles/**` 移动到 `apps/desktop/renderer/src/styles/`。
- 把 `figma_design/vite.config.ts` 与 `figma_design/postcss.config.mjs` 的关键配置合并到 `apps/desktop/electron.vite.config.ts` 的 renderer 段。
- 把 `figma_design/ATTRIBUTIONS.md` 移到 `docs/figma/ATTRIBUTIONS.md`。
- 把 `figma_design/guidelines/Guidelines.md` 移到 `docs/figma/Guidelines.md`。
- **删除整个 `figma_design/` 目录**（避免双源真相）。
- App.tsx 内部的 `useState('tracker')` 改为读 `useLocation()`，Sidebar 的 onClick 改为 `useNavigate()`。
- 依赖中删除 figma_design 用过但本 change 暂不需要的：`@mui/*`、`canvas-confetti`、`embla-carousel-react`、`next-themes`、`react-day-picker`、`react-dnd*`、`react-popper`、`react-resizable-panels`、`react-responsive-masonry`、`react-slick`、`vaul`、`input-otp`、`cmdk`、`react-hook-form`。**保留**：`@radix-ui/*`、`class-variance-authority`、`clsx`、`tailwind-merge`、`tw-animate-css`、`lucide-react`、`motion`、`recharts`、`sonner`、`react-router`。
- 这一裁剪让 renderer 安装体积从 figma_design 的 ~310 个依赖降到 ~120 个。

### D12: CI → GitHub Actions，单 workflow，矩阵只跑 windows-latest + node 20

- **Choice**: `.github/workflows/ci.yml` 触发 `pull_request` 与 `push: main`，步骤：checkout → setup-node@v4 with cache=pnpm → corepack enable → pnpm install --frozen-lockfile → pnpm lint → pnpm typecheck → pnpm test → pnpm build。
- **Rationale**: 主平台只有 Windows，跨平台矩阵留到 macOS 真正纳入支持时再开。

## 最终目录树

```
HDT_js/
├── .editorconfig
├── .gitattributes
├── .gitignore
├── .prettierrc
├── .github/
│   └── workflows/
│       └── ci.yml
├── README.md
├── package.json                       # 根 workspace
├── pnpm-workspace.yaml
├── pnpm-lock.yaml                     # 安装后生成
├── tsconfig.base.json
├── eslint.config.js
├── vitest.config.ts
├── electron-builder.yml
├── DEVELOPMENT_PLAN.md                # 保留为历史参考
├── Rewrite_Design.md                  # 保留为历史参考
├── docs/
│   └── figma/
│       ├── ATTRIBUTIONS.md
│       └── Guidelines.md
├── openspec/
│   ├── config.yaml
│   └── changes/
│       └── add-monorepo-skeleton/
│           ├── proposal.md
│           ├── design.md
│           ├── specs/
│           │   ├── monorepo-workspaces/spec.md
│           │   ├── desktop-shell/spec.md
│           │   ├── renderer-ui-shell/spec.md
│           │   └── build-and-tooling/spec.md
│           └── tasks.md
├── apps/
│   └── desktop/
│       ├── package.json
│       ├── tsconfig.json
│       ├── electron.vite.config.ts
│       ├── electron-builder.yml       # 应用级配置
│       └── src/
│           ├── main/
│           │   ├── index.ts           # 主进程入口
│           │   ├── window.ts          # createMainWindow
│           │   └── ipc.ts             # ipcMain.handle('app:getVersion', ...)
│           ├── preload/
│           │   └── index.ts           # contextBridge.exposeInMainWorld('hdt', ...)
│           └── renderer/
│               ├── index.html
│               ├── src/
│               │   ├── main.tsx       # ReactDOM.createRoot + HashRouter
│               │   ├── App.tsx        # 改造自 figma_design/src/app/App.tsx
│               │   ├── env.d.ts
│               │   ├── routes.tsx     # 路由表
│               │   ├── components/
│               │   │   ├── Sidebar.tsx
│               │   │   ├── Dashboard.tsx
│               │   │   ├── Decklist.tsx
│               │   │   ├── Stats.tsx
│               │   │   ├── Collection.tsx
│               │   │   ├── Settings.tsx
│               │   │   ├── OverlayView.tsx
│               │   │   ├── figma/ImageWithFallback.tsx
│               │   │   └── ui/        # 全部 Radix 包装
│               │   ├── data/
│               │   │   └── mockDecks.ts
│               │   └── styles/
│               │       ├── theme.css
│               │       ├── tailwind.css
│               │       └── index.css
│               └── tests/
│                   └── App.test.tsx   # 渲染冒烟测试
├── packages/
│   └── shared/                        # 唯一新建的占位包：跨包共用类型/工具
│       ├── package.json               # name: "@hdt/shared"
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts
│           ├── version.ts             # 暴露 PACKAGE_VERSION 常量
│           └── version.test.ts
├── resources/                         # （空目录 + .gitkeep）
└── data/                              # （空目录 + .gitkeep）
```

> 说明：`packages/core`、`packages/hearthdb`、`packages/hearthwatcher`、`packages/hearthmirror`、`packages/overlay` 在本 change 中**不创建**（YAGNI），由后续 change 引入。`packages/shared` 仅用于验证跨包路径别名工作正常。

## Risks / Trade-offs

- **R1: Tailwind v4 + Electron CSP 兼容性** → Tailwind v4 通过 `@tailwindcss/vite` 在构建期注入 CSS，运行期不需要 inline `<style>`，与严格 CSP 兼容。**Mitigation**：Vitest 中加一个 e2e-style 冒烟测试断言主窗口渲染后的 DOM 包含 FIRESTONE 主题类名。
- **R2: figma_design 中 OverlayView 引用了 `images.unsplash.com` 远程图片** → 严格 CSP 会拦截。**Mitigation**：本 change 在 CSP 中临时允许 `img-src https://images.unsplash.com`；并在 `docs/figma/Guidelines.md` 中加 TODO，要求后续 change 用本地占位图替换。
- **R3: ESM + Electron + better-sqlite3 dual-package hazard** → 本 change 不引入 sqlite，**风险延后**到 add-deck-management change，在那个 change 的 design 中专门处理。
- **R4: Windows-only CI 漏掉跨平台问题** → 接受。本项目当前只支持 Windows，跨平台是 ≥ M2 的事。
- **R5: figma_design 删除后若回归视觉问题难追溯** → **Mitigation**：删除前先 `git mv` 到目标位置（保留文件历史）；删除整个 `figma_design/` 用一个独立 commit。
- **R6: pnpm @ Windows 路径长度限制（260 字符）** → 启用 `pnpm config set node-linker hoisted` 不可取（违背初衷）。**Mitigation**：仓库目录命名简短（已经是 `D:\code\HDT_js`），CI runner 默认路径短。
- **R7: 锁定 pnpm 版本可能与开发者本地不一致** → **Mitigation**：根 `package.json` 加 `"engines": {"node": ">=20", "pnpm": ">=9"}` + `"packageManager": "pnpm@9.15.0"`，README 写明使用 `corepack enable`。

## Migration Plan

不存在历史用户/数据，无需 migration。但有内部"迁移"：

1. 在新建 monorepo 之前先 `git init` 并把根目录现有文件（`DEVELOPMENT_PLAN.md`、`Rewrite_Design.md`、`figma_design/`、`openspec/`、`.claude/`）作为 initial commit 存档，避免 figma_design 删除后无历史。
2. `git mv figma_design/ATTRIBUTIONS.md docs/figma/ATTRIBUTIONS.md` 等迁移用 `git mv`，保留文件历史。
3. 删除 `figma_design/` 后单独提一个 `chore: remove figma_design after migration` commit。

## Open Questions

- **OQ1**: `motion`（framer-motion 后继）在 Electron sandbox 下是否需要额外的 Permissions Policy 设置？尚未验证；如果出问题，先改用 `tw-animate-css` 替代。
- **OQ2**: 是否在 Phase 0 就引入 `electron-log`？倾向**不引入**，让 main 输出直接写 stdout，待 add-error-reporting change 一起做。
- **OQ3**: README 是否双语？倾向先写中文，英文 README 推迟。
