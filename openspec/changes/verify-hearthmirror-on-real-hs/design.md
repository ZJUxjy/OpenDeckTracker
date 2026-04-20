## Context

### 现状（2026-04-20，post-reflection-methods archive）

- `packages/hearthmirror/native/src/reflection/*.rs`：12 个方法逻辑齐全，但全部基于"字段名假设" + "Unity 2021.3 Mono 偏移假设"。
- `packages/hearthmirror/native/tests/integration_reflection.rs`：12 个 `#[test]` 包了 `if !skip_if_no_hs() { return; }`，在 CI 与开发机上**无声 skip**，从未真正触达 `MonoRuntime::init()`。
- `packages/hearthmirror/native/src/mono/runtime.rs::integration_tests`：3 个真实 init 测试也用同样的 skip — 在你的本地机有炉石时跑过一次（通过），但 12 个 reflection 方法的 happy path 没人验证。
- `field_paths.rs:116-134`：开篇注释自承 "These may need runtime probing for different Mono builds"，但 baseline 偏移最后一次校准是何时无人知晓。

### 用户需求

在投入下一轮 8-12 小时的稳定性改造（`offset-probing` + `image-walking`）之前，先用 1-2 小时拿到一份**实测数据**，回答 4 个问题：

1. 12 个方法在真实炉石上**有几个能返回非空**？
2. 失败的方法**失败在链路的哪一环**（找不到 service / 找不到 class / 找不到 field / 字段值反序列化错）？
3. 硬编码的 Mono 结构偏移（`MONO_CLASS_NAME=0x2C` 等）**还成立吗**？
4. 哪些方法的字段名在炉石新版本里**已经改名**？

## Goals / Non-Goals

### Goals

- 一份可重复运行的诊断工具（cargo example），在有炉石的机器上 5 秒内跑出 12 个方法的实测结果。
- 一份格式化的 spike 报告，覆盖：环境矩阵、12 方法 × 状态/返回/错误/耗时表格、findings 排序列表、对下一步 change 的优先级建议。
- 跑一次的过程记录，确保未来任何 contributor 都能复现。

### Non-Goals

- 不做自动化（不进 CI），因为 CI 没有炉石。
- 不修改任何 lib 代码或 field_paths.rs。
- 不替换 reflection 链路实现 — 即便发现某个方法返回错值，也只在报告里记录现象。
- 不写脚本去 patch 在线炉石进程或注入 dll — 只用现有 napi-rs 公共 API。

## Decisions

### Decision D1: 用 cargo example 而不是 #[test]

- **What**: 把诊断逻辑放在 `packages/hearthmirror/native/examples/dump_reflection.rs`，通过 `cargo run --example dump_reflection` 启动。
- **Why**:
  - example 不进 `cargo test` 范围，不会让 CI 在没有炉石时失败。
  - example 可以打印任意调试信息（`println!` 自由），不受 `clippy::print_stdout` 限制。
  - example 的 `unwrap`/`expect` 不算入 lib 的严格 clippy gate，因为是诊断脚本。
  - 与 `cargo test --test integration_reflection`（已存在）形成"开发机诊断 vs CI 跳过"的清晰职责边界。
- **Alternatives**:
  - **A: 加新 `#[test]` 不带 skip** — 会让 CI 必挂。pass。
  - **B: 写独立 binary crate** — 引入新 crate，增加构建图复杂度。pass。
  - **C: 走 napi 暴露给 TS 后用 node script 调用** — 多一层 IPC 间接性，调试不如原生 example 直接。pass。

### Decision D2: 输出格式 = JSON 单行 + Markdown 表格双形态

- **What**:
  - example 把 12 个方法的结果以 JSON Lines（每行一个方法的结果对象）打印到 stdout，便于机器处理。
  - PowerShell 脚本 `run-hearthmirror-spike.ps1` 读 JSON Lines，渲染成 Markdown 表格，附加到 spike 报告。
- **Why**: 数据 / 展示分离。未来如果 reflection 方法变多到 30+，无须改 example，只改脚本格式化。
- **JSON 行 schema**:
  ```json
  {
    "method": "getBattleTag",
    "status": "ok" | "null" | "error",
    "value": "<JSON-stringified return>",
    "error": "<message if any>",
    "elapsed_ms": 12
  }
  ```

### Decision D3: 报告归档到 docs/spikes/

- **What**: 报告路径 `docs/spikes/0003-hearthmirror-reflection-runtime-validation.md`（接续 `0001-mono-runtime-probe.md` / `0002-mono-class-cache-walk.md` 的编号 — 检查现有 spike 编号确保不冲突）。
- **Why**: 与既有 spike 文档风格、归档位置、命名约定一致；未来 hearthmirror-rs 移植决策时容易交叉引用。
- **结构**（spike 报告头部固定段）:
  - Environment matrix（OS build / Hearthstone build / Mono dll name+SHA1 / Battle.net region / 测试时间）
  - 12 方法 × {status, return excerpt, error, elapsed_ms} 表格
  - Findings（排序：blocking → degraded → ok）
  - Recommendations（优先级：必须 fix / 建议 fix / 暂缓）

### Decision D4: 环境矩阵记录到报告而非依赖

- **What**: spike 报告显式列出测试环境（炉石版本号、`mono-2.0-bdwgc.dll` SHA1、Windows build、登录的战网区服）。
- **Why**: 未来如果 finding 在另一台机器上无法复现，可以用环境矩阵反向定位差异。这是"可重复性"而非"普适性"，spike 不承诺普适。

### Decision D5: 不强制完整登录到对局中

- **What**: 测试矩阵分两段：
  - **Tier 1（必跑）**：炉石主菜单 + 已登录战网 — 验证 8 个不依赖对局状态的方法（getBattleTag / getAccountId / getMedalInfo / getMatchInfo / getDecks / getCollection / getServerInfo / getBattlegroundRatingInfo）。
  - **Tier 2（best-effort）**：进入对局后再跑一次 — 验证另外 4 个（getGameType / isSpectating / isGameOver / getArenaDeck）。
- **Why**: Tier 1 已能暴露 80% 的字段链路问题；Tier 2 需要进对战环境，时间成本高，先取必要数据。
- **报告标注**: 每个方法的状态注明"测试 tier"，Tier 2 未跑的标"not-tested"。

## Risks / Trade-offs

| Risk | Severity | Mitigation |
|---|---|---|
| 你的本机炉石版本与团队其他成员不一致，spike 结论局部化 | M | 报告显式记录环境矩阵；后续 contributor 跑 spike 时附加自己的环境到附录 |
| `cargo run --example dump_reflection` 触发 anti-cheat | L | 沿用现有 reflection 方法的相同读内存 API，无新风险 |
| example 跑炸（panic）导致拿不到部分数据 | M | example 用 `match` 而非 `?`，每个方法独立 try/catch，单方法失败不影响后 11 个 |
| Tier 2 测试不可达（无法稳定进入对局测试） | L | Tier 2 标 "not-tested"，留给后续手动补充 |

## Migration Plan

无（spike 不影响生产代码）。

## Open Questions

- spike 报告是否需要二轮验证？（建议：跑两次，间隔重启炉石，记录是否稳定）— 暂在 tasks.md 4.x 留位，可选。
- 是否需要把 `dump_reflection` example 集成到 `pnpm` script？— 当前不做，example 只在 native crate 内 `cargo run` 调用。
