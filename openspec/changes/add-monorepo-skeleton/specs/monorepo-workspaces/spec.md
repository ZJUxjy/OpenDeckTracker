## ADDED Requirements

### Requirement: pnpm workspaces 拓扑

The repository SHALL use pnpm workspaces as the only package manager and monorepo tool. The workspace configuration MUST include `apps/*` and `packages/*` and MUST NOT include the legacy `figma_design/` directory.

#### Scenario: install 后所有 workspace 包被识别
- **WHEN** 在仓库根目录执行 `pnpm install --frozen-lockfile`
- **THEN** `pnpm -r list --depth=-1` 输出至少包含 `@hdt/desktop` 与 `@hdt/shared` 两个本地包，且每个包都解析自仓库内（不是 npm registry）

#### Scenario: 非 pnpm 包管理器被拒绝
- **WHEN** 开发者在仓库根目录执行 `npm install` 或 `yarn install`
- **THEN** preinstall 钩子（`only-allow pnpm`）阻止安装并打印提示，要求改用 `pnpm install`

### Requirement: pnpm 与 Node 版本锁定

The root `package.json` SHALL declare `engines.node >= 20`, `engines.pnpm >= 9`, and `packageManager: pnpm@<exact-version>` so that Corepack can pin the toolchain.

#### Scenario: 启用 corepack 后 pnpm 版本一致
- **WHEN** 开发者运行 `corepack enable && pnpm --version`
- **THEN** 输出的 pnpm 版本与根 `package.json` 中 `packageManager` 字段声明的版本完全一致

#### Scenario: Node 版本过低被拒绝
- **WHEN** 开发者使用 Node 18 执行 `pnpm install`
- **THEN** pnpm 因 `engines.node` 检查失败而中止安装

### Requirement: 跨包路径别名

Workspace packages SHALL be importable via `@hdt/<package-name>` from any other workspace package, resolving to the source `src/index.ts` in development and to the published `dist/` entry after build.

#### Scenario: renderer 引用共享包源码
- **GIVEN** `apps/desktop/src/renderer/src/main.tsx` 中 `import { PACKAGE_VERSION } from '@hdt/shared'`
- **WHEN** 在开发态执行 `pnpm --filter @hdt/desktop dev`
- **THEN** Vite 直接解析到 `packages/shared/src/version.ts` 的源码，对该文件的修改触发 Fast Refresh

#### Scenario: typecheck 通过
- **WHEN** 在仓库根执行 `pnpm typecheck`
- **THEN** 跨包导入 `@hdt/shared` 的 TS 类型解析正确，零类型错误

### Requirement: 共享 TypeScript 配置基线

A root `tsconfig.base.json` SHALL define the shared compiler options (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `target: ES2022`, `module: ESNext`, `moduleResolution: Bundler`). Each package's `tsconfig.json` SHALL extend it.

#### Scenario: 严格模式生效
- **GIVEN** 一个 TS 文件 `const x: string | undefined = undefined; const y: string = x;`
- **WHEN** 在仓库根执行 `pnpm typecheck`
- **THEN** typecheck 报错 TS2322（不能将 undefined 赋给 string）

#### Scenario: noUncheckedIndexedAccess 生效
- **GIVEN** 一个 TS 文件 `const a: number[] = [1]; const b: number = a[5];`
- **WHEN** 在仓库根执行 `pnpm typecheck`
- **THEN** typecheck 报错 TS2322（`a[5]` 类型为 `number | undefined`）

### Requirement: 共享 lint / format / test 配置

The repository SHALL provide a single `eslint.config.js` (flat config), a single `.prettierrc`, and a single `vitest.config.ts` at the root, applied uniformly to all workspace packages.

#### Scenario: lint 命令在根触发跨包检查
- **WHEN** 执行 `pnpm lint`
- **THEN** ESLint 检查 `apps/**/*.{ts,tsx}` 与 `packages/**/*.{ts,tsx}`，违反 `@typescript-eslint` 推荐规则的代码导致退出码非 0

#### Scenario: prettier 在 lint-staged 钩子中可用
- **WHEN** 任意包内执行 `pnpm exec prettier --check src`
- **THEN** prettier 使用根目录的 `.prettierrc` 配置进行检查，不需要在子包重复声明配置

### Requirement: 不跨界引入业务依赖

Phase 0 monorepo SHALL NOT depend on `better-sqlite3`, `zustand`, `koffi`, `napi-rs`, `ffi-rs`, `ffi-napi`, any Rust toolchain, or any Hearthstone-specific data file. These belong to subsequent changes.

#### Scenario: 检查依赖白名单
- **WHEN** 在 CI 中运行 `pnpm dlx license-checker --json | jq '.packages | keys'`（或手动审阅 `pnpm-lock.yaml`）
- **THEN** 上述任何一个包都不出现在依赖树中
