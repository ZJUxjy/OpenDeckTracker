## 1. probe.rs 签名变更

- [x] 1.1 打开 `packages/hearthmirror/native/src/mono/probe.rs`，定位 `probe_field_offset` 函数
- [x] 1.2 修改函数签名，在 `base: RemotePtr` 与 `validator: F` 之间插入 `owner_class: &str, owner_field: &str,`
- [x] 1.3 修改错误返回，把 `class: "<probe>".into(), field: "<probed>".into()` 替换为 `class: owner_class.into(), field: owner_field.into()`
- [x] 1.4 更新 doc comment：追加 caller MUST pass identifiers + spike 0003 F-7 引用

## 2. 更新 caller

- [x] 2.1 定位 `runtime.rs:159` 的 `probe_field_offset` 调用
- [x] 2.2 改为 `probe_field_offset(memory, domain, "MonoDomain", "loaded_images", |slot| { ... })?`
- [x] 2.3 `cargo build -p hearthmirror-native`：编译通过
- [x] 2.4 grep `<probe>|<probed>` in src/：0 匹配 ✓
- [x] 2.5 grep `probe_field_offset\(` in src/：1 调用，含字面字符串参数 ✓

## 3. 验证 + commit

- [x] 3.1 `cargo test --lib`（无炉石依赖）：33 passed, 0 failed, 1 ignored ✓
  > 注：`cargo test --all-features` 在炉石**运行时**会暴露 `discover_domain_offsets` integration test fail —— 该 fail 不是本 change 引入，错误信息现在显示 `FieldNotFound { class: "MonoDomain", field: "loaded_images" }`（**这正是 C 验收的端到端证据** — 之前显示 `<probe>.<probed>`）。该 test 等 5e archive 后才会通过（F-6 根因）。
- [x] 3.2 `cargo clippy --no-deps --lib -- -D warnings -D clippy::unwrap_used -D clippy::expect_used -D clippy::panic`：0 错误 ✓
- [x] 3.3 `openspec validate fix-hearthmirror-probe-error-msg --strict`：valid ✓
- [x] 3.4 提交：`refactor(hearthmirror): pass probe identifiers through probe_field_offset (spike 0003 F-7)`

## 4. 文档与 archive

- [ ] 4.1 修改 `openspec/changes/.NEXT.md`：在 5d-fix 段后插入新段 `### ✓✓ 5d-fix-2. fix-hearthmirror-probe-error-msg`，含一行结果摘要
- [ ] 4.2 提交：`docs(openspec): record fix-hearthmirror-probe-error-msg in NEXT`
- [ ] 4.3 跑 `npx openspec archive fix-hearthmirror-probe-error-msg`
- [ ] 4.4 检查 `openspec/changes/archive/2026-04-XX-fix-hearthmirror-probe-error-msg/` 存在；`openspec/specs/hearthmirror-mono-probe/spec.md` 存在
- [ ] 4.5 git add archive + spec，提交：`chore(openspec): archive fix-hearthmirror-probe-error-msg`
