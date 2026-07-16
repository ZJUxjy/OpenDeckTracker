# 炉石对局建议 Agent（@hdt/advisor）设计文档

> 状态：已定稿，可直接按第 10 节实施计划执行
> 日期：2026-07-07

## 1. 目标与范围

在 OpenDeckTracker 内置一个基于 LLM 的**纯建议型**对局 agent：

- **模式**：仅标准 / 狂野对战（`FT_STANDARD` / `FT_WILD`）。
- **决策环节**：起手换牌（mulligan）建议、每回合行动序列建议、斩杀 / 危险主动提醒。
- **触发方式**：轮到本方回合自动生成建议 + 支持聊天式追问（"为什么不解那个随从？"）。
- **不做**：任何鼠标 / 键盘自动操作。agent 只输出文字建议，符合项目 "不修改游戏行为、不自动操作" 的定位。

## 2. 技术选型

| 关注点 | 选型 |
|---|---|
| Agent 运行时 | `@earendil-works/pi-agent-core`（tool calling、agent loop、状态管理） |
| LLM 接入 | `@earendil-works/pi-ai`（多 provider：OpenAI / Anthropic / Google / OpenAI 兼容本地端点） |
| 决策架构 | **LLM 主决策 + 确定性工具辅助**（tool calling 减少幻觉） |
| 代码位置 | 新 workspace 包 `packages/advisor`（`@hdt/advisor`），desktop 主进程集成 + overlay 渲染层 UI |

### 为什么 LLM + 工具而不是纯 prompt

炉石的数值计算（斩杀线、法力消耗、可行动作集）LLM 直接推理容易出错。方案：状态序列化进 prompt 供整体规划，同时暴露确定性工具供 LLM 验证关键计算。

## 3. 架构

```
┌─ Electron main ────────────────────────────────────────────┐
│  DeckTracker ──events──▶ AdvisorService                     │
│                            ├─ TurnTrigger（回合边界检测）    │
│                            ├─ StateSerializer（快照→文本）   │
│                            ├─ AdvisorAgent（pi-agent-core）  │
│                            │    └─ tools（@hdt/advisor）     │
│                            └─ ProviderConfig（pi-ai 多模型） │
│         ▲                          │                        │
│   IPC: advisor:ask (追问)     IPC: advisor:state 广播        │
└─────────┼──────────────────────────┼────────────────────────┘
          │                          ▼
┌─ Renderer (overlay) ───────────────────────────────────────┐
│  TrackerPanelTabs 新增 "建议" tab                            │
│    ├─ SuggestionPanel（结构化行动序列 + 理由）                │
│    ├─ AlertBanner（斩杀 / 危险提醒）                          │
│    └─ FollowUpChat（追问输入框 + 流式回复）                    │
│  设置页新增 "AI 建议" 区块（provider / model / key / 端点）    │
└────────────────────────────────────────────────────────────┘
```

### 3.1 新包 `packages/advisor`（纯领域，不依赖 Electron）

```
packages/advisor/src/
  agent/
    advisor-agent.ts      # pi-agent-core Agent 封装：system prompt、tool 注册、会话管理
    prompts.ts            # system prompt + 状态序列化模板（中/英）
    state-serializer.ts   # DeckTrackerSnapshot + 卡牌元数据 → 紧凑文本表示
  tools/
    lethal-tool.ts        # 斩杀线计算（复用/扩展 core 的 boardAttackToFace 逻辑）
    action-enum-tool.ts   # 枚举本回合合法动作（可下随从/可释放法术/可攻击目标/英雄技能）
    card-lookup-tool.ts   # 按 cardId/名称查卡牌全文（@hdt/hearthdb）
    mana-math-tool.ts     # 法力组合校验（"7 费能同时下 X+Y 吗"）
    deck-odds-tool.ts     # 剩余卡组抽牌概率（remaining + knownPositions）
  session/
    advisor-session.ts    # 每局一个会话；回合建议 + 追问共享上下文；回合历史滚动窗口
  types.ts                # AdvisorSuggestion / AdvisorAlert / AdvisorConfig 等
```

### 3.2 desktop 主进程 `apps/desktop/src/main/advisor.ts`

- 订阅 `tracker.on('state-change' | 'match-started' | 'match-ended')`。
- **回合触发**：监听 `recordCurrentPlayerChange` 对应的回合归属翻转 → 防抖（等 mirror 快照稳定，~1s）→ 调 `AdvisorSession.suggestTurn()`。
- **mulligan 触发**：`match-started` 后、手牌就绪且处于换牌阶段时触发一次。
- **斩杀提醒**：每次快照更新时先跑本地确定性 lethal 检查（零 token 成本）；命中才让 LLM 生成一句提醒/确认。
- 结果经 `broadcast('advisor:state', …)` 推给 overlay；追问经 `ipcMain.handle('advisor:ask', …)` 流式返回。

### 3.3 渲染层

- `TrackerPanelTabs` 增加可选 `advisorSlot`（沿用现有 slot 模式，仅玩家侧 overlay 传入）。
- `advisor-store.ts`（Zustand，沿用 `deck-tracker-store` 模式）。
- 建议以**结构化 JSON** 输出（agent 最终回答约定 schema），UI 渲染为步骤列表（每步：动作 + 目标 + 简短理由），卡牌名可 hover 显示卡图（复用现有卡图缓存）。
- 追问为普通聊天流，展示在建议下方。

## 4. 数据流：快照 → prompt

`DeckTrackerSnapshot` 已有：`friendlyHand`、`deck.remaining/extras/knownPositions`、`opponent.revealed/graveyard`、`opposingHandCount`、`friendlyEffects/opposingEffects`、`boardAttack/boardAttackToFace`、`friendlyHero/opposingHero`（血量护甲）、`friendlyGraveyard`、`opponentClass`、`matchInfo`。

序列化时用 `@hdt/hearthdb` 把 cardId 展开为：名称、费用、攻血、类型、关键词、**卡牌全文**（LLM 需要读效果文本才能决策）。

### 已知信息缺口（需要小幅扩展 tracker / mirror）

| 缺口 | 现状 | 补法 |
|---|---|---|
| 当前法力水晶（可用/总量） | 快照未暴露 | mirror 玩家实体有 RESOURCES tag；tracker 快照加 `friendlyMana` |
| 双方场面随从明细（每个随从的当前攻/血/tag：嘲讽、圣盾、剧毒、休眠…） | 只有 `boardAttack` 总和 + `extraDisplay.friendlyBoard`（仅 cardId） | 从 mirror `boardState` + tag overlay 导出 `boardMinions[]`（双方） |
| 回合数 | tracker 内部有 `recordTurnChange` 但快照未带 | 快照加 `turn` |
| mulligan 阶段识别 | 无显式标记 | 由 Power.log `MULLIGAN_STATE` tag 或 mirror 阶段推断，快照加 `isMulligan` |
| 英雄技能 / 武器 | 未暴露 | mirror 实体里有，快照加 `heroPower` / `weapon`（双方） |

这些扩展本身对 lethal calculator（在建）和对手预测也有复用价值，建议作为该提案的前置任务。

## 5. Agent 设计

### 5.1 System prompt 要点

- 角色：炉石传说职业选手级别教练，只基于给定的合法可见信息决策（不臆测对手手牌具体内容，只做概率推断）。
- 输出契约：最终回答必须是约定 JSON schema（`AdvisorSuggestion`），包含 `actions[]`（有序步骤）、`reasoning`（整体思路，≤3 句）、`alerts[]`（可选斩杀/危险标记）。
- 要求先调用 `action-enum-tool` 获取合法动作集、对斩杀判断必须调用 `lethal-tool` 验证。
- 语言跟随 app 当前 i18n locale（中/英）。

### 5.2 会话与成本控制

- 每局一个 `AdvisorSession`；回合建议之间保留**摘要化**历史（上回合建议 + 实际发生了什么），完整快照只带当前回合，控制上下文长度。
- 追问复用当前回合上下文。
- 设置项：自动建议开关、每回合最大 tool 轮数、（可选）仅手动触发模式作为省 token 后备。

### 5.3 Provider 配置（设置页）

- provider：`openai` / `anthropic` / `google` / `openai-compatible`（自定义 baseURL，覆盖 Ollama / vLLM / 各类中转）。
- 每 provider：API key（存本地 userData，不入库不上传）、model 名、可选 baseURL。
- 明确提示：开启 AI 建议后对局状态文本会发送给所选 LLM 端点——本地端点则完全不出机器。README 的隐私声明需同步更新此例外。

## 6. 关键交互时序（一个回合）

1. Power.log `CURRENT_PLAYER` 翻转为本方 → main 侧防抖 1s 等快照稳定。
2. 本地 lethal 预检 → 若可斩杀，UI 立即出确定性提示（不等 LLM）。
3. `StateSerializer` 生成回合状态文本 → `AdvisorSession.suggestTurn()`。
4. Agent loop：LLM ↔ tools（枚举动作 / 算斩杀 / 查卡）→ 输出 `AdvisorSuggestion` JSON。
5. IPC 广播 → overlay "建议" tab 渲染；期间显示 loading 态与流式 reasoning。
6. 用户可在输入框追问 → 同会话继续，流式返回。
7. 回合结束（`CURRENT_PLAYER` 翻转为对方）→ 取消未完成请求，摘要归档本回合。

边界情况：
- LLM 响应中回合已结束 → 丢弃结果并标注"已过期"。
- 请求失败 / key 未配置 → tab 内联错误提示，不影响记牌功能。
- 高速对局（快攻）下 LLM 慢：UI 明示"建议生成中"，本地 lethal 预检保证最关键信息零延迟。

## 7. 测试策略

- `@hdt/advisor` 工具层：纯函数单测（vitest），斩杀 / 动作枚举用构造局面 fixture。
- `StateSerializer`：快照 fixture → 快照测试（snapshot testing）。
- Agent 层：mock pi-ai transport，验证 tool 调用顺序与输出 schema 解析（离线可跑）。
- 端到端：录像回放（仓库已有 match recordings）驱动快照序列，人工评估建议质量。

## 8. 实施里程碑

1. **M1 快照扩展**：`friendlyMana` / `boardMinions` / `turn` / `isMulligan` / `heroPower` / `weapon`（tracker + mirror + 测试）。
2. **M2 advisor 包**：tools + serializer + session（离线单测全绿）。
3. **M3 主进程集成**：触发器 + IPC + provider 配置持久化。
4. **M4 UI**：overlay 建议 tab + 追问聊天 + 设置页；i18n。
5. **M5 打磨**：成本控制、过期丢弃、错误态、录像回放评估。

## 9. 已定决策

1. **pi 引入方式**：npm 固定版本引入 `@earendil-works/pi-agent-core` 与 `@earendil-works/pi-ai`（遵循仓库 pinned-version 约定，不做本地 workspace link）。
2. **建议 UI 位置**：玩家侧 overlay 新增 "建议" tab（沿用 `TrackerPanelTabs` 的 slot 模式）；独立窗口留作后续可选增强，不在本期范围。
3. **斩杀预检**：复用 `boardAttackToFace`（已含嘲讽 / 圣盾逻辑）。在 `@hdt/advisor` 中定义 `LethalPrecheck` 接口封装，当前实现直接消费快照里的 `boardAttackToFace` 与 `opposingHero`；lethal calculator 提案落地后替换实现即可，调用方不感知。
4. **建议历史持久化**：需要。每回合的 `AdvisorSuggestion`（含追问对话）随对局录像持久化，复盘时可见当时 AI 的建议。

## 10. 实施计划（供后续 session 执行）

> 执行约定：每个任务遵循仓库 TDD 流程（先失败测试 → 最小实现 → 绿 → commit，Conventional Commits）。任务间按依赖顺序执行；同一里程碑内标注 [P] 的任务可并行分给不同 session。开始 M2 前先跑 `pnpm install` 确认 pi 两个包已固定版本落锁。

### M1 — 快照扩展（前置，改 `@hdt/core` + `@hdt/hearthmirror` + desktop main）

- **T1.1** `DeckTrackerSnapshot` 新增 `turn: number | null`：tracker 已有 `recordTurnChange`，把当前回合数存入内部状态并写进 `buildSnapshot`。单测：turn 变更后快照携带正确值。
- **T1.2** 新增 `friendlyMana: { available: number; total: number } | null`：从 mirror 玩家实体 `RESOURCES` / `RESOURCES_USED` / `TEMP_RESOURCES` tag 读取（若 mirror 未暴露则先走 Power.log tag 通道，与 hero vitals 同路径）。
- **T1.3** [P] 新增 `boardMinions: { friendly: BoardMinion[]; opposing: BoardMinion[] }`，`BoardMinion = { entityId, cardId, atk, health, maxHealth, taunt, divineShield, poisonous, frozen, asleep, windfury, silenced }`：数据源与 `boardAttackToFace` 的 tag overlay 相同，抽出公共读取逻辑避免重复。
- **T1.4** [P] 新增 `isMulligan: boolean`：由 Power.log `MULLIGAN_STATE` tag 推断，POST mulligan 后清 false。
- **T1.5** [P] 新增 `friendlyHeroPower` / `opposingHeroPower` / `friendlyWeapon` / `opposingWeapon`（cardId + 武器攻/耐久）：来源 mirror 实体区（`HERO_POWER` / `WEAPON` zone）。
- **T1.6** 回归：`pnpm --filter @hdt/core test` 全绿；现有 overlay 不受新字段影响（字段全部 additive）。

### M2 — `packages/advisor` 新包（纯离线，依赖 M1 的类型）

- **T2.1** 包骨架：`package.json`（name `@hdt/advisor`，deps: `@hdt/core`、`@hdt/hearthdb`、`@hdt/shared`、`@earendil-works/pi-agent-core`、`@earendil-works/pi-ai` 均 pinned）、tsconfig、vitest 接入 workspace。
- **T2.2** `types.ts`：`AdvisorSuggestion { actions: SuggestedAction[]; reasoning: string; alerts: AdvisorAlert[] }`、`SuggestedAction { kind: 'play'|'attack'|'heroPower'|'trade'|'hold'|'endTurn'; cardId?; targetCardId?; note }`、`AdvisorAlert { type: 'lethal'|'danger'; detail }`、`AdvisorConfig`（provider/model/baseURL/key 引用/自动开关/语言）。
- **T2.3** [P] `tools/lethal-tool.ts` + `LethalPrecheck` 接口（决策 #3）：输入快照，输出 `{ hasLethal, damage, requiredHealth }`。
- **T2.4** [P] `tools/action-enum-tool.ts`：基于 `friendlyHand`（费用）、`friendlyMana`、`boardMinions`、heroPower 枚举合法动作集（不建模复杂目标合法性，标注 "target required" 即可，细节交给 LLM）。
- **T2.5** [P] `tools/card-lookup-tool.ts`、`tools/mana-math-tool.ts`、`tools/deck-odds-tool.ts`（超几何分布抽牌概率）。
- **T2.6** `agent/state-serializer.ts`：快照 + `@hdt/hearthdb` 元数据 → 紧凑 markdown 状态文本（含卡牌全文）；vitest snapshot 测试锁格式。
- **T2.7** `agent/prompts.ts` + `agent/advisor-agent.ts`：pi-agent-core Agent 组装，注册 T2.3–T2.5 工具，最终输出强制 `AdvisorSuggestion` JSON schema；解析失败时一次重试。中/英双语 system prompt。
- **T2.8** `session/advisor-session.ts`：`suggestMulligan()` / `suggestTurn()` / `ask(question)` / `endTurn(summary)`；回合历史摘要滚动窗口（保留最近 N=3 回合摘要）；in-flight 请求可取消（AbortSignal）。
- **T2.9** Agent 层离线测试：mock pi-ai transport，断言工具调用顺序（先 action-enum，斩杀断言必经 lethal-tool）与 schema 解析。

### M3 — desktop 主进程集成

- **T3.1** `apps/desktop/src/main/advisor.ts`：`startAdvisor(tracker)`，订阅 `state-change` / `match-started` / `match-ended`；回合归属翻转检测 + 1s 防抖后触发 `suggestTurn`；`isMulligan` 就绪时触发一次 `suggestMulligan`；每快照跑 `LethalPrecheck`（零 token），命中即广播确定性 alert。
- **T3.2** IPC：`advisor:state` 广播（建议 / loading / error / stale）、`ipcMain.handle('advisor:ask')` 流式追问、`advisor:config get/set`；preload 暴露 `window.hdt.advisor`。
- **T3.3** 配置持久化：`AdvisorConfig` 存 userData（沿用现有 settings store 模式）；API key 仅本地存储；未配置时 advisor 整体休眠，不影响记牌。
- **T3.4** 过期处理：回合翻转 / match-ended 时 abort 未完成请求；迟到结果标 `stale` 丢弃。
- **T3.5** 建议历史持久化（决策 #4）：`match-ended` 时把本局全部 `AdvisorSuggestion` + 追问对话写入对局录像记录（recordings 存储 additive 字段），复盘页可读。

### M4 — 渲染层 UI

- **T4.1** `advisor-store.ts`（Zustand，模式同 `deck-tracker-store`）+ `use-advisor.ts` hook 订阅 IPC。
- **T4.2** `TrackerPanelTabs` 增加可选 `advisorSlot`；`OverlayView`（玩家侧）传入 `AdvisorPanel`。
- **T4.3** [P] `AdvisorPanel`：行动步骤列表（卡牌名 hover 卡图，复用现有卡图缓存协议）、reasoning、AlertBanner（lethal 红色高亮）、loading / stale / error 态。
- **T4.4** [P] `FollowUpChat`：输入框 + 流式回复展示，回合切换时清空输入保留历史。
- **T4.5** 设置页 "AI 建议" 区块：开关、provider 选择（openai/anthropic/google/openai-compatible）、model、baseURL、API key（密码框）、语言跟随 app locale；含 "数据将发送至所选 LLM 端点" 的隐私提示文案。
- **T4.6** i18n：全部新文案补 zh/en 词条；README 隐私声明补充 AI 建议例外说明。

### M5 — 打磨与验证

- **T5.1** 复盘页展示历史建议（读取 T3.5 持久化数据）。
- **T5.2** 成本控制设置：自动/手动触发切换、每回合最大 tool 轮数上限。
- **T5.3** 录像回放驱动的快照序列回归脚本，人工评估建议质量并迭代 prompt。
- **T5.4** 全仓 `pnpm lint && pnpm typecheck && pnpm test` 绿；按仓库流程写/归档 OpenSpec 变更。

### 验收标准（DoD）

- 配好 key 后进入一局标准对战：mulligan 出现留牌建议；每个己方回合自动出现行动序列；可追问并得到流式回答；可斩杀回合出现即时红色提醒（早于 LLM 响应）。
- 未配置 key / 断网时记牌器一切功能不受影响。
- 对局结束后在复盘中能看到每回合当时的建议。
- 本地端点（OpenAI 兼容）配置后全程无外网调用（卡图 CDN 除外）。

## 11. 实施进度审核（2026-07-07，分支 `codex/advisor-agent` @ f56ad61，worktree `.worktrees/advisor-agent`）

### 已完成（验证通过）

| 里程碑 | 状态 | 验证 |
|---|---|---|
| M1 T1.1–T1.6 快照扩展 | ✅ 全部完成 | `turn` / `isMulligan`（mirror `isMulligan()` 反射器）/ `friendlyMana` / `boardMinions` / heroPower / weapon 均已入快照；`@hdt/core` 442 测试全绿 |
| M2 T2.1–T2.9 advisor 包 | ✅ 全部完成 | pi 两包 pinned `0.80.3`；5 工具 + serializer + `AdvisorAgentRunner`（含 JSON 修复重试、tool discipline 校验）+ `AdvisorSession`（摘要窗口、abort）；31 测试全绿 |
| M3 T3.2 IPC + preload | ✅ | 5 个 channel + `window.hdt.advisor` 已暴露 |
| M3 T3.3 配置持久化 | ✅ | `advisor-config-store.ts`：schemaVersion、原子写、secrets 分离、`isConfigured` |
| M3 T3.4 过期处理 | ✅ | `startAdvisor` 内 seq guard + abort + stale 广播，有测试 |
| M3 T3.5 建议历史入录像 | ✅ | recorder/store 已扩展 `RecordedAdvisorHistoryEntry` |

### 发现的问题（按严重度）

1. **[阻塞] 组装层缺失**：`startAdvisor` 只有测试在调用，应用启动路径没接；`ipc.ts` 里 `ask` 是抛错占位符；**没有任何代码从 `AdvisorConfig` 构建 pi-ai `Model`**，也没有把 serializer + `AdvisorAgentRunner` + `AdvisorSession` 组合成 `createSession` 工厂。当前功能实际不可用。
2. **[高] 回合归属判断缺失**：`advisor.ts` 的 `defaultShouldSuggestTurn` 只看 `turn` 数变化——**对手回合也会触发建议**。快照没有 `isLocalTurn` 字段（tracker 内部已有 `currentTurnController`，只差暴露）。
3. **[中] lethal alert 会覆盖已有建议**：`handleStateChange` 里 lethal 命中时广播 `{ status:'ready', suggestion:null }`，UI 侧若直接整体替换 state 会把已展示的建议清掉；且斩杀持续期间每个 snapshot 重复广播。需 main 侧去重 + 渲染层 store 定义合并语义。
4. **[中] API key 无 IPC 通道**：config store 有 `setApiKey/getApiKey`，但 `advisor-ipc.ts` 没有对应 channel，渲染层设置页无法写 key。
5. **[低] ask 流式为空壳**：`ADVISOR_ASK_CHUNK_CHANNEL` 通道就绪，但 `AdvisorAgentRunner.ask` 等完整回答后一次性返回，从不产生 chunk。组装时需把 agent 的 streamFn/事件接到 emitChunk，或本期接受非流式并注明。
6. M4（渲染层）完全未开始：renderer 目录零 advisor 代码。

## 12. 修订后的剩余计划

> 在 `codex/advisor-agent` 分支继续。顺序：M3.5 →（M4 各任务多数可并行）→ M5。

### M3.5 — 组装与修复（新，优先级最高）

- **T3.6** 快照暴露 `isLocalTurn: boolean`（tracker 用 `isLocalPlayerTurn()` 写入 `buildSnapshot`，blankSnapshot 置 false）；`defaultShouldSuggestTurn` 增加 `current.isLocalTurn` 条件 + 测试（对手回合不触发）。→ 修问题 2
- **T3.7** `apps/desktop/src/main/advisor-model.ts`：`AdvisorConfig` → pi-ai `Model` 工厂（openai / anthropic / google / openai-compatible + baseURL + key 解析自 config store）；未配置返回 null。单测覆盖四种 provider 分支。→ 修问题 1
- **T3.8** `createSession` 工厂：组合 `StateSerializer`（快照 provider 读 tracker 最新 snapshot）+ `createAdvisorAgent` + `AdvisorAgentRunner` + `AdvisorSession`；语言取自 config。→ 修问题 1
- **T3.9** 启动接线：应用启动（deck-tracker 启动处）调用 `startAdvisor`，`broadcast` 用 `broadcastAdvisorState`；`ipc.ts` 的 `ask` 占位符替换为 `handle.ask`；config `enabled=false` 或未配置时 advisor 休眠（`createSession` 返回 null 已支持）；config 变更时重建。→ 修问题 1
- **T3.10** IPC 增加 `advisor:api-key:set`（provider + key → `setApiKey`，返回更新后的 `apiKeyRef`）+ preload 暴露 + 测试。→ 修问题 4
- **T3.11** lethal alert 去重：main 侧记录上次 alert 指纹，仅在 hasLethal 边沿（false→true 或数值变化）广播；广播结构改为不覆盖 suggestion（alerts 独立字段随最新建议一起带出）。→ 修问题 3
- **T3.12**（可选，随 T3.9）ask 流式：若 pi-agent-core 事件流可拿到增量文本则接 `emitChunk`；否则本期一次性返回，UI 显示 spinner。→ 问题 5

### M3.5 验收记录（2026-07-07，@ da2f683）

| 任务 | 结论 |
|---|---|
| T3.6 `isLocalTurn` | ✅ 快照 + `defaultShouldSuggestTurn` 守卫 + 测试（core 443 绿） |
| T3.7 Model 工厂 | ✅ `advisor-model.ts` 四 provider 分支 + 自定义模型回退 + `StaticCredentialStore`，有测试 |
| T3.8 `createSession` 工厂 | ✅ `advisor-session-factory.ts` 组合 serializer + runner + session，有测试 |
| T3.9 启动接线 | ✅ `index.ts` → `startAdvisorService` → `rebuildAdvisor`；ask 占位符已替换；config 变更重建；before-quit dispose |
| T3.10 api-key IPC | ✅ `advisor:api-key:set` + preload `setApiKey`，有测试 |
| T3.11 lethal 去重 | ✅ 指纹去重 + 广播保留 `currentSuggestion`（非破坏性） |
| T3.12 ask chunk | ✅（最小实现）完整回答作为单个 chunk 发出，符合计划中的非流式后备选项 |

测试：`@hdt/advisor` 31 绿、`@hdt/core` 443 绿、desktop main advisor 相关 35 绿。

**验收遗留（非阻塞，转入后续任务）：**

- **[跟进 A]** 分支 typecheck 失败：`LiveDeckSyncResult.removed` 相关错误为分支基点（2208c6e）遗留、main 已修复且与 advisor 无关。**动作：merge main 进 `codex/advisor-agent`**（M4 开工前做）。
- **[跟进 B]** `advisor-session-factory.ts:89` 把 `config.maxToolRounds` 误用作会话摘要 `historyLimit`——语义错位，应各自独立配置。归入 T5.2 修正。
- **[跟进 C]** lethal alert 只在指纹变化且非 null 时广播：斩杀窗口消失后（指纹变 null）不发清除广播，UI 会残留过期 alert。T4.1 store 设计时处理，或 main 侧补一次清除广播。

### M4 — 渲染层 UI（细化版，2026-07-07 更新）

> 前置：**T4.0 必须最先做**。路径均相对 `apps/desktop/src/renderer/src/`。每个任务先写测试（渲染层测试在 `apps/desktop/src/renderer/tests/`，vitest + testing-library，参考现有 `*.test.tsx`）。

- **T4.0** merge `main` 进 `codex/advisor-agent`，解掉基点遗留的 `LiveDeckSyncResult.removed` typecheck 错误（跟进 A）；merge 后全仓 `pnpm typecheck` 须绿。
- **T4.1** `stores/advisor-store.ts`：Zustand，模式照抄 `stores/deck-tracker-store.ts`。State：`{ status, suggestion, alerts, error, updatedAt }`（即 `AdvisorMainState`）+ `applyState(state)`。**合并语义**：`suggestion` 与 `alerts` 独立保留——`status:'stale'|'error'` 不清 `alerts`；连续两次 `updatedAt` 之间 alerts 为空且上一条是 lethal 时视为解除（处理跟进 C 的残留问题；若改在 main 侧发清除广播，则此条简化为直接覆盖）。订阅在 App 挂载处：`window.hdt.advisor.onState(applyState)`（模式参考 deck-tracker snapshot 订阅）。
- **T4.2** `components/TrackerPanelTabs.tsx`：`Tab` union 加 `'advisor'`，props 加可选 `advisorSlot?: ReactNode` + `advisorBadge?: boolean`（有未读建议/lethal 时显示圆点，样式照抄 `effectsCount` badge）；tab pill `testId="tracker-tab-advisor"`，文案 key `tracker.tabAdvisor`。`OverlayView.tsx` 传入 `advisorSlot={<AdvisorPanel />}`；`OpponentOverlayView` 不传。
- **T4.3** [P] `components/AdvisorPanel.tsx`：布局仿 `LiveNarrationPanel`（标题栏 + 滚动内容区 + `NO_DRAG`）。内容自上而下：
  - AlertBanner：`alerts` 非空时红色高亮条（lethal 用 `text-red`/边框强调），`data-testid="advisor-alert"`。
  - 建议区：`suggestion.actions[]` 有序步骤列表（序号 + kind 图标 + 卡名 + note），`reasoning` 小字段落；卡名 hover 触发 `window.hdt` 的 card-preview 协议（参考 `LiveDeckPanel` 行 hover 实现）。
  - 状态区：`loading` spinner + "生成中"；`stale` 灰字"已过期"；`error` 内联错误 + 重试提示；`idle` 空态文案（未配置时引导去设置页）。
- **T4.4** [P] `components/AdvisorFollowUpChat.tsx`（AdvisorPanel 底部内嵌）：输入框 + 发送按钮，调 `window.hdt.advisor.ask(q)`；`onAskChunk` 订阅追加到当前回答气泡（T3.12 目前是单 chunk，代码按流式写、天然兼容）；请求中禁用输入；历史保留在组件 state（回合切换不清空，match-ended 清空——监听 store `status:'idle'`）。
- **T4.5** `components/Settings.tsx`：`categories` 数组加 `{ id: 'advisor', labelKey: 'settings.advisor.categoryLabel', icon: Sparkles }`（lucide）。区块内容用现有 `SettingsRow` / `SettingsSegment` / `ReferenceToggle`：
  - 开关（`config.enabled`）、自动建议开关（`autoSuggest`）；
  - provider 四选一 Segment、model 文本框、baseURL 文本框（仅 openai-compatible 时显示）；
  - API key 密码框：保存走 `window.hdt.advisor.setApiKey(provider, key)`，返回的 `apiKeyRef` 回写 config 后 `setConfig`；已配置时显示 "已设置" 占位，不回显明文；
  - 隐私提示常显文案（`settings.advisor.privacyNote`）。
  - 载入时 `getConfig()` 初始化本地表单 state；语言字段直接跟随 app locale，不单独出 UI。
- **T4.6** i18n + 文档：新词条全部写入 `resources/locales/en-US.json` 与 `zh-CN.json`（`tracker.tabAdvisor`、`advisor.*`、`settings.advisor.*`）；README 隐私声明补充 "启用 AI 建议后对局状态发送至所选 LLM 端点" 例外。
- **T4.7** 收尾验证：`pnpm --filter desktop test` 全绿、全仓 typecheck/lint 绿；随后按第 12 节"真机冒烟清单"跑一局实测（这是 M4 的 DoD）。

依赖关系：T4.0 → T4.1 → T4.2 →（T4.3 ∥ T4.4 ∥ T4.5）→ T4.6 → T4.7。

### M4 验收记录（2026-07-07，main 工作区未提交变更 @ e2428be 之上）

| 任务 | 结论 |
|---|---|
| T4.0 merge | ✅ 以反向方式完成（`codex/advisor-agent` 已 merge 进 main，949ad53）；desktop typecheck 0 错误 |
| T4.1 store | ✅ `stores/advisor-store.ts`：`stale`/`error` 保留 suggestion+alerts，`idle` 全清；`hooks/use-advisor.ts` 挂载于 `App.tsx` 根部 |
| T4.2 tab | ✅ `advisorSlot` + `advisorBadge`（alerts 非空亮点），`OverlayView` 传入，对手侧未传 |
| T4.3 面板 | ✅ `AdvisorPanel.tsx`：StatusPill + AlertBanner（lethal 红色）+ 步骤列表（kind 标签 + CardToken hover 卡图走 `useCardPreview`）+ reasoning + 四态 Notice |
| T4.4 追问 | ✅ `AdvisorFollowUpChat.tsx`：chunk 流式追加（去重防单 chunk 双写）、pending 禁用输入、`status:'idle'` 清空 |
| T4.5 设置 | ✅ Settings 加 `advisor` 分类：双开关 / provider Segment / model / baseURL（仅 compatible 显示）/ key 密码框走 `setApiKey` 不回显 / 隐私提示 |
| T4.6 i18n + README | ✅ zh/en 词条齐全；README 增 Privacy Note（双语）及网络说明 AI 例外 |
| T4.7 验证 | ✅ advisor 相关 7 个测试文件 23 绿；渲染层全量 491/492 绿；typecheck 0 错误 |

**验收遗留：**

- **[跟进 C 已缓解]** lethal 残留：store 在 `loading`/`ready` 时整体替换 alerts，过期 alert 最迟在下一次建议调度时清除（同回合内短暂残留，可接受）。
- **[跟进 D]** `density.test.tsx` 1 例失败（Stats KPI `.kpi-card`）：**与 advisor 无关的既有失败**（在无 M4 变更的 worktree 上同样失败），需单独排查修复。
- **[环境]** `pnpm --filter desktop test` 的 pretest（better-sqlite3 native rebuild）在当前机器失败，直接 `vitest run` 正常；不影响 CI 结论但建议排查本机 node-gyp 环境。
- 变更尚未 commit：M4 全部内容在 main 工作区未提交状态，验收通过后应按 Conventional Commits 分批提交。

### M5 — 打磨与验证（原计划不变）

- T5.1 复盘页展示历史建议；T5.2 成本控制设置；T5.3 录像回放评估脚本；T5.4 全仓 lint/typecheck/test 绿 + OpenSpec 归档。

## 13. 缺陷修复与打磨记录（2026-07-16，main 工作区）

本节记录一次「回放真实对局 → 评审 advisor 链路」驱动的修复批次。方法：用录像 `events.jsonl` 逐事件回放 `HearthWatcherGameState.reducePowerEvent`，在本地回合边界重建 `AdvisorSerializableSnapshot` 后跑通 agent 流程（faux provider）。回放 harness 为一次性脚本（`tmp/replay-advisor/`，不入库），其结论直接催生了下列修复。

### 已修复并验证

| # | 问题 | 修复 | 提交 |
|---|---|---|---|
| 1 | preload 打包把 `node:fs`/`node:path` 经 `advisor-ipc.ts → advisor-config-store.ts` 再导出链拖进沙箱 preload，整个脚本在 `exposeInMainWorld` 前崩溃，渲染层 `window.hdt` undefined（白屏报错 `reading 'decks'`） | 频道常量抽到零依赖 `src/shared/ipc-channels.ts`，main/preload 双侧引用 | `f54d4c6` |
| 2 | 工具闭包开局快照：`action_enum`/`lethal_check`/`deck_odds`/`mana_math` 全程回答对局开始时的场面 | `CreateAdvisorAgentArgs.snapshot` 改为 `getSnapshot()` 惰性取值，工厂内文本序列化与工具共用一个实时访问器 | `743c3e0` |
| 3 | `autoSuggest` 设置项从未被主进程消费（开关无效） | `startAdvisor` 新增 `autoSuggest` 选项，关闭时换乱/回合建议与斩杀提醒全部静默，`ask` 保留；`ipc.ts` 接线 | `743c3e0` |
| 4 | `maxToolRounds` 被误用为 session `historyLimit` | 恢复本意：每次建议运行的工具执行预算，超预算调用短路并指示模型直接产出最终 JSON；runner 每轮重置预算 | `743c3e0` |
| 5 | ask 流式为空壳（原问题 5 / T3.12） | `runner.ask` 订阅 `text_delta` 逐段回调 `onChunk`；非流式 provider 兜底整段单 chunk；`handle.ask` 防重复。链路直抵渲染层 `AdvisorFollowUpChat`（M4 已订阅 `onAskChunk`） | 未提交 |
| 6 | 快照信息缺口：对手手牌数 / 已揭示牌 / 双方墓地未进 prompt | `AdvisorSerializableSnapshot` 新增 `opposingHandCount`、`opponentRevealed`、`opponentGraveyard`、`friendlyGraveyard`；序列化新增 `## Opponent` 与 `## Friendly Graveyard` 区块 | 未提交 |
| 7 | 录像写入放大：`recording.json`（~1MB pretty JSON）每条 PowerEvent 全量同步重写，一局 ~9500 次 | 中间事件 2s 节流（`persistIntervalMs` 可注入，0 = 旧行为）；开始/完成/中断立即写；`events.jsonl` 逐条追加不变 | 未提交 |
| 8 | 全仓 `eslint .` OOM（4GB 堆） | `.worktrees/`（5 个完整检出，类型感知 lint 图 ×6）及 `tmp/`、`data/`、各 agent 工具目录加入 ignores | 未提交 |
| 9 | lint 44 问题（25 错误） | 清零；仅剩 7 个 react-refresh 混合导出告警（`i18n/index.tsx`、`routes.tsx`，架构性保留） | 未提交 |
| 10 | [跟进 D] `density.test.tsx` KPI 断言失败 | `e502b8d` 给类名加了 `reference-stats-kpi` 前缀导致 `className="kpi-card` 首位匹配失败；断言放宽为类列表内匹配 | 未提交 |
| 11 | `log-watcher.test.ts` 固定 sleep 在全量负载下抖动 | 改为 `waitForCondition` 轮询条件；连续 3 次 + 全量负载验证稳定 | 未提交 |

### 环境说明（非代码问题）

- 5 个 sqlite 测试文件（`deck-store`、`match-history-store`、`collection-snapshot-store`、`player-profile-store`、`deck-store.active-deck`）在直接 `vitest run` 下报 `NODE_MODULE_VERSION` 不匹配：`better-sqlite3` 当前为 Electron 编译（136），系统 node 需要 127。项目既有流程是 `pnpm test`（pretest 先 `pnpm rebuild:node`），dev 启动时 predev 再 `rebuild:native` 切回 Electron。**正在运行的 app 会锁住 `.node` 文件，需关闭后再跑 `pnpm test`。**
- `scripts/prepare-native-runtime.test.ts` 的 EPERM 同为运行中 app 锁文件所致。

### 测试现状（2026-07-16）

- 根套件 1658 用例：1595 绿，62 失败全部位于上述 6 个环境受限文件；其余包（advisor 35、core 444、hearthdb 57、hearthmirror 56、hearthwatcher 56、shared 1）全绿。
- eslint 0 错误 / 7 警告（见 #9）；`tsc --noEmit`：desktop、core、advisor 均 0 错误。

### 真机冒烟清单（M3.5 完成后即可做）

1. 配置 openai-compatible + 本地端点，`pnpm dev` 起 app，进一局对战。
2. 观察 main 进程日志：mulligan 触发一次、每个己方回合触发一次、对手回合不触发。
3. 场面可斩杀时 alert 先于 LLM 响应出现。
4. 对局结束后录像记录含 advisor history。
