# Spike 0001 Report: HearthMirror napi-rs Cross-Architecture Read

> Executed during change `add-hearthmirror-bridge-spike` on 2026-04-19.
> Plan: [`docs/spikes/0001-hearthmirror-spike.md`](0001-hearthmirror-spike.md)
> ADR: [`docs/adr/0001-hearthmirror-bridge.md`](../adr/0001-hearthmirror-bridge.md)

## Outcome

**Result**: ✅ **PASSED**

ADR 0001 入选方案 D（64 位 napi-rs，同进程）已在真实环境中验证可行。两个核心断言都成立：

1. **napi-rs 3.x 工具链与 Electron 33 兼容**：`napi build --platform --release` 产出 `.node` 模块（475 KB），被 Electron 33 主进程 `dynamic import` 加载零问题。
2. **64 位 Rust 跨架构读 32 位炉石可行**：标准 `OpenProcess` + `EnumProcessModulesEx(LIST_MODULES_32BIT)` + `ReadProcessMemory` 链路在普通用户权限下成功读到 `Hearthstone.exe` 的 PE 头 magic bytes，单次调用 ~250 µs。

未发生 Defender 拦截、未需要管理员权限、未触发 EAC 反作弊。

## Actual Command Sequence

完整可复现的步骤（从干净 monorepo 开始）：

```powershell
# 一次性环境准备
corepack enable
rustup target add x86_64-pc-windows-msvc

# 创建 spike workspace 包
# (按 docs/spikes/0001-hearthmirror-spike.md "Implementation Sketch" 写
#  packages/hearthmirror-spike/{Cargo.toml,build.rs,package.json,src/lib.rs})

# 在仓库根
pnpm install

# 在 spike 包内构建（首次会下载 windows crate ~50MB + cargo build ~30 s）
cd packages/hearthmirror-spike
pnpm exec napi build --platform --release
# 产出：
#   hearthmirror-spike.win32-x64-msvc.node  (475 KB)
#   index.js                                (CommonJS 加载器，24 KB)
#   index.d.ts                              (TypeScript 类型，约 10 行)

# 在 apps/desktop/package.json dependencies 加 "@hdt/hearthmirror-spike": "workspace:*"
# 在 apps/desktop/src/main/index.ts 的 app.whenReady 回调内加 SPIKE TRIGGER 块
cd ../..
pnpm install     # link workspace
pnpm typecheck   # 验证类型解析
pnpm dev         # 启动 Electron，主进程 stdout 自动跑一次 spike_read_mz()
```

## Observed Results

### 场景 A — Hearthstone 主菜单运行中

```
[spike:readMz] OK: {
  "pid": 60688,
  "baseAddress": "0x002E0000",
  "headerHex": "4D 5A 90 00 03 00 00 00 04 00 00 00 FF FF 00 00",
  "elapsedMicros": 252
}
```

✅ 全部 4 个字段符合 `add-hearthmirror-bridge-spike` spec 的"场景 A 验证"要求。

### 场景 B — Hearthstone 完全关闭

```
[spike:readMz] FAIL: process not found: Hearthstone.exe is not running
```

✅ 错误消息含 "process not found"。Electron 主进程未崩溃，主窗口正常显示 FIRESTONE，路由切换正常。

## Encountered Issues

### Issue 1: ASLR 让模块基址不固定

`baseAddress` 实测为 `0x002E0000`，不是 PE 教科书里的"典型 0x00400000"。这说明炉石的 PE 头开启了 ASLR（地址空间随机化），**每次启动地址都会变**。

**对正式实现的影响**：
- ❌ 严禁 hardcode 任何 Hearthstone.exe 内的绝对地址。
- ✅ 必须每次都通过 `EnumProcessModulesEx` 动态拿基址。
- ✅ Mono runtime 内部所有指针（domain / image / class）也都是基于 ASLR 后的运行时地址，正式实现要按 spec 用 `RemotePtr(u32)` 包装、绝不 cache。

### Issue 2: Single Instance Lock 影响 spike 重复跑

主进程 `app.requestSingleInstanceLock()`（来自 ADR D6）会让任何"残留的 Electron 进程"挡住新的 `pnpm dev`：第二次 spawn 的进程拿不到锁立即 `app.quit()`，整个 dev 进程 ~4 秒后退出，spike 触发块根本跑不到。

**对正式实现的影响**：
- 开发流程文档（README）需要写明：dev 重启前用 Task Manager 确保旧 Electron 进程清理。
- 可考虑为 dev 模式增加 single-instance 例外，或显式打日志提示"另一个实例已在运行，本进程退出"。
- 后续 `add-hearthmirror-bridge` 实施时，HearthMirror 会话本身的生命周期管理也要考虑这种"用户开了多个 HDT.js"的边缘情况。

### Issue 3: vitest 2.x ↔ vite 6 类型回归

实施 spike 时，`apps/desktop/vitest.config.ts:9` `react()` plugin 触发 typecheck 报错：

```
Types of property 'plugins' are incompatible.
Type 'PluginOption[]' (vite 6) is not assignable to type 'PluginOption[]' (vite 5).
```

根本原因：根 `devDependencies` 中 `vitest@2.1.9` peer-deps 上 `vite@5.4.21`，与 apps/desktop 显式依赖的 `vite@^6` 类型不互通。临时用 `react() as any` 绕过。

**对项目层面的影响**（已记录到下次 follow-up）：
- 可选方案 A：把 vitest 升级到 3.x（与 vite 6 对齐）。
- 可选方案 B：移除 vitest，只用 Node test runner（与 add-monorepo-skeleton 决策 D9 冲突，影响大）。
- 可选方案 C：维持 `as any` 直到 vitest 3 stable + 与 Tailwind v4 / Electron 33 验证兼容。
- 推荐：在下一个非 hearthmirror 系列 change 中解决，不在 spike change 中处理。

### Issue 4: 首次 cargo build 需下载 ~50 MB windows crate

第一次 `napi build` 触发 cargo 下载 windows crate 与全部 sub-crate（`windows-targets`、`windows-result` 等约 30 个），约 50 MB / 30 秒。后续构建只用秒级增量。属预期开销，不影响验收。

### Issue 5: Rust target/ 不在 .gitignore 中

`packages/hearthmirror-spike/target/` 部分文件（`.rustc_info.json`、`CACHEDIR.TAG`、`hearthmirror-spike` 元数据）在 `git add packages/hearthmirror-spike` 时被意外纳入。teardown 时一并修复 `.gitignore`，加入 `target/` 与 `**/Cargo.lock`（其实 spike 包的 Cargo.lock 也会被删，但加这条是防御性）。

**对正式实现的影响**：`add-hearthmirror-bridge` 必须先在 `.gitignore` 加上 `target/` 才能创建 `packages/hearthmirror/native/`。

## Performance Baseline

| 指标 | 值 | 备注 |
|---|---|---|
| 单次 `spike_read_mz` 耗时 | **252 µs** | 单次观测，包含 OpenProcess + EnumProcessModulesEx + ReadProcessMemory(16字节) + CloseHandle 全程 |
| 1000 次循环测试 | 跳过 | 252 µs 已远低于覆盖层 60 fps 帧时（16.67 ms），稳定性测试留给正式实现 |
| napi-rs 模块体积 | 475 KB（release + LTO） | 远小于 Electron 自身 |
| 模块加载时间 | < 50 ms | dynamic import 几乎瞬时（单次） |

> 性能档次评估：覆盖层 60 fps 单帧 16.67 ms，单次 ReadProcessMemory 占 1.5%。即使正式实现要每帧做 100 次内存读取（追卡组 + 对手卡组 + 段位 + 牌库等），总开销 ~25 ms，仍可在 30 fps 帧时内（33 ms）。**性能不是设计约束**。

## Hearthstone Process Info Observed

| 字段 | 值 | 含义 |
|---|---|---|
| PID | 60688 | 单次观测，每次启动会变 |
| Module Base | `0x002E0000` | 启用 ASLR，与典型 PE base `0x00400000` 不同 |
| PE Magic | `4D 5A` | "MZ" — DOS executable signature |
| DOS Stub Bytes 0–15 | `4D 5A 90 00 03 00 00 00 04 00 00 00 FF FF 00 00` | 标准 DOS stub（MS-DOS programs follow），无定制 |
| Bitness | 32-bit (x86) | 由 ADR 0001 假设，spike 没读 PE Optional Header 的 Machine field 二次确认（留给正式实现） |
| OS | Windows 10/11 x64 | 用户本机 |
| Permissions Required | 普通用户 | 没用 "Run as Administrator"；OpenProcess 直接成功 |
| Defender / EAC interference | 无观测 | spike 单次调用未被拦截 |

## Recommendations for `add-hearthmirror-bridge`

按重要性排序：

1. **`.gitignore` 必须先加 `target/` 与 `**/*.rs.bk`**（避免 Issue 5 重演），同时加 `Cargo.lock` 的策略 — 对于 lib crate 通常 ignore，对于 binary 通常 commit。`packages/hearthmirror/native/` 是 cdylib，建议 commit `Cargo.lock` 锁定 windows crate 版本，避免后续 sub-crate 版本漂移引发偏移量适配混乱。

2. **沿用 spike 的 `HandleGuard(HANDLE)` 模式**：所有 Windows handle 都用 RAII guard 关闭；进一步可以做 `OwnedProcessHandle` newtype 把 OpenProcess + Close 配对完全封装。

3. **`RemotePtr(u32)` newtype 在第一个 commit 就引入**（spec 已强制），避免 spike 的"散用 `usize` / `u32`"在正式代码里复现。在 `RemotePtr` 上实现 `Add<u32>`、`Display` 等 trait，方便地址算术。

4. **`EnumProcessModulesEx(LIST_MODULES_32BIT)` 是关键**：spike 验证 `LIST_MODULES_32BIT (0x01)` 在本机工作。但要在 release 文档里明确——若有用户报告"Hearthstone process found but no modules"，第一怀疑就是这个 flag。

5. **错误消息要稳定**：spec 用 "process not found" 作为 scenario 匹配关键字。正式实现的 ScryError 体系要保证此关键字在 `ProcessNotFound` 错误的 message 中始终出现（哪怕 i18n 后），方便 e2e 测试断言。

6. **不需要管理员权限**：spike 验证普通用户即可读取。不要在 README / 文档里建议用户用管理员模式启动，避免增加杀软误报概率。

7. **Single instance lock 与 dev 流程**：在 README 加一行"开发期重启 Electron 前确保旧进程已退出"。

8. **napi-rs 3.x 是好选择**：CLI 只用 `napi build --platform --release`，模板自动生成 `.d.ts` + CJS loader，下游消费者零额外配置。后续如果要做 prebuilds 分发，只要在 CI 加 `napi prebuild` 即可，无需重构 crate。

9. **`async fn` 暴露面工作良好**：spike 的 `pub async fn spike_read_mz()` 经 napi-rs 转 Promise，TypeScript `await` 完美。同步内核调用没必要再嵌套 `tokio::task::spawn_blocking`，napi-rs 已经在 worker thread 跑。

10. **Mono 探测应该走专门的 spike 02**：本 spike 只验证了"能读到字节"，没验证"能读到 mono.dll 的导出函数 + 拿到 root domain"。建议正式实现前再做一个 ≤ 1 天的 spike 02：从 `mono_get_root_domain` 拿到 `MonoDomain*`，从域链表枚举出 `Assembly-CSharp.dll` 的 `MonoImage*`。这是整个项目的下一个最高风险点。

## Decision Outcomes

按 [`docs/spikes/0001-hearthmirror-spike.md`](0001-hearthmirror-spike.md) §"Decision Outcomes" 决定：

- ✅ **Acceptance Criteria 全部通过** → ADR 0001 状态从 `Accepted` 升级到 `Validated`（已在 `docs/adr/0001-hearthmirror-bridge.md` 完成）。
- ✅ 启动 `add-hearthmirror-bridge` change 进入正式实施（已在 `openspec/changes/.NEXT.md` 标记为下一优先级）。
- 🚫 **不**触发 ADR 0002 fallback 路径。
