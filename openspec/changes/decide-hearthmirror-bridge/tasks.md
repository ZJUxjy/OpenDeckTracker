> 实施约定：本 change 是**纯文档型**，不写任何代码、不引入任何依赖。所有任务都是写文档/改文档/git commit。
> 工作目录默认 `D:\code\HDT_js`，所有 commit 使用 Conventional Commits（`docs:` / `chore:`）。

## 1. 写 ADR 文档

- [x] 1.1 创建目录 `docs/adr/`（如果不存在）。
- [x] 1.2 创建 `docs/adr/0001-hearthmirror-bridge.md`，使用 Michael Nygard ADR 模板。文件骨架（标题用 H1，状态用 quote 块）：

  ```markdown
  # ADR 0001: Hearthstone Memory Bridge Architecture

  > **Status**: Accepted (2026-04-19)
  > **Deciders**: HDT.js core team
  > **Supersedes**: Architecture sections (1–6) of `Rewrite_Design.md`

  ## Context
  <从 design.md 的 Context 章节摘录核心 3-5 句>

  ## Decision
  HDT.js will access Hearthstone process memory via a Rust crate compiled to a
  64-bit Windows native Node.js module using `napi-rs`, loaded directly into
  the Electron main process. (Option D in the evaluation matrix.)

  ## Considered Options
  - A. `koffi` runtime FFI
  - B. 32-bit `napi-rs` + 32-bit Electron
  - C. 32-bit Rust subprocess + stdio JSON-RPC
  - **D. 64-bit `napi-rs` (chosen)**

  ## Decision Drivers
  <从 design.md 的 Rationale 表格摘录权重高的 3 项>

  ## Consequences
  ### Positive
  - <列举 D 的优势>
  ### Negative
  - <列举 D 的代价：无进程隔离、CI 矩阵需要维护等>
  ### Engineering Constraints (binding for downstream changes)
  - 所有 unsafe Windows API 调用必须包在 `Result<T, ScryError>`，永不 panic
  - `RemotePtr(u32)` 新类型隔离 host/remote 指针
  - CI 静态门禁: `cargo clippy -- -D clippy::unwrap_used -D clippy::expect_used -D clippy::panic`

  ## Related
  - Detailed evaluation: `openspec/changes/decide-hearthmirror-bridge/design.md`
  - Spike plan: `docs/spikes/0001-hearthmirror-spike.md`
  - Mono runtime knowledge (still authoritative): `Rewrite_Design.md` §7+
  ```

- [x] 1.3 把 design.md 的 D1 Decisions 子节内容（4 个 Options 的 Optimum/Drawbacks）摘要进 ADR 的 "Considered Options" 段，每个选项 3-5 行 bullet。
- [x] 1.4 把 design.md 的 Risks / Trade-offs 表前 3 行摘进 ADR "Consequences > Negative"。
- [x] 1.5 用 `git add docs/adr && git commit -m "docs(adr): record 0001 hearthmirror bridge architecture decision"` 提交。

## 2. 写 Spike 计划

- [x] 2.1 创建目录 `docs/spikes/`（如果不存在）。
- [x] 2.2 创建 `docs/spikes/0001-hearthmirror-spike.md`，包含以下章节（每节都必须有实质内容，禁止 TBD/placeholder）：

  ```markdown
  # Spike 0001: HearthMirror 64-bit napi-rs Cross-Architecture Read

  > Time-boxed: ≤ 1 day. References: `docs/adr/0001-hearthmirror-bridge.md`.

  ## Goal
  在最小工作量下端到端验证 ADR 0001 入选方案 D 的两个最高风险点：
  1. 64 位 napi-rs 能在当前 Node 22 + Electron 33 环境下成功构建并被 Electron 主进程加载
  2. 64 位 Rust 进程能用标准 ReadProcessMemory 读取 32 位 Hearthstone.exe 的内存

  ## Acceptance Criteria
  Spike 在以下两种场景下输出预期结果：

  **场景 A — Hearthstone 正在运行**:
  - 在 Electron 主进程触发 spike 入口（如临时菜单项或 IPC handler 调用）
  - 控制台打印：
    - Hearthstone 进程 PID（非零）
    - Hearthstone.exe 模块基址（典型形如 `0x00400000`）
    - 模块基址处的前 16 字节 hex（必须以 `4D 5A 90 00` 开头 = "MZ" + DOS stub byte）

  **场景 B — Hearthstone 未运行**:
  - 同样的 spike 入口触发
  - Promise reject 一个 Error，message 含 "process not found"
  - Electron 主进程不崩溃，主窗口仍正常响应

  ## Out of Scope (明确不在 spike 范围)
  - Mono 运行时定位、mono.dll 解析、根域查找
  - ECMA-335 元数据解析
  - 任何 IReflection 业务方法（GetCollection / GetMatchInfo 等）
  - 偏移量探测 / 版本适配
  - SQLite / 任何持久化
  - IPC 通道封装、IpcRenderer 桥接
  - 单元测试、E2E 测试、CI 集成
  - 代码签名、Defender 例外配置

  ## Implementation Sketch (供实施者参考，不约束)
  - 临时新建 `packages/hearthmirror-spike/` workspace 包（spike 出口前删除）
  - `Cargo.toml` 用 napi-rs 模板（`napi build` CLI），target = `x86_64-pc-windows-msvc`
  - Rust 端用 `windows` crate 调用 `OpenProcess` + `EnumProcessModulesEx(LIST_MODULES_32BIT)` + `ReadProcessMemory`
  - 模块枚举要传 `LIST_MODULES_32BIT` 标志（默认 32+64 都返）
  - VirtualQueryEx 用 `MEMORY_BASIC_INFORMATION`（不需要 32 后缀，因为我们只读不分析其内部 size_t 字段）
  - napi-rs 暴露 `pub fn spike_read_mz() -> napi::Result<SpikeResult>`，SpikeResult 是 `{ pid: u32, baseAddress: String, headerHex: String }`
  - 在 `apps/desktop/src/main/ipc.ts` 临时加 `ipcMain.handle('spike:readMz', ...)` 触发

  ## Time Box
  - **总预算**: ≤ 1 个工作日（8 小时）
  - **2 小时**: napi-rs 构建链跑通（hello-world `.node` 模块被 Electron 加载）
  - **3 小时**: OpenProcess + ReadProcessMemory 跑通，读到 MZ
  - **2 小时**: 错误路径（炉石未运行）输出预期错误
  - **1 小时**: 写 spike 出口报告 + 删除 `packages/hearthmirror-spike/`

  ## Teardown
  Spike 完成后：
  1. 在本仓库创建后续 change `add-hearthmirror-bridge-spike`，把 spike 期间的真实代码作为该 change 的实施内容（`packages/hearthmirror-spike/` 不再 ad-hoc，而是受 OpenSpec 流程管控）。
  2. 在 spike 报告中记录：
     - 实际跑通的步骤序列（用于后续 `add-hearthmirror-bridge` 实施 change 直接复用）
     - 遇到的真实坑（包括但不限于：napi-rs 版本、Electron ABI 兼容性、Windows API 调用细节、是否需要管理员权限）
     - 性能基线（单次 ReadProcessMemory 调用 µs 数）

  ## Decision Outcomes
  - **如果 Acceptance Criteria 全部通过**: ADR 0001 状态从 "Accepted" 升级到 "Validated"，启动 `add-hearthmirror-bridge` change 进入正式实施。
  - **如果 napi-rs 构建/加载失败**: 在 ADR 0001 后追加 ADR 0002，重新评估 Option C（32 位子进程）作为 fallback；本 spike 不延期，宣告 D 不可行。
  - **如果 ReadProcessMemory 跨架构失败**: 重新评估 Option B（32 位 napi-rs）或 Option C；ADR 0002 记录失败原因。
  ```

- [x] 2.3 用 `git add docs/spikes && git commit -m "docs(spike): plan 0001 hearthmirror spike with explicit time box"` 提交。

## 3. 在 Rewrite_Design.md 顶部加 supersession banner

- [x] 3.1 在 `Rewrite_Design.md` 的第一行 H1 标题（`# HearthMirror 重写设计文档`）**下方**插入一个引用块：

  ```markdown
  > **Status**: Architecture sections (§1–6 of this document) are **superseded by**
  > [`docs/adr/0001-hearthmirror-bridge.md`](docs/adr/0001-hearthmirror-bridge.md).
  > In particular, the assumption "must target x86 (32-bit)" is incorrect:
  > 64-bit processes can use standard `ReadProcessMemory` to read 32-bit process
  > memory by treating remote pointers as `u32`. The chosen architecture is
  > **64-bit `napi-rs` native module loaded into Electron main process**.
  >
  > Sections §7+ (Mono runtime structures, ECMA-335 metadata, offsets, FFI
  > examples) remain authoritative reference material for the upcoming
  > `add-hearthmirror-bridge` implementation.
  ```

- [x] 3.2 用 `git add Rewrite_Design.md && git commit -m "docs: add supersession banner pointing to ADR 0001"` 提交。

## 4. 同步 .NEXT.md

- [x] 4.1 在 `openspec/changes/.NEXT.md` 的 `decide-hearthmirror-bridge` 段落末尾追加一行：

  ```markdown
  > **状态**: 已完成。ADR 0001 选定方案 D（64 位 napi-rs）。下一步：执行 `docs/spikes/0001-hearthmirror-spike.md` 计划的 spike，建议作为 `add-hearthmirror-bridge-spike` change。
  ```

- [x] 4.2 在 `.NEXT.md` 顶部"下一个候选 change"列表中：
  - 把第 1 条 `decide-hearthmirror-bridge` 标记为 ✓
  - 在它之后插入新的 `add-hearthmirror-bridge-spike`（依赖本 ADR）作为新的"第 1 优先级"
- [x] 4.3 用 `git add openspec/changes/.NEXT.md && git commit -m "docs(openspec): mark decide-hearthmirror-bridge done, queue spike"` 提交。

## 5. 标记 tasks 完成 + 验收

- [x] 5.1 在本文件中把任务 1.x ~ 4.x 全部标 `[x]`。
- [x] 5.2 运行 `openspec validate decide-hearthmirror-bridge --strict`，期望 `Change is valid`。
- [x] 5.3 运行 `openspec status --change decide-hearthmirror-bridge`，期望 `4/4 artifacts complete`。
- [x] 5.4 用 `git add openspec/changes/decide-hearthmirror-bridge/tasks.md && git commit -m "docs(openspec): mark all tasks complete in decide-hearthmirror-bridge"` 提交。
