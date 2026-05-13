# 萨满祭司 (Shaman) 额外显示审核

## 概览
- 卡牌总数: 19
- 建议保留并显示: 17
- 建议移除: 2
- 需要修正: 9

> 说明：保留数 + 移除数 = 总数；"需要修正"统计的是保留但 displayType/stateNeeded/文案需要调整的牌（与"保留"集合有重叠）。

## 逐卡审核

### 1. 可信的伪装 (CORE_REV_920)
- **卡牌文本**: 将一个友方随从变形成为法力值消耗增加（2）点的随从。注能（）：改为变形所有友方随从。
- **当前建议 displayType**: `infuse_progress`
- **审核结论**: ✅ 保留
- **问题**: 总体合理。注能（Infuse）效果需要按手牌实体跟踪友方死亡次数。`suggestedDisplayTextZhCN` 中 `{effectPreview}` 偏抽象。
- **修正建议**:
  - 保留 `displayType=infuse_progress`、`stateNeeded` 列表正确。
  - 文案改为更具操作性的形式：`注能进度：{progress}/{required}（已注能：变形全部友方随从 / 未注能：变形一个友方随从）`，让玩家一眼看到当前条件下会触发哪种效果。
  - `displaySurfaces` 可仅保留 `hand` 与 `hover`，无需在牌库显示（牌库中没有实体级注能计数）。

### 2. 图腾物证 (CORE_MAW_003)
- **卡牌文本**: 选择一个基础图腾并召唤它。注能（个图腾）：改为召唤全部4个。
- **当前建议 displayType**: `infuse_progress_by_tribe`
- **审核结论**: ⚠️ 需修正
- **问题**: 注能条件应为"友方图腾死亡次数"而非泛友方死亡，`displayType` 名称暗示按部族跟踪，但 `stateNeeded` 与卡 1 完全相同，没有体现"图腾"过滤；文案不会告诉玩家"剩几只图腾要死"。
- **修正建议**:
  - 保留 `infuse_progress_by_tribe`，但补充 `stateNeeded`：`friendlyTotemDeathsWhileThisEntityInHand`（替换/补充泛 friendlyDeaths）。
  - 文案：`注能（图腾死亡）：{progress}/{required}（已注能：召唤全部4个基础图腾 / 未注能：选择召唤1个）`。
  - displaySurfaces 同上，限定 `hand` + `hover`。

### 3. 沼泽之子 (CORE_BT_115)
- **卡牌文本**: 战吼：如果你在上回合施放过法术，发现一张法术牌。
- **当前建议 displayType**: `last_turn_condition`
- **审核结论**: ✅ 保留
- **问题**: 条件清晰；只需展示"上回合是否施放过法术"的布尔状态（可附带数量）。当前模板 `{historySummary}` 过宽。
- **修正建议**:
  - 文案：`上回合法术：{count} 张（{满足/未满足}发现条件）`。
  - `stateNeeded` 收紧为 `spellsCastLastTurnCount`（或保留通用历史并在渲染时过滤）。
  - displaySurfaces 限定 `hand` + `hover`，牌库阶段无意义。

### 4. 派对图腾 (CORE_REV_935)
- **卡牌文本**: 在你的回合结束时，随机召唤一个基础图腾。注能（）：改为召唤两个。
- **当前建议 displayType**: `infuse_progress`
- **审核结论**: ✅ 保留
- **问题**: 与卡1同类，建议同样优化文案与显示面。
- **修正建议**:
  - 文案：`注能进度：{progress}/{required}（已注能：每回合结束召唤2个图腾 / 未注能：召唤1个）`。
  - displaySurfaces 限定 `hand` + `hover`。

### 5. 锻石师 (CORE_REV_921)
- **卡牌文本**: 战吼：在本局对战的剩余时间内，你的图腾拥有+2攻击力。
- **当前建议 displayType**: `persistent_effect_counter`
- **审核结论**: ❌ 移除
- **问题**: 这是一次性战吼，效果是"本局图腾+2攻击力"。这种全局Buff一旦打出就持续生效，对手或玩家通过现场图腾的攻击数值即可直接看到，不存在隐藏状态需要悬停回查。在 hand/deck 中悬停时也并无动态信息要展示（卡牌文本即是全部信息），属于固定效果。
- **修正建议**: 移除 `extraDisplay`。如果想要做"本局已生效Buff列表"的全局信息板，可作为另一类全局UI，但不应挂在这张牌的悬停上。

### 6. 深渊魔物 (CORE_OG_028)
- **卡牌文本**: 嘲讽。在本局对战中，你每召唤一个图腾，本牌的法力值消耗便减少（1）点。
- **当前建议 displayType**: `cost_progress`
- **审核结论**: ✅ 保留
- **问题**: 类型正确。文案模板过抽象，未点明"图腾召唤计数"这一关键。
- **修正建议**:
  - 文案：`本局已召唤图腾：{count}；当前费用：{currentCost}`。
  - `stateNeeded` 明确为 `friendlyTotemsSummonedThisGame`、`currentCost`。
  - displaySurfaces 保留 `deck`、`hand`、`hover`（手牌/牌库内都需要看到即时费用）。

### 7. 荒蛮之主卡利莫斯 (Core_UNG_211)
- **卡牌文本**: 战吼：如果你在上个回合使用过元素牌，则施放一个元素祈咒。
- **当前建议 displayType**: `last_turn_condition`
- **审核结论**: ✅ 保留
- **问题**: 类型正确。需要明确"上回合元素牌"而非泛历史。
- **修正建议**:
  - 文案：`上回合元素牌：{count} 张（{满足/未满足}战吼条件）`。
  - `stateNeeded` 收紧为 `elementalsPlayedLastTurnCount`。
  - displaySurfaces 限定 `hand` + `hover`。

### 8. 图腾巨像 (CORE_REV_838)
- **卡牌文本**: 在本局对战中，你每召唤一个图腾，本牌的法力值消耗便减少（1）点。
- **当前建议 displayType**: `cost_progress`
- **审核结论**: ✅ 保留
- **问题**: 与卡 6 同类，文案过宽。
- **修正建议**: 同卡 6：`本局已召唤图腾：{count}；当前费用：{currentCost}`，`stateNeeded` 收紧。

### 9. 雪怒巨人 (CORE_ICC_090)
- **卡牌文本**: 在本局对战中，你每过载一个法力水晶，本牌的法力值消耗便减少（1）点。
- **当前建议 displayType**: `cost_progress`
- **审核结论**: ⚠️ 需修正
- **问题**: 类型正确，但 `stateNeeded`/`trackingHints` 未点出"本局过载总数"——这是萨满特有机制，需要单独跟踪。
- **修正建议**:
  - 保留 `cost_progress`。
  - `stateNeeded` 改为 `totalOverloadedCrystalsThisGame`、`currentCost`。
  - 文案：`本局已过载水晶：{count}；当前费用：{currentCost}`。

### 10. 明根捕食花 (EDR_477)
- **卡牌文本**: 嘲讽。在本局对战中，你每使用一次英雄技能，本牌的法力值消耗便减少（1）点。
- **当前建议 displayType**: `cost_progress`
- **审核结论**: ⚠️ 需修正
- **问题**: 类型正确；`trackingHints`/`stateNeeded` 未提"英雄技能使用次数"。
- **修正建议**:
  - `stateNeeded`：`heroPowerUsesThisGame`、`currentCost`。
  - 文案：`本局已使用英雄技能：{count} 次；当前费用：{currentCost}`。

### 11. 麦琳瑟拉 (EDR_238)
- **卡牌文本**: 战吼：复活所有 法力值消耗大于或等于（8）点的不同的友方随从。
- **当前建议 displayType**: `graveyard_pool_by_cost`
- **审核结论**: ✅ 保留
- **问题**: 完全合理。需要展示墓地里费用≥8 的不同友方随从池。
- **修正建议**:
  - 文案：`墓地候选（费用≥8，不重复）：{cardNames}；预计复活：{count} 个`。
  - `stateNeeded`：`friendlyGraveyardMinionsCostGte8Distinct`。
  - displaySurfaces 限定 `hand` + `hover`（手牌中查阅最有用）。

### 12. 登山地图 (TLC_464)
- **卡牌文本**: 发现一张你未使用过的类型的随从牌，如果你在本回合中使用该牌，再从其余选项中选择一张。
- **当前建议 displayType**: `played_type_tracker`
- **审核结论**: ✅ 保留
- **问题**: 关键是"已使用过的随从类型（部族/学派/起源 中的部族）"清单，文案没说清。
- **修正建议**:
  - 文案：`本局已使用部族：{tribeList}；可发现：{remainingTribes}`。
  - `stateNeeded`：`tribesOfMinionsPlayedThisGame`、`unplayedTribes`。
  - displaySurfaces 限定 `hand` + `hover`。

### 13. 熔爪巨龙 (TLC_482)
- **卡牌文本**: 战吼：召唤两个2/1的炽烈烬火。延系：触发你的炽烈烬火的 亡语。
- **当前建议 displayType**: `condition_and_related_board_highlight`
- **审核结论**: ❌ 移除
- **问题**: 战吼与延系效果都是固定的——召唤两个固定衍生物，并触发场上现有炽烈烬火的亡语。"场上有几个炽烈烬火"玩家直接看场面即可，没有隐藏的历史状态需要回查；衍生物本身是固定 token，悬停信息无新增价值。
- **修正建议**: 移除 `extraDisplay`。如果未来想做"场上相关 token 高亮"，应作为通用关联高亮系统而非这张牌特有的悬停面板。

### 14. 始源监督者 (TIME_213)
- **卡牌文本**: 战吼：如果你在本牌在你手中时施放过自然法术，获得+1/+1并抽一张牌。
- **当前建议 displayType**: `while_holding_condition`
- **审核结论**: ✅ 保留
- **问题**: 类型完全正确（按手牌实体跟踪持有期间自然法术）。文案模板偏抽象。
- **修正建议**:
  - 文案：`持有期间已施放自然法术：{count}（{已满足/未满足}：+1/+1并抽1）`。
  - `stateNeeded`：`natureSpellsCastWhileThisEntityInHand`。
  - displaySurfaces 限定 `hand` + `hover`。

### 15. 先知者沃 (TIME_013)
- **卡牌文本**: 扰魔。在你施放一个法术后，发现一张来自过去的自然法术牌。
- **当前建议 displayType**: `candidate_pool`
- **审核结论**: ⚠️ 需修正
- **问题**: "来自过去的自然法术"指狂野/已轮替的旧版自然法术池，这是一个静态卡池（按版本固定），并非玩家行为生成；它不是"随机候选池随对局变化"。把它当 candidate_pool 容易暗示动态变化，实际更接近"参考池预览"（玩家不一定记得有哪些旧自然法术）。优先级 `low` 合理。
- **修正建议**:
  - displayType 改名为 `static_reference_pool`（或保留 `candidate_pool` 并在 reasoning 中说明是静态卡池）。
  - 文案：`可发现池：来自过去版本的自然法术（共 {poolSize} 张可发现）`，可在悬停中折叠显示 top-N 示例。
  - `stateNeeded`：`pastNatureSpellPool`（静态卡池数据）。
  - 可考虑直接移除（玩家通常无需逐张预览整个旧法术池），但保留为 low 优先级也可接受。

### 16. 失控龙蛙 (END_030)
- **卡牌文本**: 扰魔。嘲讽。在本局对战中，你每过载一个法力水晶，本牌的法力值消耗便减少（1）点。
- **当前建议 displayType**: `cost_progress`
- **审核结论**: ⚠️ 需修正
- **问题**: 与卡 9 同机制。需要明确"本局过载水晶总数"。
- **修正建议**:
  - 同卡 9：`stateNeeded` = `totalOverloadedCrystalsThisGame`、`currentCost`；文案 `本局已过载水晶：{count}；当前费用：{currentCost}`。

### 17. 雷鸣流云 (CATA_563)
- **卡牌文本**: 战吼：选择并吸收你手牌中一张法力值消耗小于或等于（4）点的法术牌。亡语：施放该法术。
- **当前建议 displayType**: `stored_card_state`
- **审核结论**: ✅ 保留
- **问题**: 正确——需要记录"被吸收的具体法术"，亡语结算时要回放。
- **修正建议**:
  - 文案：`已吸收法术：{spellName}（亡语时施放）`。
  - `stateNeeded`：`storedSpellEntityId`、`storedSpellCardId`。
  - displaySurfaces：`play`（场上随从悬停）+ `graveyard`（亡语已结算可回看）+ `hover`。当前缺 `play`，建议补上——这张牌在场时悬停最需要看到吸收的是哪张。

### 18. 升腾 (CATA_567)
- **卡牌文本**: 将所有友方随从变形成为法力值消耗增加（1）点的随从。当这些随从死亡时，召唤原随从。
- **当前建议 displayType**: `original_mapping`
- **审核结论**: ✅ 保留
- **问题**: 正确——每个被变形的随从需要绑定"原随从"，死亡时召回。是非常典型的 stored/transformed mapping 场景。
- **修正建议**:
  - 文案：`变形映射：{variantName} → {originalName}`（按场上每个被影响实体显示）。
  - `stateNeeded`：`transformedEntityToOriginalCardMap`。
  - displaySurfaces：变形后的随从悬停于场上时显示最有用，应加入 `play`（不仅是 `graveyard` + `hover`）。

### 19. 穆拉丁的奋战 (CATA_568)
- **卡牌文本**: 抽两张牌。在本局对战中，友方角色每攻击过一次，本牌的法力值消耗便减少（1）点。
- **当前建议 displayType**: `cost_progress`
- **审核结论**: ⚠️ 需修正
- **问题**: 类型正确；`stateNeeded`/`trackingHints` 未提"友方角色攻击次数"这一关键计数。
- **修正建议**:
  - `stateNeeded`：`friendlyCharacterAttacksThisGame`、`currentCost`。
  - 文案：`本局友方攻击次数：{count}；当前费用：{currentCost}`。

## 总结建议

1. **建议移除 2 张**：
   - 锻石师 (CORE_REV_921)——一次性全局 Buff，场面可见，无隐藏状态。
   - 熔爪巨龙 (TLC_482)——战吼/延系都是固定效果，相关 token 在场可见。

2. **萨满核心计数器机制**，建议在记牌器全局状态中沉淀以下"班级级"计数器，供本类牌共享读取：
   - `friendlyTotemsSummonedThisGame`（卡 6、卡 8 需要）
   - `totalOverloadedCrystalsThisGame` + `overloadedCrystalsThisTurn` + `lockedCrystalsNextTurn`（卡 9、卡 16 及未来过载相关牌共用）
   - `heroPowerUsesThisGame`（卡 10）
   - `friendlyCharacterAttacksThisGame`（卡 19）
   - `elementalsPlayedThisTurn` / `elementalsPlayedLastTurn`（卡 7 及通用元素归档）
   - `spellsCastLastTurn` 含学派分桶 / `natureSpellsCastWhileEntityInHand[entityId]`（卡 3、卡 14、卡 18）
   - 这些都属于已在 `trackingHints` 里提到但 `stateNeeded` 未具体化的数据，建议在实现时统一收敛。

3. **文案模板**：当前模板大量使用 `{historySummary}`、`{effectPreview}`、`{currentValue}` 这类抽象占位符；建议每张牌使用更具体的占位符（如 `{count}`、`{currentCost}`、`{tribeList}`），并在文案中点出条件满足/未满足的语义，使玩家无需对比卡牌原文就能行动。

4. **displaySurfaces 校正**：
   - 注能类（卡 1、卡 2、卡 4）：`hand` + `hover` 即可，`deck` 中无注能进度。
   - 上回合条件类（卡 3、卡 7）：`hand` + `hover`。
   - 全局费用递减类（卡 6、卡 8、卡 9、卡 10、卡 16、卡 19）：`deck` + `hand` + `hover` 合理保留。
   - 存储/绑定类（卡 17、卡 18）：建议补 `play`（场上随从悬停查看绑定）。

5. **优先级分层建议**：
   - high：注能进度（1、2、4）、过载/图腾/英雄技能/攻击费用递减（6、8、9、10、16、19）、墓地池（11）、持有期间历史（14）、存储/变形映射（17、18）、登山地图（12）。
   - medium：上回合条件（3、7）——逻辑简单但仍需历史。
   - low：先知者沃静态卡池（15），可在能力允许时再做。
