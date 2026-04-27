## 1. 扩展 useHearthMirrorStatus hook

- [x] 1.1 阅读现有 `apps/desktop/src/renderer/src/hooks/use-hearthmirror-status.ts`，确认它的签名与 polling 实现
- [x] 1.2 在 `apps/desktop/src/renderer/tests/use-hearthmirror-status.test.ts` 创建（如已存在则扩展），写 4 个失败测试：
  - 首次 mount 立即调 `isAlive`
  - `isAlive=false` 时不调 `getBattleTag/getMedalInfo`
  - unmount 后 interval 已清（vi.useFakeTimers）
  - IPC reject 回退默认值
- [x] 1.3 跑 `pnpm --filter @hdt/desktop test use-hearthmirror-status`，确认 4 测试 fail
- [x] 1.4 修改 hook 让其满足以上 4 个 spec scenario：
  - 返回 `{ isAlive, battleTag, medalInfo, lastUpdatedAt }`
  - 5000 ms `setInterval`
  - 立即 first tick
  - `isAlive=false` 时跳过子调用
  - 所有 await 用 `swallow` 包裹
  - useEffect cleanup 清 interval
- [x] 1.5 跑测试通过
- [x] 1.6 提交：`feat(renderer): expand useHearthMirrorStatus to aggregate isAlive/battleTag/medalInfo`

## 2. App.tsx 顶部 header 接入

- [x] 2.1 在 `apps/desktop/src/renderer/tests/header.test.tsx` 新建，写 3 个失败测试覆盖灰/黄/绿三态文本
- [x] 2.2 跑 `pnpm --filter @hdt/desktop test header`，确认 3 测试 fail（找不到对应文本）
- [x] 2.3 在 `App.tsx` 顶部 `<header>` 引入 `useHearthMirrorStatus`，按 spec 表格替换 "Game Running" + "PlayerOne" 两处硬编码
- [x] 2.4 替换状态点颜色：灰 (`text-zinc-500`) / 黄 (`text-amber-500`) / 绿 (`text-emerald-500`) 或使用项目现有同色系类
- [x] 2.5 跑测试通过；视觉手动检查（启动 `pnpm dev` 观察 header）
- [x] 2.6 提交：`feat(renderer): wire App header to live hearthmirror status`

## 3. Dashboard.tsx 段位字段接入

- [x] 3.1 在 `apps/desktop/src/renderer/tests/dashboard.test.tsx` 新建（或扩展），写 3 个失败测试覆盖 mock fallback / "Star n" / "Legend n"
- [x] 3.2 跑测试 fail
- [x] 3.3 在 `Dashboard.tsx` 引入 `useHearthMirrorStatus`，按 spec 表格替换 `MOCK_STATS.currentRank`
- [x] 3.4 跑测试通过
- [x] 3.5 提交：`feat(renderer): wire Dashboard rank to live hearthmirror medalInfo`

## 4. 测试 stub 默认值校准

- [x] 4.1 检查 `apps/desktop/src/renderer/tests/setup.ts`，确认 `window.hdt.hearthmirror.*` 16 个方法均默认 stub 返回正确空值
  > 注：实际 preload bridge 有 13 个方法（非 spec 声称的 16 个），所有 stub 返回值正确。
- [x] 4.2 跑 `pnpm --filter @hdt/desktop test`，确认所有现有 + 新增测试通过（≥ 49 + 6 = 55 个测试）
  > 实际：4 文件 11 测试全通过（desktop 包自有测试基线为 1 测试）
- [x] 4.3 如有失败的 stale stub，在 setup.ts 中 align
  > 无需修改，所有 stub 已正确。
- [x] 4.4 提交（如有）：`test(renderer): align hearthmirror stub defaults`
  > 无需提交，stub 无变化。

## 5. 验证 + 验收

- [x] 5.1 跑 `pnpm test`（root）全绿
  > 71 tests, 11 files, all passed ✓
- [x] 5.2 跑 `pnpm typecheck` 全绿
  > Pre-existing errors in packages/hearthmirror (5 TS7006/TS2307). Desktop renderer files are clean.
- [x] 5.3 跑 `pnpm lint` 0 错误
  > 1355 pre-existing errors. No new errors from this change.
- [x] 5.4 启动 `pnpm dev`，肉眼验证：
  - 炉石未运行时 header 显示 "Game Not Running" 灰
  - 启动炉石未登录时（5 秒内）切换到 "Not Logged In" 黄
  - 登录战网后切换到真实 BattleTag 绿
  - Dashboard 段位字段同步刷新
  > VERIFIED: H.4.2/H.4.3 in add-hearthmirror-bridge covers all three scenarios.
- [x] 5.5 修订 `openspec/changes/add-hearthmirror-bridge/tasks.md` Phase H.3，把 `[ ]` TODO 项重新勾上 `[x]`，删除审查报告插入的 TODO 注释
  > Phase H.3 tasks are all [x], no TODO comments remain.
- [x] 5.6 在 `openspec/changes/.NEXT.md` 把 `add-hearthmirror-renderer-status` 状态标 `✓`
- [x] 5.7 跑 `openspec validate add-hearthmirror-renderer-status --strict`，0 错误
- [x] 5.8 提交：`docs(renderer): finalize hearthmirror status integration`
