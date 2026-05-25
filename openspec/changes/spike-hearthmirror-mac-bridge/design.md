## Context

OpenDeckTracker 当前在 Windows 端工作良好（v0.6.0），核心桥接架构由 [ADR 0001](../../../docs/adr/0001-hearthmirror-bridge.md) 选定为「64-bit napi-rs Rust 同进程 + 跨架构读 32-bit `Hearthstone.exe`」。本仓库 macOS 端尚未启动，路线图见 [`docs/macos-roadmap.md`](../../../docs/macos-roadmap.md)，新建 ADR [0002](../../../docs/adr/0002-hearthmirror-mac-bridge.md) 选定方案 A（Rust + napi-rs，cfg 分平台）。

ADR 0002 是基于推理选定的，必须先用 spike 在真实 Apple Silicon 机器上验证三个最高风险点（见 proposal §Why）。spike 是 throw-away code，模式与已归档的 `2026-04-27-add-hearthmirror-bridge-spike` 完全一致——独立 workspace 包、主进程一次性触发、写报告、teardown。

最终持久产出：

```text
docs/adr/0002-hearthmirror-mac-bridge.md           # Status: Accepted → Validated
docs/spikes/0006-hearthmirror-mac-spike.md         # Spike plan (路线图阶段已写)
docs/spikes/0006-hearthmirror-mac-spike-report.md  # 真机验证结果（本 change 产出）
openspec/changes/.NEXT.md                          # 标记 spike 完成，next = Phase 1
```

临时存在：

```text
packages/hearthmirror-mac-spike/                   # spike 出口前删除
scripts/codesign-mac-spike.sh                      # spike 出口前删除
apps/desktop/src/main/index.ts                     # spike 块插入 + 删除
apps/desktop/package.json                          # 依赖添加 + 删除
```

不需要新外部依赖**进入** main `packages/hearthmirror/native/Cargo.toml`——所有 macOS crate 暂时只在 spike 包内引入。

## Goals / Non-Goals

**Goals:**

- 在真实 Apple Silicon 机器上跑通 `task_for_pid` + `mach_vm_read_overwrite`，证明 ADR 0002 选定方案可行。
- 输出可复现的命令序列与签名脚本，让 Phase 1 各 change 直接复用。
- 验证 napi-rs `darwin-arm64` 工件能被 Electron 37 + Node 22 主进程加载。
- 验证 `CGWindowListCopyWindowInfo` + AX API 在桌面 + 全屏两种模式下都能拿到所需信息。
- 输出三元组兼容性记录（macOS 版本 / 芯片代号 / Hearthstone build）。
- 升级 ADR 0002 状态到 `Validated`。

**Non-Goals:**

- 实现任何 Mono 反射逻辑、字段偏移探测、IReflection 业务方法。
- 引入正式的平台抽象 trait（`refactor-hearthmirror-platform-traits` 单独立项）。
- TypeScript 端 wrapper / IPC / preload 改动。
- 做性能 benchmark（留给 Phase 1）。
- 解决正式签名 / Notarization（留给 Phase 4）。
- 修改 `packages/hearthmirror/native/` 任何现有 Windows 文件。
- 改 CI workflow。

## Decisions

### Decision 1: Spike 包独立于 `packages/hearthmirror/native/`

**Context:** 既要在真实环境验证 macOS 链路，又要保证 Windows 端零影响；且 spike 是 throw-away code，期望 teardown 时一行 `git rm -r` 干净。

**Options:**

- 在 `packages/hearthmirror/native/` 内加 `#[cfg(target_os = "macos")]` 模块直接做 spike。
- **新建独立 `packages/hearthmirror-mac-spike/` 包，与生产 hearthmirror-native 完全隔离。**
- 在 `apps/desktop/src/main/` 直接用 N-API 手写而不走 napi-rs（用 koffi 或 ffi-napi）。

**Choice:** 独立 spike 包。

**Rationale:**

- 与 spike 0001 模式一致，已经验证 throw-away workflow 干净。
- Windows 端 Cargo.toml / 现有反射代码零碰触，Windows CI 不会因为 spike 期间的 macOS deps 解析失败而炸。
- Phase 1 的 `refactor-hearthmirror-platform-traits` 是大改动，spike 阶段不混进去能让两个 change 各自简洁。

### Decision 2: 主进程触发块用 `if (process.platform === 'darwin')` 守卫

**Context:** 当前 `apps/desktop/src/main/index.ts` 是跨平台代码，spike 块只能在 macOS 跑（Windows runner 上 import macOS-only `.node` 会失败）。

**Options:**

- 用 `process.platform` 运行时守卫，build 产物 Windows 也包含 spike 块但跳过执行。
- 用 vite plugin / electron-vite 的 platform 条件构建剔除 spike 块。
- 把 spike 入口做成单独的 macOS-only 入口文件（`main-mac.ts`）。

**Choice:** 运行时 `process.platform === 'darwin'` 守卫。

**Rationale:**

- 改动最小，回滚最快（teardown 时删除一段 if 块）。
- Windows runner 跑 `pnpm --filter @hdt/desktop build` 时，import 用 dynamic `await import('@hdt/hearthmirror-mac-spike')` 配合 `try/catch`，dependency tree 上的 native binary 不解析，不影响 Windows 构建。
- 上游 spike 0001 用过类似模式，验证可行。

### Decision 3: spike 期间用 ad-hoc 签名（`codesign --sign -`）

**Context:** `task_for_pid` 在 macOS 上要求调用方有 `com.apple.security.cs.debugger` entitlement。正式方案是 Apple Developer ID 签名 + Notarization；spike 阶段不应等正式证书。

**Options:**

- 等正式 Apple Developer ID 证书走完一遍 → spike 周期延长 5+ 天。
- **ad-hoc 签名（`codesign --sign - --entitlements ...`）+ 关闭 SIP？**
- 在开发机上 `csrutil disable` 关 SIP 直接绕过。

**Choice:** ad-hoc 签名 + 不关 SIP。

**Rationale:**

- macOS 12+ 上 ad-hoc 签名 + entitlements 足以让 `task_for_pid` 工作（HSTracker 开发期就是这么干的）。
- 关 SIP 是 nuclear option，会污染开发机环境，不推荐。
- ad-hoc 签名同时验证签名链路本身没有问题（场景 C 的负向测试就是用「不签」来反证签名是必要的）。

### Decision 4: 不做性能 benchmark

**Context:** spike 0001 同时跑了功能验证 + 性能基线（1000 次循环测 µs/call）。

**Options:**

- 复用 spike 0001 的 1000 次循环模式，spike 期间就出性能基线。
- **只验证「能不能读」，性能基线推到 Phase 1 `add-hearthmirror-mac-memory`。**

**Choice:** 不做性能 benchmark。

**Rationale:**

- spike 时间盒紧（≤ 3 天），核心问题是签名 + 工具链兼容，性能不是失败模式。
- Phase 1 的内存模块本身就要做带缓存的 `mach_vm_read_overwrite`，那时基线更有参考价值（spike 阶段的简单循环可能误判性能）。
- 与 Windows 端 spike 0001 的 ~252 µs/call 横向对比留到 Phase 1 做更严谨。

### Decision 5: spike teardown 必须验证残留为零

**Context:** spike 0001 在 teardown 后用 `rg` 验证零残留——这是这套工作流的关键质量门，避免半 teardown 状态污染主线。

**Options:**

- 默认 teardown 列表逐项执行就行。
- **强制跑 `rg -i 'hearthmirror-mac-spike|spikeRead(Macho|HearthstoneWindow)'` 并要求零匹配。**

**Choice:** 强制 grep 校验。

**Rationale:**

- 与 spike 0001 一致，自动化校验比 review 更可靠。
- 命中匹配立即修复，避免 spike 残留进入 Phase 1 的 baseline。

## Risks / Trade-offs

### Spike 失败概率不为零

[Risk] `task_for_pid` 在某些 macOS 14+ 上对未由 Developer ID 签名的二进制更严格，可能 ad-hoc 签名也拿不到 task port。
Mitigation: 场景 C 已经设计为「负向测试」——如果 ad-hoc 签名也拿不到 task port，spike report 会指出来，触发 ADR 0002 fallback（方案 B 借 HSTracker dylib）。

### arm64e PAC（Pointer Authentication Codes）干扰

[Risk] Apple Silicon 的 arm64e ABI 会在指针高位塞 PAC 签名位，`mach_vm_read` 拿到的 raw 指针不能直接当地址用，可能要 `XPACI` 剥离。
Mitigation: spike 期间如果 hex 头已经能正确读出（`CF FA ED FE`），说明对 main image base 这类「来自 dyld_info」的指针 PAC 是透明的（dyld 自己会剥）；Phase 1 在 Mono 反射层处理 C# object 内部指针时再视情况加 PAC strip。本 spike 不涉及。

### macOS 版本碎片化

[Risk] `mach_vm_*` API 在 macOS 12 / 13 / 14 / 15 上行为可能有微差异。
Mitigation: spike report 中明确记录跑 spike 用的 macOS 版本三元组；Phase 1 各 change 至少在另一个 macOS major version 上回归一次。

### Hearthstone Mac 客户端可能下架或 PowerPC-style 沉默

[Risk] 暴雪近年对 Mac 投入有缩减迹象（虽然 Hearthstone 还在更新），spike 期间客户端可能升级 / Mac 版下线。
Mitigation: 接受。spike 失败如果是因为 Hearthstone Mac 客户端不可用，则整个 macOS 路线暂停，不属于 ADR 0002 的失败。

### Security

[Risk] `task_for_pid` 是高权限 API，spike 二进制在拥有 task port 期间能读 Hearthstone 任意内存。spike 仅读 16 字节是 self-imposed，不是技术约束。
Mitigation: spike 出口前 teardown 全部 spike 代码 + 二进制；spike 期间不写任何持久化（不入 SQLite、不落盘）。

## Migration Plan

1. 创建 spike 包骨架（task §1）。
2. 写 Rust spike 代码 + 编译 + ad-hoc 签名（task §2-§3）。
3. 主进程加触发块（task §4），用户在真机上跑 4 个场景（task §5-§7）。
4. 写 spike report（task §8），升级 ADR 0002（task §9）。
5. Teardown spike 包 + 主进程触发 + 依赖（task §10）。
6. 跑质量门 + OpenSpec 验收（task §11）。

回滚：spike 失败时按 §Decision Outcomes 走 fallback 流程；如果中途 abort，按 task §10 强制 teardown。

## Open Questions

- 场景 C 的「未签名」如何精确制造？是 `codesign --remove-signature` 后再跑？还是用未签名的 spike 二进制直接覆盖？需要 spike 期间用户实际操作时确认命令序列。
- Hearthstone CN 服 Mac 客户端 bundle id 是 `unity.Blizzard Entertainment.Hearthstone` 还是国服特殊变体？spike report 必须记录实际值。
- napi-rs 3.x 是否对 `aarch64-apple-darwin` 提供 prebuild？或者必须在 macOS runner 上现编？影响 Phase 4 的 CI 配置。
- `objc2-app-kit` / `objc2-application-services` 在 Apple Silicon 上是否需要额外的 frameworks linker flag？
