## ADDED Requirements

### Requirement: 一条命令启动开发环境

The repository SHALL expose a root npm script `pnpm dev` that starts the desktop application in watch mode (renderer Fast Refresh + main process auto-relaunch on file change).

#### Scenario: 修改 renderer 代码自动热更新
- **GIVEN** `pnpm dev` 已经启动主窗口
- **WHEN** 修改 `apps/desktop/src/renderer/src/components/Sidebar.tsx` 中的 "FIRESTONE" 文本为 "FIRESTONE-DEV" 并保存
- **THEN** 主窗口在 2 秒内不重启而是热替换组件，Sidebar 显示 "FIRESTONE-DEV"

#### Scenario: 修改 main 代码自动重启
- **GIVEN** `pnpm dev` 已经启动主窗口
- **WHEN** 修改 `apps/desktop/src/main/window.ts` 中的窗口默认宽度从 1280 改为 1400 并保存
- **THEN** electron-vite 在 5 秒内重启 main 进程，新窗口宽度为 1400

### Requirement: 类型检查脚本

The root `package.json` SHALL define `pnpm typecheck` that runs `tsc --noEmit` recursively across all workspace packages.

#### Scenario: typecheck 在干净仓库通过
- **GIVEN** 仓库刚 `pnpm install --frozen-lockfile` 完成
- **WHEN** 执行 `pnpm typecheck`
- **THEN** 退出码为 0，无任何 TS 错误输出

### Requirement: Lint 脚本

The root `package.json` SHALL define `pnpm lint` that runs `eslint .` using the root `eslint.config.js` flat config across `apps/**/*.{ts,tsx}` and `packages/**/*.{ts,tsx}`.

#### Scenario: lint 在干净仓库通过
- **GIVEN** 仓库刚 `pnpm install` 完成
- **WHEN** 执行 `pnpm lint`
- **THEN** 退出码为 0，无任何 ESLint 错误

#### Scenario: 故意引入 lint 错误被报告
- **GIVEN** 在某个文件添加 `let x = 1; console.log(x); x = 2;`（故意触发 `prefer-const`）
- **WHEN** 执行 `pnpm lint`
- **THEN** 退出码非 0，错误输出中包含 `prefer-const`

### Requirement: 测试脚本

The root `package.json` SHALL define `pnpm test` that runs Vitest in `run` mode (single-pass, no watch) across all workspace packages.

#### Scenario: test 在干净仓库通过
- **GIVEN** 仓库刚 `pnpm install` 完成
- **WHEN** 执行 `pnpm test`
- **THEN** 退出码为 0，至少有 2 个测试通过（`packages/shared/src/version.test.ts` 与 `apps/desktop/src/renderer/tests/App.test.tsx`），0 失败

### Requirement: 打包脚本

The root `package.json` SHALL define `pnpm package` that produces an installable Windows `.exe` via electron-builder for the `@hdt/desktop` application.

#### Scenario: package 产出 NSIS 安装包
- **WHEN** 在 Windows 上执行 `pnpm package`
- **THEN** `apps/desktop/release/` 目录中出现至少一个文件名匹配 `HDT.js-Setup-*.exe` 的 NSIS 安装包，体积大于 50MB（Electron 自身体积）

#### Scenario: 安装包能在干净 Windows 机器上启动
- **GIVEN** 一台未装过本应用的 Windows 10/11 机器
- **WHEN** 双击安装 `HDT.js-Setup-*.exe` 并启动
- **THEN** 主窗口正常打开，标题为 "FIRESTONE"，无 missing DLL 报错

### Requirement: GitHub Actions CI

The repository SHALL include `.github/workflows/ci.yml` that triggers on `pull_request` and `push: main`, runs on `windows-latest` with Node 20, and executes `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm --filter @hdt/desktop build`.

#### Scenario: PR 触发 CI 全绿
- **GIVEN** 一个新建的 PR，diff 仅修改 README
- **WHEN** PR 被推送到 GitHub
- **THEN** CI workflow 在 15 分钟内完成且 5 个步骤全部成功（绿色对勾）

#### Scenario: 故意破坏代码使 CI 失败
- **GIVEN** PR 中故意删除了 `apps/desktop/src/main/window.ts` 的最后一行 `export`
- **WHEN** CI 执行 `pnpm typecheck`
- **THEN** 该步骤退出码非 0，PR 显示红色 X，后续 build 步骤被跳过

### Requirement: 共享包测试样例

The `@hdt/shared` package SHALL include a Vitest test file `packages/shared/src/version.test.ts` that asserts `PACKAGE_VERSION` is a non-empty string matching semver.

#### Scenario: shared 包的版本测试通过
- **WHEN** 执行 `pnpm --filter @hdt/shared test`
- **THEN** Vitest 报告 1 个测试通过，且断言 `PACKAGE_VERSION` 匹配正则 `/^\d+\.\d+\.\d+/`

### Requirement: README 开发文档

The repository SHALL include a root `README.md` that documents (in Chinese): prerequisites (Node 20, pnpm 9 via Corepack, Windows 10/11 for full functionality), the four primary scripts (`dev`, `lint`, `typecheck`, `test`, `package`), and a brief monorepo layout map.

#### Scenario: README 包含所有关键命令
- **WHEN** 用 grep 检查 `README.md`
- **THEN** 文件包含以下子串：`pnpm dev`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm package`、`corepack enable`、`apps/desktop`、`packages/`
