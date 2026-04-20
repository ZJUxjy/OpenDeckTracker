## 1. 扩展 useHearthMirrorStatus hook

- [ ] 1.1 阅读现有 `apps/desktop/src/renderer/src/hooks/use-hearthmirror-status.ts`，确认它的签名与 polling 实现
- [ ] 1.2 在 `apps/desktop/src/renderer/tests/use-hearthmirror-status.test.ts` 创建（如已存在则扩展），写 4 个失败测试：
  - 首次 mount 立即调 `isAlive`
  - `isAlive=false` 时不调 `getBattleTag/getMedalInfo`
  - unmount 后 interval 已清（vi.useFakeTimers）
  - IPC reject 回退默认值
- [ ] 1.3 跑 `pnpm --filter @hdt/desktop test use-hearthmirror-status`，确认 4 测试 fail
- [ ] 1.4 修改 hook 让其满足以上 4 个 spec scenario：
  - 返回 `{ isAlive, battleTag, medalInfo, lastUpdatedAt }`
  - 5000 ms `setInterval`
  - 立即 first tick
  - `isAlive=false` 时跳过子调用
  - 所有 await 用 `swallow` 包裹
  - useEffect cleanup 清 interval
- [ ] 1.5 跑测试通过
- [ ] 1.6 提交：`feat(renderer): expand useHearthMirrorStatus to aggregate isAlive/battleTag/medalInfo`

## 2. App.tsx 顶部 header 接入

- [ ] 2.1 在 `apps/desktop/src/renderer/tests/header.test.tsx` 新建，写 3 个失败测试覆盖灰/黄/绿三态文本
- [ ] 2.2 跑 `pnpm --filter @hdt/desktop test header`，确认 3 测试 fail（找不到对应文本）
- [ ] 2.3 在 `App.tsx` 顶部 `<header>` 引入 `useHearthMirrorStatus`，按 spec 表格替换 "Game Running" + "PlayerOne" 两处硬编码
- [ ] 2.4 替换状态点颜色：灰 (`text-zinc-500`) / 黄 (`text-amber-500`) / 绿 (`text-emerald-500`) 或使用项目现有同色系类
- [ ] 2.5 跑测试通过；视觉手动检查（启动 `pnpm dev` 观察 header）
- [ ] 2.6 提交：`feat(renderer): wire App header to live hearthmirror status`

## 3. Dashboard.tsx 段位字段接入

- [ ] 3.1 在 `apps/desktop/src/renderer/tests/dashboard.test.tsx` 新建（或扩展），写 3 个失败测试覆盖 mock fallback / "Star n" / "Legend n"
- [ ] 3.2 跑测试 fail
- [ ] 3.3 在 `Dashboard.tsx` 引入 `useHearthMirrorStatus`，按 spec 表格替换 `MOCK_STATS.currentRank`
- [ ] 3.4 跑测试通过
- [ ] 3.5 提交：`feat(renderer): wire Dashboard rank to live hearthmirror medalInfo`

## 4. 测试 stub 默认值校准

- [ ] 4.1 检查 `apps/desktop/src/renderer/tests/setup.ts`，确认 `window.hdt.hearthmirror.*` 16 个方法均默认 stub 返回正确空值
- [ ] 4.2 跑 `pnpm --filter @hdt/desktop test`，确认所有现有 + 新增测试通过（≥ 49 + 6 = 55 个测试）
- [ ] 4.3 如有失败的 stale stub，在 setup.ts 中 align
- [ ] 4.4 提交（如有）：`test(renderer): align hearthmirror stub defaults`

## 5. 验证 + 验收

- [ ] 5.1 跑 `pnpm test`（root）全绿
- [ ] 5.2 跑 `pnpm typecheck` 全绿
- [ ] 5.3 跑 `pnpm lint` 0 错误
- [ ] 5.4 启动 `pnpm dev`，肉眼验证：
  - 炉石未运行时 header 显示 "Game Not Running" 灰
  - 启动炉石未登录时（5 秒内）切换到 "Not Logged In" 黄
  - 登录战网后切换到真实 BattleTag 绿
  - Dashboard 段位字段同步刷新
- [ ] 5.5 修订 `openspec/changes/add-hearthmirror-bridge/tasks.md` Phase H.3，把 `[ ]` TODO 项重新勾上 `[x]`，删除审查报告插入的 TODO 注释
- [ ] 5.6 在 `openspec/changes/.NEXT.md` 把 `add-hearthmirror-renderer-status` 状态标 `✓`
- [ ] 5.7 跑 `openspec validate add-hearthmirror-renderer-status --strict`，0 错误
- [ ] 5.8 提交：`docs(renderer): finalize hearthmirror status integration`
