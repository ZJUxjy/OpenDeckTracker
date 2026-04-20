## Context

### 现状（2026-04-20，post-spike-0003）

`packages/hearthmirror/native/src/mono/runtime.rs:91-117` 的 `find_mono_get_root_domain_va` 函数负责定位 `mono_get_root_domain` export 的远程虚拟地址。流程：

1. 读 mono dll 模块的 PE bytes 到本地 buffer（**当前 cap 为 `min(mono.size, 0x100_000)` = 最多 1MB**）
2. `unsafe { PeView::module(pe_bytes.as_ptr()) }` 把 buffer 当作 mapped PE
3. `pe.exports().by().name("mono_get_root_domain")` 找 export 名
4. 计算 `RemotePtr::new(base_addr + rva)` 返回

**问题**：`PeView::module` 假设 `ptr` 后面跟着完整的 mapped PE 镜像。`exports.by().name(...)` 在内部需要解析 export name pointer table → 跳到 export name 字符串表（通常位于 PE 末端的 `.edata` 段）→ 字符串比对。Mono dll 大小 6,529,024 字节（≈6.5MB），export name 字符串表 RVA 远大于 1MB → 跨过本地 buffer 边界 → 读未映射内存 → Windows SEH `STATUS_ACCESS_VIOLATION`。

### Spike 0003 attempt 3 的实测证据

- 把 cap 去掉、读完整 mono.size = 6,529,024 字节
- `pe.exports().by().name("mono_get_root_domain")` 成功返回 RVA `0x00095DD0`
- 后续 disasm + root_domain 解析全部成功（root_domain @ `0x0B442E70`）

### 为什么不在 spike 内顺手修

Spike 的契约（[`verify-hearthmirror-on-real-hs/specs/.../spec.md`](../verify-hearthmirror-on-real-hs/specs/hearthmirror-runtime-validation/spec.md) "不修改 lib 代码" requirement）禁止动 lib 代码。Spike 只采集事实、提建议；fix 走单独 change 才能保留：(a) 改动可独立 PR / revert；(b) tasks.md 与测试基线变化清晰可追；(c) 不让 spike 的"诊断脚本"职责与"生产代码修复"职责混淆。

## Goals / Non-Goals

### Goals

- 让 `MonoRuntime::init()` 在真实炉石进程上不再以 `STATUS_ACCESS_VIOLATION` 崩溃
- 一行 fix + 1 个回归测试 + 重跑 spike 0003 验证 → P0 完全闭环
- 解锁 [`add-hearthmirror-offset-probing`](../add-hearthmirror-offset-probing/) 与 [`add-hearthmirror-image-walking`](../add-hearthmirror-image-walking/) 的真机回归路径

### Non-Goals

- 不引入额外 bounds checking（spike R-4 提议的 `PeFile::from_bytes` 替换 `PeView::module` — 留给未来 hardening change，本 change 只做最小可工作 fix）
- 不改 `find_mono_get_root_domain_va` 的函数签名 / 错误类型 / 调用方
- 不引入新依赖
- 不修字段名飘移（如 Run 2 暴露则单独 hotfix）
- 不动 napi/TS/IPC 任何 surface

## Decisions

### Decision D1: 用 `mono.size as usize` 而不是其他 fallback

- **What**: `let pe_size = mono.size as usize;`（移除 `.min(0x100_000)`）
- **Why**:
  - `mono.size` 来自 `EnumProcessModulesEx` 报告的 `MODULEINFO.SizeOfImage`，权威且实测一致（6,529,024 字节）
  - 不需要二次保护（如 `min(mono.size, 0x800_0000)` = 128MB 上限）— 任何被 windows loader 加载的 dll 都不会超过 32-bit 进程地址空间；超大异常值表明上游 OS API 返回有问题，应让其失败（`read_bytes` 会 propagate IO error）
- **Alternatives**:
  - **A: 改用 `pelite::pe32::PeFile::from_bytes`**（接受 file layout 而非 mapped layout） — 不行，远程进程内的 PE 是 mapped layout（每段按 SectionAlignment 对齐到 RVA），不是 file layout（按 FileAlignment 对齐到磁盘偏移），换 API 等于重写 export 解析逻辑。pass。
  - **B: 只读 export directory + name table**（精确定位 RVA 范围按需读取） — 复杂度爆炸，需手写 PE 解析；与 spike R-4 hardening 思路重叠，但本 change 不做。pass。
  - **C: 把上限提到 0x800_000 (8MB)** — 仍然脆弱，下次 mono dll 涨到 9MB 又崩。pass。

### Decision D2: 注释同步更新

- **What**: 把 line 96 的注释 `// Read enough of the PE to satisfy pelite (header + tables, ~64 KB is generous).` 改为反映新约束的版本：

  ```rust
  // PeView::module assumes the buffer represents the full mapped PE image
  // (export name strings can sit near the module tail). The 1MB cap previously
  // here caused STATUS_ACCESS_VIOLATION on mono.dll (~6.5MB). See spike 0003 F-1.
  ```

- **Why**: 旧注释字面错误（"~64 KB is generous"），且未来读者无 spike 上下文易再缩 cap。新注释把 root cause + spike 引用钉死。

### Decision D3: 回归测试设计

- **What**: 新增 `packages/hearthmirror/native/tests/integration_runtime_init.rs`，含 1 个测试 `init_succeeds_when_hearthstone_running`：

  ```rust
  #[test]
  fn init_succeeds_when_hearthstone_running() {
      if skip_if_no_hs() { return; }
      let rt = MonoRuntime::init().expect("init must succeed");
      assert!(rt.global_root_domain_addr.0 != 0, "root domain addr must be non-zero");
  }
  ```

- **Why**:
  - skip-if-no-hs 模式与现有 `integration_reflection.rs` 12 个测试一致，CI 友好
  - 这个测试是"防止 cap 复活"的钩子 — 任何未来动 `find_mono_get_root_domain_va` 的人，本机有炉石时跑测试就能发现回归
  - 不放在现有 `runtime.rs::integration_tests` 里是因为该 mod 的测试用 raw `MonoRuntime::init()` 但断言的是更深层（class 找到、token 解析），这里要的是"init 不崩"的最小契约

### Decision D4: skip_if_no_hs helper 复用策略

- **What**: 从 `integration_reflection.rs` 顶部的 `fn skip_if_no_hs() -> bool` 直接复制粘贴到新 integration test 文件。
- **Why**:
  - cargo integration tests 之间不能共享 helper（每个 `tests/*.rs` 是独立 crate）
  - 如要 DRY，需要把 helper 提到 `lib.rs` 或 `tests/common/mod.rs` — 都比直接复制更复杂
  - 该 helper 只 5 行，复制成本可忽略；image-walking change 也会需要同样 helper，统一抽出可放到那时（或单独 housekeeping change）

### Decision D5: spike 0003 Run 2 必须本 change 内完成

- **What**: tasks.md 包含一个步骤"重跑 `pwsh scripts/run-hearthmirror-spike.ps1` 拿 12 方法 fix 后实测，追加到 `0003-*.md` 的 `## Run 2` 段"。
- **Why**:
  - 不重跑 spike，本 change 只能验证"init 不崩"，无法回答"12 方法实际状态如何"
  - Run 2 是 5e/5f 设计修订的关键输入（如 F-4 已揭示 Unity 2022.3 ≠ 计划的 2021.3，Run 2 还可能揭示更多字段名飘移）
  - 如果 Run 2 显示某些方法**仍然失败**（非 init 崩溃，是字段名 / 偏移问题）—— 这是 spike F-4 已暗示的字段名飘移，**不在本 change scope**；记录到 Run 2 即可，让后续 hotfix change 处理

### Decision D6: 不动 add-hearthmirror-reflection-methods 的测试基线

- **What**: 完成本 change 后，`cargo test -p hearthmirror-native --all-features` 在**无炉石**环境下保持 48/48 通过；**有炉石**环境下，如果 12 个 reflection integration 仍然全绿（最理想）→ 实际通过数升至 49/49（含本 change 新加的 init test）；如 reflection integration 部分失败（字段名飘移）→ 在 Run 2 数据中记录，标"非本 change 引入"。
- **Why**: 本 change 的 acceptance criterion 是"init 不再崩"，不是"12 个 reflection 方法全绿"。后者由后续 hotfix / 5e / 5f 兑现。

## Risks / Trade-offs

| Risk | Severity | Mitigation |
|---|---|---|
| 读完整 6.5MB 比 1MB 慢 ~10ms | L | init 是一次性操作，全程 ~50ms vs ~40ms 用户感受不出；如未来需要可换 D1.B 的精确读取方案 |
| 6.5MB Rust 堆分配 | L | init 后 buffer 立即 drop；vs 现有 metadata reader 也读完整模块，已是先例 |
| Run 2 揭示 reflection 方法失败但不属本 change | M | 显式在 Run 2 注 "non-init failures observed; outside this change scope; logged for future hotfix / 5e" |
| 未来开发者重新加 cap | L | D2 注释 + D3 集成测试双重防御 |

## Migration Plan

无（内部 fix，公共 API 不变）。

## Open Questions

- **是否要把 PE 读取改为流式 / 按需？** — 不在本 change scope。如未来发现 init 性能问题（spike 0003 显示当前 ~50ms 完全可接受），再考虑 spike R-4 路径。
- **spike 0003 Run 2 是否要标 fix-version commit hash？** — 是，tasks.md 中明确要求 Run 2 头部注明 "post-fix-hearthmirror-pe-read-cap commit `<sha>`"。
