# integrate-hearthmirror-rs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the mature Mono runtime engine from `D:\code\hearthmirror-rs` (hm-core crate) into HDT.js 的 `@hdt/hearthmirror-native` napi-rs crate，replacing/upgrading the current basic implementations with battle-tested code: `iced-x86` disassembly-based offset probing, JSON-configurable offset tables, complete class_cache walking, recursive field resolution, VTable handling, and additional business methods.

**NOT in scope:** hearthmirror-rs 的子进程 + JSON-RPC 架构（Option C）已被 ADR 0001 否决。我们只提取其 **Rust 内核逻辑**（hm-core + hm-collections），适配到 HDT.js 的 64-bit napi-rs 架构（Option D）中。

**Architecture invariant:** 保持 ADR 0001 Decision D — 64-bit `napi-rs` native module loaded into Electron main process. `RemotePtr(u32)` newtype 不变。

---

## 0. Plan Metadata

- **Source repo**: `D:\code\hearthmirror-rs` — Rust workspace (`hearthmirror/crates/{hm-core, hm-collections, hm-rpc}`) + TS client (`packages/hearthmirror/`)
- **Target repo**: `D:\code\HDT_js` — `packages/hearthmirror/native/` (Rust crate) + `packages/hearthmirror/src/` (TS wrapper)
- **ADR**: [`docs/adr/0001-hearthmirror-bridge.md`](../../adr/0001-hearthmirror-bridge.md) — binding constraints #1–#7 remain in force
- **Prior plan**: [`docs/superpowers/plans/2026-04-19-add-hearthmirror-bridge.md`](2026-04-19-add-hearthmirror-bridge.md) — current implementation baseline

### Key Differences Between Two Codebases

| 维度 | HDT_js (目标) | hearthmirror-rs (源) |
|------|-------------|-------------------|
| 架构 | 64-bit napi-rs cdylib, 同进程 | 32-bit subprocess + stdio JSON-RPC |
| 目标三元组 | `x86_64-pc-windows-msvc` | `i686-pc-windows-msvc` |
| PE 解析 | `pelite` crate | 手写 PE export parser |
| 反汇编 | 硬编码 byte pattern (`A1+C3`) | `iced-x86` 通用 disassembler |
| 偏移管理 | 运行时探测 (`probe.rs`) | JSON 配置文件 + `OffsetProber` 系统 |
| 指针类型 | `RemotePtr(u32)` newtype | 裸 `usize`（32-bit 下等于 u32） |
| Mono 覆盖 | 基础（runtime, class, object, probe） | 完整（+image, field, vtable, array, string, value, offsets） |
| 集合遍历 | list, dict, custom_map, glist | list, dict, custom_map, service_locator |
| 业务方法 | 12 个 | 8 个 + dump_class + list_services |

### What to Port (High Value)

1. **`iced-x86` disassembly engine** (`hm-core/src/disasm.rs`, 362 行) — 替代硬编码 byte pattern
2. **JSON offset config** (`hm-core/src/mono/offsets.rs`, 418 行) — 可配置 baseline offsets
3. **`OffsetProber`** — 通过反汇编 mono export 函数自动探测偏移量
4. **MonoImage class_cache walking** (`hm-core/src/mono/image.rs`) — 完整的 class 枚举
5. **MonoClass recursive field resolution** (`hm-core/src/mono/class.rs`) — 含继承链
6. **VTable handling** (`hm-core/src/mono/vtable.rs`) — 当前 HDT_js 缺失
7. **MonoFieldDef** 独立模块 (`hm-core/src/mono/field.rs`)
8. **ServiceLocator** 改进 (`hm-collections/src/service_locator.rs`)
9. **Additional RPC methods**: `is_mulligan`, `dump_class` (debug utility)

### What NOT to Port

- 子进程架构（`hm-worker`, `hm-rpc`）
- JSON-RPC 传输层（`transport.rs`, `protocol.rs`）
- TypeScript `WorkerClient` / `Session` 类
- 32-bit 目标三元组
- 手写 PE parser（保留 `pelite`）

---

## 1. Dependency Upgrades

### Phase 1A: Add `iced-x86` to Cargo.toml

- [ ] **Add `iced-x86` dependency** to `packages/hearthmirror/native/Cargo.toml`:
  ```toml
  iced-x86 = { version = "1.21", default-features = false, features = ["std", "decoder", "fast_fmt"] }
  ```
- [ ] **Add `serde` + `serde_json`** for offset config loading:
  ```toml
  serde = { version = "1.0", features = ["derive"] }
  serde_json = "1.0"
  ```
- [ ] Run `cargo check` to verify dependency resolution.

### Validation
- `cargo check` passes with new dependencies.

---

## 2. Port Disassembly Engine

**Source**: `D:\code\hearthmirror-rs\hearthmirror\crates\hm-core\src\disasm.rs` (362 lines)

### Phase 2A: Create `disasm.rs` module

- [ ] **Create** `packages/hearthmirror/native/src/disasm.rs` by porting `hm-core/src/disasm.rs`.
- [ ] **Adapt pointer types**: hearthmirror-rs 用 `usize`（32-bit），HDT_js 需要保持 `usize` 作为内部反汇编返回值（偏移量是相对值，不受宿主位数影响）。
- [ ] **Port `find_field_load_displacement()`**: 核心算法 — 跟踪函数体中最后一个 `mov eax, [reg+disp]` 的 displacement。
- [ ] **Port `find_first_absolute_load()`**: 提取第一个 `mov reg, [absolute_addr]` 的地址。
- [ ] **Port `DEFAULT_PROBE_WINDOW`** constant (256 bytes).
- [ ] **Key adaptation**: 反汇编 bitness 参数。hearthmirror-rs 硬编码 32（因为是 32-bit 进程），HDT_js 需要传 `32` 作为 bitness 参数因为我们反汇编的是 32-bit 炉石进程的代码（不是宿主进程的）。
- [ ] **Add `pub mod disasm;`** to `lib.rs`.
- [ ] **Port tests**: 至少 port `disasm.rs` 中的 byte-level 单元测试。

### Phase 2B: Replace existing pattern matching

- [ ] **Modify** `mono/runtime.rs` 中的 `extract_global_root_domain_addr()` — 将硬编码 byte pattern 替换为调用 `disasm::find_first_absolute_load()`。
- [ ] **Remove** the old `Pattern A` / `Pattern B` byte matching code.
- [ ] **Update** `ScryError` — 移除 `DisasmPatternUnknown` variant（如存在），用通用 `DisasmError(String)` 替代。

### Validation
- `cargo test` — disasm unit tests pass.
- 集成测试（需要炉石运行）：`extract_global_root_domain_addr` 使用 `iced-x86` 成功定位 root domain。

---

## 3. Port JSON Offset Config System

**Source**: `D:\code\hearthmirror-rs\hearthmirror\crates\hm-core\src\mono\offsets.rs` (418 lines)

### Phase 3A: Create offset types

- [ ] **Create** `packages/hearthmirror/native/src/mono/offsets.rs` by porting offset structs:
  - `MonoOffsets` (top-level)
  - `MonoStructs` (container for all per-type offsets)
  - `DomainOffsets`, `AssemblyOffsets`, `ImageOffsets`, `HashTableOffsets`
  - `ClassOffsets`, `FieldOffsets`, `VTableOffsets`, `ObjectOffsets`
  - `StringOffsets`, `ArrayOffsets`
- [ ] **Port `hex_or_int` deserializer** — accepts `"0xC"` strings and plain integers.
- [ ] **Port `MonoOffsets::from_file()` and `MonoOffsets::from_str()`**.
- [ ] **Key adaptation**: 所有 offset 值类型保持 `usize`（反汇编探测结果是 `usize`），但在与 `RemotePtr` 交互时需注意 `RemotePtr` 内部是 `u32`。添加 `offset as u32` 转换辅助。

### Phase 3B: Bundle default offset JSON

- [ ] **Copy** `D:\code\hearthmirror-rs\hearthmirror\config\mono-offsets\unity-2021.3.json` to `packages/hearthmirror/native/config/mono-offsets/unity-2021.3.json`.
- [ ] **Add** `include_str!()` 或 `env!("CARGO_MANIFEST_DIR")` 方式加载默认配置。推荐 `include_str!()` 以避免运行时文件查找问题。
- [ ] **Port tests**: `loads_unity_2021_3_json_from_repo`, `hex_or_int_accepts_string_and_int`, `ignores_dollar_annotation_keys`.

### Phase 3C: Create `OffsetProber`

- [ ] **Port `OffsetProber` struct** — 包含 `mem`, `mono_module`, `bitness`, `probe_window` 字段。
- [ ] **Port `probe_displacement()`** — 使用新的 `disasm::find_field_load_displacement()`。
- [ ] **Port `probe_absolute_load()`** — 使用新的 `disasm::find_first_absolute_load()`。
- [ ] **Port `probe_all()`** — 6 个 critical probes + 4 个 best-effort probes。
- [ ] **Key adaptation**: PE export table读取。hearthmirror-rs 用手写 `pe::read_exports()`，HDT_js 用 `pelite`。需要写一个 `read_exports_map()` 函数，用 `pelite` 遍历 export table 返回 `HashMap<String, usize>`（export_name → VA）。
- [ ] **Add** `pub mod offsets;` to `mono/mod.rs`.

### Validation
- `cargo test` — offset config 加载和解析测试通过。
- 集成测试：`OffsetProber::probe_all()` 成功探测偏移量。

---

## 4. Upgrade Mono Runtime Module

**Source**: `hm-core/src/mono/runtime.rs`, `image.rs`, `class.rs`, `field.rs`, `object.rs`, `vtable.rs`

### Phase 4A: Refactor `MonoRuntime` struct

- [ ] **Expand** `MonoRuntime` in `packages/hearthmirror/native/src/mono/runtime.rs` to include:
  - `offsets: MonoOffsets` (从 Phase 3 porting)
  - `exports: HashMap<String, usize>` (mono export table cache)
  - Keep existing fields: `memory`, `mono_module`, `root_domain`
- [ ] **Refactor `MonoRuntime::init()`** to use the new offset system:
  1. Find mono dll (keep existing `find_mono_module`)
  2. Read PE exports into `HashMap` (new: `read_exports_map()`)
  3. Load default offsets from bundled JSON
  4. Run `OffsetProber::probe_all()` to refine offsets
  5. Resolve `mono_get_root_domain` via `disasm::find_first_absolute_load()` (replaces old pattern match)
  6. Dereference to get `root_domain`
- [ ] **Port `enumerate_assembly_image_addrs()`** — walk `domain_assemblies` GSList using offset config.
- [ ] **Port `find_image()`** — find MonoImage by name.
- [ ] **Keep** `discover_offsets()` and `open_assembly_csharp()` as supplementary methods.

### Phase 4B: Port `MonoImage` (class_cache walker)

- [ ] **Create** `packages/hearthmirror/native/src/mono/image.rs` (if not exists, or refactor existing).
- [ ] **Port** `MonoImage::enumerate_classes()` — walk class_cache hash table using offset config.
- [ ] **Port** `MonoImage::find_class()` — lookup by full name.
- [ ] **Key adaptation**: 所有 `self.rt.mem.read_ptr()` 调用需适配 `RemotePtr` — hearthmirror-rs 返回 `usize`，HDT_js 的 `ProcessMemory::read_remote_ptr()` 返回 `RemotePtr`. 需要在 `ProcessMemory` 上添加 `read_ptr_raw(&self, addr: RemotePtr) -> Result<usize>` 辅助，内部做 `read_remote_ptr()` + `.0 as usize` 转换。或者统一在此 module 内用 `u32` 工作。

### Phase 4C: Upgrade `MonoClass`

- [ ] **Refactor** existing `packages/hearthmirror/native/src/mono/class.rs` to match hearthmirror-rs 的 API：
  - `name()`, `namespace()`, `full_name()`
  - `parent() -> Option<usize>`
  - `fields() -> Vec<MonoFieldDef>` — own declared fields
  - `fields_recursive() -> HashMap<String, MonoFieldDef>` — including inherited
  - `find_field()` — lookup by name with inheritance

### Phase 4D: Port `MonoFieldDef` module

- [ ] **Create** `packages/hearthmirror/native/src/mono/field.rs` by porting `hm-core/src/mono/field.rs`.
- [ ] **Port** `MonoFieldDef::read()` — reads a field descriptor from process memory.
- [ ] **Fields**: `name: String`, `offset: u32`, `type_ptr: usize`, `is_static: bool`.

### Phase 4E: Port `VTable` module

- [ ] **Create** `packages/hearthmirror/native/src/mono/vtable.rs` by porting `hm-core/src/mono/vtable.rs` (4396 bytes).
- [ ] **Port** vtable → class resolution.
- [ ] **Port** static field data area access via VTable.

### Phase 4F: Upgrade `MonoObject`

- [ ] **Refactor** existing `packages/hearthmirror/native/src/mono/object.rs` to use offset config:
  - `from_addr()` — reads vtable using `offsets.structs.object.vtable`
  - `read_field_raw()` — uses `field.offset` directly
  - `read_field_ptr()`, `read_field_i32()`, `read_field_u32()`, `read_field_bool()`, `read_field_string()`
  - Port `struct_field_addr()` helper for inline value-types
- [ ] **Key adaptation**: hearthmirror-rs 的 `MonoObject` 接受 `&'rt MonoRuntime` 生命周期引用。HDT_js 可能需要 `Arc<MonoRuntime>` 或调整生命周期设计。评估后决定。

### Phase 4G: Update `mono/mod.rs` barrel

- [ ] **Update** `packages/hearthmirror/native/src/mono/mod.rs` to re-export all new modules:
  ```rust
  pub mod offsets;
  pub mod runtime;
  pub mod image;
  pub mod class;
  pub mod field;
  pub mod vtable;
  pub mod object;
  pub mod probe;
  ```

### Validation
- `cargo test` — all mono module unit tests pass.
- 集成测试（炉石运行时）：
  - `MonoRuntime::init()` 使用新的 offset probing 成功初始化
  - `MonoImage::enumerate_classes()` 返回 >100 个类
  - `MonoImage::find_class("CollectionManager")` 成功
  - `MonoClass::fields_recursive()` 返回非空字段列表

---

## 5. Upgrade Collections Module

**Source**: `hm-collections/src/{list.rs, dict.rs, custom_map.rs, service_locator.rs}`

### Phase 5A: Compare and upgrade List/Dict/CustomMap

- [ ] **Diff** `hm-collections/src/list.rs` vs `packages/hearthmirror/native/src/collections/list.rs` — 取各自优点合并。
- [ ] **Diff** `hm-collections/src/dict.rs` vs `packages/hearthmirror/native/src/collections/dict.rs`.
- [ ] **Diff** `hm-collections/src/custom_map.rs` vs `packages/hearthmirror/native/src/collections/custom_map.rs`.
- [ ] **Adapt** 所有集合模块使用新的 `MonoOffsets` 偏移值而非硬编码。

### Phase 5B: Upgrade ServiceLocator

- [ ] **Compare** `hm-collections/src/service_locator.rs` (6114 bytes) with `packages/hearthmirror/native/src/service_locator.rs` (1238 bytes).
- [ ] **Port** hearthmirror-rs 的更完整 ServiceLocator 实现（支持 `s_runtimeServices` 和 `s_dynamicServices` 双路径）。
- [ ] **Adapt** to use offset config for field access.

### Validation
- 集成测试：ServiceLocator 能找到 `CollectionManager`, `NetCache`, `GameMgr` 等服务。

---

## 6. Port Additional Business Methods

**Source**: `hm-rpc/src/handler.rs` (731 lines)

### Phase 6A: Port `is_mulligan`

- [ ] **Create** `packages/hearthmirror/native/src/reflection/mulligan.rs`.
- [ ] **Port** `handle_is_mulligan()` from `handler.rs` — reads `MulliganManager.Get()` via ServiceLocator.
- [ ] **Add** `#[napi]` export `is_mulligan() -> Promise<bool>`.
- [ ] **Update** `@hdt/hearthmirror` TypeScript wrapper to expose `isMulligan()`.

### Phase 6B: Port `dump_class` (debug utility)

- [ ] **Create** `packages/hearthmirror/native/src/reflection/debug.rs`.
- [ ] **Port** `handle_dump_class()` — enumerates all fields of a named class (useful for debugging new Hearthstone builds).
- [ ] **Expose as** `#[napi]` export `dump_class(class_name: String) -> Promise<Vec<FieldDumpEntry>>`.

### Phase 6C: Port `list_services` (debug utility)

- [ ] **Port** `handle_list_services()` — enumerates all registered services.
- [ ] **Expose as** `#[napi]` export `list_services() -> Promise<Vec<ServiceEntry>>`.

### Validation
- 集成测试：`is_mulligan()` 在换牌阶段返回 `true`。
- `dump_class("CollectionManager")` 返回非空字段列表。
- `list_services()` 返回已注册服务列表。

---

## 7. Update TypeScript Wrapper

### Phase 7A: Add new methods to `HearthMirror` class

- [ ] **Add** `isMulligan(): Promise<boolean>` to `packages/hearthmirror/src/hearthmirror.ts`.
- [ ] **Add** `dumpClass(className: string): Promise<FieldDump[]>` (optional debug method).
- [ ] **Add** `listServices(): Promise<ServiceInfo[]>` (optional debug method).
- [ ] **Update** `packages/hearthmirror/src/types.ts` with new interfaces (`FieldDump`, `ServiceInfo`).
- [ ] **Update** `packages/hearthmirror/src/index.ts` barrel exports.

### Phase 7B: Update desktop IPC

- [ ] **Add** IPC channels for new methods in `apps/desktop/src/main/hearthmirror.ts`.
- [ ] **Add** preload bridge entries in `apps/desktop/src/preload/`.

### Validation
- `pnpm typecheck` — zero errors.
- `pnpm test` — existing + new tests pass.

---

## 8. Quality Gates & Cleanup

### Phase 8A: Verify ADR 0001 constraints

- [ ] **Constraint #1**: 永不 panic — run `cargo clippy -- -D warnings -D clippy::unwrap_used -D clippy::expect_used -D clippy::panic` on the hearthmirror-native crate.
- [ ] **Constraint #3**: 所有远程指针使用 `RemotePtr` — grep 确认无裸 `u32`/`usize` 表示远程地址。
- [ ] **Constraint #5**: Mono 偏移量动态探测 — 确认 `OffsetProber::probe_all()` 覆盖 critical + best-effort probes。
- [ ] **Constraint #6**: 优先用 `loaded_images` — 确认 `find_image()` 路径正确。
- [ ] **Constraint #7**: Mono DLL 名字 fallback 顺序 — `mono-2.0-bdwgc.dll` → `mono-2.0-sgen.dll` → `mono-2.0-boehm.dll` → `mono-*.dll`。

### Phase 8B: Cleanup and documentation

- [ ] **Remove** old byte-pattern matching code from `mono/runtime.rs` (replaced by `disasm.rs`).
- [ ] **Update** `packages/hearthmirror/native/README.md` — document new offset probing system.
- [ ] **Add** `config/` directory reference in Cargo.toml if using `include_str!`.
- [ ] **Run** full test suite: `cargo test`, `pnpm test`, `pnpm typecheck`, `pnpm lint`.

### Phase 8C: Build and verify `.node` binary

- [ ] **Build** release: `cd packages/hearthmirror/native && npx napi build --platform --release`.
- [ ] **Replace** `hearthmirror-native.win32-x64-msvc.node` with new build.
- [ ] **Smoke test**: start Electron app → 确认 `isAlive()` 返回 `true`（需要炉石运行）。

### Validation
- All clippy gates pass.
- `.node` binary loads without crash.
- 12 + 3 (new) reflection methods all return valid data with Hearthstone running.

---

## 9. Adaptation Notes (Critical)

### 9.1 Pointer Type Translation

hearthmirror-rs 内部所有指针是 `usize`（32-bit 进程中 = `u32`）。HDT_js 是 64-bit 进程读 32-bit 目标，所以：

- **远程指针** → `RemotePtr(u32)` — 代表炉石进程中的地址
- **偏移量** → `usize` 或 `u32` — 不是地址，是结构体内的偏移
- **计算**：`remote_addr = RemotePtr(base.0 + offset as u32)`

移植时的规则：
```rust
// hearthmirror-rs (32-bit):
let ptr = self.rt.mem.read_ptr(addr + offset)?;  // usize + usize → usize

// HDT_js (64-bit) adaptation:
let ptr = self.memory.read_remote_ptr(RemotePtr::new(base.0 + offset as u32))?;  // RemotePtr
```

### 9.2 ProcessMemory API 差异

| 操作 | hearthmirror-rs | HDT_js |
|------|----------------|--------|
| 读指针 | `mem.read_ptr(addr: usize) -> usize` | `memory.read_remote_ptr(addr: RemotePtr) -> RemotePtr` |
| 读 u32 | `mem.read_u32(addr: usize) -> u32` | `memory.read_u32(addr: RemotePtr) -> u32` |
| 读 string | `mem.read_cstring_utf8(addr: usize, max: usize) -> String` | `memory.read_cstring(addr: RemotePtr, max: usize) -> String` |

可能需要在 `ProcessMemory` 上添加一些辅助方法简化移植。

### 9.3 反汇编 Bitness

hearthmirror-rs 中 `bitness` 根据宿主进程决定（32-bit → 32）。HDT_js 的宿主是 64-bit，但反汇编的 mono.dll 代码是 32-bit。所以 `OffsetProber` 中必须**硬编码 `bitness = 32`**，因为我们反汇编的是炉石（32-bit）进程中的 mono.dll 机器码。

### 9.4 生命周期设计

hearthmirror-rs 用 `&'rt MonoRuntime` 生命周期引用。HDT_js 当前用 `static MIRROR: Mutex<Option<MonoRuntime>>`。移植时有两种策略：

- **策略 A（推荐）**：保持 `Mutex<Option<MonoRuntime>>`，在 `with_runtime()` 闭包内传引用给 MonoImage/MonoClass/MonoObject。
- **策略 B**：改为 `Arc<MonoRuntime>`，各子结构持有 `Arc`。更灵活但增加引用计数开销。

推荐策略 A，与当前设计一致。

---

## 10. Risk Assessment

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| `iced-x86` 增加 `.node` binary 体积 | 确定 | 低 | 仅启用 `std + decoder + fast_fmt`，不含 formatter/encoder |
| 反汇编 32-bit 代码在 64-bit 进程中的行为差异 | 低 | 高 | `iced-x86` 的 `Decoder` 接受显式 bitness 参数，传 32 即可 |
| offset JSON 配置与当前炉石版本不匹配 | 中 | 中 | `OffsetProber::probe_all()` 会覆盖 JSON 默认值 |
| `RemotePtr` 适配增加大量样板代码 | 高 | 中 | 添加 `ProcessMemory::read_ptr_as_usize()` 辅助减少噪音 |
| 移植过程中破坏现有 12 个反射方法 | 中 | 高 | Phase 4 前先 snapshot 所有集成测试结果作为 baseline |

---

## 11. Execution Order Summary

```
Phase 1 (deps)     ─────────────────────────────────────┐
Phase 2 (disasm)   ──────────────────────┐               │
Phase 3 (offsets)  ──────────────────────┤ serial        │ can parallel
Phase 4 (mono)     ──────────────────────┘               │ with Phase 6B
Phase 5 (collections) ──────────────────────────────────┐│
Phase 6 (business methods) ─────────────────────────────┘│
Phase 7 (TS wrapper) ───────────────────────────────────┐│
Phase 8 (quality)    ───────────────────────────────────┘┘
```

严格串行：1 → 2 → 3 → 4 → 5 → 6 → 7 → 8

Phases 1-3 是基础设施，Phase 4 是核心升级，Phase 5-6 依赖 Phase 4，Phase 7 依赖 Phase 6，Phase 8 是最终验证。

---

## 12. Estimated Effort

| Phase | 预估 | 复杂度 |
|-------|------|--------|
| 1. Dependencies | 0.5h | 低 |
| 2. Disasm engine | 2-3h | 中高 |
| 3. Offset config | 2-3h | 中 |
| 4. Mono modules | 4-6h | 高 |
| 5. Collections | 1-2h | 中 |
| 6. Business methods | 2-3h | 中 |
| 7. TS wrapper | 1-2h | 低 |
| 8. Quality gates | 1-2h | 低 |
| **Total** | **~14-22h** | |
