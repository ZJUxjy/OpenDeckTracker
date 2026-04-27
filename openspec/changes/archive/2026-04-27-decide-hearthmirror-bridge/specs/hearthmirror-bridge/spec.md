## ADDED Requirements

### Requirement: Bridge 架构契约

HDT.js SHALL access Hearthstone process memory via a Rust crate compiled to a **64-bit Windows native Node.js module** using `napi-rs`, loaded directly into the Electron main process. The crate SHALL NOT run as a separate subprocess and SHALL NOT use any runtime FFI library (`koffi`, `ffi-rs`, `ffi-napi`).

#### Scenario: 后续 add-hearthmirror-bridge change 沿用本架构
- **WHEN** 任意后续 OpenSpec change 引入 `packages/hearthmirror/native/` 实现
- **THEN** 该 crate 的 `Cargo.toml` `[lib]` 段使用 `crate-type = ["cdylib"]`，且依赖 `napi` 与 `napi-derive`，target 在 CI 中包含 `x86_64-pc-windows-msvc`，**不**包含 `i686-pc-windows-msvc`

#### Scenario: 不引入子进程或运行时 FFI
- **WHEN** 任意后续 change 的 design.md 提议引入子进程模型或 koffi/ffi-rs 等运行时 FFI 库
- **THEN** 该 design 必须显式 supersede 本 ADR（即先开新的 ADR change 推翻 0001，否则不通过 review）

### Requirement: 跨架构指针建模

The Rust native crate SHALL define a distinct newtype `RemotePtr(u32)` for any pointer that addresses memory **inside** the Hearthstone process. Native (host) Rust pointers SHALL never be implicitly converted to or from `RemotePtr`. All Mono internal structures (MonoDomain, MonoImage, MonoClass, MonoObject, etc.) modeled in Rust SHALL use `RemotePtr` (not `u32` directly, not `usize`, not `*const T`) for their pointer fields.

#### Scenario: 类型系统拦截位数混淆
- **GIVEN** 一个 Rust 函数签名为 `fn read_field<T>(memory: &Memory, addr: RemotePtr) -> Result<T>`
- **WHEN** 调用方误传宿主指针 `&local_var as *const T as usize`
- **THEN** 编译错误（不能从 `usize` 隐式转换到 `RemotePtr`）

### Requirement: 不带 panic 的暴露面

Every `#[napi]` exported function from the hearthmirror native crate SHALL have a return type of `napi::Result<T>` (or `napi::Result<()>`). The crate SHALL NOT call `panic!`, `unwrap()`, `expect()`, or any function that may panic on user-controllable input. Any `unsafe` Windows API call SHALL be wrapped in a function that returns `Result<T, ScryError>` and never panics on failure.

#### Scenario: 静态门禁强制
- **WHEN** CI 在 `packages/hearthmirror/native/` 下运行 `cargo clippy -- -D warnings -D clippy::unwrap_used -D clippy::expect_used -D clippy::panic`
- **THEN** clippy 退出码为 0（任何 unwrap/expect/panic 调用导致 CI 失败）

#### Scenario: 进程未找到时优雅返回
- **GIVEN** Hearthstone 未运行
- **WHEN** TypeScript 调用 `await hearthmirror.openSession()`
- **THEN** Promise reject 一个 `MirrorError`（带错误码 `ProcessNotFound`），Electron 主进程不崩溃

### Requirement: ADR 文档存在且可追溯

The repository SHALL contain `docs/adr/0001-hearthmirror-bridge.md` recording the architecture decision (Status / Context / Decision / Consequences). The `Rewrite_Design.md` document SHALL contain a banner at the top pointing to this ADR and stating that its architecture sections are superseded.

#### Scenario: ADR 文件存在且非空
- **WHEN** 检查 `docs/adr/0001-hearthmirror-bridge.md`
- **THEN** 文件存在，内容包含 "Status: Accepted" 段、"Decision: 64-bit napi-rs" 段、"Consequences" 段

#### Scenario: Rewrite_Design.md 顶部有 supersession banner
- **WHEN** 读取 `Rewrite_Design.md` 的前 50 行
- **THEN** 包含子串 "superseded" 和 "docs/adr/0001-hearthmirror-bridge.md"

### Requirement: Spike 计划存在并定义可验证出口标准

The repository SHALL contain `docs/spikes/0001-hearthmirror-spike.md` that defines a time-boxed (≤ 1 day) spike with explicit acceptance criteria, in-scope and out-of-scope items, and a teardown plan.

#### Scenario: Spike 计划包含必要章节
- **WHEN** 读取 `docs/spikes/0001-hearthmirror-spike.md`
- **THEN** 文件包含以下章节标题：`## Goal`、`## Acceptance Criteria`、`## Out of Scope`、`## Teardown`、`## Time Box`

#### Scenario: 验收标准对应 ADR 的 risks
- **WHEN** 读取 spike 计划的 Acceptance Criteria 章节
- **THEN** 至少包含两条断言：(1) 64 位 napi-rs `.node` 模块能被 Electron 主进程成功 require，(2) 64 位 Rust 能从 Hearthstone.exe 读取到 PE 头 magic bytes `4D 5A`

### Requirement: 后续 change 必须显式回引

When any subsequent OpenSpec change introduces hearthmirror native code, that change's `design.md` SHALL contain a section that cites `docs/adr/0001-hearthmirror-bridge.md` and confirms the implementation aligns with its Decision. Any deviation SHALL be argued with a new ADR (e.g., `docs/adr/0002-...`) that explicitly supersedes 0001.

#### Scenario: 实施 change 的 design 引用 ADR
- **GIVEN** 一个名为 `add-hearthmirror-bridge` 的后续 change
- **WHEN** 检查其 `design.md` 的 Decisions 节
- **THEN** 包含字符串 `docs/adr/0001-hearthmirror-bridge.md` 与 "aligns with"（或等价的中文表述）
