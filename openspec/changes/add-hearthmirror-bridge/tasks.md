> 实施约定：8 个 Phase（A–H）严格独立 commit。每 Phase 完成后跑 `cargo build`/`pnpm typecheck`/`pnpm test` 局部验证，全部 8 个 Phase 完成后再跑全套质量门 + final commit。
> Conventional Commits：`feat(hearthmirror):` / `chore:` / `test:` / `docs:` / `build:` 视情况。
> 工作目录 `D:\code\HDT_js`。

## 0. 准备阶段

- [ ] 0.1 在根 `eslint.config.js` ignores 加 `'packages/hearthmirror/native/**'`（Rust 不进 ESLint）。
- [ ] 0.2 在 `tsconfig.base.json` paths 加 `"@hdt/hearthmirror": ["./packages/hearthmirror/src/index.ts"]`。
- [ ] 0.3 commit：`build(hearthmirror): scaffold tsconfig + eslint config for new package`。

---

## Phase A — Foundation（无需炉石可测）

- [ ] A.1 创建目录 `packages/hearthmirror/native/src/{mono,metadata,collections,reflection}`。
- [ ] A.2 创建 `packages/hearthmirror/native/Cargo.toml`：

  ```toml
  [package]
  name = "hearthmirror-native"
  version = "0.1.0"
  edition = "2021"
  publish = false

  [lib]
  crate-type = ["cdylib"]

  [dependencies]
  napi = { version = "3", default-features = false, features = ["napi9", "async"] }
  napi-derive = "3"
  pelite = "0.10"

  [dependencies.windows]
  version = "0.58"
  features = [
    "Win32_Foundation",
    "Win32_System_Threading",
    "Win32_System_Diagnostics_ToolHelp",
    "Win32_System_ProcessStatus",
    "Win32_System_Diagnostics_Debug",
    "Win32_System_LibraryLoader",
    "Win32_System_Memory",
  ]

  [build-dependencies]
  napi-build = "2"

  [profile.release]
  lto = true
  ```

- [ ] A.3 创建 `packages/hearthmirror/native/build.rs`、`packages/hearthmirror/native/package.json`（仿 spike 02）。
- [ ] A.4 创建 `packages/hearthmirror/native/src/error.rs`：定义 `pub enum ScryError { ProcessNotFound, AccessDenied, MemoryAccess { addr: u32, reason: String }, ClassNotFound { name: String }, FieldNotFound { class: String, field: String }, ModuleNotFound, MonoNotInitialized, MetadataError(String), DisasmPatternUnknown { bytes: Vec<u8> }, CollectionOverflow, Unsupported(String) }` + `From<windows::core::Error> for ScryError` + `From<ScryError> for napi::Error`。
- [ ] A.5 创建 `packages/hearthmirror/native/src/remote_ptr.rs`：`pub struct RemotePtr(pub u32)` + `impl Add<u32>` + `Display` + `From<u32>`（仅显式构造器，不允许从 usize 隐式转）。
- [ ] A.6 创建 `packages/hearthmirror/native/src/handle.rs`：`OwnedProcessHandle` RAII。
- [ ] A.7 创建 `packages/hearthmirror/native/src/process.rs`：`find_pid(name) -> Option<u32>` + `enumerate_modules_32bit(handle)`。
- [ ] A.8 创建 `packages/hearthmirror/native/src/memory.rs`：`pub struct ProcessMemory { handle: OwnedProcessHandle }` + 方法 `read_bytes(addr: RemotePtr, len: usize)` / `read_u8/u16/u32/u64/i32/i64/f32/f64` / `read_remote_ptr` / `read_cstring(addr, max)` / `read_mono_string(addr)` （UTF-16）。
- [ ] A.9 创建 `packages/hearthmirror/native/src/lib.rs`：`pub mod error; pub mod remote_ptr; pub mod handle; pub mod process; pub mod memory;`（先把 mod 立起来，后续 Phase 扩充）。
- [ ] A.10 跑 `cargo build --release` 在 `packages/hearthmirror/native/`，期望成功。
- [ ] A.11 写单元测试 `packages/hearthmirror/native/src/memory.rs#[cfg(test)]`：用本进程内存（一个 `static mut U32: u32 = 0xDEADBEEF;` + 自己的 PID + OpenProcess(GetCurrentProcessId())) 验证 `read_u32` 返回 0xDEADBEEF。
- [ ] A.12 跑 `cargo test --release`，期望通过。
- [ ] A.13 commit：`feat(hearthmirror): Phase A — foundation (RemotePtr, OwnedProcessHandle, ScryError, ProcessMemory)`。

---

## Phase B — Mono runtime locate（需炉石主菜单运行才能集成测试）

- [ ] B.1 创建 `packages/hearthmirror/native/src/mono/mod.rs`：`pub struct MonoRuntime { memory, mono_module: ModuleInfo, root_domain: RemotePtr, offsets: MonoOffsets }`。
- [ ] B.2 创建 `packages/hearthmirror/native/src/mono/runtime.rs`：实现 `find_mono_module(memory)` 用 D2 决策的 fallback 链 + `pelite::PeView::module(buf)` 解析 PE → 找 `mono_get_root_domain` 导出 → 字节模式匹配（A1+ret / push ebp 序列）→ 解引用得 `RemotePtr` (root_domain)。
- [ ] B.3 在 `mono/runtime.rs` 加 `MonoRuntime::init(memory)` 接口。
- [ ] B.4 commit：`feat(hearthmirror): Phase B — mono runtime locate via PE export + byte pattern`。

---

## Phase C — 偏移量探测（无需炉石可单测，需要炉石做集成验证）

- [ ] C.1 创建 `packages/hearthmirror/native/src/mono/probe.rs`：实现 `probe_field_offset(memory, base, validator)` 按 design D4 描述。
- [ ] C.2 在 `mono/runtime.rs` 加 `discover_offsets(memory, root_domain) -> MonoOffsets`：
  - `MonoDomain.loaded_images`：validator = "解 GList，data 指向看起来像 MonoImage（前 8 字节非全零）"
  - `MonoImage.name`：validator = "指向以 ASCII 可打印字符开头的 cstring"
  - `MonoImage.assembly_name`：同上
  - `MonoClass.name` / `MonoClass.fields` / `MonoClassField.offset`：暂留空 stub，Phase E/F 用到时再探测。
- [ ] C.3 创建 `packages/hearthmirror/native/src/mono/image.rs`：`MonoImage::find_class(memory, runtime, namespace, name) -> Result<RemotePtr>` —— 走 ECMA-335 token 路径（依赖 Phase D），暂留 stub。
- [ ] C.4 commit：`feat(hearthmirror): Phase C — dynamic offset probing for MonoDomain/MonoImage`。

---

## Phase D — ECMA-335 disk metadata（无需炉石可单测）

- [ ] D.1 创建 `packages/hearthmirror/native/src/metadata/mod.rs`：`pub struct MetadataReader { pe: PeFile<'static> }` + `from_disk(path)` / `from_memory(bytes)`。
- [ ] D.2 创建 `packages/hearthmirror/native/src/metadata/stream_table.rs`：解析 #~ stream 头（基于 pelite 的 CLI 头读取），输出 table row counts 与 row pointers。
- [ ] D.3 创建 `packages/hearthmirror/native/src/metadata/tables.rs`：`TypeDefRow { namespace_idx, name_idx, field_list_idx }` + `FieldRow { flags, name_idx, signature_idx }`。
- [ ] D.4 在 `MetadataReader` 实现 `find_class_token(namespace, name) -> Option<u32>`：扫 TypeDef 表，按字符串匹配。
- [ ] D.5 在 `mono/image.rs` 完成 `find_class` 使用 metadata token。
- [ ] D.6 单测：在 `metadata/tests/fixtures/` 放一个 minimal `Assembly-CSharp.dll`（可以用 Roslyn 编译一个含 namespace `Test.Foo` 的小 C# 项目；或直接复制炉石的，但要小心 license）。
- [ ] D.7 commit：`feat(hearthmirror): Phase D — ECMA-335 metadata reader (pelite + #~ stream + TypeDef/Field tables)`。

---

## Phase E — 集合遍历（无需炉石可单测）

- [ ] E.1 创建 `packages/hearthmirror/native/src/collections/mod.rs` + 子模块 `glist.rs` / `list.rs` / `dict.rs` / `custom_map.rs`。
- [ ] E.2 实现 `glist::iter(memory, head, max_items)` 遍历 MonoGList 链表。
- [ ] E.3 实现 `list::iter(memory, list_ptr, max_items)` 读 `_items` (MonoArray) + `_size` (i32)。
- [ ] E.4 实现 `dict::iter / dict::lookup(key: i32)` 按 .NET Dictionary 内部布局遍历 / 查找。
- [ ] E.5 实现 `custom_map::iter / lookup` 按 Hearthstone 自定义 Map 布局（参考 `Rewrite_Design.md` §4.1 collections.rs 段）。
- [ ] E.6 单测：mock 内存数据（构造一个本进程内的 List<int> 替身，验证 iter 拿到 10 个元素）。
- [ ] E.7 commit：`feat(hearthmirror): Phase E — collection iterators with max-items safety`。

---

## Phase F — ServiceLocator（需炉石做集成测试）

- [ ] F.1 创建 `packages/hearthmirror/native/src/service_locator.rs`：实现 design D6 决策的 lookup 流程。
- [ ] F.2 集成测试（gated `#[cfg(feature = "integration")]`）：连炉石 → `get_service("NetCache")` 返回 Some。
- [ ] F.3 commit：`feat(hearthmirror): Phase F — ServiceLocator with s_runtimeServices fallback`。

---

## Phase G — 12 个 Reflection 方法（需炉石做集成测试）

> 每个方法独立小 commit；每个方法的 native 实现 + napi-rs 暴露 + （可选）单元测试一起提。

- [ ] G.1 `reflection/battle_tag.rs` + napi `getBattleTag()` 暴露。
- [ ] G.2 `reflection/account_id.rs` + `getAccountId()`。
- [ ] G.3 `reflection/game_state.rs` 实现 `getGameType()` / `isSpectating()` / `isGameOver()` 三个相关方法。
- [ ] G.4 `reflection/match_info.rs` + `getMatchInfo()`。
- [ ] G.5 `reflection/medal_info.rs` + `getMedalInfo()`（含四个赛季）。
- [ ] G.6 `reflection/decks.rs` + `getDecks()`。
- [ ] G.7 `reflection/collection.rs` + `getCollection()`。
- [ ] G.8 `reflection/arena.rs` + `getArenaDeck()`。
- [ ] G.9 `reflection/battlegrounds.rs` + `getBattlegroundRatingInfo()`。
- [ ] G.10 `reflection/server.rs` + `getServerInfo()`。
- [ ] G.11 在 `lib.rs` 注册全部 12 个 napi 暴露面，跑 `pnpm exec napi build --platform --release` 验证编译，检查 `index.d.ts` 含 13 个签名。
- [ ] G.12 commit：`feat(hearthmirror): Phase G — 12 IReflection methods (BattleTag/AccountId/GameState/MatchInfo/MedalInfo/Decks/Collection/Arena/Battlegrounds/Server)`（可分 commit；上述列表是任务粒度）。

---

## Phase H — TypeScript API + IPC + Renderer 集成

### H.1 TypeScript 包 `@hdt/hearthmirror`

- [ ] H.1.1 创建 `packages/hearthmirror/{package.json, tsconfig.json, vitest.config.ts}`，声明 dependency `"hearthmirror-native": "file:./native"`（或 workspace ref）。
- [ ] H.1.2 创建 `packages/hearthmirror/src/{index.ts, hearthmirror.ts, types.ts, enums.ts, errors.ts}`。
- [ ] H.1.3 `errors.ts`：`MirrorError` + `MirrorErrorCode`（按 spec hearthmirror-api）。
- [ ] H.1.4 `types.ts`：12 个返回类型 interface（按 spec）。
- [ ] H.1.5 `hearthmirror.ts`：`class HearthMirror` 实现 lazy connect + 12 方法转发 + isAlive。
- [ ] H.1.6 `vitest`：mock native module（用 vitest mock + import.meta.vitest），验证 lazy connect / disconnect / 方法签名。
- [ ] H.1.7 commit：`feat(hearthmirror): Phase H.1 — TypeScript HearthMirror class with mock-based unit tests`。

### H.2 主进程 IPC

- [ ] H.2.1 创建 `apps/desktop/src/main/hearthmirror.ts`：`ensureHearthMirror()` 单例 + lazy connect。
- [ ] H.2.2 修改 `apps/desktop/src/main/ipc.ts`，加 13 个 handler（13 = 1 isAlive + 12 reflection），全部按 design D8 swallow exception → 返回 null/false。
- [ ] H.2.3 修改 `apps/desktop/src/preload/index.ts`，扩展 `hdt.hearthmirror` 命名空间（13 方法签名）。
- [ ] H.2.4 修改 `apps/desktop/electron.vite.config.ts`，把 `@hdt/hearthmirror` 加进 `WORKSPACE_INLINE`（与 `@hdt/hearthdb` 同处理）。
- [ ] H.2.5 修改 `apps/desktop/package.json` 加 `"@hdt/hearthmirror": "workspace:*"` 依赖。
- [ ] H.2.6 跑 `pnpm install && pnpm typecheck` 确认零错误。
- [ ] H.2.7 commit：`feat(desktop): Phase H.2 — wire hearthmirror IPC and preload bridge`。

### H.3 Renderer 集成

- [ ] H.3.1 创建 `apps/desktop/src/renderer/src/hooks/use-hearthmirror-status.ts`：5 秒 polling 封装 isAlive + getBattleTag + getMedalInfo。
- [ ] H.3.2 修改 `apps/desktop/src/renderer/src/App.tsx` 顶部 header：使用 `useHearthMirrorStatus` 替换 `Game Running` + `PlayerOne` mock。
- [ ] H.3.3 修改 `apps/desktop/src/renderer/src/components/Dashboard.tsx`：把 `MOCK_STATS.currentRank` 替换为 hook 返回的真实段位。
- [ ] H.3.4 修改 `apps/desktop/src/renderer/tests/setup.ts`：扩展 stub 含 13 个 hearthmirror 方法（全 stub 为 `null`/`false`）。
- [ ] H.3.5 跑 `pnpm test`，期望全部通过（49+ tests，可能 50+ 因为 hearthmirror TS 包加了几个）。
- [ ] H.3.6 commit：`feat(desktop): Phase H.3 — wire renderer header to hearthmirror polling with mock fallback`。

### H.4 dev 验证

- [ ] H.4.1 跑 `pnpm typecheck` / `pnpm lint` / `pnpm test` / `pnpm --filter @hdt/desktop build` 全套质量门，期望全 0 退出码。
- [ ] H.4.2 跑 `pnpm dev`，验证（炉石未运行）：顶部显示 "Game Not Running" + "Not Connected"，主窗口正常显示 FIRESTONE。
- [ ] H.4.3 [需用户配合] 跑 `pnpm dev`，验证（炉石主菜单运行 + 已登录）：顶部 5 秒内切换为 "Game Running" + 真实 BattleTag，Dashboard 段位也是真实数据。
- [ ] H.4.4 commit：`docs(hearthmirror): Phase H.4 — dev mode end-to-end verified`（如果有 minor fix）。

---

## 9. 收尾

- [ ] 9.1 同步 `openspec/changes/.NEXT.md`：把 `add-hearthmirror-bridge` 标 ✓，next 推荐 = `add-deck-management`（依赖 hearthmirror 提供的 `getDecks`）+ `add-hearthwatcher`。
- [ ] 9.2 在 `README.md` 当前进度段加 `[x] add-hearthmirror-bridge` 行。
- [ ] 9.3 把本文件全部 `[ ]` 改 `[x]`。
- [ ] 9.4 `openspec validate add-hearthmirror-bridge --strict` → valid。
- [ ] 9.5 `openspec status --change add-hearthmirror-bridge` → 4/4 done。
- [ ] 9.6 final commit：`docs(openspec): mark all tasks complete in add-hearthmirror-bridge`。
