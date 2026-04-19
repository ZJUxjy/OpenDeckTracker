# Spike 0001: HearthMirror 64-bit napi-rs Cross-Architecture Read

> Time-boxed: ≤ 1 day. References: [`docs/adr/0001-hearthmirror-bridge.md`](../adr/0001-hearthmirror-bridge.md).

## Goal

在最小工作量下端到端验证 ADR 0001 入选方案 D 的两个最高风险点：

1. **64 位 napi-rs 能在当前 Node 22 + Electron 33 环境下成功构建并被 Electron 主进程加载**（验证 napi-rs 工具链兼容性 + ABI 匹配）。
2. **64 位 Rust 进程能用标准 `ReadProcessMemory` 跨架构读取 32 位 `Hearthstone.exe` 的内存**（验证跨架构调用真的可行 + 验证不需要管理员权限）。

## Acceptance Criteria

Spike 在以下两种场景下输出预期结果：

### 场景 A — Hearthstone 正在运行

- 在 Electron 主进程触发 spike 入口（如临时菜单项或 IPC handler 调用）。
- 控制台必须打印：
  - Hearthstone 进程 PID（非零正整数）
  - `Hearthstone.exe` 模块基址（典型形如 `0x00400000`）
  - 模块基址处的前 16 字节 hex（**必须以 `4D 5A 90 00` 开头** = `"MZ"` + DOS stub byte 0x90 + 0x00）

### 场景 B — Hearthstone 未运行

- 同样的 spike 入口触发。
- Promise reject 一个 `Error`，message 含 `"process not found"`（小写不敏感）。
- Electron 主进程**不崩溃**，主窗口仍正常响应交互（点击 Sidebar 仍能切路由）。

## Out of Scope

明确**不**在 spike 范围（留给后续 `add-hearthmirror-bridge` 实施 change）：

- Mono 运行时定位、`mono.dll` 解析、根域查找。
- ECMA-335 元数据解析、字段偏移映射。
- 任何 `IReflection` 业务方法（`GetCollection` / `GetMatchInfo` / `GetBattleTag` 等）。
- 偏移量探测 / 版本适配。
- SQLite / 任何持久化。
- IPC 通道封装、`window.hdt.*` 桥接。
- 单元测试、E2E 测试、CI 集成。
- 代码签名、Defender 例外配置。
- prebuild 二进制分发优化。

## Implementation Sketch

> 供实施者参考，不约束。

- 临时新建 `packages/hearthmirror-spike/` workspace 包（spike 出口前删除整个目录）。
- `Cargo.toml` 用 napi-rs 模板（推荐 `npm create napi-rs` 或手写最小配置），`crate-type = ["cdylib"]`，`target = "x86_64-pc-windows-msvc"`。
- Rust 端依赖：`napi`、`napi-derive`、`windows`（`Win32_Foundation`、`Win32_System_Threading`、`Win32_System_Diagnostics_Debug`、`Win32_System_ProcessStatus`、`Win32_System_Memory` features）。
- 调用序列：
  1. `CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0)` 枚举所有进程，找 `Hearthstone.exe` 拿 PID。
  2. `OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, FALSE, pid)` 拿 handle。
  3. `EnumProcessModulesEx(handle, modules, size, &needed, LIST_MODULES_32BIT)` 列出 32 位模块（默认 flag 在 64 位读 32 位时会拿不全）。
  4. 找到 `Hearthstone.exe` 模块的 base address。
  5. `ReadProcessMemory(handle, base, &buf[0], 16, &read)` 读 16 字节。
  6. `CloseHandle(handle)`。
  7. 把 `(pid, base, hex_string)` 包成 `SpikeResult` 返回 napi-rs。
- napi-rs 暴露：

  ```rust
  #[napi]
  pub fn spike_read_mz() -> napi::Result<SpikeResult> { ... }

  #[napi(object)]
  pub struct SpikeResult {
    pub pid: u32,
    pub base_address: String,   // "0x00400000"
    pub header_hex: String,     // "4D 5A 90 00 ..."
  }
  ```

- 在 `apps/desktop/src/main/ipc.ts` 临时加 `ipcMain.handle('spike:readMz', () => spikeReadMz())` 触发；renderer 端不做 UI 改动，用 DevTools console `await window.hdt.app... ` 临时调（或者干脆在主进程启动后 console.log 自动跑一次）。

### 关键 Windows API 注意事项

- 64 位读 32 位**不需要** `NtWow64ReadVirtualMemory64` 或其他 hack，标准 `ReadProcessMemory` 即可；只要把对端指针作为 `u32` / `RemotePtr` 传入。
- `EnumProcessModulesEx` 的 `dwFilterFlag` 必须传 `LIST_MODULES_32BIT`（值 = 0x01）。如果传 `LIST_MODULES_DEFAULT` 或 `LIST_MODULES_64BIT`，64 位宿主进程读 32 位目标进程时会**拿不到任何模块**。
- `OpenProcess` 在 Win10/11 默认权限下，对同一用户运行的进程**不需要管理员**即可拿到 `PROCESS_QUERY_INFORMATION | PROCESS_VM_READ`。如果 spike 中报 `ERROR_ACCESS_DENIED (5)`，先检查炉石是否以管理员启动（用户配置问题）；如果普通用户启动也被拒，记入 spike 报告作为"Anti-cheat / EAC 拦截"信号。
- `VirtualQueryEx`：本 spike **不需要**，留到正式实施再处理（届时记得 64 位读 32 位时用 `MEMORY_BASIC_INFORMATION` —— Windows 会自动适配 size 字段）。

## Time Box

| 阶段 | 预算 | 验收 |
|---|---|---|
| napi-rs 构建链跑通 | 2 h | hello-world `.node` 模块被 Electron 主进程 `require` 并调用一个返回 `42` 的函数 |
| `OpenProcess` + `ReadProcessMemory` 跑通 | 3 h | 场景 A 全部通过 |
| 错误路径验证 | 2 h | 场景 B 全部通过 |
| Spike 出口报告 + 删除 spike 包 | 1 h | `packages/hearthmirror-spike/` 不再存在；`docs/spikes/0001-hearthmirror-spike-report.md` 写完 |
| **总预算** | **≤ 1 工作日（8 h）** | |

## Teardown

Spike 完成后必须做的事：

1. **创建后续 change `add-hearthmirror-bridge-spike`**，把 spike 期间的真实代码作为该 change 的实施内容（让 spike 包从 ad-hoc 转为 OpenSpec 流程管控）。也可以选择跳过这个 change 直接开 `add-hearthmirror-bridge` 把 spike 经验融入正式实施。
2. **删除 `packages/hearthmirror-spike/`**（或在其内部加 README 标记 "exploratory, do not depend"）。
3. **写 `docs/spikes/0001-hearthmirror-spike-report.md`**，记录：
   - 实际执行的步骤序列（用于后续正式 change 直接复用）。
   - 遇到的真实坑（napi-rs 版本号、Electron ABI 兼容性、Windows API 调用细节、是否需要管理员权限、`LIST_MODULES_32BIT` 的真实表现等）。
   - 性能基线（连续 1000 次 `ReadProcessMemory(16 字节)` 的总耗时 / 平均单次 µs 数）。
4. **更新 ADR 0001**：把 Status 从 `Accepted` 改为 `Validated`，并在 Consequences 末尾追加一行 `Validated by spike report: docs/spikes/0001-hearthmirror-spike-report.md`。

## Decision Outcomes

- **如果 Acceptance Criteria 全部通过** → ADR 0001 升级到 `Validated`，启动 `add-hearthmirror-bridge` 进入正式实施。
- **如果 napi-rs 构建/加载失败** → 在 `docs/adr/0002-*.md` 重新评估 Option C（32 位子进程）作为 fallback。spike **不延期**，宣告 D 不可行并记录失败原因。
- **如果 `ReadProcessMemory` 跨架构失败**（典型表现：`ERROR_PARTIAL_COPY` / `ERROR_NOACCESS` 即使非管理员也持续出现）→ 在 ADR 0002 中重新评估 Option B（32 位 napi-rs）或 Option C；记录失败原因（包括 OS 版本、Defender 配置、是否被 EAC/anti-cheat 拦截）。
- **如果场景 B 路径让 Electron 崩溃**（不是 reject Promise 而是 abort） → 不算 spike 失败但记录为 known issue，强制在正式实施时优先解决（`napi::Error` 转换链路必须在所有失败路径上验证）。

## Related

- ADR：[`docs/adr/0001-hearthmirror-bridge.md`](../adr/0001-hearthmirror-bridge.md)
- 详细评估：[`openspec/changes/decide-hearthmirror-bridge/design.md`](../../openspec/changes/decide-hearthmirror-bridge/design.md)
- Mono 内部结构（spike 后正式实施时参考）：[`Rewrite_Design.md`](../../Rewrite_Design.md) §7
