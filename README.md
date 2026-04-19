# HDT.js

> 炉石传说记牌器 — TypeScript 重写版本，对标开源项目 [Hearthstone-Deck-Tracker](https://github.com/HearthSim/Hearthstone-Deck-Tracker)。

## 项目背景

- 整体规划：[`DEVELOPMENT_PLAN.md`](./DEVELOPMENT_PLAN.md)（14 周 Phase 0–8）
- HearthMirror Rust 重写设计：[`Rewrite_Design.md`](./Rewrite_Design.md)
- UI 设计参考（FIRESTONE 主题）：[`docs/figma/Guidelines.md`](./docs/figma/Guidelines.md)
- 工作流：本仓库使用 [OpenSpec](https://github.com/openspec/openspec) 做 spec-driven 开发，每一项变更先在 `openspec/changes/` 写 proposal/design/specs/tasks，然后实施。

## 前置条件

- **OS**: Windows 10/11 x64（Phase 0 也支持 macOS/Linux 启动 Electron，但内存读取相关功能仅 Windows）
- **Node.js**: ≥ 20 LTS
- **pnpm**: ≥ 9（推荐通过 `corepack enable` 自动管理版本，仓库 `packageManager` 字段已锁定 `pnpm@10.10.0`）

## 一键启动

```bash
corepack enable           # 启用 corepack 自动用上正确的 pnpm 版本
pnpm install              # 安装所有 workspace 依赖
pnpm dev                  # 启动 Electron 主窗口（renderer Fast Refresh + main 自动重启）
```

成功后会出现一个标题为 **FIRESTONE** 的深色窗口，顶部有 Desktop App / In-Game Overlay 切换，左侧 Sidebar 切换 Tracker / Stats / Collection / Settings。

## 常用脚本

| 命令 | 作用 |
|---|---|
| `pnpm dev` | 启动 desktop 开发环境（HMR） |
| `pnpm build` | 递归构建所有 workspace 包 |
| `pnpm lint` | 跨包 ESLint 检查（flat config） |
| `pnpm typecheck` | 跨包 TypeScript strict 检查 |
| `pnpm test` | 跑 Vitest workspace（所有包的测试） |
| `pnpm package` | 用 electron-builder 产出 Windows NSIS 安装包到 `apps/desktop/release/` |

## 仓库结构

```
HDT_js/
├── apps/
│   └── desktop/                       # Electron 应用
│       ├── src/
│       │   ├── main/                  # 主进程（窗口 / IPC / 生命周期）
│       │   ├── preload/               # 预加载脚本（暴露 window.hdt）
│       │   └── renderer/              # React 渲染端（基于 figma_design）
│       │       ├── index.html
│       │       └── src/
│       │           ├── components/    # Sidebar / Dashboard / Decklist / Stats / Collection / Settings / OverlayView
│       │           ├── data/          # mockDecks
│       │           ├── styles/        # Tailwind v4 + 主题
│       │           ├── App.tsx
│       │           ├── routes.tsx     # HashRouter 路由表
│       │           ├── main.tsx       # 入口
│       │           └── env.d.ts       # window.hdt 类型
│       ├── electron.vite.config.ts    # main + preload + renderer 三段式构建
│       └── electron-builder.yml       # NSIS 打包配置
├── packages/
│   └── shared/                        # @hdt/shared：跨包共享类型与常量
├── docs/
│   └── figma/                         # 从 figma_design/ 迁移过来的 UI 指南与素材归属
├── openspec/                          # spec-driven 开发流程
│   ├── config.yaml
│   └── changes/
│       └── add-monorepo-skeleton/     # 第一个 change（本骨架）
├── tests/                             # 根级 sanity 测试
├── tsconfig.base.json                 # strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes
├── eslint.config.js                   # ESLint 9 flat config
├── vitest.workspace.ts                # 多包测试编排
├── pnpm-workspace.yaml
├── DEVELOPMENT_PLAN.md
├── Rewrite_Design.md
└── README.md
```

## 贡献流程

1. 在 `openspec/changes/<change-name>/` 写好 proposal / design / specs / tasks（参考 `add-monorepo-skeleton` 的样例）。
2. 按 tasks 实施，TDD 优先（写失败测试 → 最小实现 → 通过 → 提交）。
3. 提交信息使用 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/v1.0.0/)：`feat:` / `fix:` / `chore:` / `build:` / `docs:` / `refactor:` / `test:` / `ci:`。
4. PR 自动触发 GitHub Actions CI（`.github/workflows/ci.yml`），跑 lint / typecheck / test / build 全绿才能合并。
5. 全部 task 完成后，运行 `openspec validate <change-name> --strict` 与 `openspec status --change <change-name>` 确认无误，再用 `openspec archive <change-name>` 归档。

## 当前进度

- [x] **add-monorepo-skeleton**（Phase 0）— 仓库骨架、Electron 三段式、figma_design 迁入、CI 配置
- [ ] decide-hearthmirror-bridge — FFI 架构 ADR（koffi vs napi-rs vs 32 位子进程）
- [ ] add-card-database — `@hdt/hearthdb`：Cards.json 加载与查找
- [ ] add-deck-management — `@hdt/core/deck` + SQLite + 卡组 CRUD/导入导出

详见 [`openspec/changes/.NEXT.md`](./openspec/changes/.NEXT.md)。
