## Context

HDT.js 的核心差异化能力（卡组追踪、卡牌收藏读取、对手段位识别等）依赖从运行中的 `Hearthstone.exe` 进程读取 Mono 运行时管理的 C# 对象。原 `Rewrite_Design.md` 给出了完整的 native 引擎架构（Rust + 32 位 + ffi-napi），但其中两个核心假设已被证实过时：

1. **`ffi-napi` 已不可用** — Windows + Node ≥ 18 无法编译，原仓库 issue #269 公开请求 archive。
2. **"必须 32 位"是误判** — 64 位进程可以直接用标准 `ReadProcessMemory()` 读 32 位炉石进程内存（参考 [MSDN ReadProcessMemory 文档](https://learn.microsoft.com/en-us/windows/win32/api/memoryapi/nf-memoryapi-readprocessmemory) 与多个 SO 工程实践），唯一注意点是把对端指针当 `u32` 而非宿主 `usize`。反方向（32 位读 64 位）才需要 `NtWow64ReadVirtualMemory64` 等 hack。

约束：

- **目标进程**：`Hearthstone.exe` 是 32 位 Unity Mono（非 IL2CPP），地址空间 ≤ 4 GB，所有指针 4 字节。
- **宿主**：HDT.js 是 Electron 桌面应用，主平台 Windows 10/11 x64。Phase 0 已经把 Electron 锁定为 64 位（add-monorepo-skeleton）。
- **Mono 内部结构**：`MonoDomain` / `MonoImage` / `MonoClass` / `MonoObject` / `MonoArray` 等结构按 32 位指针对齐（4 字节 stride），与宿主位数无关——这意味着无论我们用什么宿主架构，Rust 端都得用 `u32` 表示对端指针。
- **节奏**：本 change 是**先于任何 native 代码**的决策门，目的是避免在错误的工程化基础上花费数周。

## Goals / Non-Goals

**Goals:**

- 在 4 个候选架构方案中做出明确选择，并写出可追溯的 Rationale。
- 把所有"已知未知"（unknown unknowns）尽可能转成"已知已知"或"已知未知列入 spike"。
- 给出一个**最高 1 天工时**的 spike 计划，端到端验证入选方案的最高风险点。
- 让后续 `add-hearthmirror-bridge` change 的 design.md 能直接 cite 本 ADR 的 Choice。

**Non-Goals:**

- 不在本 change 实施 spike（实施留给 `add-hearthmirror-bridge-spike` change，依赖本 ADR）。
- 不解决 Mono 偏移量随炉石/Unity 版本漂移的问题（识别为风险即可，缓解策略在后续 change 落地）。
- 不解决代码签名 / Defender 误报。
- 不评估 macOS / Linux 适配（炉石只在 Windows 上能稳定运行，跨平台不在范围）。

## Decisions

### D1: Bridge 架构 → 64 位 napi-rs 原生模块（方案 D）

#### Context

需要让 TypeScript（Electron 主进程，64 位）能调用 Rust 编写的 native 代码（Mono 解析 + ReadProcessMemory），并在合理的复杂度内实现性能、稳定性、可维护性的平衡。

#### Options

##### Option A — `koffi`（运行时 FFI）

- **形态**：Rust 不出场。把所有内存读取、Mono 解析逻辑用 TypeScript + `koffi` 直接调 Windows API DLL（`kernel32.ReadProcessMemory` 等）。
- **优点**：
  - 无 Rust 工具链 / 无原生模块构建 / 无 CI 矩阵。
  - 任何 Node 版本下都能 `pnpm install` 即用，分发简单。
  - `koffi` 仍在活跃维护（2025–2026 年仍有更新），是 `ffi-napi` 的合理继承者。
- **缺点**：
  - **Mono 解析器在 TS 里写非常痛苦** — 需要手动 `koffi.struct({...})` 描述每个 Mono 内部结构（MonoClass 几十个字段）、自己处理小端 + 对齐 + 32 位指针 + 偏移量适配。
  - **每次内存读取都过一次 FFI**，`koffi` 平均开销 ~500 ns/call，单帧覆盖层刷新（数千次读取）累计开销不可忽视。
  - 类型安全弱（FFI 描述符是运行时校验，TS 静态类型基本帮不上忙）。
  - 出错时调试困难（segfault 直接带崩 Electron，没有 Rust 端的堆栈）。

##### Option B — 32 位 `napi-rs`（编译时绑定 + 32 位 Electron）

- **形态**：Rust 编译成 ia32 `.node` 模块，Electron 也得用 32 位发布版（v33-ia32 仍存在但官方维护意愿在下降，多次 bug 已积累）。
- **优点**：与 32 位炉石进程位数对齐，`ReadProcessMemory` 等 API 调用最直观，Mono 内部指针直接是宿主 `usize`。
- **缺点**：
  - **64 位 Electron 才是主流** — 32 位 Electron 的体积、性能、兼容性都更差，杀软更敏感。
  - **napi-rs ia32 构建已知有坑** — 历史 issue #284 提到 32 位 Windows 目标多次构建失败，社区主流不推荐。
  - 锁死了 32 位限制，未来若想跨平台几乎不可能。

##### Option C — 32 位独立 Rust 子进程 + stdio JSON-RPC

- **形态**：把 `hearthmirror-native` 编译为独立的 32 位 `.exe`（CLI），Electron 主进程（64 位）`spawn` 它，通过 stdin/stdout 用 newline-delimited JSON-RPC 通信。
- **优点**：
  - **进程隔离** — Rust 端 panic / segfault / Mono 探测越界都不影响 Electron 主进程。
  - **位数完全隔离** — 32 位 Rust 进程读 32 位炉石，零 WOW64 边界问题。
  - 易于独立测试（`echo '{"method":"getBattleTag"}' | hm-bridge.exe`）。
  - 易于换实现（任何能讲 JSON-RPC 的二进制都能替换）。
- **缺点**：
  - **运维复杂度最高** — 子进程生命周期、stdin/stdout 缓冲、错误恢复、僵尸进程清理、安装包要打两个 .exe、两套构建产物。
  - **每次 RPC 都有序列化 + IPC 开销**（虽然可以批量调用平摊，但单次 call ≥ 1 ms 量级）。
  - **杀软最敏感** — 一个独立的 .exe 主动 `OpenProcess` + `ReadProcessMemory` 一个游戏进程，几乎肯定被部分杀软标记，需要代码签名缓解。
  - 调试链路最长（Electron → 子进程 stdin → JSON 解析 → Rust 业务 → JSON 回复 → 解析）。

##### Option D — 64 位 `napi-rs`（编译时绑定，同进程）

- **形态**：Rust 编译成 x64 `.node` 模块，被 Electron 主进程直接 `require` / `import`。Rust 内用 64 位 `OpenProcess` + 64 位 `ReadProcessMemory` 读取 32 位炉石进程，**Mono 内部所有指针在 Rust 端用 `u32` 类型表示**（不是 `usize`/`u64`）。
- **优点**：
  - **同进程零 IPC** — 调用就是函数调用，单次 < 1 µs。
  - **napi-rs 64 位 windows-msvc 是标准 CI 矩阵**，构建/分发最熟，社区案例最多（`@swc/core`、`@parcel/source-map` 等大厂用户都跑这个 target）。
  - **Electron 主流 64 位**，不绑死老平台，未来扩展空间大。
  - **Rust 类型系统能从源头排除 32/64 位指针混淆** — 在 Rust 端把"对端指针"封装为一个 `RemotePtr(u32)` 新类型，编译期就拦住所有把它当宿主指针用的错误。
  - **错误处理最规整** — Rust `Result` 经 napi-rs 自动转 JS Promise reject，TypeScript 端可以正常 try/catch。
- **缺点**：
  - **同进程无隔离** — Rust 端 panic 会带崩 Electron 主进程；缓解：所有 unsafe Windows API 调用包在 `std::panic::catch_unwind` 里，napi-rs 暴露的方法返回 `Result`，永不 unwrap。
  - **napi-rs CI 复杂度** — 要为 win32-x64-msvc 构建 prebuild 二进制，分发到 npm；首版可以 npm 端只发源码 + postinstall 编译，等后续做 prebuilds（这是 CI/CD 优化，不是阻塞）。
  - **跨架构边界要小心** — `MEMORY_BASIC_INFORMATION32` vs `MEMORY_BASIC_INFORMATION`，`Module32First/Next` 在 64 位读 32 位时返回的是 32 位版本（`MODULEENTRY32W`，恰好就是带 32 后缀的），需要在 Rust 端用对应的 windows-rs 类型。这是一次性的工程负担，不是持续性的复杂度。

#### Choice — **Option D（64 位 napi-rs，同进程）**

#### Rationale

| 维度 | 权重 | A koffi | B napi-rs ia32 | C 32 位子进程 | **D napi-rs x64** |
|---|---|---|---|---|---|
| 单次内存读取性能 | 高 | 差（每次 FFI） | 中 | 差（每次 IPC） | **优** |
| 类型安全 | 高 | 差 | 优 | 中 | **优** |
| 工程化成熟度 | 高 | 中 | 差（ia32 napi-rs 罕见） | 中 | **优** |
| 进程隔离 | 中 | 无 | 无 | **优** | 无 |
| 运维复杂度 | 中 | 优 | 中 | 差（双产物 + 子进程编排） | 中 |
| 调试链路长度 | 中 | 中 | 短 | 长 | **短** |
| 杀软敏感度 | 中 | 中 | 中 | 差（独立 .exe） | **中** |
| 未来跨平台空间 | 低 | 中 | 差 | 中 | **优** |

D 在权重高的三项（性能、类型安全、工程化成熟度）全面领先，唯一明显劣势"无进程隔离"通过 `catch_unwind` + `Result` 暴露面可以工程化降级成可控风险。**采用 D**。

#### 必须遵循的工程约束（在后续 `add-hearthmirror-bridge` design 中需要复述并细化）

- 所有 unsafe FFI 调用（OpenProcess / ReadProcessMemory / VirtualQueryEx 等）必须在 Rust 端封装在 `unsafe fn raw_*`，外层 `pub fn` 必须返回 `Result<T, ScryError>`，永不直接 `panic!` / `unwrap()` / `expect()`。
- napi-rs 暴露的所有 `#[napi]` 方法必须签名为 `fn(...) -> Result<T>`（返回 JS Promise reject，不是直接 throw / abort）。
- `RemotePtr(u32)` 新类型必须独立定义，不能直接用 `u32` 表示远程指针，避免本地/远程指针混淆。
- 静态分析门禁：CI 加 `cargo clippy -- -D warnings -D clippy::unwrap_used -D clippy::expect_used`（在 hearthmirror crate 内）。

### D2: Spike 范围 → 最小端到端的 "MZ" 验证

#### Context

不需要在 spike 阶段验证整个 Mono 解析链路（那是数周的工作），只需要把 D 路线最高的两个风险点钉死：

1. **64 位 napi-rs 能否成功构建并被 Electron 主进程加载**（验证 napi-rs 工具链兼容当前 Node 22 + Electron 33）。
2. **64 位 Rust 进程能否对 32 位运行的 Hearthstone.exe 调用 OpenProcess + ReadProcessMemory 并拿到正确数据**（验证跨架构 ReadProcessMemory 真的能工作 + 验证不需要管理员权限）。

#### Spike 验收标准

- 在炉石客户端运行的前提下，从 Electron 主进程触发，输出：
  - Hearthstone 进程 PID
  - Hearthstone.exe 模块基址（`HMODULE`）
  - 该地址前 4 字节内容必须是 `4D 5A 90 00`（PE 文件头的 "MZ" magic + DOS stub 的第三字节 0x90）
- 在炉石未运行的前提下，输出明确的"未找到进程"错误（不是 panic）。
- spike 不引入 SQLite、不引入 Mono 解析、不引入 IPC 通道封装、不写测试（spike 出口前删掉）。

#### Spike 不验证的事

- Mono 运行时定位（`mono.dll` / `mono_get_root_domain`）—— 留给 `add-hearthmirror-bridge` 实施。
- 元数据解析（ECMA-335 #~ 流）—— 同上。
- 偏移量探测 / 版本适配 —— 同上。
- Anti-cheat / Defender 误报 —— 留给"上线前"的专项工作。

### D3: 文档归宿 → `docs/adr/` + `docs/spikes/`

#### Context

OpenSpec 的 `docs/superpowers/specs/` 是 brainstorming skill 的默认路径，不适合放 ADR（ADR 是更窄的"决策快照"）。

#### Choice

- ADR 放在 `docs/adr/0001-hearthmirror-bridge.md`，遵循 Michael Nygard 的 ADR 模板（Status / Context / Decision / Consequences），编号从 0001 开始。
- Spike 计划放在 `docs/spikes/0001-hearthmirror-spike.md`，编号与 ADR 对齐。
- 后续每个架构决策都开新的 ADR 文件（0002、0003…），形成可审计链。

### D4: 与 `Rewrite_Design.md` 的关系

#### Context

`Rewrite_Design.md`（43 KB）是宝贵的 Mono 解析知识资产（每个 Mono 结构的偏移、字段、布局），但其架构层假设已被本 ADR 推翻。直接删除会丢失知识，原样保留会误导后续读者。

#### Choice

在 `Rewrite_Design.md` 顶部插入一个 `> **Status**: Architecture sections (1–6) **superseded by** [`docs/adr/0001-hearthmirror-bridge.md`](docs/adr/0001-hearthmirror-bridge.md). Sections 7+ on Mono runtime internals remain authoritative.` 块，确保读者第一眼就知道架构看 ADR、Mono 知识看本文档。

## Risks / Trade-offs

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| `napi-rs` 在 Electron 33 下 binary ABI 不兼容 | 低 | 高 | spike 0.5 天验证，若失败立刻回退到 Option C |
| 64 位读 32 位 `ReadProcessMemory` 在 Win11 24H2+ 被 ETW / Defender 拦截 | 中 | 高 | spike 在干净 Win11 上验证；若失败评估 ETW 例外或回退 Option C |
| Mono 内部结构在 Unity 2024 LTS 后变化 | 高 | 中 | 与本 ADR 无关，是后续 `add-hearthmirror-bridge` 的偏移量探测策略要解决的事 |
| Rust panic 带崩 Electron | 中 | 高 | 静态门禁 `clippy::unwrap_used` + `catch_unwind` + napi-rs Result 返回 |
| napi-rs prebuild 分发复杂度 | 中 | 低 | 首版 source-only + postinstall `cargo build`，prebuild CI 矩阵作为优化项 |
| ADR 决定后被后续实现偏离 | 低 | 高 | `add-hearthmirror-bridge` 的 design.md 必须显式回引本 ADR 的 Choice，任何偏离需在该 design 重新论证 |

## Open Questions

- **OQ1**: napi-rs 是否能与 Electron 的 sandbox renderer 共存？答：本 change 不需要回答（hearthmirror native 模块只在主进程加载，渲染端通过 IPC 调用，不直接 require .node）。但 `add-hearthmirror-bridge` design 必须显式在 IPC 边界上画清楚。
- **OQ2**: spike 二进制要不要走 napi-rs 的 prebuild 还是 source-only postinstall？答：spike 阶段用 source-only（最简单），prebuild 留给生产化阶段。
- **OQ3**: 是否要在 spike 中顺便验证 `VirtualQueryEx` + `MEMORY_BASIC_INFORMATION32` 的正确用法？答：建议加进 spike，多花 1 小时但能消除一个真实坑。

## Migration Plan

不存在历史用户/数据，无需 migration。但有"内部迁移"：

- `Rewrite_Design.md` 的全部 Rust 模块结构（`hearthmirror/native/Cargo.toml` 等）需要在 `add-hearthmirror-bridge` design 中**全部重写**（从"32 位 ia32 + ffi-napi"转为"64 位 windows-msvc + napi-rs"），不能机械搬运。
