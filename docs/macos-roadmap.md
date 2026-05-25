# OpenDeckTracker — macOS 移植路线图

> 分支：`macos`（与 `main` 平行推进，所有阶段性 change 先在该分支落地，每阶段验收通过后再回流主分支）
>
> 参考项目：[`HSTracker`](https://github.com/HearthSim/HSTracker)（HearthSim 维护的 macOS Swift 端炉石记牌器）。本路线只参考其**功能组件划分与 macOS 系统 API 选型**，不直接拷贝代码（HSTracker 是 MIT，但我们的 Rust + Electron 架构与 Swift/Cocoa 完全不同，移植粒度仅到「设计意图」级别）。

---

## 1. 目标与非目标

### 目标（v0.7-mac.alpha → v0.8-mac.beta）

- 在 **macOS 12+ (Monterey 起)、Apple Silicon (arm64) only** 上跑通 OpenDeckTracker 的核心闭环：
  1. 检测炉石进程并稳定附加；
  2. HearthMirror 反射读 Mono runtime 拿到 BattleTag / MatchInfo / DeckState / HandState / BoardState 等；
  3. HearthWatcher 解析 Power.log（macOS 路径），驱动 deck-tracker 状态机；
  4. 玩家+对手两个 overlay 面板贴在炉石窗口边缘，全屏/窗口切换都能跟随；
  5. UI 主进程窗口可正常打开、能看历史/统计/收藏页；
  6. 出 `.dmg` + `.zip`，签名 + 公证（Notarization）通过，Gatekeeper 直接打开不需要右键。

### 非目标（v1.0 之前先不做）

- **Intel Mac（x86_64）支持** — 已确认只发 `darwin-arm64`，不出 universal binary；这显著简化反射层和打包链路（见 §3.1 与 Phase 4）；
- macOS 11 及以下版本（最低线 macOS 12 Monterey；CGWindow API 在更早版本对 Hearthstone 全屏 / Metal 输出有兼容差异）；
- Mac App Store 分发（沙箱 + `task_for_pid` 不兼容，单独立项）；
- Linux 端（Hearthstone 没有原生 Linux 客户端，无意义）；
- HSReplay.net 上传（Windows 也未实现，跨平台再统一做）。

---

## 2. 与现有 Windows 实现的差异面（差异表）

| 子系统 | 现状（Windows） | macOS 需要做什么 |
|---|---|---|
| **进程检测** | `tasklist /FI "IMAGENAME eq Hearthstone.exe"`，主进程 `hearthstone-process-monitor.ts` 直接 `if !win32 return` | `NSWorkspace.runningApplications` 找 `bundleIdentifier == "unity.Blizzard Entertainment.Hearthstone"`，或 fallback 用 `pgrep -x Hearthstone`。封到同一个 monitor 里按 `process.platform` 分流。 |
| **进程内存读取** | `windows` crate → `OpenProcess(PROCESS_VM_READ)` + `ReadProcessMemory` | `mach2` crate → `task_for_pid(pid)` + `mach_vm_read_overwrite`。需要 **`com.apple.security.cs.debugger` entitlement**，且要由 Apple Developer ID 签名才能拿到 task port。 |
| **PE/DLL 模块枚举** | `EnumProcessModulesEx(LIST_MODULES_32BIT)` + `GetModuleBaseNameW` + `GetModuleInformation` | 走 `mach_vm_region_recurse` 遍历内存区域 + dyld shared cache → 解析 Mach-O 头找 `Assembly-CSharp.dylib`、`mono*.dylib` 的 base/size。Mac 上 Hearthstone 是 64 位 ARM64/x86_64（HSTracker 的 HearthMirror 已经处理这套，可对照其 image walking 实现）。 |
| **Mono 反射** | `mono.rs`、`metadata`、`reflection/*` 假定 **32-bit Mono on Win32 — Windows HS 客户端就是 32 位，必须保持原样不动** | 不改 Windows code path。新增 64-bit Mono 反射分支（macOS HS 客户端是 64-bit）：抽象 `MonoAbi { Abi32, Abi64 }`，按 cfg 选 ABI。`RemotePtr`、字段偏移、字符串布局、HashMap/List 内部结构对照 64-bit Mono ABI 重新验证。**核心约束：现有 Windows 32-bit 行为零回归**（既有测试和 `cargo test --target x86_64-pc-windows-msvc` 全绿）。 |
| **窗口几何** | `EnumWindows` + `GetWindowRect` + `IsIconic`/`IsWindowVisible` + `GetForegroundWindow` | `CGWindowListCopyWindowInfo` 找 owner == `Hearthstone` 的最大 onscreen 窗口拿 bounds；`AXUIElementCreateApplication(pid)` + `kAXFocusedWindowAttribute` + `AXFullScreen` 判定全屏；`NSWorkspace.frontmostApplication` 判定 foreground。 |
| **窗口事件订阅** | `SetWinEventHook(EVENT_OBJECT_LOCATIONCHANGE / EVENT_SYSTEM_FOREGROUND)` | KVO `NSWorkspace.runningApplications`，外加 1Hz `CGWindow` 轮询补偿 fullscreen → space 切换；或者用 `AXObserverCreate` 订阅 `kAXMovedNotification` / `kAXResizedNotification`。需要 **辅助功能 (Accessibility) 权限**，第一次启动时弹原生授权对话框引导用户开启。 |
| **覆盖层置顶** | `SetWindowPos(HWND_NOTOPMOST, insertAfter=GetWindow(hs, GW_HWNDPREV))`，刚好压在炉石上方 | `NSWindow.level = .floating` 并配合 `collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]` 让覆盖层能跟进炉石的全屏 space。Hearthstone 全屏时需要切到 `screensSaverWindow - 1` 级别才不会被全屏专用 window server layer 盖住。 |
| **Power.log 路径** | `%LOCALAPPDATA%\Blizzard\Hearthstone\Logs\` + 安装目录扫描 | `~/Library/Logs/Blizzard/Hearthstone/`（CN 客户端是同一路径）。需要扩展 `packages/hearthwatcher/src/log-paths.ts` 加 darwin 分支。HSTracker 还会**主动写 `~/Library/Preferences/Blizzard/Hearthstone/log.config`** 来确保 Power log 被启用，我们也要做这一步（Windows 端目前要求用户自行启用，Mac 端可以做得更顺滑）。 |
| **打包** | electron-builder NSIS + zip portable | `dmg`（DMG 安装器，可拖拽到 Applications）+ `zip`（绿色版）。需要 `entitlements.mac.plist`，开 `com.apple.security.cs.debugger`、`com.apple.security.cs.allow-jit`（如果将来用），`hardened runtime` 必开。 |
| **代码签名/公证** | 占位、未签名 | **必须**：Apple Developer ID Application 证书签 .app + .dmg，notarytool 走完 Notarization，stapler 装订。否则 task_for_pid 拿不到权限、Gatekeeper 也会直接 quarantine。 |
| **自动更新** | `electron-updater` generic provider | macOS 用同一份 `electron-updater`，但 publish channel 要按平台分 `latest-mac.yml`，DMG 必须签名+notarized 才能走 Squirrel.Mac 静默更新。 |
| **CI** | `windows-latest` 一台 | 加 `macos-14`（Apple Silicon）+ 可选 `macos-13`（Intel） runner，分别构建 napi-rs 二进制；签名/公证用 secrets 注入。 |

---

## 3. 架构决策

### 3.1 HearthMirror 的 macOS 实现：扩展 Rust，单仓 + cfg 分流（决策已敲定：方案 A）

**最终方案：**在 `packages/hearthmirror/native` 内按 `#[cfg(target_os)]` 分平台，新增 `process_mac.rs`、`memory_mac.rs`、`window_mac.rs`，依赖 `mach2`、`libproc`、`core-foundation`、`objc2`、`objc2-app-kit`、`objc2-application-services` 等 crate。

**关键约束（用户已确认）：**

- **Windows HS 客户端是 32 位**，现有的 `mono.rs`/`metadata`/`reflection` 全部按 32-bit ABI 写就，**Phase 1 不动 Windows code path**。
- **macOS HS 客户端是 64 位**（且只支持 Apple Silicon → arm64），新增独立的 64-bit Mono ABI 分支。
- 反射层走 trait（或 enum dispatch）抽象出 `MonoAbi32` / `MonoAbi64` 两套指针/字段算式；`#[cfg(target_os = "windows")]` → `MonoAbi32`，`#[cfg(target_os = "macos")]` → `MonoAbi64`，互不影响。
- napi-rs 发布二进制：`win32-x64-msvc`（已有）+ 新增 `darwin-arm64`。**不出** `darwin-x64` / universal。
- 其他被否决的方案：B（借 HSTracker Obj-C++ dylib，napi-rs 桥接）— 引入第二种语言、维护成本高；C（独立 Swift Package + XPC）— 进程间通信成本高、打包复杂。两者作为 Phase 0 spike 失败时的 fallback 备选，不进入主路线。

### 3.2 macOS 全屏 overlay：`canJoinAllSpaces + fullScreenAuxiliary`，不用 always-on-top

参考 HSTracker `WindowManager.swift`：用 `NSWindow.Level` 略低于 `mainMenuWindow`，`collectionBehavior` 加 `.canJoinAllSpaces` + `.fullScreenAuxiliary`，让覆盖层能进入炉石的 fullscreen space 但不抢焦点。Electron 通过 `BrowserWindow.setAlwaysOnTop(true, 'modal-panel')` + `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })` 可以拿到等价效果。

### 3.3 Accessibility & TaskPort 权限引导

第一次启动时主进程检测：

1. **Accessibility 权限**：`AXIsProcessTrustedWithOptions({ kAXTrustedCheckOptionPrompt: true })` 弹系统对话框引导用户去 `System Settings → Privacy & Security → Accessibility` 加白名单；
2. **TaskPort（debugger entitlement）**：包内 entitlements 已声明 `com.apple.security.cs.debugger`，正常签名后即可调用 `task_for_pid`。**但**：用户必须用「右键打开」或开发者签名，未签的 dev build 在主进程 spike 一个 fallback——通过 `sudo /usr/libexec/taskgated -s` 提示？太重。dev build 用 self-signed `codesign --force --sign - --entitlements ... --deep` 即可绕过，文档里写清楚。

引导界面用 OpenSpec 单独立个 `add-mac-onboarding` change。

---

## 4. 分阶段路线（按 OpenSpec change 切片）

下面每一项对应 `openspec/changes/<name>/` 一个独立提案，遵循仓库现有 `proposal.md / design.md / specs/ / tasks.md` 规范。**先 spike → 再实现 → 再签名/CI → 最后发版**。

### Phase 0 — Spike & 决策（≈ 3 ~ 5 天）

| Change | 目标 | 验收 |
|---|---|---|
| `spike-hearthmirror-mac-bridge` | 用 `mach2` + `libproc` 在 macOS 上把 Hearthstone 的 base address 找出来，能 `mach_vm_read` 出 `Hearthstone` Mach-O 头的 magic（`0xFEEDFACF`）。spike 报告写到 `docs/spikes/`。 | 在 Apple Silicon + Intel 各跑一次，命令行二进制能输出 PID + base + size。 |
| `spike-mac-window-tracking` | 用 `objc2` + Core Graphics 调 `CGWindowListCopyWindowInfo` 拿炉石窗口 bounds；用 AX API 拿 fullscreen 状态。 | 桌面 + 全屏两种状态都能正确拿到 frame，且 frame 在 retina 屏上以「点」为单位，与 Electron `BrowserWindow.setBounds` 一致（无需 DIP 转换，与 Windows 不同）。 |
| `decide-mac-distribution` | 决定 macOS 端发布通道：DMG + zip + Sparkle/electron-updater？是否需要 universal binary？需不需要单独 ARM64 / x64 包？签名 + 公证流程。 | 出一份 `docs/adr/0xx-mac-distribution.md`，敲定证书、bundle id、entitlements、CI secret 名。 |

### Phase 1 — HearthMirror 平台抽象 + macOS 实现（≈ 2 周）

| Change | 目标 |
|---|---|
| `refactor-hearthmirror-platform-traits` | 把 `process.rs`/`memory.rs`/`window.rs` 里的 Win32 调用抽出 `Process`、`ProcessMemory`、`WindowHost` trait（或 enum dispatch），保留现有 Windows 实现作为默认 cfg；测试用 mock 实现替换。**Mono 反射代码不动**。 |
| `add-hearthmirror-mac-process` | 新增 `process_mac.rs` 实现 `find_pid` (`libproc::proc_listpids`) 和 `enumerate_modules` (走 dyld images / `mach_vm_region_recurse`)；napi 入口在 macOS 下走新分支。 |
| `add-hearthmirror-mac-memory` | 新增 `memory_mac.rs` 实现 `read_bytes` 用 `mach_vm_read_overwrite`；处理 `KERN_INVALID_ADDRESS`/`KERN_PROTECTION_FAILURE` 映射到 `ScryError::MemoryAccess`。 |
| `add-mono-abi64-for-mac` | **不动 Windows 32-bit code path**。新增 `RemotePtr64`（与现有 `RemotePtr` 共存，后者改名 `RemotePtr32` 或保留别名），并把反射模块按 `MonoAbi32` / `MonoAbi64` trait 拆分。Windows 仍编译走 `MonoAbi32`，macOS 编译走 `MonoAbi64`。`metadata` 模块在 Mac 上重新跑一次离线 dump，把 64-bit Mono 的 class/method/field 偏移表落到 `metadata/probe-results-mac.json`。**验收硬指标：现有 Windows 测试套件（`cargo test`、`pnpm test`）全绿，行为零回归。** |
| `add-hearthmirror-mac-window` | 新增 `window_mac.rs`，封装 `CGWindowListCopyWindowInfo` + AX 全屏检测 + `NSWorkspace.frontmostApplication`；同时新增窗口事件订阅器（NSWorkspace KVO + 1Hz fallback poll）。 |

### Phase 2 — HearthWatcher + 主进程跨平台改造（≈ 1 周）

| Change | 目标 |
|---|---|
| `add-hearthwatcher-mac-paths` | `log-paths.ts` 加 darwin 分支：`~/Library/Logs/Blizzard/Hearthstone/`、`~/Library/Application Support/Blizzard/Hearthstone/Logs/`，以及通过 NSWorkspace 反查 Hearthstone.app bundle 的兜底。 |
| `add-mac-log-config-bootstrap` | 第一次检测不到 Power.log 时，**自动写** `~/Library/Preferences/Blizzard/Hearthstone/log.config`（参考 HSTracker `CoreManager.swift`），并提示用户「重启炉石以生效」。Windows 端目前要用户手动加，可以同步把 Win 端也加上。 |
| `port-hearthstone-process-monitor-to-mac` | 把现在的 `if process.platform !== 'win32' return` 拆掉，新增 darwin 实现：`pgrep -x Hearthstone` + `NSWorkspace.runningApplications` KVO（双保险）。事件 `appeared`/`disappeared` 行为完全一致。 |
| `add-mac-permission-guards` | 主进程启动时探测 Accessibility & 调试权限，缺失就把主窗口跳到一个引导页（新建 `/onboarding/mac-permissions` 路由），点按钮触发 `AXIsProcessTrustedWithOptions(prompt: true)` 或打开「系统设置 → 隐私与安全」。 |

### Phase 3 — Overlay & Window Manager（≈ 1 周）

| Change | 目标 |
|---|---|
| `port-overlay-window-to-mac` | `OverlayManager` 当前直接用 `BrowserWindow.setBounds` + `placeWindowAboveHearthstone(handle)`。新增 darwin 分支：bounds 不需要 DIP 转换；置顶用 `setAlwaysOnTop(true, 'modal-panel')` + `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`；`placeWindowAboveHearthstone` 在 Mac 下空操作（NSWindow 自身的 level 已经够）。 |
| `port-card-preview-window-to-mac` | 同上，确认卡牌悬浮卡预览窗口不会抢焦点（macOS 上 `BrowserWindow` 默认会拿 keyboard focus，需要 `focusable: false`）。 |
| `verify-overlay-fullscreen-spaces` | 在炉石全屏 + Mission Control 多 space 切换 + 外接显示器组合下做手动验收，写到 `docs/spikes/mac-overlay-verification.md`。 |

### Phase 4 — 打包、签名、公证（≈ 3 天）

| Change | 目标 |
|---|---|
| `add-mac-electron-builder-config` | `apps/desktop/electron-builder.yml` 加 `mac:` 段（targets: `dmg`、`zip`，**arch 只发 `arm64`**），`build/entitlements.mac.plist` 启用 hardened runtime + `com.apple.security.cs.debugger` entitlement，`build/icon.icns`，`mac.identity` 走环境变量。 |
| `add-mac-codesign-and-notarize` | 在 `package.json` `package` 脚本里串一个 `node scripts/notarize-mac.mjs`（用 `@electron/notarize`），CI 注入 `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID` secret。 |
| `add-mac-ci-pipeline` | `.github/workflows/ci.yml` 加 `runs-on: macos-14`（Apple Silicon）并行 job，跑 `pnpm install` + `pnpm typecheck` + `pnpm test` + `pnpm --filter @hdt/desktop package`（PR 上不签名，只验编译；release tag 上跑签名+公证 + upload artifact）。**不需要 macos-13 (Intel) runner**。同时跑一次 `cargo test --target x86_64-pc-windows-msvc` 的 cross-check（用 `cross` 或在 Windows runner 上）确保 Phase 1 的 trait 抽象没有回归 Windows 32-bit 反射行为。 |
| `add-mac-auto-update-channel` | electron-updater publish 加 `latest-mac.yml`，`auto-update.ts` 按 `process.platform` 选 channel。 |

### Phase 5 — Beta、发版、文档（≈ 1 周）

| Change | 目标 |
|---|---|
| `add-mac-beta-release-notes` | `RELEASE_NOTES.md` 新增 `v0.7.0-mac.alpha` / `v0.7.0-mac.beta` 段，列已知问题（如 CN 客户端 bundle id 差异、Mac App Store 不支持等）。 |
| `update-readme-for-mac` | `README.md` 顶部「Platform」徽章改成 `Windows | macOS`，下载/快速上手段加 macOS 步骤。 |
| `add-mac-troubleshooting-doc` | `docs/mac-troubleshooting.md`：Accessibility 权限怎么开、Hardened Runtime 报错怎么处理、CN/Asia 服 log 路径异常怎么办。 |

---

## 5. 风险登记

| 风险 | 影响 | 缓解 |
|---|---|---|
| `task_for_pid` 不签名拿不到权限 | macOS 端**完全无法工作** | Phase 0 的 spike 必须**先**用 ad-hoc 签名跑通，Phase 4 拉通正式签名。这是整个移植的硬依赖。 |
| **Phase 1 抽象 trait 时不慎回归 Windows 32-bit 反射** | Windows 端 v0.6.0 用户**线上炸**（最高风险） | 每个 Phase 1 change 提交前必须本地跑 `pnpm --filter @hdt/hearthmirror-native test` + `pnpm --filter @hdt/desktop test`；CI 加 Windows job 跑反射模块的 dump 用例并 diff 输出；trait 抽象采用「先抽象、后改 Windows 实现签名（保持调用面不动）、再加 macOS 实现」三步走，每步独立 PR。 |
| Apple Silicon 的 Mono 内存布局有 PAC（指针认证）干扰 | 反射偶发崩 | spike 阶段就处理 `arm64e` 指针认证位剥离（top-byte ignore），反射读出的指针先过 `RemotePtr64::strip_pac()`。 |
| 暴雪炉石 Mac 客户端版本相对滞后或随时下架（暴雪近年来对 Mac 投入有缩减迹象） | 用户基数不大、维护性价比低 | 接受；macOS 端定位为「best effort」，CI 失败不阻塞 Windows release（CI job 用 `continue-on-error: true` 直到 Phase 5 转正）。 |
| Hearthstone CN 服在 Mac 上路径/bundle id 是否一致 | log 检测失败 | Phase 2 加 bundle id 兜底（`com.blizzardentertainment.Hearthstone` 等候选），并允许用户手动指定 log 路径。 |
| 公证（Notarization）由 Apple 异步审核，CI 不稳 | release pipeline 慢 | 使用 `notarytool` 的 `--wait`，超时 30min；release job 单独跑、不阻塞 PR CI。 |
| Accessibility 权限只能用户手动开启，无法自动 | 首次启动体验差 | onboarding 页做引导动画 + 「点这里去系统设置」直达链接（`x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility`）。 |

---

## 6. 工作量估算（合计 ≈ 5 ~ 7 周个人时）

| 阶段 | 天数 |
|---|---|
| Phase 0 spike & 决策 | 3 ~ 5 天 |
| Phase 1 HearthMirror macOS | 10 ~ 14 天 |
| Phase 2 HearthWatcher + 进程监控 | 5 ~ 7 天 |
| Phase 3 Overlay & Window | 5 天 |
| Phase 4 签名 + CI | 3 天 |
| Phase 5 文档 + 发布 | 5 天 |

最大单点 = HearthMirror macOS 实现（Mono 64-bit 反射 port 是核心硬骨头）。建议 Phase 0 spike 拆成单独的 timebox，spike 失败就退回选项 B（借 HSTracker 的 HearthMirror dylib）。

---

## 7. 立刻可以做的第一步（用户已确认方向，可以开干）

> 当前分支：`macos`。

1. 先开 `openspec/changes/spike-hearthmirror-mac-bridge/`，把 spike 目标 / 验证标准 / 时间盒 写清楚（建议 3 天 timebox）。
2. 在 `packages/hearthmirror/native/Cargo.toml` 加 `[target.'cfg(target_os = "macos")'.dependencies]` 段，引入 `mach2`、`libproc`、`core-foundation`，**不动** Windows 现有 cfg。
3. 在 `packages/hearthmirror/native/examples/` 加一个 `dump_mac_modules.rs`，读 PID 输出 dyld image list；这是 spike 的 deliverable 1。
4. 同时在 `apps/desktop/src/main/index.ts` 把 `if (process.platform !== 'win32') return` 这种**硬绑死的平台分支**列一个清单（grep `process.platform` 已知 5 处），逐个 TODO 化，作为 Phase 2 的待办输入。
5. **每次进 Phase 1 的 PR 前先跑一遍 Windows 32-bit 反射测试**：`cargo test -p hearthmirror-native` + 在 Windows 沙盒里 `pnpm --filter @hdt/desktop test`，确保零回归。
