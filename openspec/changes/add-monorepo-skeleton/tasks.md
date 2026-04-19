> 实施约定：每个任务粒度 2–5 分钟。遵循 TDD（除纯配置类）：写失败测试 → 看到失败 → 最小实现 → 通过 → commit。
> 全部 commit message 使用 Conventional Commits（`feat:` / `chore:` / `build:` / `test:` / `docs:` / `refactor:` / `ci:`）。
> 验证命令的 working directory 默认为仓库根目录 `D:\code\HDT_js`，特殊情况会注明。

## 1. 仓库初始化

- [x] 1.1 在 `D:\code\HDT_js` 执行 `git init -b main`，确认输出 `Initialized empty Git repository`，且生成了 `.git/` 目录。
- [x] 1.2 创建 `.gitignore`，内容包含：`node_modules/`、`dist/`、`out/`、`release/`、`coverage/`、`*.log`、`.DS_Store`、`Thumbs.db`、`.vite/`、`pnpm-debug.log*`、`*.tsbuildinfo`。
- [x] 1.3 创建 `.gitattributes`，内容：`* text=auto eol=lf` 与 `*.{png,jpg,jpeg,gif,ico,webp} binary`。
- [x] 1.4 创建 `.editorconfig`：`root = true`、`[*]` 段 `indent_style = space`、`indent_size = 2`、`end_of_line = lf`、`charset = utf-8`、`trim_trailing_whitespace = true`、`insert_final_newline = true`、`[*.md]` 段 `trim_trailing_whitespace = false`。
- [x] 1.5 把现有根目录文件（`DEVELOPMENT_PLAN.md`、`Rewrite_Design.md`、`figma_design/**`、`openspec/**`、`.claude/**`）作为 initial commit：
  ```bash
  git add .
  git commit -m "chore: initial commit (existing design docs and figma_design baseline)"
  ```
  期望输出：`(root-commit) ... files changed`。

## 2. pnpm Workspace 与根级 package.json

- [x] 2.1 执行 `corepack enable` 并验证 `pnpm --version` 输出 ≥ 9.0.0；若未安装 corepack，提示用户先升级 Node。
- [x] 2.2 创建 `pnpm-workspace.yaml`，内容：
  ```yaml
  packages:
    - 'apps/*'
    - 'packages/*'
  ```
- [x] 2.3 创建根 `package.json`（手写，不执行 `npm init`）：name `hdt-js`、version `0.1.0`、private `true`、type `module`、`packageManager: "pnpm@10.10.0"`（实际用 10.10.0 匹配本机）、`engines: { node: ">=20", pnpm: ">=9" }`、`scripts: { preinstall: "npx -y only-allow pnpm", dev: "pnpm --filter @hdt/desktop dev", build: "pnpm -r build", lint: "eslint .", typecheck: "pnpm -r typecheck", test: "vitest run", package: "pnpm --filter @hdt/desktop package" }`，`devDependencies` 暂留空。
- [x] 2.4 提交：`git add pnpm-workspace.yaml package.json && git commit -m "chore: bootstrap pnpm workspaces"`。

## 3. TypeScript 基线

- [x] 3.1 创建 `tsconfig.base.json`，内容包含：
  ```json
  {
    "compilerOptions": {
      "target": "ES2022",
      "module": "ESNext",
      "moduleResolution": "Bundler",
      "lib": ["ES2022", "DOM", "DOM.Iterable"],
      "jsx": "react-jsx",
      "strict": true,
      "noUncheckedIndexedAccess": true,
      "exactOptionalPropertyTypes": true,
      "noImplicitOverride": true,
      "noFallthroughCasesInSwitch": true,
      "esModuleInterop": true,
      "isolatedModules": true,
      "skipLibCheck": true,
      "resolveJsonModule": true,
      "verbatimModuleSyntax": false,
      "forceConsistentCasingInFileNames": true,
      "baseUrl": ".",
      "paths": {
        "@hdt/shared": ["./packages/shared/src/index.ts"]
      }
    }
  }
  ```
- [x] 3.2 提交：`git add tsconfig.base.json && git commit -m "build: add shared tsconfig base with strict options"`。

## 4. ESLint + Prettier + Vitest 基线

- [ ] 4.1 在根安装 dev 依赖：
  ```bash
  pnpm add -Dw eslint@^9 @eslint/js typescript-eslint eslint-plugin-react eslint-plugin-react-hooks eslint-plugin-react-refresh eslint-config-prettier prettier typescript@^5.6 vitest@^2 @vitest/coverage-v8 jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
  ```
  期望：`pnpm-lock.yaml` 在仓库根生成。
- [ ] 4.2 创建 `eslint.config.js`（flat config）：
  ```js
  import js from '@eslint/js';
  import tseslint from 'typescript-eslint';
  import react from 'eslint-plugin-react';
  import reactHooks from 'eslint-plugin-react-hooks';
  import reactRefresh from 'eslint-plugin-react-refresh';
  import prettier from 'eslint-config-prettier';

  export default tseslint.config(
    { ignores: ['**/dist/**', '**/out/**', '**/release/**', '**/.vite/**', 'figma_design/**'] },
    js.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    {
      files: ['**/*.{ts,tsx}'],
      languageOptions: { parserOptions: { project: true, tsconfigRootDir: import.meta.dirname } },
      plugins: { react, 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
      rules: {
        ...react.configs.recommended.rules,
        ...react.configs['jsx-runtime'].rules,
        ...reactHooks.configs.recommended.rules,
        'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
        'react/prop-types': 'off',
      },
      settings: { react: { version: '18.3' } },
    },
    prettier,
  );
  ```
- [ ] 4.3 创建 `.prettierrc`：
  ```json
  { "semi": true, "singleQuote": true, "trailingComma": "all", "printWidth": 100, "arrowParens": "always" }
  ```
- [ ] 4.4 创建 `vitest.config.ts`：
  ```ts
  import { defineConfig } from 'vitest/config';
  export default defineConfig({
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: [],
      coverage: { provider: 'v8', reporter: ['text', 'html'] },
    },
  });
  ```
- [ ] 4.5 写一个根级 sanity 测试 `tests/sanity.test.ts`：
  ```ts
  import { describe, it, expect } from 'vitest';
  describe('sanity', () => {
    it('runs', () => { expect(1 + 1).toBe(2); });
  });
  ```
- [ ] 4.6 运行 `pnpm test`，期望：1 passed。
- [ ] 4.7 运行 `pnpm lint`，期望：0 errors（可能有少量 warning，允许）。
- [ ] 4.8 提交：`git add . && git commit -m "build: add eslint/prettier/vitest baseline"`。

## 5. `@hdt/shared` 包（验证跨包引用 + 测试管线）

- [ ] 5.1 创建目录 `packages/shared/src/`。
- [ ] 5.2 创建 `packages/shared/package.json`：
  ```json
  {
    "name": "@hdt/shared",
    "version": "0.1.0",
    "private": true,
    "type": "module",
    "main": "./src/index.ts",
    "types": "./src/index.ts",
    "exports": { ".": "./src/index.ts" },
    "scripts": { "typecheck": "tsc -p tsconfig.json --noEmit", "test": "vitest run" }
  }
  ```
- [ ] 5.3 创建 `packages/shared/tsconfig.json`：
  ```json
  { "extends": "../../tsconfig.base.json", "include": ["src/**/*"] }
  ```
- [ ] 5.4 **写失败测试** `packages/shared/src/version.test.ts`：
  ```ts
  import { describe, it, expect } from 'vitest';
  import { PACKAGE_VERSION } from './index';
  describe('PACKAGE_VERSION', () => {
    it('is a non-empty semver string', () => {
      expect(PACKAGE_VERSION).toMatch(/^\d+\.\d+\.\d+/);
    });
  });
  ```
- [ ] 5.5 运行 `pnpm --filter @hdt/shared test`，期望：FAIL（Cannot find module './index'）。
- [ ] 5.6 创建 `packages/shared/src/version.ts`：
  ```ts
  export const PACKAGE_VERSION: string = '0.1.0';
  ```
- [ ] 5.7 创建 `packages/shared/src/index.ts`：
  ```ts
  export { PACKAGE_VERSION } from './version';
  ```
- [ ] 5.8 重新运行 `pnpm --filter @hdt/shared test`，期望：1 passed。
- [ ] 5.9 运行 `pnpm typecheck`，期望：零错误。
- [ ] 5.10 提交：`git add packages/shared && git commit -m "feat(shared): bootstrap @hdt/shared package with version constant"`。

## 6. `@hdt/desktop` 应用骨架与依赖

- [ ] 6.1 创建目录 `apps/desktop/src/main/`、`apps/desktop/src/preload/`、`apps/desktop/src/renderer/src/`、`apps/desktop/src/renderer/tests/`。
- [ ] 6.2 创建 `apps/desktop/package.json`：
  ```json
  {
    "name": "@hdt/desktop",
    "version": "0.1.0",
    "private": true,
    "type": "module",
    "main": "./out/main/index.js",
    "scripts": {
      "dev": "electron-vite dev",
      "build": "electron-vite build",
      "start": "electron-vite preview",
      "typecheck": "tsc -p tsconfig.json --noEmit",
      "test": "vitest run",
      "package": "electron-vite build && electron-builder --config electron-builder.yml --win"
    }
  }
  ```
- [ ] 6.3 创建 `apps/desktop/tsconfig.json`：
  ```json
  {
    "extends": "../../tsconfig.base.json",
    "include": ["src/**/*", "electron.vite.config.ts"],
    "compilerOptions": {
      "types": ["vite/client", "node"]
    }
  }
  ```
- [ ] 6.4 在 `apps/desktop` 安装运行依赖：
  ```bash
  pnpm --filter @hdt/desktop add electron@^33 electron-vite@^2 electron-builder@^25 vite@^6 @vitejs/plugin-react@^4 @tailwindcss/vite@^4 tailwindcss@^4 react@^18.3 react-dom@^18.3 react-router@^7.13 lucide-react clsx class-variance-authority tailwind-merge tw-animate-css motion recharts sonner
  ```
- [ ] 6.5 在 `apps/desktop` 安装实际使用的 Radix 组件（按 figma_design 实际 import 列出）：
  ```bash
  pnpm --filter @hdt/desktop add @radix-ui/react-accordion @radix-ui/react-alert-dialog @radix-ui/react-aspect-ratio @radix-ui/react-avatar @radix-ui/react-checkbox @radix-ui/react-collapsible @radix-ui/react-context-menu @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-hover-card @radix-ui/react-label @radix-ui/react-menubar @radix-ui/react-navigation-menu @radix-ui/react-popover @radix-ui/react-progress @radix-ui/react-radio-group @radix-ui/react-scroll-area @radix-ui/react-select @radix-ui/react-separator @radix-ui/react-slider @radix-ui/react-slot @radix-ui/react-switch @radix-ui/react-tabs @radix-ui/react-toggle @radix-ui/react-toggle-group @radix-ui/react-tooltip
  ```
- [ ] 6.6 在 `apps/desktop` 安装 dev 依赖：
  ```bash
  pnpm --filter @hdt/desktop add -D @types/react @types/react-dom @types/node electron-devtools-installer
  ```
- [ ] 6.7 创建 `apps/desktop/electron.vite.config.ts`：
  ```ts
  import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
  import react from '@vitejs/plugin-react';
  import tailwindcss from '@tailwindcss/vite';
  import { resolve } from 'node:path';

  export default defineConfig({
    main: {
      plugins: [externalizeDepsPlugin()],
      build: { rollupOptions: { input: { index: resolve('src/main/index.ts') } } },
    },
    preload: {
      plugins: [externalizeDepsPlugin()],
      build: { rollupOptions: { input: { index: resolve('src/preload/index.ts') } } },
    },
    renderer: {
      root: resolve('src/renderer'),
      plugins: [react(), tailwindcss()],
      resolve: {
        alias: {
          '@': resolve('src/renderer/src'),
          '@hdt/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
        },
      },
      build: { rollupOptions: { input: resolve('src/renderer/index.html') } },
    },
  });
  ```
- [ ] 6.8 提交：`git add apps/desktop && git commit -m "build(desktop): scaffold electron-vite three-segment build"`。

## 7. Main / Preload 实现

- [ ] 7.1 创建 `apps/desktop/src/main/window.ts`：
  ```ts
  import { BrowserWindow } from 'electron';
  import { join } from 'node:path';

  export function createMainWindow(): BrowserWindow {
    const win = new BrowserWindow({
      width: 1280,
      height: 800,
      title: 'FIRESTONE',
      backgroundColor: '#0E0E14',
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
      },
    });

    win.webContents.on('will-navigate', (e) => e.preventDefault());
    win.webContents.on('will-attach-webview', (e) => e.preventDefault());

    if (process.env['ELECTRON_RENDERER_URL']) {
      win.loadURL(process.env['ELECTRON_RENDERER_URL']);
    } else {
      win.loadFile(join(__dirname, '../renderer/index.html'));
    }
    return win;
  }
  ```
- [ ] 7.2 创建 `apps/desktop/src/main/ipc.ts`：
  ```ts
  import { app, ipcMain } from 'electron';
  export function registerIpc(): void {
    ipcMain.handle('app:getVersion', () => app.getVersion());
  }
  ```
- [ ] 7.3 创建 `apps/desktop/src/main/index.ts`：
  ```ts
  import { app, BrowserWindow } from 'electron';
  import { createMainWindow } from './window';
  import { registerIpc } from './ipc';

  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
  } else {
    app.on('second-instance', () => {
      const [win] = BrowserWindow.getAllWindows();
      if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
    });

    app.whenReady().then(() => {
      registerIpc();
      createMainWindow();
      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
      });
    });

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') app.quit();
    });
  }
  ```
- [ ] 7.4 创建 `apps/desktop/src/preload/index.ts`：
  ```ts
  import { contextBridge, ipcRenderer } from 'electron';

  const api = {
    app: {
      getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
    },
  };

  contextBridge.exposeInMainWorld('hdt', api);
  export type HdtApi = typeof api;
  ```
- [ ] 7.5 提交：`git add apps/desktop/src/main apps/desktop/src/preload && git commit -m "feat(desktop): add main process, preload bridge, IPC for app:getVersion"`。

## 8. Renderer：迁移 figma_design 源码

> 步骤 8.1–8.7 全部用 `git mv` 保留历史。每个 mv 后用 `git status` 验证。

- [ ] 8.1 创建目标目录骨架：`apps/desktop/src/renderer/index.html`、`apps/desktop/src/renderer/src/components/`、`apps/desktop/src/renderer/src/styles/`、`apps/desktop/src/renderer/src/data/`。
- [ ] 8.2 创建 `apps/desktop/src/renderer/index.html`：
  ```html
  <!doctype html>
  <html lang="zh-CN">
    <head>
      <meta charset="UTF-8" />
      <meta http-equiv="Content-Security-Policy"
        content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://images.unsplash.com; connect-src 'self'" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>FIRESTONE</title>
    </head>
    <body class="bg-[#0E0E14] text-slate-300">
      <div id="root"></div>
      <script type="module" src="/src/main.tsx"></script>
    </body>
  </html>
  ```
- [ ] 8.3 用 git mv 迁移所有 figma 组件（保留历史）：
  ```bash
  git mv figma_design/src/app/components apps/desktop/src/renderer/src/components
  git mv figma_design/src/app/data/mockDecks.ts apps/desktop/src/renderer/src/data/mockDecks.ts
  git mv figma_design/src/styles apps/desktop/src/renderer/src/styles
  ```
- [ ] 8.4 迁移文档：
  ```bash
  mkdir -p docs/figma
  git mv figma_design/ATTRIBUTIONS.md docs/figma/ATTRIBUTIONS.md
  git mv figma_design/guidelines/Guidelines.md docs/figma/Guidelines.md
  ```
- [ ] 8.5 在 `docs/figma/Guidelines.md` 末尾追加：
  ```markdown
  ## TODO（add-monorepo-skeleton change 遗留）
  - 把 OverlayView 中 `images.unsplash.com` 占位图替换为本地资源；之后从 `index.html` CSP 中移除 `https://images.unsplash.com`。
  - 把 figma_design 原 App.tsx 中 `useState('tracker')` 改造后的状态管理（HashRouter）若需要扩展，迁入 `@hdt/core/router`。
  ```
- [ ] 8.6 删除 figma_design 残留：
  ```bash
  git rm -r figma_design
  ```
  期望 `git status` 显示 figma_design 整体被删除。
- [ ] 8.7 提交：
  ```bash
  git add docs/figma apps/desktop/src/renderer
  git commit -m "refactor(desktop): migrate figma_design into apps/desktop renderer"
  ```

## 9. Renderer：路由化与入口装配

- [ ] 9.1 创建 `apps/desktop/src/renderer/src/env.d.ts`：
  ```ts
  import type { HdtApi } from '../../preload/index';
  declare global {
    interface Window { hdt: HdtApi }
  }
  export {};
  ```
- [ ] 9.2 重写 `apps/desktop/src/renderer/src/components/Sidebar.tsx`：把 `setActiveTab` 改为基于 `useNavigate`（react-router v7）：
  - 顶部加 `import { useNavigate, useLocation } from 'react-router';`
  - `navItems` 中每项的 `id` 同时作为 `path`
  - 点击 → `navigate('/' + item.id)`
  - 当前激活态用 `useLocation().pathname.startsWith('/' + item.id)`
  - 删除原 `activeTab/setActiveTab` props
- [ ] 9.3 创建 `apps/desktop/src/renderer/src/routes.tsx`：
  ```tsx
  import { Navigate, type RouteObject } from 'react-router';
  import { Dashboard } from './components/Dashboard';
  import { Stats } from './components/Stats';
  import { Collection } from './components/Collection';
  import { Settings } from './components/Settings';
  import { OverlayView } from './components/OverlayView';

  export const routes: RouteObject[] = [
    { index: true, element: <Navigate to="/tracker" replace /> },
    { path: 'tracker', element: <Dashboard /> },
    { path: 'stats', element: <Stats /> },
    { path: 'collection', element: <Collection /> },
    { path: 'settings', element: <Settings /> },
    { path: 'overlay', element: <OverlayView /> },
    { path: '*', element: <Navigate to="/tracker" replace /> },
  ];
  ```
- [ ] 9.4 重写 `apps/desktop/src/renderer/src/App.tsx`：用 `<Outlet />` 渲染当前路由内容，移除 `useState('tracker')` 与 `viewMode` 内的 `<OverlayView/>` 直接挂载（OverlayView 改由路由 `/overlay` 提供）。Sidebar 在 pathname 为 `/overlay` 时不渲染。
- [ ] 9.5 创建 `apps/desktop/src/renderer/src/main.tsx`：
  ```tsx
  import './styles/index.css';
  import { createRoot } from 'react-dom/client';
  import { createHashRouter, RouterProvider } from 'react-router';
  import App from './App';
  import { routes } from './routes';

  const router = createHashRouter([{ path: '/', element: <App />, children: routes }]);
  const root = document.getElementById('root');
  if (!root) throw new Error('Missing #root');
  createRoot(root).render(<RouterProvider router={router} />);
  ```
- [ ] 9.6 确认 `apps/desktop/src/renderer/src/styles/index.css` 顶部有 `@import "tailwindcss";`（Tailwind v4 写法），如无则添加。
- [ ] 9.7 启动 dev 验证：`pnpm dev`，5 秒内出现 FIRESTONE 主窗口，点击 Sidebar 各 Tab 都能切换。手动验证后 Ctrl+C 停掉。
- [ ] 9.8 提交：`git add apps/desktop && git commit -m "feat(desktop): wire HashRouter and migrate sidebar to react-router"`。

## 10. Renderer 冒烟测试

- [ ] 10.1 创建 `apps/desktop/vitest.config.ts`：
  ```ts
  import { defineConfig } from 'vitest/config';
  import react from '@vitejs/plugin-react';
  import { resolve } from 'node:path';
  export default defineConfig({
    plugins: [react()],
    test: {
      environment: 'jsdom',
      globals: true,
      include: ['src/renderer/tests/**/*.test.{ts,tsx}'],
      setupFiles: ['src/renderer/tests/setup.ts'],
    },
    resolve: { alias: { '@': resolve(__dirname, 'src/renderer/src') } },
  });
  ```
- [ ] 10.2 创建 `apps/desktop/src/renderer/tests/setup.ts`：
  ```ts
  import '@testing-library/jest-dom/vitest';
  ```
- [ ] 10.3 **写失败测试** `apps/desktop/src/renderer/tests/App.test.tsx`：
  ```tsx
  import { describe, it, expect } from 'vitest';
  import { render, screen } from '@testing-library/react';
  import { createMemoryRouter, RouterProvider } from 'react-router';
  import App from '../src/App';
  import { routes } from '../src/routes';

  describe('App', () => {
    it('renders FIRESTONE brand and default Tracker view', () => {
      const router = createMemoryRouter(
        [{ path: '/', element: <App />, children: routes }],
        { initialEntries: ['/'] },
      );
      render(<RouterProvider router={router} />);
      expect(screen.getByText(/FIRESTONE/i)).toBeInTheDocument();
    });
  });
  ```
- [ ] 10.4 运行 `pnpm --filter @hdt/desktop test`，期望：FAIL（缺 setup 或缺 `window.hdt` 等）。根据失败原因在 `setup.ts` 中 stub `window.hdt`：
  ```ts
  Object.defineProperty(window, 'hdt', {
    value: { app: { getVersion: async () => '0.1.0' } },
    writable: true,
  });
  ```
- [ ] 10.5 重新运行 `pnpm --filter @hdt/desktop test`，期望：1 passed。
- [ ] 10.6 提交：`git add apps/desktop && git commit -m "test(desktop): add renderer smoke test for default route"`。

## 11. 打包配置（electron-builder）

- [ ] 11.1 创建 `apps/desktop/electron-builder.yml`：
  ```yaml
  appId: com.hdt.desktop
  productName: HDT.js
  directories:
    output: release
    buildResources: build
  files:
    - out/**/*
    - package.json
  win:
    target:
      - target: nsis
        arch: [x64]
    icon: build/icon.ico
  nsis:
    oneClick: false
    perMachine: false
    allowToChangeInstallationDirectory: true
    artifactName: HDT.js-Setup-${version}.${ext}
  ```
- [ ] 11.2 创建占位图标 `apps/desktop/build/icon.ico`：先放一个 256x256 的简单橙色火焰占位图，或使用 lucide 的 Crown SVG 转 ICO。可暂用空文件占位，但 build 时 electron-builder 会警告；接受 warning，不阻断 build。
- [ ] 11.3 在 `.gitignore` 末尾追加 `apps/desktop/release/`、`apps/desktop/out/`。
- [ ] 11.4 运行 `pnpm package`，等待至产出 `apps/desktop/release/HDT.js-Setup-0.1.0.exe`，体积 > 50MB。如果 Windows Defender 拦截可在本机白名单临时放行（仅本地验证用）。
- [ ] 11.5 提交：`git add apps/desktop/electron-builder.yml apps/desktop/build .gitignore && git commit -m "build(desktop): add electron-builder NSIS config"`。

## 12. CI workflow

- [ ] 12.1 创建 `.github/workflows/ci.yml`：
  ```yaml
  name: CI
  on:
    pull_request:
    push:
      branches: [main]
  jobs:
    build:
      runs-on: windows-latest
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with:
            node-version: '20'
            cache: 'pnpm'
        - name: Enable corepack
          run: corepack enable
        - run: pnpm install --frozen-lockfile
        - run: pnpm lint
        - run: pnpm typecheck
        - run: pnpm test
        - run: pnpm --filter @hdt/desktop build
  ```
- [ ] 12.2 提交：`git add .github && git commit -m "ci: add GitHub Actions workflow for windows build"`。

## 13. README 与收尾

- [ ] 13.1 创建根 `README.md`，包含以下章节（中文）：
  - 项目简介（一段 + 链接到 `DEVELOPMENT_PLAN.md` / `Rewrite_Design.md`）
  - 前置条件：Windows 10/11 x64、Node.js ≥ 20 LTS、`corepack enable` 启用 pnpm 9
  - 一键启动：`pnpm install && pnpm dev`
  - 常用脚本：`pnpm dev` / `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm package`
  - 仓库结构（贴 `apps/`、`packages/shared`、`docs/figma`、`openspec` 的简化树）
  - 贡献流程：Conventional Commits + PR 触发 CI + OpenSpec 流程
- [ ] 13.2 提交：`git add README.md && git commit -m "docs: add README with quickstart and repo layout"`。
- [ ] 13.3 在仓库根运行最终验收：
  ```bash
  pnpm install --frozen-lockfile
  pnpm lint
  pnpm typecheck
  pnpm test
  pnpm --filter @hdt/desktop build
  ```
  全部命令退出码 0，则本 change 实施完成。
- [ ] 13.4 运行 `openspec validate add-monorepo-skeleton --strict`，期望：所有 spec / scenario 解析无错。
- [ ] 13.5 运行 `openspec status --change add-monorepo-skeleton`，确认所有 artifact 显示 done，全部 task 显示已完成。

## 14. 后续 change 准备（仅记录，不在本 change 实施）

- [ ] 14.1 在 commit message 历史中追加一条 `chore: add followup notes`，把以下文字写入 `openspec/changes/.NEXT.md`：
  ```
  下一个候选 change：
  - decide-hearthmirror-bridge：评审 koffi vs napi-rs vs 32-bit 子进程，输出 ADR 与原型 spike 计划。
  - add-card-database：引入 packages/hearthdb，下载并加载 Cards.json，实现卡牌查找/过滤。
  - add-deck-management：引入 packages/core/deck + better-sqlite3 + Zustand，实现卡组 CRUD 与卡组码导入导出。
  ```
- [ ] 14.2 提交：`git add openspec/changes/.NEXT.md && git commit -m "docs(openspec): record candidate followup changes"`。
