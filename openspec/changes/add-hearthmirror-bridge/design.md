## Context

ADR 0001 与两份 spike report 已经把"做什么 / 怎么做"的架构问题钉死。本 design 聚焦"按什么顺序做、每个模块的边界在哪、风险在哪"。

约束（来自 ADR 0001 binding constraints + spike 经验）：

- 64 位 napi-rs 同进程，`x86_64-pc-windows-msvc` 单 target
- `RemotePtr(u32)` 强类型隔离，`OwnedProcessHandle` RAII
- 永不 panic（`clippy::unwrap_used` / `expect_used` / `panic` CI 门禁）
- mono dll fallback 链：`mono-2.0-bdwgc.dll` → `mono-2.0-sgen.dll` → `mono-2.0-boehm.dll` → 任何 `mono-*.dll`
- 偏移量动态探测，禁止硬编码 §7.2
- 优先用 `loaded_images` 而非 `domain_assemblies`
- ECMA-335 disk metadata 用 `pelite`（生产代码不再手写 PE 解析）
- 集合遍历必须有 max-iterations 安全上限

## Goals / Non-Goals

**Goals:**

- 提供产品级 `@hdt/hearthmirror` 包（Rust crate + TS 高层 API + IPC bridge）
- 12 个核心 IReflection 方法签名稳定、永不 panic、与原版 HearthSim HearthMirror 同名同义
- 运行时**首次** IPC 调用 ≤ 200 ms（含 mono locate + offset 探测），**稳态**单方法 ≤ 10 ms
- Renderer 端 Dashboard 的 BattleTag / 段位 / Game Running 状态在炉石运行时显示真实数据，未运行时显示 mock fallback 不白屏
- 单元测试 ≥ 30 个、集成测试 ≥ 8 个（带"需炉石"标签）
- 全套质量门绿，包括 `cargo clippy` 静态门禁

**Non-Goals:**

- 不实现剩余 50+ 方法
- 不做内存页缓存
- 不做版本适配静态偏移量表（始终运行时探测）
- 不实现自动重连 watchdog
- 不实现 prebuild 二进制分发矩阵（CI 仅 source-only `napi build`）
- 不替代 `Decklist.tsx` 的 enrichment（依赖 hearthwatcher 的另一个 change）
- 不阻塞 / 等待 IL2CPP 兼容

## 整体架构

```
┌──────────────────────────────────────────────────────────┐
│ Renderer (React)                                         │
│ Dashboard.tsx                                            │
│   ├─ const { battleTag, medal, alive } = useHearthMirror()│
│   └─ fallback: mock data                                 │
└──────────────────────┬───────────────────────────────────┘
                       │ IPC (window.hdt.hearthmirror.*)
┌──────────────────────▼───────────────────────────────────┐
│ Main Process (Electron)                                  │
│ apps/desktop/src/main/                                   │
│   ├─ hearthmirror.ts (lifecycle / lazy connect)          │
│   └─ ipc.ts: 13 handlers                                 │
└──────────────────────┬───────────────────────────────────┘
                       │ require('@hdt/hearthmirror')
┌──────────────────────▼───────────────────────────────────┐
│ packages/hearthmirror/ (TypeScript)                      │
│   ├─ HearthMirror class (12 async methods)               │
│   ├─ types: Card / Deck / MatchInfo / ...                │
│   ├─ MirrorError + MirrorErrorCode                       │
│   └─ require('hearthmirror-native') ← native module      │
└──────────────────────┬───────────────────────────────────┘
                       │ napi-rs cdylib (.node)
┌──────────────────────▼───────────────────────────────────┐
│ packages/hearthmirror/native/ (Rust)                     │
│ ┌──────────────────────────────────────────────────────┐ │
│ │  ffi.rs: #[napi] exports (per Reflection method)     │ │
│ ├──────────────────────────────────────────────────────┤ │
│ │  reflection/  per-method orchestration               │ │
│ │  service_locator/  GetService("X") lookup            │ │
│ │  collections/  List/Dict/Map traversal               │ │
│ │  metadata/     pelite + ECMA-335 #~ stream parser    │ │
│ ├──────────────────────────────────────────────────────┤ │
│ │  mono/                                                │ │
│ │   ├─ runtime.rs  locate mono-2.0-bdwgc.dll           │ │
│ │   ├─ image.rs    walk loaded_images, find class      │ │
│ │   ├─ class.rs    field offset map                    │ │
│ │   ├─ object.rs   read instance fields                │ │
│ │   ├─ array.rs    read MonoArray                      │ │
│ │   ├─ string.rs   read UTF-16 MonoString              │ │
│ │   └─ probe.rs    dump-and-validate offset discovery  │ │
│ ├──────────────────────────────────────────────────────┤ │
│ │  Foundation                                           │ │
│ │   ├─ remote_ptr.rs  RemotePtr(u32) newtype           │ │
│ │   ├─ handle.rs      OwnedProcessHandle (RAII)        │ │
│ │   ├─ memory.rs      ProcessMemory + read primitives  │ │
│ │   ├─ process.rs     find_pid / enumerate modules     │ │
│ │   └─ error.rs       ScryError + napi::Error mapping  │ │
│ └──────────────────────────────────────────────────────┘ │
└──────────────────────┬───────────────────────────────────┘
                       │ Win32 API: ReadProcessMemory etc.
┌──────────────────────▼───────────────────────────────────┐
│ Hearthstone.exe (32-bit Mono process)                    │
└──────────────────────────────────────────────────────────┘
```

## 文件结构

```
packages/hearthmirror/
├── package.json               # name @hdt/hearthmirror, type module, main src/index.ts
├── tsconfig.json
├── vitest.config.ts
└── src/
    ├── index.ts               # barrel: HearthMirror, types, errors
    ├── hearthmirror.ts        # class HearthMirror { connect / disconnect / 12 methods }
    ├── types.ts               # Card / Deck / Collection / MatchInfo / ... interfaces
    ├── enums.ts               # GameType / FormatType / Side / etc.
    ├── errors.ts              # MirrorError + MirrorErrorCode
    └── tests/
        ├── hearthmirror.test.ts  # mock native module, verify class behavior
        └── types.test.ts         # type-only tests (compile-time)

packages/hearthmirror/native/
├── package.json               # napi build config
├── Cargo.toml                 # napi 3, napi-derive 3, windows 0.58, pelite 0.10
├── build.rs
├── README.md
└── src/
    ├── lib.rs                 # napi exports (entry only)
    ├── ffi.rs                 # #[napi] functions per IReflection method
    ├── error.rs               # ScryError → napi::Error
    ├── remote_ptr.rs          # RemotePtr(u32) newtype
    ├── handle.rs              # OwnedProcessHandle (Drop=CloseHandle)
    ├── process.rs             # find_pid, enumerate 32-bit modules
    ├── memory.rs              # ProcessMemory + typed reads
    ├── mono/
    │   ├── mod.rs             # MonoRuntime entry
    │   ├── runtime.rs         # locate mono dll, mono_get_root_domain, root domain
    │   ├── image.rs           # MonoImage (find_class)
    │   ├── class.rs           # MonoClass (fields map)
    │   ├── field.rs           # MonoClassField
    │   ├── object.rs          # MonoObject (instance fields)
    │   ├── array.rs           # MonoArray
    │   ├── string.rs          # MonoString (UTF-16 → String)
    │   ├── value.rs           # MonoValue enum (variant)
    │   └── probe.rs           # dump-and-validate offset discovery
    ├── metadata/
    │   ├── mod.rs             # MetadataReader entry
    │   ├── stream_table.rs    # #~ stream parser
    │   ├── tables.rs          # TypeDef / Field tables
    │   └── signatures.rs      # field signature blob parser
    ├── collections/
    │   ├── mod.rs
    │   ├── list.rs            # C# List<T>
    │   ├── dict.rs            # C# Dictionary<K, V>
    │   └── custom_map.rs      # Hearthstone custom Map<K, V>
    ├── service_locator.rs     # GetService("X") lookup
    └── reflection/
        ├── mod.rs
        ├── battle_tag.rs      # GetBattleTag
        ├── account_id.rs      # GetAccountId
        ├── game_state.rs      # GetGameType / IsSpectating / IsGameOver
        ├── match_info.rs      # GetMatchInfo
        ├── medal_info.rs      # GetMedalInfo
        ├── decks.rs           # GetDecks
        ├── collection.rs      # GetCollection
        ├── arena.rs           # GetArenaDeck
        ├── battlegrounds.rs   # GetBattlegroundRatingInfo
        └── server.rs          # GetServerInfo
```

## Decisions

### D1: 内部 8 个 Phase + 每 Phase 独立 commit

**Context**：本 change 是 spec-driven 工作流里**最大的**一个，2000–3000 行 Rust + 800–1200 行 TS。一气呵成 apply 风险高。

**Choice**：apply 阶段严格按 Phase A → H 顺序推进，每 Phase 完成后单独 commit + push。任何 Phase 内的失败可以从该 Phase 重启而不影响前面。

**Rationale**：单一 OpenSpec change 包住所有内容（用户选 A 的偏好），但实施时仍享受 incremental delivery 的好处。如果发现某个 Phase 工作量爆炸，可以中途 spawn 一个 follow-up change 把它独立出去。

### D2: PE 解析 → 生产用 `pelite`，不再手写

**Context**：spike 02 用 ~150 行手写 PE 解析跑通了。生产代码不该这样。

**Choice**：`packages/hearthmirror/native/Cargo.toml` 加 `pelite = "0.10"`。在 `metadata/` 子模块用 `PeFile` 处理磁盘 `Assembly-CSharp.dll`；在 `mono/runtime.rs` 找 `mono_get_root_domain` 时也改用 `pelite::PeView::module(buf)` 处理从内存 dump 出来的 PE 段。

**Rationale**：spike 是 throw-away；生产代码要 well-tested。pelite 处理了很多边界（forwarder exports、ordinal-only exports）。代价：~50 KB binary size 增加，可忽略。

### D3: 字节模式反汇编 → 暂用 byte pattern，不引入 `iced-x86`

**Context**：spike 02 `mono_get_root_domain` 的 `A1+ret` 模式一次过。

**Choice**：`mono/runtime.rs` 的反汇编保留两个模式（`A1 [4] C3` 和 `55 89 E5 A1 [4] 5D C3`，与 spike 02 一致），如果两个都不匹配则返回 ScryError 并提示用户报告字节序列。**不**引入 `iced-x86`。

**Rationale**：YAGNI。如果未来某个 Mono 函数用了不同模式，再视情况引入 disassembler。

### D4: 偏移量探测策略 → dump 0x100 字节 + pointer chasing 验证

**Context**：spike 02 已证明 `MonoDomain.domain_assemblies` 漂移；ADR 0001 binding constraint #5 强制偏移探测。

**Choice**：在 `mono/probe.rs` 实现一个通用 `probe_struct_offset(memory, base, expected_kind)` 函数，对一个内存区域：
1. 读取 0x100 字节（MonoDomain / MonoImage / MonoClass 都不会更大）
2. 把它当作 `[u32; 64]` 数组（4 字节对齐的指针 slot）
3. 对每个 slot 验证它是否指向"看起来像 X 类型"的目标（X 由调用方提供 validator）
4. 第一个通过验证的 slot 就是该字段的偏移

具体到 `MonoDomain.loaded_images`：validator = "解引用得到 MonoGList，其 .data 不为 NULL，再解引用得到看起来像 MonoImage（指向一段以 'M', 'Z' 开头的 PE 头或 name 字段是合理 ASCII 字符串）"。

探测结果在 `MonoRuntime` 内**缓存**（按 `mono_module_base` 为 key），同一会话内只算一次。

**Rationale**：每次启动 < 100 ms 的探测开销可以接受。比维护"已知偏移量表"简单且对炉石更新自动适应。

### D5: ECMA-335 disk metadata → 强制走 `pelite::PeFile::from_bytes`

**Context**：HDT.js 业务逻辑（如 ServiceLocator 的 GetService）需要按"类全名 → MonoClass*"查找。Mono 运行时本身没有"按全名找类"的 API（只有 `mono_class_get` 按 token 找）。所以必须先从磁盘读 `Assembly-CSharp.dll` 的 TypeDef 表拿到 token，再调 `mono_class_get` 拿 MonoClass*。

**Choice**：`metadata/` 子模块用 pelite 直接读 disk 文件，解析 #~ stream → TypeDef 表 → Field 表。从 `mono_module_base` 通过 PE 解析能拿到 mono dll 在炉石安装目录中的路径，进一步推算出同目录下 `Assembly-CSharp.dll` 的位置。

**Fallback**：如果路径推算失败（ASLR 不影响磁盘路径，但用户可能装在非默认目录），从 `MonoImage.raw_data` 字段读取（指向 mmap 的元数据起点，与 disk 等价但避免 IO）。Phase D 的 task 包含两条路径都实现。

### D6: 集合遍历的安全上限

**Context**：Mono 集合（List/Dict/Map）在 GC 期间可能短暂不一致，遍历可能死循环。

**Choice**：所有集合遍历函数都接受一个 `max_items` 参数（默认 50000，即使大型炉石卡组库也不会到这个量级）。超过则返回 `ScryError::CollectionOverflow` 并停止。

**Rationale**：防御性编程。50000 比真实业务上限大几个数量级，正常使用永远不会触发。

### D7: TypeScript HearthMirror class 生命周期

```typescript
class HearthMirror {
  private nativeSession: NativeSession | null = null;

  /** Lazy: connects on first method call. Idempotent. */
  async connect(): Promise<void>;

  /** Frees native handles. After disconnect, methods reject. */
  async disconnect(): Promise<void>;

  get isConnected(): boolean;

  /** Quick check whether Hearthstone is running. */
  async isAlive(): Promise<boolean>;

  // 12 reflection methods, all returning Promise<T | null>
  // null = data unavailable (process gone / data not in memory yet)
  // throw = programming error or unexpected fatal
  async getBattleTag(): Promise<BattleTag | null>;
  async getAccountId(): Promise<AccountId | null>;
  async getGameType(): Promise<GameType>;
  async isSpectating(): Promise<boolean>;
  async isGameOver(): Promise<boolean>;
  async getMatchInfo(): Promise<MatchInfo | null>;
  async getMedalInfo(): Promise<MedalInfo | null>;
  async getDecks(): Promise<Deck[] | null>;
  async getCollection(): Promise<Card[] | null>;
  async getArenaDeck(): Promise<ArenaInfo | null>;
  async getBattlegroundRatingInfo(): Promise<BattlegroundRatingInfo | null>;
  async getServerInfo(): Promise<GameServerInfo | null>;
}
```

**Choice**：所有业务方法返回 `Promise<T | null>` —— 与原版 HearthSim HearthMirror 行为对齐（`null` = 数据缺失，调用方易处理）。仅生命周期方法 `connect/disconnect` reject 致命错误。

### D8: IPC 失败语义

**Context**：renderer 端调用 `await window.hdt.hearthmirror.getBattleTag()`，可能：
- 主进程未连接 hearthmirror 或炉石未运行 → 解决为 `null`
- 主进程连接成功但 BattleTag 数据不在内存（炉石未登录）→ 解决为 `null`
- 主进程内部 panic → reject Promise（用户能 try/catch）
- 通道不存在（preload 未注册）→ TypeScript 类型层面拦不住，运行时 reject

**Choice**：IPC handler 模式：

```typescript
ipcMain.handle('hearthmirror:getBattleTag', async () => {
  try {
    const hm = await ensureHearthMirror();
    return await hm.getBattleTag();   // null on data missing
  } catch (e) {
    console.error('[hearthmirror:getBattleTag]', e);
    return null;                       // 不 reject，避免 renderer 端处理 try/catch
  }
});
```

**Rationale**：12 个方法的所有失败路径在 main 端 swallow 成 `null`，让 renderer 永远只需要判 `if (data === null) showFallback()`，不需要 try/catch 矩阵。**唯一 reject 的场景**是 lifecycle handler `hearthmirror:isAlive` —— 它本就是布尔，无 null。

### D9: Renderer 集成范围（Dashboard 顶部 3 字段）

**Context**：proposal Non-goals 限制了 UI 集成范围。但要"看得见效果"。

**Choice**：

`apps/desktop/src/renderer/src/components/Dashboard.tsx` 顶部当前有 3 个 mock 元素（在 `App.tsx` 的 header 而非 Dashboard 内）：

1. `<Monitor /> Game Running` 状态条 → 改为 `await window.hdt.hearthmirror.isAlive()`，alive=true 显示绿点 "Game Running"，false 显示灰点 "Game Not Running"
2. `<User /> PlayerOne` 用户名 → 改为 `await window.hdt.hearthmirror.getBattleTag()` 的 `.name` 字段，null 显示 "Not Connected"
3. Dashboard 内顶部 "Legend" 段位 → 改为 `await window.hdt.hearthmirror.getMedalInfo()` 的 `standard.legendRank`（如有）或 `standard.starLevel`，null 显示 mock "Legend"

每 5 秒 polling（不引入 SSE/EventEmitter）。

**Rationale**：3 字段足以演示 hearthmirror 工作；polling 简单可靠；将来 hearthwatcher 来后会引入 push-based 更新，那是别的 change 的事。

### D10: 测试策略

| 类别 | 范围 | 是否需炉石 |
|---|---|---|
| Rust 单元测试 | `RemotePtr` 类型行为、`ScryError` 转换、`pelite` 解析 fixture .dll、集合遍历 mock 数据、字节模式匹配 | ❌ |
| Rust 集成测试 | 完整连接炉石 + 跑 12 个方法各一次 | ✅ |
| TS 单元测试 | `HearthMirror` 类生命周期、`MirrorError` 类型守卫 | ❌（mock native module） |
| TS 集成测试 | preload + IPC + renderer fallback 行为 | ❌（mock IPC handler） |

集成测试用 `#[cfg(feature = "integration")]` gated，CI 不跑（CI 上没炉石）；本地用 `cargo test --features integration` 触发。

### D11: 不做版本检测，靠探测

**Context**：`Rewrite_Design.md` §7.3 提议维护"已知 Mono 版本对应偏移量表"。

**Choice**：放弃。Phase C 的偏移探测覆盖所有需要的字段，不需要版本号。

**Rationale**：减小维护负担。每次炉石更新只需要重跑一次 spike，不需要上架新偏移表。如果未来探测开销太大（超过 200 ms），再考虑缓存到磁盘。

## Risks / Trade-offs

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| 工作量大于预期（2000+ 行 Rust 写不完） | 中 | 高 | 8 个 Phase 严格独立 commit，万一某 Phase 卡住可以 spawn 子 change 隔离；最坏可以只交付 Phase A-G 把 H（UI 集成）留给 follow-up |
| MonoDomain.loaded_images 实际遍历出错（GList 链表损坏 / 空指针） | 中 | 中 | 集合遍历有 max-iterations 上限；每个指针 deref 都验证非零非越界 |
| ECMA-335 disk metadata 解析在炉石某 build 失败（pelite 不兼容某种 PE 配置） | 低 | 中 | Phase D 加 fallback 到 raw_data 内存读取 |
| 偏移探测速度过慢（> 500 ms）影响 dev experience | 低 | 中 | 探测结果按 mono base 缓存；首次开销可接受（炉石主菜单本身就要 10+ 秒加载） |
| 12 个方法中某个找不到对应 mono class（炉石改 namespace） | 中 | 低 | 每个 reflection 方法都返回 `null` on class-not-found，单方法失败不影响其他方法 |
| Defender 在长时间反复 ReadProcessMemory 后报警 | 低 | 高 | 监控 spike 长跑稳定性；如出现，建议用户加入 Defender 例外（在 README） |
| napi-rs cdylib 在 Electron production build 中加载失败 | 低 | 高 | Phase H 必须验证 `pnpm package` 能产出可双击运行的 .exe |
| `pelite` API 与磁盘 `Assembly-CSharp.dll` 不兼容 | 低 | 中 | Phase D 单元测试用真实 fixture |
| `add-card-database` 的 hotfix 经验提示我们 main bundle 路径解析很坑 | 中 | 中 | hearthmirror native 用 `import.meta.url` 计算 .node 文件位置（同 cards.ts 经验） |

## Open Questions

- **OQ1**: ServiceLocator 的"GetService" 用什么 key？答：HearthSim HearthMirror 用类型全名字符串（如 `"NetCache"`），spike F 阶段确认。
- **OQ2**: 是否要把 hearthmirror 的 IPC 也加进 `cards-ipc` 一样的 fallback stub？答：是。Phase H 的 `apps/desktop/src/renderer/tests/setup.ts` 必须 stub `window.hdt.hearthmirror.*` 的 12 个方法返回 null。
- **OQ3**: getDecks 返回的 deck 是否要解码成 deckstring 形式？答：不。返回的 Deck 类型已含 dbfId 数组，调用方（add-deck-management）自己用 `@hdt/hearthdb`.encodeDeck 编码。
- **OQ4**: Dashboard polling 间隔 5 秒会不会太频繁？答：5 秒是平衡；hearthmirror 开销低（~5 ms/call）。如有性能问题再调到 15 秒。
