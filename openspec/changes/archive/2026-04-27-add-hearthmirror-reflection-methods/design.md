## Context

`add-hearthmirror-bridge` 完成了 12 个 `#[napi]` 反射函数的签名 + 桩，但函数体清一色是 `let _ = runtime; Ok(None)` / `Ok(false)` / `Ok(0)`。要把这些桩换成真实实现，需要：

1. **每个方法的字段路径**：`ServiceManager → Service → field → field → … → 终值`，由对应的 C# 端 [HearthSim/HearthMirror](https://github.com/HearthSim/HearthMirror) 与 [HDT 主仓](https://github.com/HearthSim/Hearthstone-Deck-Tracker) 提供 ground truth
2. **集合遍历**：`List<T>` / `Dictionary<K,V>` / 自定义 `Map<K,V>` 都已在 `mono::collections` 中有实现，只需正确调用
3. **字段偏移定位**：当前 `MonoClass.fields` 链表遍历可解决 90% 的字段，剩余依赖 ECMA-335 `Field` 表 → 由 [`add-hearthmirror-metadata-reader`](../add-hearthmirror-metadata-reader/) 提供
4. **null/部分缺失语义**：所有 `#[napi]` 函数永不 reject，字段链路任一环 `NULL` 时返回 `Ok(None)` 或对应 boolean / 0

## Goals / Non-Goals

**Goals:**

- 12 个反射方法返回真实业务数据（炉石主菜单运行 + 用户登录时）
- 每个方法两层测试：mock 单测（构造合成 MonoObject 链）+ feature-gated 集成测试（炉石运行时）
- 字段路径表写入 `docs/superpowers/research/2026-04-20-hearthmirror-field-paths.md`，有版本号、提取来源 commit、对应 C# 类名
- 永不 panic，永不 reject Promise；字段缺失返回业务级 `null`
- 修复 `add-hearthmirror-bridge` `tasks.md` 中 G.1–G.10 的虚假完成状态

**Non-Goals:**

- 不重写 metadata reader（依赖 [`add-hearthmirror-metadata-reader`](../add-hearthmirror-metadata-reader/)）
- 不改并发模型（[code review I2](../../../.worktrees/integrate-hearthmirror-rs/docs/superpowers/plans/2026-04-20-add-hearthmirror-bridge-code-review.md) 全局 Mutex + block_on 的重构留给单独 change）
- 不实现额外反射 API（如 SecretsManager / GameMgr 内部状态）
- 不修复 `iced-x86` 决策冲突（code review I1）
- 不引入版本探测（针对炉石客户端版本切换字段路径），但留出扩展点

## Decisions

### Decision 1: 字段路径来源

- **Context**: 12 个方法各自的字段链路是炉石客户端内部细节，必须有可信来源
- **Options**:
  - **A. C# `HearthSim/HearthMirror` 仓库**：开源、近年仍在维护、就是为这件事而存在的 ground truth
  - **B. 自行运行炉石 + dnSpy 反编译猜测**：耗时大、易错
  - **C. HDT C# 主仓 (`Hearthstone-Deck-Tracker`)**：实际消费者，但抽象在 HearthMirror 之上
- **Choice**: **A** 为主、**C** 为辅
- **Rationale**: HearthMirror 的 `Reflection.cs` 文件每个方法 1-1 对应；ground truth 直接拷贝过来；HDT 仓库可作为字段含义的 cross-reference

### Decision 2: 字段路径硬编码 vs 配置文件

- **Context**: 字段名（如 `m_netCacheValues` / `BattleTag`）会随炉石版本漂移；硬编码在 Rust 里需要每次发版重编
- **Options**:
  - **A. 硬编码字符串常量**：简单、与代码同生命周期；版本漂移时改 Rust 源 + 重编
  - **B. 抽到 JSON 配置**（类似 `mono/offsets.rs` 的 `bundled_unity_2021_3.json`）：版本漂移时改配置无需重编；但 Rust 端要写 JSON schema、加载器、版本选择逻辑
- **Choice**: **A 硬编码字符串**，但所有字符串集中在 `reflection/field_paths.rs` 的 `pub const` 里
- **Rationale**:
  1. 当前没有版本探测能力，B 的好处兑现不了
  2. 字段名变更频率经验值：≤ 2 次/年；硬编码 + 重编可接受
  3. 集中在一个文件便于将来迁移到 JSON
  4. 跟 [`add-hearthmirror-metadata-reader`](../add-hearthmirror-metadata-reader/) 输出的 token 互相独立，便于单测

### Decision 3: 反射 helper API 设计

- **Context**: 12 个方法有大量重复的"读 service → 读 field → 取 string / int / object → 续读"模式
- **Options**:
  - **A. 每个方法独立写所有内存读**：重复严重，3000 行 boilerplate
  - **B. 在 `MonoObject` 上加 `read_string_field(name)` / `read_int32_field(name)` / `read_object_field(name) -> Option<MonoObject>` 链式 helper**：每个方法 ~30 行
  - **C. macro DSL**：表达力强但调试难
- **Choice**: **B**
- **Rationale**: 平衡可读性与精简度；helper 都返回 `Option<T>`，链式 `?` 风格容错；macro 留作未来重构选项

### Decision 4: 集成测试 gate

- **Context**: 真正验证字段路径正确，必须有炉石进程；CI 没有炉石环境
- **Options**:
  - **A. 默认跑、CI 跳过**：用 `#[ignore]` 标记，本地手动跑 `cargo test -- --ignored`
  - **B. cargo feature gate**：`#[cfg(feature = "hearthstone-running")]`，CI 不开
  - **C. 运行时检测**：测试代码内 `if HearthstoneProcess::find().is_none() { return; }`
- **Choice**: **C**（首选）+ **A**（备选，对耗时长的）
- **Rationale**:
  1. 开发者本地跑 `cargo test` 一次性既看到 mock 单测也跑集成测试，体验最好
  2. 集成测试自动 skip 无炉石环境（在 stderr 打 `SKIP: no Hearthstone process found`），不需要记 ignore flag
  3. cargo feature 在 CI 也方便保留 0 二进制变化

### Decision 5: 版本兼容（前向）

- **Context**: 炉石每两周 patch，可能调字段名；本 change 必须设计好"漂移时如何失败"
- **Options**:
  - **A. 字段缺失静默返回 null**：用户无感
  - **B. 字段缺失返回 null + `eprintln!` warn (HM_LOG=1 时)**：开发者能看到
  - **C. 字段缺失返回 Err，napi 层吞掉返回 null**：没意义
- **Choice**: **B**
- **Rationale**: 用户视角永远 graceful；开发者视角能定位问题；与现有 `mono/offsets.rs` 的 HM_LOG 风格一致

## Risks / Trade-offs

- **R1**：字段路径研究阶段如果跳过，逐方法实现时会反复来回查 → **缓解**：研究文档先 commit；12 个方法的字段表全部就绪后再开始实现
- **R2**：12 个方法虽然结构同质，但 `getDecks` / `getCollection` 涉及大型集合（数千张卡）的内存遍历，性能可能成问题 → **缓解**：`list/dict/map iter` 已有 `max_items=50000` 上限；为大集合方法补 benchmark assert ≤ 200 ms
- **R3**：依赖 [`add-hearthmirror-metadata-reader`](../add-hearthmirror-metadata-reader/) 完成；如果 metadata change 推迟，本 change 中部分方法（涉及 generic / static-only 类）无法实现 → **缓解**：先做不依赖 metadata 的 8 个方法；剩余 4 个等 metadata change merge

### 性能 / 安全 / 兼容性

- **性能**：单方法 < 50 ms（mock）；集成测试 < 500 ms（真实炉石）；`getCollection` < 200 ms（5000 张卡）
- **安全**：所有 `unsafe` 已封装在底层 `ProcessMemory`；本 change 不新增 `unsafe`；napi 层永不 reject
- **兼容性**：仅适用于当前炉石稳定版本（写明在研究文档中，含 build number）；版本漂移时返回 null + warn

## 最终目录树

```
packages/hearthmirror/native/src/reflection/
├── mod.rs
├── field_paths.rs         # 新增：所有字段路径常量集中
├── battle_tag.rs          # 改写
├── account_id.rs          # 改写
├── game_state.rs          # 改写（getGameType / isSpectating / isGameOver）
├── match_info.rs          # 改写
├── medal_info.rs          # 改写
├── decks.rs               # 改写
├── collection.rs          # 改写
├── arena.rs               # 改写
├── battlegrounds.rs       # 改写
├── server.rs              # 改写
└── debug.rs               # 不变

packages/hearthmirror/native/src/mono/
├── object.rs              # 新增 read_*_field 链式 helper
└── ... (其余不变)

docs/superpowers/research/
└── 2026-04-20-hearthmirror-field-paths.md   # 字段路径研究文档（先于实现）
```

## Migration Plan

- **顺序**：研究文档 → mono::object helper → 不依赖 metadata 的 8 个方法（每个 1 commit）→ 待 [`add-hearthmirror-metadata-reader`](../add-hearthmirror-metadata-reader/) merge → 剩余 4 个方法
- **回滚**：每个方法独立 commit，可单独 revert
- **下游**：[`add-hearthmirror-renderer-status`](../add-hearthmirror-renderer-status/) 在 `getBattleTag` + `isAlive` + `getMedalInfo` 三个方法 ready 时即可启动（无需等全部 12 个完成）

## Open Questions

- ❓ 字段路径研究文档要不要包含每个字段的 binary offset？
  - **倾向**：否；offset 由运行时探测，文档只列字段名链路与对应 C# 源行
- ❓ `getDecks` 是否需要按"卡组类型"过滤（standard / wild / classic）？
  - **倾向**：返回完整列表，让 TS 层过滤；保持 reflection 与展示分层
- ❓ 是否在 `napi` 层加重试（首次返回 null 时立刻再读）？
  - **倾向**：否；polling 由调用方（renderer 5 秒 tick）负责
