# Hearthmirror 桥接代码审查报告

> 审查范围：worktree `integrate-hearthmirror-rs` (分支 `copilot/integrate-hearthmirror-rs`) 相对 `main` 的全部变更（约 4431 行 / 42 文件）。
> 参考文档：`openspec/changes/add-hearthmirror-bridge/{proposal,design,tasks}.md`、`openspec/changes/decide-hearthmirror-bridge/design.md`、`docs/superpowers/plans/2026-04-19-add-hearthmirror-bridge.md`、`docs/adr/0001-hearthmirror-bridge.md`、`docs/spikes/0001/0002`。
> 审查者：Cursor 代码审查

---

## 总体评价

❌ **不建议合并**。`tasks.md` 已将 Phase A–H 全部勾选为已完成，但实际上 Phase G（12 个 IReflection 方法）几乎全部为返回 `Ok(None)/Ok(false)/Ok(0)` 的桩实现，Phase H 中的渲染层接入（`App.tsx` / `Dashboard.tsx`）也未在本 PR 中体现。同时存在两处与 `design.md` 明确决策相悖的实现选择（手写 PE 解析、引入 `iced-x86`），以及一处 `process.rs` 中潜在的越界 panic。基础设施（Phase A–F）质量良好，IPC/Preload/TS Wrapper 骨架与设计文档一致，但目前桥接未提供任何实际的游戏数据。

---

## 与计划/规范一致性

| 阶段 | tasks.md 状态 | 实际状态 | 备注 |
| --- | --- | --- | --- |
| Phase A — Foundation (RemotePtr / Handle / Memory / Error) | `[x]` | ✅ 完成 | `remote_ptr.rs`、`handle.rs`、`memory.rs`、`error.rs` 已落地，`OwnedProcessHandle` RAII 正确，错误类型分层清晰 |
| Phase B — Mono runtime locate | `[x]` | ✅ 完成 | `mono/runtime.rs` 实现 `find_mono_module`、`resolve_root_domain`，并配套字节模式 + iced-x86 解析 |
| Phase C — 偏移量探测 | `[x]` | ✅ 完成 | `mono/probe.rs` + `mono/offsets.rs` 提供 `OffsetProber`，并自带 `bundled_unity_2021_3.json` 默认配置 |
| Phase D — ECMA-335 disk metadata | `[x]` | ⚠️ **严重偏离** | `metadata/tables.rs` 自实现 PE 解析，未使用 `pelite`（违反 design D2）；只解析 `TypeDef`，无 Field/Method 表 |
| Phase E — 集合遍历 | `[x]` | ✅ 完成 | `List<T>`、`Dictionary<K,V>`、`Map<K,V>` 均带 `max_items` 上限，单测覆盖布局解析 |
| Phase F — ServiceLocator | `[x]` | ✅ 完成 | `service_locator.rs` 完整实现 ServiceManager → 服务遍历，`tasks.md` L115 中"stub" 注释已过时 |
| Phase G — 12 个 IReflection 方法 | `[x]` | ❌ **严重缺失** | 12 个核心方法（`get_battle_tag`、`get_account_id`、`get_match_info`、`get_medal_info`、`get_decks`、`get_collection`、`get_arena_deck`、`get_battleground_rating_info`、`get_server_info`、`get_game_type`、`is_spectating`、`is_game_over`）**全部** 为桩，仅 `is_mulligan` 与调试用 `dump_class` / `list_services` 有真实逻辑 |
| Phase H — TS API + IPC + Renderer | `[x]` | ⚠️ 部分完成 | TS Wrapper、IPC 通道、preload bridge、单元测试齐备且符合 design D7/D8/D9；但任务描述的 `App.tsx` 顶部条 / `Dashboard.tsx` 状态卡接入在 PR diff 中**完全不存在**（仅 `routes.tsx` 做了无关重构）|

---

## 阻塞性问题（Blocker）

### B1. 12 个 IReflection 方法均为桩实现（与 tasks.md 严重不符）

- **文件路径**：
  - `packages/hearthmirror/native/src/reflection/battle_tag.rs:11-17`
  - `packages/hearthmirror/native/src/reflection/account_id.rs:15`
  - `packages/hearthmirror/native/src/reflection/decks.rs:26`
  - `packages/hearthmirror/native/src/reflection/collection.rs:16`
  - `packages/hearthmirror/native/src/reflection/arena.rs:18`
  - `packages/hearthmirror/native/src/reflection/battlegrounds.rs:15`
  - `packages/hearthmirror/native/src/reflection/server.rs:19`
  - `packages/hearthmirror/native/src/reflection/match_info.rs:32`
  - `packages/hearthmirror/native/src/reflection/medal_info.rs:27`
  - `packages/hearthmirror/native/src/reflection/game_state.rs:6/11/16`
- **问题描述**：所有上述方法仅做 `let _ = runtime; Ok(None)` 或返回常量 `Ok(false)/Ok(0)`。它们对应 `proposal.md` 中的整个数据采集目标（NetCache、CollectionManager、GameMgr、GameState 等）。`tasks.md` 在 G.1–G.10 全部打勾，但代码与之严重不一致——这是项目最根本的"输出有用数据"功能。
- **为什么是阻塞**：
  1. 桥接的全部价值在于为渲染层提供真实游戏数据；当前任何调用都返回 null/false/0，UI 即使全部接好也只能显示空状态。
  2. tasks.md 的状态标记误导了下游（README、ADR 0001 中"实现状态"段、文档审计），合并后会让其他贡献者误以为可直接消费这些 API。
- **建议修复**：
  1. 立刻将受影响的 G.1–G.10 子任务在 `tasks.md` 中改回未完成。
  2. 按 `proposal.md` 中详细规格逐一实现：通过 `service_locator::get_service` 取得对应服务，使用 `MonoClass::field_offset` + `ProcessMemory` 读取字段，复合对象按 `MonoObject::read_object_field` 链式遍历，集合调用 `collections::list/dictionary/map`。
  3. 每一个方法补一份"无 Hearthstone 时返回 None / 字段缺失时降级"的单元/集成测试。

### B2. 渲染层集成（`App.tsx`、`Dashboard.tsx`、Status Panel）缺失

- **文件路径**：`apps/desktop/src/renderer/src/`（`App.tsx`、`Dashboard.tsx` 在本 PR 中无任何变更，新增 hook `hooks/use-hearthmirror-status.ts` 已存在但**未在任何组件中被引用**）
- **问题描述**：
  - `tasks.md` H.3.1 / H.3.2 / H.3.3 标记完成，对应需求是"在 Dashboard 显示 Hearthmirror 在线状态、玩家名"等。
  - 实际 `git diff main..HEAD -- apps/desktop/src/renderer/src/` 仅包含 `routes.tsx` 的一次格式化重构，没有任何 hearthmirror 相关 UI 接入。
  - 新建的 `useHearthMirrorStatus` hook 没有任何调用方，相当于 dead code。
- **为什么是阻塞**：渲染层是 Phase H 的可见交付物；如果不真实接入，连"桥接通了"这件事都无法在产品中验证，与 ADR 0001 验收门 4 不符。
- **建议修复**：
  1. 在 `Dashboard.tsx` 顶部或侧栏插入"Hearthmirror 状态卡"组件，订阅 `useHearthMirrorStatus()`。
  2. 在 `App.tsx` 标题栏 / 状态栏展示 `isAlive` 指示灯与 `playerName`。
  3. 补充对应的 `@testing-library/react` 渲染测试（Mock `window.hdt.hearthmirror`）。

### B3. `metadata/tables.rs` 手写 PE / 元数据解析，违背 design D2

- **文件路径**：`packages/hearthmirror/native/src/metadata/tables.rs`（特别是 `locate_cli_metadata`、`parse_metadata_streams`、`parse_typedef_table`）
- **问题描述**：
  - design.md D2 明确写道：生产代码使用 `pelite` 完成 PE / metadata 解析。
  - 现实现完全自行解析 `IMAGE_DOS_HEADER` / `IMAGE_NT_HEADERS` / CLI Header / `#~` Stream，且只支持 `TypeDef`，不实现 `FieldDef`、`MethodDef` 等 Phase G 必需的表。
  - 自实现的解析对压缩元数据 token、`StringHeapSize`/`GuidHeapSize`/`BlobHeapSize` 引用宽度、字段排序异常等情况缺乏防御。
- **为什么是阻塞**：
  1. 与设计文档相矛盾，未走过 ADR 流程就替换技术选型。
  2. Phase G 的真正实现需要 Field / Method 表来定位字段偏移（部分类无法仅靠 `MonoClass::fields` 遍历完成），现有手写实现无法支撑 Phase G 完成。
- **建议修复**：
  1. 引入并使用 `pelite::PeFile` 处理 PE 头与 `Resources/CliHeader`，再通过 `pelite::pe32::Pe` 提供的 metadata helper 或额外 crate（如 `dnlib`/`assembly_inspector`）解析 `#~`。
  2. 至少完整支持 `TypeDef` / `Field` / `MethodDef`（含 token 解码 / heap 索引宽度判断），并补单测覆盖 `Assembly-CSharp.dll` 真实样本。

---

## 重要问题（Important）

### I1. 引入 `iced-x86` 与 design.md D3 决策冲突

- **文件路径**：`packages/hearthmirror/native/Cargo.toml`、`packages/hearthmirror/native/src/disasm.rs`、`packages/hearthmirror/native/src/mono/runtime.rs`（提交 `686fbd6 Restore iced-x86 disassembly`）
- **问题描述**：design D3 明确"不引入完整反汇编引擎，使用字节模式匹配"。但 `Cargo.toml` 中保留 `iced-x86`，并在 `disasm.rs` 中调用 `Decoder` 解析 `mov [rax+disp]`、`lea ... [rip+disp]`。Spike 报告（0002）中也表明字节模式匹配可行。
- **影响**：增加二进制体积；偏离已记录的架构决策；提交 `Restore iced-x86 disassembly` 表明此改动是反复引入而未在 design / ADR 中讨论。
- **建议修复**：
  - 路径 A：移除 `iced-x86`，按 spike 02 的字节模式 (`8B 80 ?? ?? ?? ??`、`48 8D 05 ?? ?? ?? ??`) 在 `disasm.rs` 内重写小型解析器。
  - 路径 B：若确实必须保留 `iced-x86`，**先更新 design.md D3** 并在 ADR 0001 中追加一条"D3 已被覆盖"的决策记录，写明权衡。

### I2. `MonoRuntime` 全局 `Mutex` + `block_on` 的并发模型风险

- **文件路径**：`packages/hearthmirror/native/src/lib.rs:23-43`、64-175
- **问题描述**：
  - 静态 `Mutex<Option<MonoRuntime>>` 包裹运行时；每个 `#[napi] async fn` 都先获取锁，然后通过 `futures::executor::block_on` 同步执行内部 async 调用。
  - `MonoRuntime` 持有 `OwnedProcessHandle`（`unsafe impl Send`），其内部内存读取调用是阻塞 syscall。
  - 这导致：
    1. **串行化所有调用**：`Dashboard` 5 秒 poll + `dumpClass` + `getDecks` 等无法并发，完全违反 ADR 0001 中"单次内存读取性能：优"目标。
    2. **`block_on` 阻塞 napi worker 线程**：napi-rs 的 async worker 池里的线程被锁死等待 syscall，等价于`tokio::block_in_place`未启用时的反模式。
    3. **潜在死锁**：若任何 internal `async fn` 通过 `napi::tokio_runtime` 再调度回 napi 线程（未来扩展），将形成跨锁回环。
- **建议修复**：
  - 由于内部反射方法实质都是同步阻塞 syscall，应当：
    1. 将 `reflection::*::*_internal` 改为同步 `fn(&MonoRuntime) -> Result<...>`，取消 `async`。
    2. 在 `#[napi]` 函数中使用 `napi::tokio::task::spawn_blocking` / `napi::Task` API 在阻塞线程池中执行，避免锁住 napi worker。
  - 如果短期内无法重构，至少把 `Mutex` 换成 `parking_lot::Mutex`（错误语义更清晰）并在文档里明确每个 IPC 调用都是串行的。

### I3. `enumerate_modules_32bit` 固定 1024 槽，存在越界 panic 风险

- **文件路径**：`packages/hearthmirror/native/src/process.rs:66-100`
- **问题描述**：
  ```rust
  let mut modules = [HMODULE::default(); 1024];
  // EnumProcessModulesEx(...);
  let count = needed as usize / size_of::<HMODULE>();
  for hmod in &modules[..count] { ... }
  ```
  当目标进程加载 ≥1024 个模块（一些被注入的安卓模拟器、反作弊、overlay 软件常见），`needed` 会大于 `1024 * 8 = 8192`，导致 `count > 1024`，随后 `&modules[..count]` 切片越界 panic。
- **建议修复**：
  1. 先用 `EnumProcessModulesEx(handle, null, 0, &mut needed, ...)` 取得真实大小；
  2. `let mut modules: Vec<HMODULE> = vec![HMODULE::default(); needed as usize / size_of::<HMODULE>()];` 再调用一次；
  3. 用 `min(count, modules.len())` 兜底。

### I4. 模块枚举中错误处理策略不一致

- **文件路径**：`packages/hearthmirror/native/src/process.rs:83-98`
- **问题描述**：
  - `GetModuleBaseNameW` 失败 → `continue`（静默跳过）。
  - `GetModuleInformation` 失败 → `?` 直接将整个 `enumerate_modules_32bit` 短路为 `Err`。
  - 单个模块拿不到 info 不应该拖垮整个流程，因为我们其实只关心 `mono` 模块。
- **建议修复**：将两个调用统一为"失败 → continue 并通过 `tracing::debug!` 记录"，仅在没有任何模块成功匹配 `mono` 关键字时返回 `ScryError::ModuleNotFound`。

### I5. `*.node` 二进制被提交到 Git 仓库

- **文件路径**：`packages/hearthmirror/native/hearthmirror-native.win32-x64-msvc.node`（被 `git ls-files` 列出）
- **问题描述**：
  - `proposal.md` Non-goals 明确写明"不实现 prebuild 二进制分发，走 source-only + postinstall napi build"。
  - 但 `.node` 二进制目前在版本库中，PR 中也确实更新了它，使代码评审无法 review，且会随时间膨胀仓库体积。
  - 还会带来供应链审计问题：审查者无法知晓二进制是否对应当前源码。
- **建议修复**：
  1. 在 `.gitignore` 中加入 `packages/hearthmirror/native/*.node`；
  2. `git rm --cached packages/hearthmirror/native/hearthmirror-native.win32-x64-msvc.node`；
  3. 在 `package.json` `postinstall` 中执行 `napi build --release`（或 `pnpm -F @hdt/hearthmirror-native build`），保证开发者首次安装时本地构建。

### I6. preload 与 ipc 仅暴露调试通道，缺少 12 个核心 API 通道

- **文件路径**：`apps/desktop/src/main/ipc.ts`、`apps/desktop/src/preload/index.ts`、`apps/desktop/src/renderer/tests/{ipc,preload}.test.ts`
- **问题描述**：测试 `setup.ts` 中 `window.hdt.hearthmirror` 列出全部 16 个方法（说明 type 层期望全部暴露），但 `ipc.test.ts` / `preload.test.ts` 仅断言 `isMulligan / dumpClass / listServices`；查 `ipc.ts` 也只 `swallow` 注册了这三个通道。
- **影响**：即便 Rust 端补齐 12 个反射方法，渲染层目前也无法调用，`window.hdt.hearthmirror.getBattleTag()` 在运行时会抛 "no handler registered for hearthmirror:getBattleTag"。
- **建议修复**：在 `ipc.ts` / `preload/index.ts` 中将 12 个核心方法对应通道全部注册并通过 `swallow` 包装；并在测试中覆盖每个通道的成功 / 异常路径。

---

## 次要问题（Minor）

### M1. `RemotePtr::add` 使用 `wrapping_add` 可能掩盖逻辑错误

- **文件路径**：`packages/hearthmirror/native/src/remote_ptr.rs:35-37`
- **问题描述**：`u32::wrapping_add` 在偏移量异常（例如错误的 offset 表配置）时静默环绕到低地址，反射调用读到错误的内存可能仍"看似"返回了字节，导致难以定位的 bug。
- **建议修复**：默认使用 `checked_add`，溢出时返回 `ScryError::Unsupported { reason: "remote pointer overflow" }`；如确有少量需要环绕语义的位置，单独提供 `wrapping_add()` 显式方法。

### M2. `is_mulligan_internal_source()` 测试基于源码字符串切片，过于脆弱

- **文件路径**：`packages/hearthmirror/native/src/reflection/mulligan.rs:32-43`
- **问题描述**：测试通过 `include_str!` + `find()` 两次定位"`pub async fn is_mulligan_internal`"和下一个 `pub` 关键字，断言其内容包含特定模式。该方式：
  - 在重命名 / 拆分 / 重新格式化时会假阳性失败；
  - 实际上没有验证函数行为，只验证了源码片段。
- **建议修复**：移除该测试，转而以 mock `MonoRuntime`（trait + 假实现）对真实行为做单元测试；其他反射模块的测试也应同样。

### M3. `tasks.md` 中 Phase F 的 NOTE 已过时

- **文件路径**：`openspec/changes/add-hearthmirror-bridge/tasks.md:115`
- **问题描述**：注释仍说 `service_locator.rs` 当前是 stub，但实际已是完整实现。误导后续阅读者。
- **建议修复**：删除或改写为"已实现，接受 ServiceManager 偏移配置"。

### M4. `lib.rs::try_init` 命名与签名不符

- **文件路径**：`packages/hearthmirror/native/src/lib.rs:25-27`
- **问题描述**：`try_init` 通常意味着返回 `Result<_, _>`；当前实现是 `fn() -> Option<MonoRuntime>` 内部吞掉了所有错误。当 Hearthstone 没运行时直接返回 `None` 是合理的，但调用方无法区分"没运行"与"运行了但 mono 解析失败"。
- **建议修复**：改名为 `try_attach_or_none` 或返回 `Result<Option<MonoRuntime>, ScryError>`，并在 `is_alive` 中区分这两种状态（向上层暴露错误码或日志）。

### M5. `is_alive` 实现重复了 `with_runtime` 的锁逻辑

- **文件路径**：`packages/hearthmirror/native/src/lib.rs:64-73`
- **问题描述**：`is_alive` 没有走 `with_runtime`，而是重复了一次锁 + 初始化逻辑。维护成本高，且容易在未来修改时遗漏。
- **建议修复**：让 `with_runtime_or` 接受 `Option<&MonoRuntime>` 形态；或者新增一个 `runtime_initialized() -> bool` 内部 helper，被 `is_alive` 与 `with_runtime` 共用。

### M6. `unsafe impl Send for OwnedProcessHandle` 缺少安全注释

- **文件路径**：`packages/hearthmirror/native/src/handle.rs`
- **问题描述**：`HANDLE` 在 Win32 中跨线程使用是合法的，但当前 `unsafe impl Send` 没有 `// SAFETY:` 注释解释依据。`#[deny(clippy::missing_safety_doc)]` 未开启的情况下编译能过，但代码审计不友好。
- **建议修复**：补充 `// SAFETY: Win32 HANDLE 在跨线程使用上是 thread-safe，本结构体只在 drop 时调用 CloseHandle，且持有期间不会被移交给其他线程并发使用。`

### M7. `reflection/debug.rs::dump_class_internal` 默认列出 64 字段没有上限保护配置

- **文件路径**：`packages/hearthmirror/native/src/reflection/debug.rs`
- **问题描述**：调试通道在意外类（例如有几百个字段）时会一次性序列化所有 `FieldDumpEntry`，可能堵塞 IPC。建议传一个 `limit` 参数或在 ipc.ts 中限制响应大小。

### M8. `bundled_unity_2021_3.json` 偏移与版本绑定方式

- **文件路径**：`packages/hearthmirror/native/src/mono/offsets.rs`、`unity-2021.3.json`
- **问题描述**：默认 bundled 文件名带 unity 主次号，但 `OffsetProber` 在探测失败时没有日志告知"使用了哪一份 bundled offsets"。一旦炉石升级到不同 unity build，调试将十分困难。
- **建议修复**：在 `MonoRuntime::init` 时通过 `tracing::info!` 输出"loaded offsets: bundled-unity-2021.3 (sha256=...)"，并将 `unity_version` 字段加入到 `MonoOffsets` 元信息。

---

## 测试与构建建议

1. **Rust 集成测试**：tasks D.6 / E.6 / F.2 / G.11 都提到 `#[cfg(feature = "integration")]`，但仓库内只有 `MonoRuntime::init` 的烟雾测试。建议为以下场景补充：
   - `collections::list/dictionary/map` 在合成内存（基于 `MockProcessMemory` trait 抽象 `ProcessMemory`）下的遍历正确性；
   - `service_locator::get_service` 真实命中 `NetCache` / `GameMgr`；
   - 12 个反射方法（实现后）每个至少一项"无 Hearthstone → None"的烟雾测试。
2. **TypeScript 端缺测**：
   - `hearthmirror.test.ts` 未覆盖"native 抛错 → wrapper 返回 null"路径的全部分支；
   - `apps/desktop/src/renderer/tests/` 下没有 React 组件层面的渲染测试，无法验证 `useHearthMirrorStatus` 接入后 UI 的回退行为。
3. **CI 门禁**：
   - 增加 `pnpm -F @hdt/hearthmirror-native build` 步骤，确保 Rust 工具链正常；
   - 在 CI 中加入"`*.node` 不可被 `git add`" 的 lint（pre-commit hook 或 CI grep）。
4. **依赖精简**：移除 `iced-x86`（见 I1），评估 `tokio` 的 feature 是否需要 `rt-multi-thread`（结合 I2 重构后可降级为 `rt`）。
5. **文档同步**：在 `docs/adr/0001-hearthmirror-bridge.md` 的 "实现状态" 段落补充准确的进度，避免后续开发者误判。

---

## 是否建议合并到主分支

**否——必须修复后才能合并**。

最低合并门槛（Must-fix）：
1. **B1 / B2 / B3 / I6** 这四项（核心反射方法、UI 接入、PE 解析方案、IPC 通道完整性）至少要全部补齐或拆分成可单独审查的小 PR；
2. **I3 / I5** 必须在合并前修复（潜在 panic、不可分发的二进制）；
3. `tasks.md` 的进度需与代码现状对齐。

其他 Important / Minor 问题可在合并前列入跟踪 issue 推进。

---

## 修复 TODO 清单

### 高优先级（合并前必修）

- [ ] **B1**：完成 12 个 IReflection 方法的真实实现（battle_tag / account_id / decks / collection / arena / battlegrounds / server / match_info / medal_info / game_state * 3）。
- [ ] **B2**：在 `App.tsx` / `Dashboard.tsx` 接入 `useHearthMirrorStatus`，提供可见的连接状态/玩家名展示，并补 React 渲染测试。
- [ ] **B3**：用 `pelite` 重写 `metadata/tables.rs`，至少完整支持 TypeDef / FieldDef / MethodDef，并补对应单测。
- [ ] **I3**：动态分配 `enumerate_modules_32bit` 的模块缓冲区，消除越界 panic。
- [ ] **I5**：将 `*.node` 加入 `.gitignore`，从仓库剔除，并在 `postinstall` 接入构建脚本。
- [ ] **I6**：在 `apps/desktop/src/main/ipc.ts` / `preload/index.ts` 中暴露并测试 12 个核心方法对应的 IPC 通道。
- [ ] 修订 `tasks.md`：将 G.1–G.10、H.3.x 等未完成的子任务恢复为未勾选，附 TODO。

### 中优先级（合并前建议修复，或开 follow-up issue）

- [ ] **I1**：决策 `iced-x86`：要么按 spike 02 的字节模式重写 `disasm.rs` 并删除依赖；要么显式更新 design D3 + ADR。
- [ ] **I2**：重构 `MonoRuntime` 并发模型，将反射调用迁移到 `spawn_blocking`，避免阻塞 napi worker 线程并消除全局串行化。
- [ ] **I4**：统一 `process.rs` 模块枚举中两个 Win32 调用的错误处理策略（统一 continue + log）。

### 低优先级（可后续清理）

- [ ] **M1**：`RemotePtr::add` 改用 `checked_add`，明确错误语义。
- [ ] **M2**：替换 `is_mulligan_internal_source` 风格的脆性测试为基于行为的测试。
- [ ] **M3**：清理 `tasks.md` Phase F 中过时的 `service_locator` stub 注释。
- [ ] **M4**：重命名或调整 `lib.rs::try_init` 的签名。
- [ ] **M5**：消除 `is_alive` 与 `with_runtime` 之间重复的锁逻辑。
- [ ] **M6**：为 `unsafe impl Send for OwnedProcessHandle` 补充 `// SAFETY:` 注释。
- [ ] **M7**：为 `dump_class` 增加字段数量上限或分页参数。
- [ ] **M8**：在加载 mono offsets 时输出一条 `tracing::info!`，附 unity 版本与 sha256。
- [ ] 补 Rust 集成测试（collections / service_locator / 反射方法）与 React 组件渲染测试。
