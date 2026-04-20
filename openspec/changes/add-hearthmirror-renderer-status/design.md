## Context

`add-hearthmirror-bridge` Phase H.3 标记完成，但 [代码审查 B2](../../../.worktrees/integrate-hearthmirror-rs/docs/superpowers/plans/2026-04-20-add-hearthmirror-bridge-code-review.md) 证实：

- `apps/desktop/src/renderer/src/App.tsx`：未引用任何 hearthmirror API；顶部 header 仍硬编码 "Game Running" 与 "PlayerOne"
- `apps/desktop/src/renderer/src/components/Dashboard.tsx`：未引用任何 hearthmirror API；段位字段仍硬编码 `MOCK_STATS.currentRank = 'Legend'`
- `apps/desktop/src/renderer/src/hooks/use-hearthmirror-status.ts`：hook 文件存在但**没有任何组件引用**，是 dead code
- `window.hdt.hearthmirror.*` IPC bridge 已在 `apps/desktop/src/preload/index.ts` 暴露，且 IPC handler 健康

工作量本身极小（"接根线"），但要做对 null 状态、polling 节流、test stub 不破坏现有冒烟测试。

## Goals / Non-Goals

**Goals:**

- 主窗口顶部 header 实时显示 `isAlive` + `BattleTag`
- Dashboard 顶部段位字段实时显示真实段位（standard 优先）
- 5 秒 polling，所有 IPC 调用 `swallow` 包裹（沿用现有 helper），永不破窗
- 测试覆盖三态（炉石未运行 / 运行未登录 / 运行已登录）
- 与 [`add-hearthmirror-reflection-methods`](../add-hearthmirror-reflection-methods/) 解耦：`isAlive` 一个方法可用就能至少让"Game Running"指示灯工作

**Non-Goals:**

- 不实现卡组面板 / 对局历史 / 收藏统计等更深 UI（留给 `add-deck-management` / overlay 等 change）
- 不引入新设计系统 / 不替换 Tailwind 类（沿用 firestone / Figma 现有样式）
- 不实现 overlay 独立 BrowserWindow
- 不改 IPC 契约 / preload bridge / Rust 端
- 不引入新依赖（如 react-query / swr）；polling 自己写 setInterval

## Decisions

### Decision 1: polling 实现

- **Context**: 5 秒频率的状态拉取
- **Options**:
  - **A. setInterval + useEffect 自管**：原生、零依赖、可控
  - **B. 引入 `swr` / `@tanstack/react-query`**：缓存 + 重试免费，但 + 1 dep
  - **C. main process 推送 IPC event**：更"纯"，但需要在 IPC layer 加 channel + 发布订阅
- **Choice**: **A**
- **Rationale**: 项目当前无 swr / react-query；polling 频率低（5s）+ 状态简单（3 个字段）不值得引入；遵循 YAGNI；hook 自管 setInterval cleanup 已是常规 pattern

### Decision 2: 数据形态

- **Context**: hook 应该返回什么
- **Options**:
  - **A. 三个独立 hook**：`useIsAlive()` / `useBattleTag()` / `useMedalInfo()`，各自管 polling
  - **B. 一个聚合 hook**：`useHearthMirrorStatus()` 返回 `{ isAlive, battleTag, medalInfo, lastUpdatedAt }`，单 polling tick 同时拉 3 个
- **Choice**: **B**（聚合）
- **Rationale**:
  1. 3 个字段在产品上一同显示在顶部，没有解耦理由
  2. 单 polling tick 一次跨 IPC 3 次调用，总成本 < 5 ms（Rust 内部串行 OK）
  3. 减少 useEffect / setInterval 数量，降低 leak 风险
  4. 现有 `use-hearthmirror-status.ts` 已是聚合形态，重用即可

### Decision 3: null 三态显示

- **Context**: `isAlive=true && battleTag=null` 是常见状态（炉石主菜单未登录）
- **Options**:
  - **A. 三种文本**：`"Game Not Running"` / `"Not Logged In"` / 真实 BattleTag
  - **B. 二态**：游戏未运行 vs 真 BattleTag（未登录归到"未运行"）
- **Choice**: **A**
- **Rationale**: 用户区分"游戏开了但没登录"与"游戏没开"对调试有帮助；视觉成本零

| isAlive | battleTag | 顶部 header 显示 | 颜色 |
|---|---|---|---|
| false | * | "Game Not Running" | 灰 |
| true | null | "Not Logged In" | 黄 |
| true | "Player#12345" | "Player#12345" | 绿 |

Dashboard 段位字段：
| medalInfo.standard | 显示 |
|---|---|
| null | mock fallback "Legend" |
| `{ legendRank: 0, starLevel: 42 }` | "Star 42" |
| `{ legendRank: 1234, starLevel: * }` | "Legend 1234" |

### Decision 4: 测试 stub 策略

- **Context**: 现有 renderer 冒烟测试在 `tests/setup.ts` 给 `window.hdt` 一个完整 stub；新增三态需要新 fixture
- **Options**:
  - **A. 在 setup.ts 默认 stub 三个方法返回 null/false**：所有现有测试默认走"未运行"分支
  - **B. 用 `vi.mock` per-test 覆盖**：测试侧灵活，但 setup.ts 默认值是 `null`/`false`/`0`
- **Choice**: **A + B**：setup.ts 默认 null/false/0；新增 dashboard.test.tsx / header.test.tsx 用 `vi.mock` 重写返回值覆盖三态
- **Rationale**: 现有 49 个测试不需要改；新测试用标准 vitest 模式

## Risks / Trade-offs

- **R1**：5 秒 polling 在炉石未运行时也会发起 IPC → Rust 端进入 `OpenProcess` 失败路径 → **缓解**：Rust 端早就缓存了"未连接"状态，`isAlive()` 失败极快（< 1 ms）；renderer 层在 `isAlive=false` 时**跳过**后续 `getBattleTag/getMedalInfo` 调用减少 syscall
- **R2**：`useEffect` cleanup 漏写会 leak setInterval → **缓解**：hook 单测专门验证 unmount 后 setInterval 已清；用 `vi.useFakeTimers()`
- **R3**：StrictMode 双调用会让 polling 提前 fire 两次 → **缓解**：当前 `App.tsx` 未启用 StrictMode；如未来启用，hook 内部用 ref 去重；不在本 change 处理（写 TODO 注释）

### 性能 / 安全 / 兼容性

- **性能**：5 秒 polling × 3 IPC = 0.6 IPC/秒，可忽略；renderer 重渲染只在状态变化时触发（hook 用 useState）
- **安全**：所有 IPC 走 `swallow`，无新增 attack surface
- **兼容性**：纯 React，无浏览器 API 依赖；Electron renderer 跑得通

## 最终目录树

```
apps/desktop/src/renderer/src/
├── App.tsx                            # 改：顶部 header 接 useHearthMirrorStatus
├── components/Dashboard.tsx           # 改：段位字段接 useHearthMirrorStatus
└── hooks/use-hearthmirror-status.ts  # 改：扩展返回 3 字段聚合状态

apps/desktop/src/renderer/tests/
├── setup.ts                           # 改：补 hearthmirror.* 默认 stub（如已有，对齐返回值）
├── header.test.tsx                    # 新增：3 态渲染
└── dashboard.test.tsx                 # 新增：段位 3 态渲染
```

## Migration Plan

- **顺序**：tasks.md 先 hook → 再 App.tsx → 再 Dashboard.tsx → 再测试
- **回滚**：单 PR 内全部改动，revert 即可
- **可见交付节点**：每个 commit 都让产品可跑（hook 改完后 App.tsx 接上即可见绿点；Dashboard 是独立增强）

## Open Questions

- ❓ 顶部 header 灰/黄/绿色用哪三种 Tailwind 类？
  - **倾向**：用现有 firestone palette（灰 = `text-zinc-500` / 黄 = `text-amber-500` / 绿 = `text-emerald-500`），与现有按钮/状态点颜色一致；具体在 PR 中视觉对齐
- ❓ medal 显示前缀 "Star" / "Legend" 是否需要 i18n？
  - **倾向**：硬编码英文，i18n 留给 future change；当前其他 UI 字符串也是硬编码英文
