## ADDED Requirements

### Requirement: 三段式 Electron 应用骨架

The `apps/desktop` package SHALL be a runnable Electron application composed of three TypeScript entry points: `src/main/index.ts` (main process), `src/preload/index.ts` (preload script), and `src/renderer/src/main.tsx` (renderer entry). All three SHALL be authored as ES Modules.

#### Scenario: 三个入口都被 electron-vite 识别
- **WHEN** 执行 `pnpm --filter @hdt/desktop build`
- **THEN** electron-vite 产出 `out/main/index.js`、`out/preload/index.js`、`out/renderer/index.html` 三个文件，且 `out/main/index.js` 顶部为 ESM 语法（包含 `import` / `export`）

#### Scenario: pnpm dev 启动主窗口
- **WHEN** 执行 `pnpm --filter @hdt/desktop dev`
- **THEN** 5 秒内出现一个标题为 "FIRESTONE" 的 Electron 主窗口，窗口尺寸默认 1280x800

### Requirement: 安全默认值

The main process SHALL create the default `BrowserWindow` with the following security options enforced: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`, and a strict Content-Security-Policy meta tag injected into `index.html`.

#### Scenario: 渲染进程无 require / 无 process
- **GIVEN** 主窗口已启动
- **WHEN** 在 DevTools Console 执行 `typeof require` 与 `typeof process`
- **THEN** 两者均为 `'undefined'`

#### Scenario: CSP 阻止 inline script
- **GIVEN** 主窗口已启动
- **WHEN** 在 DevTools Console 尝试 `eval('1+1')`
- **THEN** 抛出 `EvalError: Refused to evaluate a string as JavaScript because 'unsafe-eval' is not an allowed source of script`

### Requirement: Preload 仅暴露最小 IPC 表面

The preload script SHALL use `contextBridge.exposeInMainWorld('hdt', api)` to expose **exactly one** namespace `hdt.app.getVersion(): Promise<string>`. No other property SHALL be exposed in this change.

#### Scenario: window.hdt.app.getVersion 返回应用版本
- **GIVEN** 主窗口已启动
- **WHEN** 在 DevTools Console 执行 `await window.hdt.app.getVersion()`
- **THEN** 返回值为 `apps/desktop/package.json` 中的 `version` 字符串（例如 `"0.1.0"`）

#### Scenario: 未声明的 API 不可访问
- **GIVEN** 主窗口已启动
- **WHEN** 在 DevTools Console 执行 `window.hdt.fs` 或 `window.hdt.exec`
- **THEN** 返回 `undefined`

### Requirement: 单实例锁

Launching a second instance of the application SHALL focus the existing main window instead of creating a new one. This SHALL be implemented via `app.requestSingleInstanceLock()`.

#### Scenario: 二次启动聚焦已有窗口
- **GIVEN** 应用已经启动并显示主窗口
- **WHEN** 再次执行 `pnpm --filter @hdt/desktop start`（或双击安装后的快捷方式）
- **THEN** 第二个进程立即退出（exit code 0），第一个窗口前置且获得焦点

### Requirement: 主进程导航与 webview 锁定

The main process SHALL register `will-navigate` and `will-attach-webview` handlers that prevent any navigation away from the bundled `index.html` and reject all `<webview>` creation.

#### Scenario: will-navigate 拦截外链
- **GIVEN** 主窗口已启动并加载 `index.html`
- **WHEN** 渲染进程通过 `window.location.assign('https://evil.example.com')` 试图跳转
- **THEN** 主进程的 `will-navigate` 监听器调用 `event.preventDefault()`，URL 保持为本地 `index.html`

### Requirement: 应用生命周期处理

The main process SHALL quit when all windows are closed on Windows/Linux (`window-all-closed` → `app.quit()`). On macOS the app SHALL stay alive (Apple HIG)，但本 change 在 Windows 上验收即可。

#### Scenario: 关闭主窗口后应用退出
- **GIVEN** 主窗口正在显示
- **WHEN** 用户关闭主窗口
- **THEN** 在 Windows 平台上，Electron 进程在 1 秒内退出（exit code 0）
