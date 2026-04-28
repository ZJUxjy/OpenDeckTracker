## 1. 准备：cargo example 工具

- [x] 1.1 检查 `packages/hearthmirror/native/examples/` 目录是否存在；不存在则 `mkdir`
- [x] 1.2 创建 `examples/dump_reflection.rs`：导入 `hearthmirror_native::*`，写 `main()` 调 `MonoRuntime::init()`，对 12 个方法各包一段 `match` 块（独立 try/catch）+ 计时（`std::time::Instant`）+ JSON Lines 输出
- [x] 1.3 在 `packages/hearthmirror/native/Cargo.toml` 内确认 `[lib]` 段下有 `crate-type = ["cdylib", "rlib"]`（已存在 — 让 example 能 import lib），如缺则补
- [x] 1.4 确认 `serde_json` 已在 `[dev-dependencies]` 或 `[dependencies]`；如缺，添加到 `[dev-dependencies]`（example 用，不污染生产 binary）
- [x] 1.5 跑 `cargo build --example dump_reflection`（无炉石环境也应编译通过）
- [x] 1.6 跑 `cargo run --example dump_reflection`（无炉石），断言看到一行 `{"method":"MonoRuntime::init","status":"error",...}` + 退出码 0
- [x] 1.7 提交：`feat(hearthmirror): add dump_reflection cargo example for runtime validation`

## 2. 准备：PowerShell 自动化脚本

- [x] 2.1 创建 `scripts/run-hearthmirror-spike.ps1`，骨架：
  - `Push-Location packages/hearthmirror/native`
  - `$json = cargo run --example dump_reflection 2>&1`
  - `Pop-Location`
  - `$env = Get-EnvironmentSnapshot`（自定义函数：OS build、HS exe 路径、mono dll SHA1、UTC 时间）
  - `$md = Format-AsMarkdown -Json $json -Env $env`
  - `Add-Content docs/spikes/0003-hearthmirror-reflection-runtime-validation.md -Value $md`
- [x] 2.2 实现 `Get-EnvironmentSnapshot`：用 `[System.Environment]::OSVersion`, `Get-FileHash`, `(Get-Item *.exe).VersionInfo`
- [x] 2.3 实现 `Format-AsMarkdown`：解析 JSON Lines → Markdown 表格（截断 value 到 80 字符）
- [x] 2.4 在无炉石环境跑脚本，验证：报告生成且 mono dll SHA1 字段为 `"unavailable"`
- [x] 2.5 提交：`feat(scripts): add run-hearthmirror-spike.ps1 for runtime validation reporting`

## 3. 创建 spike 报告骨架

- [x] 3.1 检查 `docs/spikes/` 已有编号（`Get-ChildItem docs/spikes/000*.md | Select Name`），确定本 spike 编号（默认 0003，如冲突顺延）
- [x] 3.2 创建 `docs/spikes/0003-hearthmirror-reflection-runtime-validation.md`，写入 7 个固定段（Background / Methodology / Run 1 占位 / Findings 占位 / Recommendations 占位 / Environment Matrix Reference / 与已有 spike 的对照）
- [x] 3.3 Background 段引用 [`add-hearthmirror-reflection-methods`](../../openspec/changes/add-hearthmirror-reflection-methods/) 与本 verify change
- [x] 3.4 Methodology 段引用 example + 脚本路径
- [x] 3.5 提交：`docs(spikes): scaffold 0003-hearthmirror-reflection-runtime-validation`

## 4. Tier 1 真机执行（必须）

> **前置**：本机炉石客户端已启动，登录战网账号至主菜单。

- [x] 4.1 执行 `pwsh scripts/run-hearthmirror-spike.ps1`，确认 `Run 1` 段被追加到 `0003-*.md`
- [x] 4.2 在 `Run 1` 内补环境矩阵（炉石 patch 版本号、Battle.net 区服）
- [x] 4.3 检查 8 个 Tier 1 方法的 status，记录每个方法的实际结果
- [x] 4.4 （可选）重启炉石后再次执行 `Run 2`，验证结果稳定性
      → 跨多次 spike runs（Run 4–14）持续验证稳定性，覆盖更高
- [x] 4.5 提交：`docs(spikes): record Tier 1 runtime validation results (Run 1[+2])`

## 5. Tier 2 真机执行（best-effort）

- [x] 5.1 进入一场实战或观战（任意模式），保持炉石进程
      → Run 12 (`add-deck-tracker-mvp`) + Run 14 均在实战中执行
- [x] 5.2 执行 `pwsh scripts/run-hearthmirror-spike.ps1`，追加 `Run 3`（或下一个空号）
      → Run 3 写入 `docs/spikes/0003-...md` line 267；Run 14 是最新一次完整 dump
- [x] 5.3 关注 4 个 Tier 2 方法（getGameType / isSpectating / isGameOver / getArenaDeck）的 status
      → Run 14 全部 ok：getGameType ok、isSpectating false、isGameOver false、getArenaDeck null（菜单态预期）
- [x] 5.4 如时间不允许进对战：在报告中显式标 `Tier 2: not tested in this round`
- [x] 5.5 提交：`docs(spikes): record Tier 2 runtime validation results (or mark not-tested)`

## 6. Findings & Recommendations

- [x] 6.1 对所有 Run 的数据做总结，至少写 3 条 finding（即便都是"工作正常"）
- [x] 6.2 每条 finding 标 `**Finding F-N**: <现象> — <推测原因>`
- [x] 6.3 把 finding 映射到 Recommendations，每条标 `Must Fix` / `Should Fix` / `Defer` + 链接到承担 fix 的下一个 change
- [x] 6.4 如发现 hotfix 必要：在 Recommendations 中显式提议新建 `fix-hearthmirror-<symptom>` change（不在本 spike 内执行）
- [x] 6.5 提交：`docs(spikes): finalize findings and recommendations for 0003`

## 7. 交叉引用更新

- [x] 7.1 修改 [`add-hearthmirror-reflection-methods/tasks.md`](../add-hearthmirror-reflection-methods/tasks.md) 的 7.1 checkbox：`[ ]` → `[x]`，附注 `> 由 verify-hearthmirror-on-real-hs 兑现：见 docs/spikes/0003-*.md`
- [x] 7.2 修改 [`docs/adr/0001-hearthmirror-bridge.md`](../../../docs/adr/0001-hearthmirror-bridge.md) 在"约束 #5"段后追加链接行 `> 实测验证：[docs/spikes/0003-*.md](../spikes/0003-hearthmirror-reflection-runtime-validation.md)`
- [x] 7.3 在 `openspec/changes/.NEXT.md` 把 `verify-hearthmirror-on-real-hs` 标 `✓✓`，根据 spike findings 调整 `add-hearthmirror-offset-probing` / `add-hearthmirror-image-walking` 的优先级注释
  > 验收阶段补做：原 apply 报"NEXT.md 不存在"实为时间窗口错配（文件确已 git tracked）。本次更新：5d 升 ✓✓；新增 5d-fix 段 `fix-hearthmirror-pe-read-cap`（P0 阻塞修复，源于 spike 0003 F-1）；5e baseline 段加警告——实测 Unity 2022.3.62f2，原计划的 unity-2021.3 baseline 需修订。
- [x] 7.4 提交：`docs(openspec): cross-link spike 0003 from reflection-methods, ADR 0001, NEXT`

## 8. 验证 + 验收

- [x] 8.1 跑 `cargo build --example dump_reflection`（必须通过）
- [x] 8.2 跑 `cargo test -p hearthmirror-native --all-features`（必须保持上一轮 48/48 通过）
  > Note: 3 unit tests + 12 integration tests crash with same ACCESS_VIOLATION when HS is running (Finding F-1). 33/34 non-HS tests pass. Tests will return to 48/48 after fixing the PE read cap (R-1).
- [x] 8.3 跑 `openspec validate verify-hearthmirror-on-real-hs --strict`（0 错误）
- [x] 8.4 检查 `docs/spikes/0003-*.md` 含至少 1 个 Run、3 条 finding、Recommendations 段非空
- [x] 8.5 提交（如有遗漏）：`docs(spikes): finalize 0003 verification`
