## Context

ADR 0001 选定方案 D，但属于"基于推理"的决策。spike 的目的是在最小代价下端到端验证两个最高风险点：(1) napi-rs 3.x 在 Node 22 + Electron 33 下能否正常构建/加载；(2) 64 位 Rust 跨架构调标准 `ReadProcessMemory` 真的能读到 32 位炉石进程内存。

约束：

- **时间盒**：≤ 1 工作日（≤ 8 小时实际编码 + 验证 + 报告）。
- **代码寿命**：spike 包 `packages/hearthmirror-spike/` 在本 change 出口前**必须删除**（避免污染仓库与误导后续读者）。
- **不污染主分支稳定性**：spike 期间的 ipc handler 与 main 启动逻辑必须可独立 revert，且 teardown 后 `pnpm dev` / `pnpm test` / `pnpm lint` 仍全绿。
- **环境**：本机已具备 Rust 1.95.0 + cargo 1.95.0 + `x86_64-pc-windows-msvc` target，无需安装。

## Goals / Non-Goals

**Goals:**

- 让用户开/关炉石客户端各一次，分别看到主进程 stdout 输出符合 spike spec 的字段（场景 A 的 PID + base + MZ hex；场景 B 的 "process not found" 错误）。
- 写出一份可执行步骤+真实坑+性能基线的 spike 报告，供 `add-hearthmirror-bridge` 直接复用。
- 把 ADR 0001 状态从 Accepted 升级到 Validated。
- spike 出口后 `git status` 干净（spike 代码全部删除），`pnpm test` / `pnpm lint` / `pnpm typecheck` / `pnpm --filter @hdt/desktop build` 全部通过。

**Non-Goals:**

- 不写任何 Mono 解析、不暴露任何业务方法。
- 不优化 napi-rs 构建（不做 prebuild、不做 cross-compile、不做 strip）。
- 不写自动化测试（spike 验证靠人眼读 stdout）。
- 不在 renderer UI 上加任何按钮（spike 触发走主进程自动跑一次）。
- 不为 spike 配 ESLint / Prettier / typecheck（spike 包用 `eslint.config.js` 的 ignores 排除）。

## Decisions

### D1: spike 包形态 → 单文件 napi-rs 模块（不用 `napi new` 模板）

**Context**：`napi new` 会生成完整的发布模板（GitHub Actions、prebuild matrix、yarn 4 hooks、版本管理脚本），90% 内容对 spike 是噪音。

**Choice**：手写最小 napi-rs 配置。文件清单（仅 5 个）：

```
packages/hearthmirror-spike/
├── Cargo.toml
├── package.json
├── build.rs            # napi-build 输出 .d.ts
├── src/
│   └── lib.rs          # 全部 Rust 代码（< 150 行）
└── README.md           # 标记 "exploratory, do not depend"，spike 出口删
```

`napi build` CLI 会把构建产物写到 `packages/hearthmirror-spike/index.node` + `index.d.ts` + `index.cjs`，可被 Electron 主进程 `import`。

### D2: Cargo `[lib].crate-type` → `cdylib` only

**Choice**：`crate-type = ["cdylib"]`。不输出 `rlib` / `staticlib`，因为 spike 不被其他 Rust crate 依赖。

### D3: Rust 依赖 → 仅 4 个

| crate | 用途 | feature flags |
|---|---|---|
| `napi` v3 | NAPI 绑定 | `napi9`（Electron 33 用 NAPI 9） |
| `napi-derive` v3 | `#[napi]` 宏 | （default） |
| `napi-build` v2 | build.rs 生成 .d.ts | （default） |
| `windows` v0.58 | Windows API | `Win32_System_Threading`、`Win32_System_Diagnostics_ToolHelp`、`Win32_System_ProcessStatus`、`Win32_System_Diagnostics_Debug`、`Win32_Foundation` |

不引入 `windows-sys`（用 `windows` 高层封装更安全）；不引入 `thiserror`（spike 用 `napi::Error::from_reason(String)` 即可）。

### D4: API 形状 → 一个 `#[napi] async fn spike_read_mz() -> napi::Result<SpikeResult>`

**Context**：spec 要求 napi-rs 的暴露面必须返回 `Result`（永不 panic / abort）。`async fn` 让结果走 Promise 路径，与 ADR 0001 spec 中"reject Promise 而非 throw"对齐。

**Choice**：

```rust
#[napi(object)]
pub struct SpikeResult {
  pub pid: u32,
  pub base_address: String,   // hex 字符串如 "0x00400000"
  pub header_hex: String,     // 空格分隔的 16 字节 hex 如 "4D 5A 90 00 03 00 00 00 ..."
  pub elapsed_micros: u32,    // 整个 spike 调用耗时（含 OpenProcess 全程）
}

#[napi]
pub async fn spike_read_mz() -> napi::Result<SpikeResult>
```

虽然 Windows API 调用本身是同步的，套 `async` 是为了让 Node event loop 不阻塞（毕竟这个调用 ~100 µs–1 ms 量级），且 napi-rs 自动用线程池跑。

### D5: 进程查找策略 → CreateToolhelp32Snapshot + Process32First/Next

**Context**：常见替代是 `EnumProcesses`，但要 PID → 名字的反向映射比较麻烦。

**Choice**：`CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0)` 拿快照，`Process32FirstW/Next32W` 遍历 `PROCESSENTRY32W`，按 `szExeFile` 大小写不敏感匹配 `Hearthstone.exe`。

匹配多个进程时取第一个（spike 不需要处理多开场景，正式实现要再考虑）。

### D6: 模块基址枚举 → EnumProcessModulesEx + LIST_MODULES_32BIT

**关键坑**：64 位宿主进程读 32 位目标进程时，**必须**给 `dwFilterFlag` 传 `LIST_MODULES_32BIT (0x01)`，否则 `EnumProcessModulesEx` 在 64 位/32 位混合场景下返回空列表（这是 Windows API 文档明确说明的行为，但实践中很多人踩坑）。

调用序列：

```rust
unsafe {
  let h_process = OpenProcess(
    PROCESS_QUERY_INFORMATION | PROCESS_VM_READ,
    false, pid)?;
  let mut needed: u32 = 0;
  let mut modules = [HMODULE::default(); 1024];
  EnumProcessModulesEx(
    h_process,
    modules.as_mut_ptr(),
    (modules.len() * std::mem::size_of::<HMODULE>()) as u32,
    &mut needed,
    LIST_MODULES_32BIT)?;
  // 第 0 个 module 通常是主 exe（Hearthstone.exe）本身
  let base = modules[0];
  let mut buf = [0u8; 16];
  let mut read: usize = 0;
  ReadProcessMemory(
    h_process, base.0 as *const _, buf.as_mut_ptr() as *mut _,
    16, Some(&mut read))?;
  CloseHandle(h_process)?;
}
```

### D7: 错误处理 → ScryError → napi::Error 链

每个 unsafe 调用都返回 `windows::core::Result<T>`，spike 入口把它转成 `napi::Result<T>`：

```rust
fn map_err(e: windows::core::Error) -> napi::Error {
  napi::Error::from_reason(format!("Windows API failed: {} (HRESULT 0x{:08X})",
    e.message(), e.code().0))
}
```

如果 `Process32FirstW/Next32W` 遍历完没找到 Hearthstone：

```rust
return Err(napi::Error::from_reason("process not found: Hearthstone.exe is not running"));
```

这样 TypeScript 端 `await ... .spike_read_mz()` 直接 `try/catch` 拿到 `Error.message` 包含 "process not found"，符合场景 B 验收标准。

### D8: 主进程 spike 触发点 → app.whenReady() 之后异步跑一次

不在 IPC handler 里等用户触发（用户得切到 DevTools），而是 main 启动后自动跑一次：

```typescript
import { spikeReadMz } from '../../packages/hearthmirror-spike';
// 注意：用 dynamic import 避免 spike 模块加载失败带崩 main

void app.whenReady().then(async () => {
  registerIpc();
  createMainWindow();
  // === SPIKE TRIGGER (remove on teardown) ===
  try {
    const result = await spikeReadMz();
    console.log('[spike:readMz] OK:', result);
  } catch (err) {
    console.log('[spike:readMz] FAIL:', (err as Error).message);
  }
  // === END SPIKE ===
});
```

注释 `=== SPIKE TRIGGER ===` 与 `=== END SPIKE ===` 之间是删除范围标记，teardown 一目了然。

### D9: spike 包不进 lint/typecheck/CI

`eslint.config.js` 的 ignores 加 `packages/hearthmirror-spike/**`；spike 包没有 tsconfig；CI workflow 不需要改动（spike 出口前已删）。

但 `apps/desktop/src/main/index.ts` 引用 spike 模块时会被 typecheck 看到，要么：

- (a) 在 `packages/hearthmirror-spike/index.d.ts` 中提供 TypeScript 类型（`napi build` 自动生成）。
- (b) 在 main/index.ts 中 dynamic `import` 并 `as any` 处理。

**Choice**：(a) — `napi build` 自动产 .d.ts，零额外工作量。

### D10: spike 出口的 teardown 范围

teardown 必须删除：

- 整个目录 `packages/hearthmirror-spike/`
- `apps/desktop/src/main/index.ts` 中 `=== SPIKE TRIGGER ===` 至 `=== END SPIKE ===` 的全部代码
- `apps/desktop/src/main/ipc.ts` 中 spike 相关 handler（如有）
- `apps/desktop/src/preload/index.ts` 中 spike 相关 contextBridge 暴露（如有）
- `apps/desktop/src/renderer/src/env.d.ts` 中 spike 相关类型（如有）
- `package.json` 根级或 `apps/desktop/package.json` 中临时新增的 `@napi-rs/cli` dev dep（如装在哪一层都要清掉）

teardown 完成后，跑 `pnpm install`、`pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm --filter @hdt/desktop build` 全绿。

## Risks / Trade-offs

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| napi-rs 3.x 与 Electron 33 NAPI 9 ABI 不兼容 | 低 | 高 | spike 第一步先做 hello-world `.node` 模块加载，失败立刻终止 |
| `EnumProcessModulesEx` 在某些 Win11 24H2 build 上对游戏进程返回 ERROR_PARTIAL_COPY | 中 | 中 | spike 报告记录实际 OS build；如出现回退到 `CreateToolhelp32Snapshot(TH32CS_SNAPMODULE32)` |
| Hearthstone.exe 实际不是首个模块（可能是 launcher） | 中 | 低 | 改为遍历 modules 数组，拿到每个 `GetModuleBaseNameW` 后匹配字符串 |
| `OpenProcess` 即使用户态启动也被 Defender / EAC 拦截 | 中 | 高 | 在 spike 报告的"Decision Outcomes"明确：若发生则触发 ADR 0002 流程 |
| spike 代码意外被 commit 到 main 但未及时删除 | 中 | 中 | tasks.md 强制要求 teardown 在最后一组 + final commit message 包含 "remove spike" |
| `pnpm install` 在 spike 包里装 napi-rs CLI 时拉很多 transitive 依赖 | 低 | 低 | napi 3.x 体积可控（~5 MB）；teardown 时 `pnpm remove` 恢复 |
| spike 包的 `cargo build` 第一次要下载 windows crate（~50 MB） | 低 | 低 | 接受（一次性） |
| Rust panic 把 napi 主进程带崩 | 低 | 高 | 所有 unsafe 包在 `Result`，无 unwrap/expect；如出现立刻记入 spike 报告 |

## Migration Plan

无 user data migration。但有 dev workflow migration：

- 实施 apply 阶段会**临时**让 `apps/desktop/src/main/index.ts` 引用 spike 模块。这意味着在 spike 完成前的中间提交里，main process 启动时会自动尝试加载 spike 模块。如果 spike 模块还没 `napi build`，启动会失败。**应对**：apply 阶段必须先 `cargo build` + `napi build` 跑通后再改 main/index.ts，避免脏中间态。

## Open Questions

- **OQ1**: napi-rs 3.x 是否需要 `napi build --target` 显式传 target？答：`napi build` 默认用 `cargo` 当前 active toolchain 的 host target，对本机 x86_64-msvc 来说不需要显式传。
- **OQ2**: spike 是否要顺便测一下连续 N 次调用的稳定性（避免 handle leak / 内存泄漏）？答：spike report 中加一个 1000 次循环测试，验证耗时线性增长 + 无 handle 累积。
- **OQ3**: 用户的炉石实际版本是什么？是否还在用 32 位 Mono？答：spike 报告记录实测炉石进程的 PE 头 Machine field（`0x014C` = i386 → 32 位确认）。
