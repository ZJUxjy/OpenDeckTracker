# 战士 (Warrior) 额外显示审核

## 概览
- 卡牌总数: 8
- 建议保留并显示: 5
- 建议移除: 2
- 需要修正: 5（保留中有 5 张需要修正字段，另含 1 张介于移除/低优先级显示之间）

## 逐卡审核

### 2. 灌能战斧 (CORE_REV_933)
- **卡牌文本**: 在你的英雄攻击后，使你受伤的随从获得+1/+2。注能（）：改为+2/+2。
- **当前建议 displayType**: `infuse_progress`
- **审核结论**: ✅ 保留
- **问题**:
  - 建议的 `displayType`、`stateNeeded`、`displaySurfaces` 都合理。
  - `suggestedDisplayTextZhCN` 中的 `{effectPreview}` 占位符过于抽象，玩家不知道当前激活的是 +1/+2 还是 +2/+2。
- **修正建议**:
  - 文案建议直接渲染为「注能进度：{progress}/{required}（当前效果：+1/+2）」或注能完成后「注能已完成（+2/+2）」。
  - `stateNeeded` 中可保留 `friendlyDeathsWhileThisEntityInHand`，但应说明只在该实体进入手牌后开始计数（注能机制是按实体跟踪的，进入牌库或被偷走需重置）。
  - 仅 `hand`/`hover` 即可，`deck` 不需要（牌库中实体未生成时无法注能）。

### 5. 怨毒焰魔 (CATA_EVENT_002)
- **卡牌文本**: 战吼：如果你在本回合中施放过火焰法术，消灭一个随从。
- **当前建议 displayType**: `turn_condition`
- **审核结论**: ⚠️ 需修正
- **问题**:
  - 这是一个**本回合**布尔条件（是否已施放过火焰法术），不是连续计数也不是历史摘要。
  - `suggestedDisplayTextZhCN` 用「{stateSummary}」过于笼统，玩家需要的是一个明确的「✓ 已满足 / ✗ 未满足」。
  - 跟踪范围不应是 `cards_played_this_game` 之类整局历史，只需「本回合是否施放过 FIRE spell」。
- **修正建议**:
  - 文案：「本回合已施放火焰法术：是 / 否」；满足时高亮，未满足时灰色。
  - `stateNeeded` 收窄为 `fireSpellsCastThisTurnByYou`（布尔即可，或保留计数用于其它牌共用）。
  - `trackingHints` 应聚焦 `spells_cast_this_turn_by_school`（火焰系），不需要整局法术历史。

### 6. 屈从疯狂 (EDR_455)
- **卡牌文本**: 发现一条在本局对战中死亡的友方的龙，并再次召唤它。
- **当前建议 displayType**: `graveyard_candidate_pool`
- **审核结论**: ✅ 保留
- **问题**:
  - 类型与表面（graveyard/hand/hover）都合适。
  - 候选池筛选条件需明确：「本局已死亡」+「友方」+「龙族」+「随从（亡语再次召唤暗含可被召唤）」。
  - 文案中的 `{count}` 是冗余信息（候选名单本身就能数出来），可直接列名字。
- **修正建议**:
  - 文案：「墓地龙族候选（{n}）：{cardNames}」；候选过多时折叠。
  - `stateNeeded` 改为 `friendlyDragonMinionsDiedThisGame`（更具体），删除模糊的 `eligibleDeathrattleOrMinionPool`（亡语字段是误判，本牌不限亡语）。
  - 候选池为空时应显式提示「无可发现的目标」，避免玩家以为发现一定生效。

### 8. 伊森德雷 (EDR_465)
- **卡牌文本**: 嘲讽。亡语：在本局对战中伊森德雷每死亡过一次，随机召唤一条龙。
- **当前建议 displayType**: `dynamic_counter`
- **审核结论**: ⚠️ 需修正
- **问题**:
  - `dynamic_counter` 类型选择正确，但 `currentValue`/`currentCostOrCurrentValue` 字段名误导——本牌不改变费用或身材，改变的是「亡语触发时召唤的龙数量」。
  - `displaySurfaces` 写了 `deck`，但伊森德雷在牌库时该死亡次数无变化（玩家自身有时也想确认），可保留但优先级低；`hover`/`hand`/`play`（战场实体右上角）才是主舞台。
  - 文案 `{currentValue}` 含义不清。
- **修正建议**:
  - 文案：「已死亡 {n} 次 → 亡语将召唤 {n} 条龙」；n=0 时显示「首次亡语将不召唤任何龙」（注意规则文字是「每死亡过一次」，第一次死亡时该计数尚未发生，需确认游戏内具体计数时序，UI 应明确告知）。
  - `stateNeeded`: `isendreDeathCountThisGame`；不需要 `currentCostOrCurrentValue`。
  - 该计数对手牌、战场实体、墓地都应可悬停查看。

### 10. 时光领主埃博克 (TIME_714)
- **卡牌文本**: 战吼：消灭你的对手上回合使用的所有随从。
- **当前建议 displayType**: `last_turn_history`
- **审核结论**: ⚠️ 需修正
- **问题**:
  - 范围必须收窄到「对手上回合使用的随从」，而非整体 played history。
  - 「使用过」≈ 从手牌打出的随从（不含被效果召唤的衍生物，需注意游戏内判定通常对应 `PLAY` 而非 `SUMMON`）。
  - 「上回合」对玩家而言一般指**对手的上一个回合**（也可能解释为「自上次我方回合结束以来对手打过的随从」）；UI 应明确列出实际会被消灭的随从。
  - 还需考虑被消灭的随从可能此时已不在场上（已死亡或被沉默/变形），UI 列表应仅显示「仍在对手场上」的目标，避免误导战吼实际效果。
- **修正建议**:
  - 文案：「对手上回合打出的随从（仍在场）：{cardNames}」；列表为空时显示「无可消灭目标」。
  - `displayType` 可改为更具体的 `opponent_last_turn_minions_played`，或保留 `last_turn_history` 但补充 `filter: opponent, played, minion, still_on_board`。
  - `stateNeeded`: `opponentMinionsPlayedDuringTheirLastTurn` + `currentlyOnOpponentBoard` 交集。

### 11. 血斗士洛戈什 (TIME_850)
- **卡牌文本**: 奇闻 突袭。亡语：从你的手牌中召唤一位血斗士，使其获得+5/+5并随机攻击一个敌人。
- **当前建议 displayType**: `hand_candidate_pool`
- **审核结论**: ✅ 保留
- **问题**:
  - 类型正确：亡语从手牌中随机召唤「血斗士」标签的随从，玩家需要知道当前手牌里有哪些血斗士。
  - 「血斗士」是奇闻系列的关键字标签 `BLOODSPORT`/特定 tag，需确认实际数据字段是 `tags` 还是某分类；候选筛选必须精准。
  - 该牌在战场上时（亡语未触发前）也需要查看；`displaySurfaces` 仅写 `hand`/`hover` 太窄。
- **修正建议**:
  - 文案：「手牌中的血斗士（{n}）：{cardNames}」；为空时明确「无血斗士可召唤，亡语将无效果」。
  - `displaySurfaces` 补充 `play`（战场上悬停该实体时也显示）。
  - `stateNeeded`: `bloodsportMinionsInHand`（更精准，不要笼统的 `matchingCardsOrMinionsCurrentlyAvailable`）。
  - 该信息高度有用，`implementationPriority` 可从 medium 提升到 high。

### 12. 喷发火山 (CATA_584)
- **卡牌文本**: 造成3点伤害，随机分配到所有敌人身上。如果你在本回合中使用过火焰法术牌，再造成3点。
- **当前建议 displayType**: `turn_condition`
- **审核结论**: ⚠️ 需修正
- **问题**:
  - 与 #5 怨毒焰魔同类条件：本回合是否施放过火焰法术（额外 +3 伤害的触发条件）。
  - 注意一个边界：玩家若先点开/使用该地标，再「在本回合内」再次使用火焰法术，可能不满足触发顺序——但规则文字「使用过」是历史性，下次激活该地标即可参与计数。UI 显示当前回合状态即可，玩家自行判断顺序。
  - 文案过于通用。
- **修正建议**:
  - 文案：「本回合已施放火焰法术：是 → 共 6 点 / 否 → 共 3 点」（直接预览总伤害最直观）。
  - `stateNeeded`: `fireSpellsCastThisTurnByYou`。
  - 与怨毒焰魔共用同一份「本回合火焰法术」状态。

### 14. 洛戈什的奋战 (CATA_610)
- **卡牌文本**: 使一个随从获得"亡语：从你的手牌中随机召唤一个随从。"
- **当前建议 displayType**: `hand_candidate_pool`
- **审核结论**: ❌ 移除（或降为极低优先级）
- **问题**:
  - 「从你的手牌中随机召唤一个随从」**无任何筛选条件**——只要手牌里有随从都是候选。
  - 手牌信息玩家本就能直接查看，记牌器在悬停时再重复一遍价值有限；候选随机性也使列表无法预测结果。
  - 与 #11 血斗士洛戈什不同，那张牌限定 `BLOODSPORT` 标签，候选不可一眼看清，故需要辅助；本牌不存在筛选困难。
- **修正建议**:
  - 建议移除 `extraDisplay`；如确实希望显示，可降级为「手牌中随从数量：{n}」的简单角标（避免重复展示手牌全列表）。
  - 不需要 `deathrattle_card_locations` / `deathrattle_trigger_events`（该亡语是附加给目标随从的，跟踪意义不大）。

## 总结建议

1. **移除 1 张**：#14 洛戈什的奋战——无筛选条件，悬停信息冗余。
2. **保留并优化文案 7 张**，其中 5 张明显需要修正：
   - #2 灌能战斧：文案明确「当前效果」具体数值（+1/+2 或 +2/+2）。
   - #5 怨毒焰魔 / #12 喷发火山：共用「本回合火焰法术布尔/计数」状态，文案做成「是/否」+伤害预览。
   - #8 伊森德雷：去掉「currentValue/cost」误导字段；文案直接说明召龙数量。
   - #10 埃博克：必须收窄到「对手上回合打出且仍在场的随从」并列名。
   - #11 血斗士洛戈什：精准筛选 `BLOODSPORT` 标签，提升优先级到 high，并扩充到 `play` 表面。
3. **跨牌共用的状态**应集中实现：
   - `fireSpellsCastThisTurn`（怨毒焰魔、喷发火山，未来可能更多火焰构筑卡）。
   - `friendlyMinionsDiedThisGame`（按 race/type/cost 分类，服务屈从疯狂、伊森德雷及其他类似墓地池牌）。
   - `cardsPlayedLastTurn`（对手向，过滤随从+仍在场）。
4. **战士专有机制提醒**：本批 8 张中**没有**触发本局护甲、武器破损/获取历史、激怒、随从交换、海盗追踪、登陆（dredge）等机制；后续如有相关牌再单独建模即可，本次不需要为它们预留字段。
5. **`displaySurfaces` 一致性**：本次多张漏写 `play`（实体在战场时悬停）；建议规范化为「手牌牌库一律 hand+deck，进入战场后的实体一律加 play，graveyard 类按需补 graveyard」。
