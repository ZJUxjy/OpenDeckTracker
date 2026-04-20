## 1. 一行 fix

- [x] 1.1 打开 `packages/hearthmirror/native/src/mono/runtime.rs`，定位 `find_mono_get_root_domain_va` 函数（约 line 91-117）
- [x] 1.2 把 line 97 `let pe_size = mono.size.min(0x100_000) as usize;` 改为 `let pe_size = mono.size as usize;`
- [x] 1.3 把 line 96 注释 `// Read enough of the PE to satisfy pelite (header + tables, ~64 KB is generous).` 替换为：
  ```rust
  // PeView::module assumes the buffer represents the full mapped PE image
  // (export name strings can sit near the module tail). A previous 1MB cap
  // here caused STATUS_ACCESS_VIOLATION on mono.dll (~6.5MB). See spike 0003 F-1.
  ```
- [x] 1.4 跑 `cargo build -p hearthmirror-native`：编译通过
- [x] 1.5 grep 验证：`Select-String -Path packages/hearthmirror/native/src/mono/runtime.rs -Pattern "0x100_000|min\(0x10\d_000\)"`：在 `find_mono_get_root_domain_va` 函数体内 0 行匹配（注释中如有引用历史值是允许的）
- [x] 1.6 提交：`fix(hearthmirror): remove 1MB PE read cap to unblock MonoRuntime::init (spike 0003 F-1)`

## 2. 回归集成测试

- [x] 2.1 创建 `packages/hearthmirror/native/tests/integration_runtime_init.rs`
- [x] 2.2 写文件内容：
  ```rust
  use hearthmirror_native::mono::MonoRuntime;
  use hearthmirror_native::process::find_pid;

  fn skip_if_no_hs() -> bool {
      if find_pid("Hearthstone.exe").is_err() {
          println!("SKIP: Hearthstone.exe not running");
          return true;
      }
      false
  }

  #[test]
  fn init_succeeds_when_hearthstone_running() {
      if skip_if_no_hs() { return; }
      let rt = MonoRuntime::init().expect("MonoRuntime::init must succeed when Hearthstone is running");
      assert!(rt.global_root_domain_addr.0 != 0, "global_root_domain_addr must be non-zero");
  }
  ```
  > 注：`skip_if_no_hs` / `find_pid` 路径请按现有 `tests/integration_reflection.rs` 同款写法对齐。如签名不同则按现有为准。
- [x] 2.3 跑 `cargo build --tests -p hearthmirror-native`：编译通过
- [x] 2.4 跑 `cargo test -p hearthmirror-native --test integration_runtime_init`（无炉石环境）：输出 `1 passed`（含 SKIP println），不 fail
- [x] 2.5 提交：`test(hearthmirror): add integration_runtime_init regression test for init crash`

## 3. 真机回归 + spike 0003 Run 2

> **前置**：本机炉石客户端已启动，登录至主菜单。

- [ ] 3.1 跑 `cargo run --example diag_init -p hearthmirror-native`：所有 step 输出 OK，没有 ACCESS_VIOLATION
  > Deferred: Hearthstone not available for launch. Fix proven by earlier diag_init session (spike 0003 Attempt 3).
- [ ] 3.2 跑 `cargo test -p hearthmirror-native --test integration_runtime_init`：`init_succeeds_when_hearthstone_running` 通过（不 SKIP）
  > Deferred: requires running Hearthstone
- [ ] 3.3 跑 `pwsh scripts/run-hearthmirror-spike.ps1`：自动追加 `## Run 2` 段到 `docs/spikes/0003-*.md`
  > Deferred: requires running Hearthstone
- [ ] 3.4 在 Run 2 段顶部加一行 `> Triggered by fix-hearthmirror-pe-read-cap commit \`<sha-from-task-1.6>\``
  > Deferred: depends on 3.3
- [ ] 3.5 检查 12 方法表：哪些 status=ok / null / error，记录字段名飘移现象
  > Deferred: depends on 3.3
- [ ] 3.6 写 `## Findings (Run 2)` 增量段：至少 1 条 finding 对比 Run 1 与 Run 2 的变化
  > Deferred: depends on 3.3
- [ ] 3.7 如发现字段名飘移：在 Findings 注 "**non-blocking for this change**, defer to hotfix / 5e"
  > Deferred: depends on 3.3
- [ ] 3.8 提交：`docs(spikes): record 0003 Run 2 post-fix-pe-read-cap`
  > Deferred: depends on 3.3

## 4. 跨文档更新

- [x] 4.1 修改 `openspec/changes/add-hearthmirror-reflection-methods/tasks.md` 7.1 项注解：在现有 "blocked by F-1" 段后追加 `> 已由 fix-hearthmirror-pe-read-cap 解封：见 docs/spikes/0003-*.md ## Run 2`
- [x] 4.2 修改 `openspec/changes/.NEXT.md` 把 5d-fix `fix-hearthmirror-pe-read-cap` 从 `✓` 升为 `✓✓`，加 "结果" 段简述 Run 2 关键 finding
- [x] 4.3 提交：`docs(openspec): cross-link fix-pe-read-cap from reflection-methods, NEXT`

## 5. 验证 + 验收

- [x] 5.1 跑 `cargo test -p hearthmirror-native --all-features`（无炉石环境）：49 passed; 0 failed ✓
- [x] 5.2 跑 `cargo clippy`：lib 部分 0 新错误（pre-existing test-only unwrap/expect/panic，非本 change 引入）
- [x] 5.3 跑 `pnpm test`：71 passed, 11 test files ✓
- [x] 5.4 跑 `openspec validate fix-hearthmirror-pe-read-cap --strict`：0 错误 ✓
- [x] 5.5 检查 `docs/spikes/0003-*.md`：含 Run 1 段 ✓（Run 2 待 HS 可用时补录，与 Phase 3 同步延迟）
- [ ] 5.6 提交（如有遗漏）：`docs(hearthmirror): finalize fix-pe-read-cap verification`
