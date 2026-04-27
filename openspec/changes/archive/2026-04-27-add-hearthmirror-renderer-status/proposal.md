## Why

`add-hearthmirror-bridge` 的 Phase H.3 标记 renderer 接入完成，但 [2026-04-20 代码审查 B2](../../../.worktrees/integrate-hearthmirror-rs/docs/superpowers/plans/2026-04-20-add-hearthmirror-bridge-code-review.md) 证实 `App.tsx` / `Dashboard.tsx` 实际无任何 hearthmirror 调用——已新建的 `useHearthMirrorStatus` hook 是 dead code，没有任何组件引用。

桥接是否真的"通了"必须在产品 UI 中可见才算 ADR 0001 验收门 4 通过。本 change 把现有 hook 真正接入主窗口顶部条，把"Game Running" 指示灯、PlayerOne 字段、Dashboard 段位三处硬编码 mock 替换为来自 `window.hdt.hearthmirror.*` 的真实数据，附带容错（炉石未运行 / 字段为 null 时的灰态 fallback）与 5 秒 polling。

> 这是 [DEVELOPMENT_PLAN.md](../../../DEVELOPMENT_PLAN.md) Phase 4 收尾的可见交付物；与 [`add-hearthmirror-reflection-methods`](../add-hearthmirror-reflection-methods/) 解耦——只要 `isAlive` 单一方法可用，本 change 就能至少把"Game Running"指示灯做出来。

## What Changes

- **接入** `useHearthMirrorStatus` hook 到 `apps/desktop/src/renderer/src/App.tsx` 顶部 `<header>`：
  - 绿点 + "Game Running" 当 `isAlive() === true`；灰点 + "Game Not Running" 否则
  - 现有 `PlayerOne` 字符串替换为 `await getBattleTag().name`（`null` 时显示 `Not Connected`）
- **接入** `useHearthMirrorStatus` hook 到 `apps/desktop/src/renderer/src/components/Dashboard.tsx`：
  - 现有 `MOCK_STATS.currentRank = 'Legend'` 替换为：从 `getMedalInfo().standard` 读取 `legendRank > 0 ? "Legend ${legendRank}" : "Star ${starLevel}"`；`null` 时回退到 mock 字符串
- **扩展** `useHearthMirrorStatus` hook（如有必要）使其状态对象包含 `isAlive` / `battleTag` / `medalInfo` 三个字段，5 秒 polling 周期，所有 `await` 用 `swallow` 包裹（已存在的 IPC 防御性 helper）
- **新增** renderer 测试：`apps/desktop/src/renderer/tests/dashboard.test.tsx` + `apps/desktop/src/renderer/tests/header.test.tsx` 覆盖三种状态（炉石未运行 / 运行未登录 / 运行已登录）的 mock window.hdt.hearthmirror 渲染
- **回归** `tasks.md` 中 `add-hearthmirror-bridge` Phase H.3 的 checkbox（archive 前同步勾回 ✓）

### Non-goals

- **不**实现 12 个反射方法的真实数据（在 [`add-hearthmirror-reflection-methods`](../add-hearthmirror-reflection-methods/) 中处理；本 change 只要求 hook 可调，假数据下 UI 也要跑通）
- **不**做新设计风格（沿用 firestone / Figma 现有视觉，最小侵入式替换文本与色号）
- **不**实现卡组面板 / 对局历史 / 收藏统计等更深层 UI（这些是后续 `add-deck-management` / overlay 等 change）
- **不**新建独立 BrowserWindow 或 overlay 路由
- **不**改动 IPC 契约或 preload bridge（已存在）

## Capabilities

### New Capabilities

- `hearthmirror-renderer-status`: 主窗口顶部 + Dashboard 顶部三个字段的真实数据接入契约（含状态值映射、null fallback、polling 频率、错误吞噬语义）

### Modified Capabilities

（无——`add-hearthmirror-bridge` 中的 `hearthmirror-ui-integration` spec 描述的就是这件事；本 change 等于"实现该 spec"。归档后两份 spec 可合并）

## Impact

- **代码**：`apps/desktop/src/renderer/src/App.tsx`、`apps/desktop/src/renderer/src/components/Dashboard.tsx`、`apps/desktop/src/renderer/src/hooks/use-hearthmirror-status.ts`（如需扩展）
- **测试**：renderer 新增 2 个 React Testing Library 测试文件
- **不影响**：Rust crate、IPC、preload、TS package（纯 renderer）
- **解锁**：ADR 0001 验收门 4（桥接产品级可见性）
- **预估工时**：1–2 小时（最小可见 `isAlive` 指示灯）→ 4 小时（含三字段 + 测试 + null 三态全覆盖）
