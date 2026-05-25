# ADR 0002: HearthMirror macOS Memory Bridge Architecture

> **Status**: Accepted (2026-05-25)
> **Deciders**: OpenDeckTracker core team
> **Builds on**: [`docs/adr/0001-hearthmirror-bridge.md`](./0001-hearthmirror-bridge.md)
> **Related roadmap**: [`docs/macos-roadmap.md`](../macos-roadmap.md)

## Context

ADR 0001 已敲定 Windows 端的 HearthMirror 桥接方案（64-bit napi-rs Rust 同进程 + 跨架构读 32-bit `Hearthstone.exe`）。当前要把项目扩展到 macOS 端，必须为 macOS 选定一个等效的内存桥接架构。

差异面：

| 维度 | Windows（已生效） | macOS（待决策） |
|---|---|---|
| HS 客户端位数 | **32-bit**（Mono 32-bit ABI） | **64-bit**（Mono 64-bit ABI） |
| 进程内存读取 | `OpenProcess` + `ReadProcessMemory` | `task_for_pid` + `mach_vm_read_overwrite`（**需要 entitlement + 代码签名**） |
| 模块枚举 | `EnumProcessModulesEx(LIST_MODULES_32BIT)` | `mach_vm_region_recurse` + dyld images / Mach-O 头解析 |
| 窗口 / 全屏 | Win32 `EnumWindows` + `GetWindowRect` + `SetWinEventHook` | Core Graphics `CGWindowListCopyWindowInfo` + Accessibility `AXUIElement` + `NSWorkspace` KVO |
| 客户端架构 | x64 onlye | **arm64 only**（已确认不出 Intel / universal） |
| 最低 OS 版本 | Win10 1809+ | **macOS 12 Monterey+** |

## Decision

**OpenDeckTracker 在 macOS 上沿用 ADR 0001 选定的「Rust + napi-rs + 同进程」桥接架构**，按 `#[cfg(target_os)]` 在 `packages/hearthmirror/native` 内部分平台实现，发布两套 napi-rs 二进制（`win32-x64-msvc` 已有 + `darwin-arm64` 新增）。

具体地：

1. **进程层**（`process.rs` / `memory.rs` / `window.rs`）按平台拆分为 `*_win.rs` / `*_mac.rs`，对外通过 trait（或 enum dispatch）提供统一接口。**Windows 现有实现保持原文件名 + `#[cfg(windows)]`，零行为变更。**
2. **Mono 反射层**（`mono.rs` / `metadata` / `reflection/*`）抽象出 `MonoAbi32` 与 `MonoAbi64` 两套指针/字段算式：
   - **Windows 编译走 `MonoAbi32`**（HS Win 客户端是 32-bit Mono，硬约束）。
   - macOS 编译走 `MonoAbi64`（HS Mac 客户端是 64-bit Mono）。
   - **既有 Windows 32-bit 反射代码不动**——所有偏移、字段类型、`RemotePtr32` 字面量保持原样，只是把它们放到 `MonoAbi32` impl 里。
3. **macOS 进程内存底层**用 [`mach2`](https://crates.io/crates/mach2) crate 调 `task_for_pid(mach_task_self(), pid, &task)` + `mach_vm_read_overwrite`；模块枚举用 [`libproc`](https://crates.io/crates/libproc) + Mach-O 头解析。
4. **窗口层**用 [`core-foundation`](https://crates.io/crates/core-foundation) + [`core-graphics`](https://crates.io/crates/core-graphics) crate 调 `CGWindowListCopyWindowInfo` 拿 frame；fullscreen 真值检测（`AXUIElement` + `kAXFullScreenAttribute`）与 `NSWorkspace` 进程发现 / 焦点跟随放到 Phase 1 实装（spike 阶段先用 frame≈display-bounds 启发式打底，避免引入 `objc2` 系列依赖）。
5. **代码签名 + Notarization 是硬依赖**：发布 .app 必须由 Apple Developer ID Application 证书签名，entitlements 启用 `com.apple.security.cs.debugger` + Hardened Runtime；否则 `task_for_pid` 直接拒绝。开发期 ad-hoc 签名（`codesign --sign - --entitlements ...`）足以通过。
6. **不出 universal binary**：napi-rs 二进制只发 `darwin-arm64`。Intel Mac 用户用 v0.6.0 Windows 端 + Parallels 等方案，不在本路线覆盖范围。

## Considered Options（对照 ADR 0001 评估矩阵的简化复评）

### A. Rust 单仓 cfg 分流（chosen）

- 形态：当前 `packages/hearthmirror/native` 加 `#[cfg(target_os = "macos")]` 平台模块，反射逻辑按 `MonoAbi32`/`MonoAbi64` trait 共享。Windows 现有 32-bit 反射不动。
- ✅ 单一构建链 + 单一发布工件类型（napi-rs `.node`）。
- ✅ 与 Windows 端共享 ~70% 反射代码（`metadata` / `reflection/*` 业务逻辑层），只有底层进程访问与 ABI 算式分平台。
- ✅ 维护演进同步——后续偏移探测 / 字段升级一处改两端受益。
- ⚠️ Mono 64-bit ABI 的字段偏移需要在 macOS 真机上重新探测（接受）。

### B. 借 [HearthSim/HearthMirror](https://github.com/HearthSim/HearthMirror) Obj-C++ dylib + napi-rs 桥接

- 形态：把 HSTracker 在用的 Obj-C++ 实现编译成 dylib，从 Rust 通过 FFI 反向调用。
- ✅ Mono 64-bit 反射逻辑可直接复用（HSTracker 已经趟过坑）。
- ❌ 引入 Obj-C++ + Xcode 工具链，长期维护成本翻倍。
- ❌ 与 Windows 端 Rust 实现演进会越走越远，未来想统一卡顿。
- ❌ HSTracker 的 HearthMirror 代码近年活跃度下降，依赖第三方维护风险高。
- ➜ 仅作为方案 A 的 fallback：Phase 0 spike 失败时启用。

### C. 独立 Swift Package + XPC service

- 形态：单独写一个 Swift 项目用 Apple 原生 API 读内存，通过 XPC 与 Electron 通信。
- ✅ Mac 平台原生体验。
- ❌ 进程间通信成本高（IPC overhead 抹掉同进程优势）。
- ❌ 三种语言（TS / Rust / Swift）+ 两种构建（pnpm + cargo + swift）+ 双产物分发，工程复杂度爆炸。
- ❌ 与 ADR 0001 选 D 的核心理由（同进程 < 1 µs 调用）冲突。

## Decision Drivers

| 维度 | 权重 | A | B | C |
|---|---|---|---|---|
| 与 Windows 实现共享代码 | 高 | **优** | 差 | 差 |
| 单一构建工具链 | 高 | **优** | 差 | 差 |
| 同进程性能 | 高 | **优** | **优** | 差 |
| 维护演进同步 | 高 | **优** | 中 | 差 |
| 不引入第三方代码依赖 | 中 | **优** | 差 | **优** |
| Apple 平台 API 完备性 | 中 | 中 | **优** | **优** |

A 在最重要的四个维度上全胜。

## Consequences

### Positive

- Windows 32-bit 反射代码零回归（trait 抽象时**不动既有 impl 内的字面量**，只把代码搬位置）。
- macOS 端发布工件简洁：1 个 `.dmg` + 1 个 `.zip`（arm64 only）。
- CI 矩阵扩展简单：在现有 Windows runner 旁加 `macos-14` runner 即可。
- 反射层后续做偏移探测 / 字段升级时，写一遍 ABI 算式 Windows 与 macOS 都受益。

### Negative

- Mono 64-bit ABI 的字段偏移需要在真机上重新探测，至少要做一次 `add-hearthmirror-mac-offset-probing` 类型的 follow-up（参考 archive 里的 `2026-04-20-add-hearthmirror-offset-probing`）。
- 代码签名 + Notarization 是硬性发布前置条件——CI release job 必须配齐 `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID` secrets。
- macOS 端要求用户授予 Accessibility 权限（系统偏好设置中的隐私），首次启动体验比 Windows 端差。

### Neutral

- HearthMirror 反射 ABI 拆分后单元测试需要按 ABI 各跑一份；CI 时长会增加（macOS runner 比 Windows runner 慢 ~30%）。
- napi-rs prebuild 工件数量从 1 升到 2（`win32-x64-msvc` + `darwin-arm64`）。

## Validation

本 ADR 的 Phase 0 验证由 spike `docs/spikes/0006-hearthmirror-mac-spike.md` 负责。验证通过后本 ADR 状态升级为 `Validated`。
