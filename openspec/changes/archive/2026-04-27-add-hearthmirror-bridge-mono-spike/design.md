## Context

Spike 01 已经证明 napi-rs 3.x + 跨架构 `ReadProcessMemory` 能可靠工作。但 ADR 0001 里 ⚠️ Mono runtime 漂移 还是被列为 "高概率 / 中影响" 风险。本 spike 目标是在 ≤ 1 天内消除这个风险。

约束：
- Hearthstone 是 32 位 Unity Mono。Unity 标准 embedded runtime DLL 名为 **`mono-2.0-bdwgc.dll`**（Boehm-Demers-Weiser 垃圾回收版本）。`Rewrite_Design.md` 当年写的 `mono.dll` 是错的，spike 02 必须先纠正这点。
- ASLR 已确认启用（spike 01 实测），所有地址在每次进程启动时都会变；spike 必须始终用 RVA + 运行时 base 计算 VA。
- `Rewrite_Design.md` §7.2 的偏移量来自 Unity 2021.3 (Mono 2.0)。当前炉石用什么版本未知 —— spike 必须先确认 Unity 版本，再决定偏移量是否能直接复用。
- spike 寿命 ≤ 1 工作日；teardown 必须干净。

## Goals / Non-Goals

**Goals:**

- 端到端验证从"找到 mono dll"到"读出 MonoDomain 关键字段"的 6 步链路。
- 写出一份可执行步骤+偏移量比对表+真实坑+对 `add-hearthmirror-bridge` 的建议的 spike 报告。
- spike 出口后 `git status` 干净，所有质量门绿。

**Non-Goals:**

- 不实现完整的 ServiceLocator / Reflection 模型。
- 不实现 ECMA-335 disk metadata 解析。
- 不解析任何 MonoClass / MonoObject / MonoArray（只验证 MonoDomain 一层）。
- 不修复任何偏移量偏差（仅记录）。
- 不写自动化测试（spike 验证靠人眼读 stdout）。
- 不在 renderer 加 UI（spike 触发走 main 自动跑）。

## Decisions

### D1: Mono DLL 名字 → 优先 `mono-2.0-bdwgc.dll`，回退到任何以 `mono` 开头的 DLL

**Context**: `Rewrite_Design.md` §7.1 写的是 `mono.dll`，但 Unity embedded runtime 实际是 `mono-2.0-bdwgc.dll`。

**Choice**: 在模块枚举时先精确匹配 `mono-2.0-bdwgc.dll`（大小写不敏感），找不到则降级遍历所有模块名包含 "mono" 的；都找不到才报"mono runtime not found"。

**Rationale**: 既适配 Unity 当前版本，也兼容未来 Unity 切别的 GC（比如 SGen → `mono-2.0-sgen.dll`），同时给将来切到 IL2CPP 留个明确的失败信号（IL2CPP 的炉石进程根本没有 `mono*.dll`）。

### D2: PE 导出表解析 → 手写最小解析（不引入 pelite/goblin）

**Context**: spike 02 只需要找 **一个** 导出函数（`mono_get_root_domain`）的 RVA，不需要完整 PE 解析。

**Options**:
- (a) `pelite` / `goblin`：高层 API 但要把 mono dll 整个 PE 字节读到本地 Buffer，这增加几百行 IO 代码。
- (b) **手写最小解析**：只需读 PE Header → DataDirectory[0] (Export Table) → 三个 RVA 数组（function addresses, name pointers, ordinals）→ 字符串匹配 `mono_get_root_domain`。约 150 行 Rust。

**Choice**: **(b) 手写**。spike 范围本来就小，依赖少；同时让我们在 spike report 里能确切说"PE 解析是 X 行代码、Y 个 ReadProcessMemory 调用"，对 `add-hearthmirror-bridge` 决策有帮助。

### D3: 反汇编 `mono_get_root_domain` 提取全局变量地址 → 模式匹配前 16 字节

**Context**: `mono_get_root_domain` 的实现通常是 `return mono_root_domain;`，编译为：

```
x86 (32-bit, common):
  A1 XX XX XX XX        mov eax, dword ptr [XX XX XX XX]
  C3                    ret
```

或（PIC 编译）：

```
  8B 05 XX XX XX XX     mov eax, dword ptr [rip + XX XX XX XX]    (但这是 64 位语法，32 位用立即地址)
  C3                    ret
```

或更复杂的（编译器内联了 NULL check）：

```
  55                    push ebp
  89 E5                 mov ebp, esp
  A1 XX XX XX XX        mov eax, dword ptr [XX XX XX XX]
  5D                    pop ebp
  C3                    ret
```

**Choice**: spike 不引入 disassembler crate（`iced-x86` / `capstone-rs` 都重）。改用**简单字节模式匹配**：从函数前 32 字节中找 opcode `A1`（MOV EAX, moffs32），后 4 字节即全局变量地址。如果模式匹配失败，spike report 记录原始字节，留给 `add-hearthmirror-bridge` 引入正经 disassembler。

### D4: napi-rs API 形状

```rust
#[napi(object)]
pub struct MonoSpikeResult {
  // L1
  pub pid: u32,
  pub mono_module_name: String,        // "mono-2.0-bdwgc.dll"
  pub mono_module_base: String,        // hex
  pub mono_module_size: u32,
  // L2
  pub pe_machine: String,              // "0x014C (i386)"
  pub pe_subsystem: String,            // "0x0002 (Windows GUI)"
  // L3
  pub mono_get_root_domain_rva: String,
  pub mono_get_root_domain_va: String,
  pub mono_get_root_domain_first_bytes: String,    // hex
  // L4
  pub global_root_domain_addr: String,             // 反汇编提取
  pub disasm_pattern: String,                      // "A1+ret" 或 "push ebp/mov eax/pop ebp/ret" 或 "unknown"
  // L5
  pub root_domain_ptr: String,                     // 解引用全局变量
  // L6
  pub domain_assemblies_ptr: String,
  pub loaded_images_ptr: String,
  // 元信息
  pub elapsed_micros: u32,
  pub notes: Vec<String>,                          // 任何非致命警告
}

#[napi]
pub async fn spike_locate_mono() -> napi::Result<MonoSpikeResult>
```

如果链路任意一步失败，返回 reject Promise；message 必须明确指出失败在哪一步（"step 3: mono_get_root_domain export not found in PE"）。

### D5: 主进程 SPIKE TRIGGER 块

复用 spike 01 的同样模板（dynamic import + try/catch + console.log），更换包名为 `@hdt/hearthmirror-mono-spike`，方法名为 `spikeLocateMono`。注释边界仍是 `// === SPIKE TRIGGER ===` 与 `// === END SPIKE ===`，方便 teardown grep。

### D6: 失败模式与 Decision Outcomes

| 失败模式 | spike 报告 | 后续动作 |
|---|---|---|
| `mono-2.0-bdwgc.dll` 找不到 → 炉石可能转 IL2CPP | 记录为 BLOCKER | 开 ADR 0002 重新评估整个项目（IL2CPP 完全不同的解析方式） |
| 找到 dll 但 PE 解析失败 | 记录字节 + 假设 | 引入 `pelite`，重做 spike |
| `mono_get_root_domain` 找不到（导出表里没有） | 记录可见的 mono_* 导出列表 | 可能 Unity 改名为 `mono_get_root_domain_internal` 或类似，spike report 给候选 |
| 反汇编模式匹配失败 | 记录原始字节 | `add-hearthmirror-bridge` 必须引入 `iced-x86` |
| 解引用拿到的 MonoDomain* 是 NULL 或越界 | spike PARTIAL | 可能炉石未完全启动 / 用户未登录 / Mono 还没初始化；建议先等"主菜单"再跑 |
| §7.2 偏移量与实测偏差大 | spike PARTIAL，列出新偏移 | `add-hearthmirror-bridge` 在 design 中加版本偏移量表 |

### D7: spike 出口的 teardown 范围

按 spike 01 同样标准：
- 删 `packages/hearthmirror-mono-spike/`
- 删 main/index.ts 的 `=== SPIKE TRIGGER ===` 至 `=== END SPIKE ===` 块
- 删 `apps/desktop/package.json` 的 spike 依赖
- `pnpm install` 重生成 lockfile
- 质量门全绿

## Risks / Trade-offs

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| 反汇编模式匹配失败（编译器优化产生意外指令序列） | 中 | 中 | 接受；spike 仍然能输出原始字节，由人眼判断或留给后续 |
| Mono GC 在 spike 跑的瞬间 mark 了某个 MonoDomain 字段，导致读到的指针不一致 | 极低 | 低 | spike 只读取 domain 顶层指针，不深度遍历，时间窗口 < 1 ms |
| 炉石"主菜单未完全加载"时 mono_root_domain 还是 NULL | 中 | 中 | spike report 明确说"必须等到主菜单加载完毕再触发"，建议在炉石主菜单出现 5 秒后再启动 dev |
| `mono-2.0-bdwgc.dll` 实际名字不一样（如 `mono-2.0-sgen.dll` 或 `Mono.dll`） | 低 | 中 | D1 已经做了 prefix 匹配 fallback |
| pelite / goblin 不引入但手写 PE 解析有 off-by-one bug | 中 | 中 | 接受；spike 出错时可以加 pelite 重做（成本 < 30 min） |
| Anti-cheat / EAC 在炉石主菜单后启用 ReadProcessMemory 拦截 | 低 | 高 | spike 01 已经验证主菜单状态可读；spike 02 不进对局，风险等同 spike 01 |

## Open Questions

- **OQ1**: 炉石的 Unity 版本到底是多少？答：spike 期间用 `findstr /c:"Unity 20" Hearthstone\Hearthstone.exe`（粗略字符串扫描）或读 `globalgamemanagers` 文件可以确认；spike 不强求，记录到 report 即可。
- **OQ2**: 是否要顺便验证 `mono_image_loaded` 或 `mono_class_get` 等其他导出函数？答：不在本 spike 范围。本 spike 只验证 `mono_get_root_domain`，"PE 导出表能解析" 这件事就足够推广到其他函数。
- **OQ3**: 如果 spike 通过，`add-hearthmirror-bridge` 是否可以直接用 `pelite` 而不是手写 PE 解析？答：可以（生产代码用 pelite 更安全），spike 02 的"手写"决策只为减少 spike 范围。
