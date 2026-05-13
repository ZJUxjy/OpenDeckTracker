# 德鲁伊 (Druid) 额外显示审核

## 概览
- 卡牌总数: 17
- 建议保留并显示: 14
- 建议移除（不需要额外显示）: 2
- 需要修正建议: 9

## 逐卡审核

### 1. 日蚀 (CORE_DMF_058)
- **卡牌文本**: 在本回合中，你施放的下一个法术将施放两次。
- **当前建议 displayType**: persistent_effect_and_highlight
- **审核结论**: ⚠️ 需修正
- **问题**:
  - 这是回合内一次性效果（"下一个法术"），不是持续到本局结束。`persistent_effect_*` 命名容易让人误以为长期生效。
  - `spellsInHand` 作为 stateNeeded 意义不大——记牌器无法预知玩家"下一张"会打哪个法术，列出所有手中法术只会让信息框变臃肿。真正关键的是"日蚀状态是否已激活"以及"本回合是否已触发过"。
- **修正建议**:
  - displayType: `pending_next_spell_effect`（或归类为 `turn_effect_status`）
  - 应展示内容: 显示"日蚀已激活：下一个法术施放两次"的状态文本；激活时在玩家手牌上方/记牌器顶部高亮提示即可，无需逐一列出手中法术。
  - 备注: 状态仅在本回合内有效；触发或回合结束时清除。stateNeeded 简化为 `solarEclipseNextSpellActive` 单一布尔。

---

### 2. 罪恶谋划 (CORE_REV_336)
- **卡牌文本**: 召唤两个2/2的树人。注能（）：改为两个5/5的古树。
- **当前建议 displayType**: infuse_progress
- **审核结论**: ✅ 保留
- **问题**: 无明显问题。
- **修正建议**:
  - displayType: 维持 `infuse_progress`
  - 应展示内容: `注能：{progress}/{required}`，已达成时显示"已注能：召唤两个5/5古树"。
  - 备注: 注能进度按手牌实体（entityId）作用域统计友方随从死亡数，必须随实体迁移（拿到对手手中也带着进度）。

---

### 3. 私法程序 (CORE_MAW_024)
- **卡牌文本**: 在本局对战的剩余时间内，玩家会在其回合开始时额外抽一张牌。
- **当前建议 displayType**: persistent_effect_status
- **审核结论**: ⚠️ 需修正
- **问题**:
  - `affectedCards` 没有意义——这是一个全局抽牌速率效果，不针对任何特定卡牌。
  - displaySurfaces 包含 hand 不合适：这张牌打出后会从手牌消失，剩余信息应该贴在"全局"层（顶栏/对局状态条），而不是某张牌的悬停。
- **修正建议**:
  - displayType: `global_match_modifier`
  - 应展示内容: "私法程序已生效：双方每回合额外抽1张牌"，可放在记牌器对局状态区，无需附在卡牌悬停。
  - 备注: stateNeeded 简化为 `arcaneSubroutineActive`（布尔）。移除 `affectedCards`。

---

### 4. 诺达希尔德鲁伊 (CORE_CS3_012)
- **卡牌文本**: 战吼：在本回合中，你施放的下一个法术的法力值消耗减少（3）点。
- **当前建议 displayType**: persistent_effect_and_highlight
- **审核结论**: ⚠️ 需修正
- **问题**:
  - 与日蚀类似：仅本回合"下一个法术"，不是持续局内效果。
  - 列出 `spellsInHand` 不必要——记牌器无法预判下一张是哪张法术，玩家自己能看到手牌。重点是"当前减费状态是否激活"。
- **修正建议**:
  - displayType: `pending_next_spell_effect`
  - 应展示内容: 战吼触发后在记牌器顶部/玩家手区显示"下一个法术 -3 费"状态指示；触发或回合结束时清除。
  - 备注: stateNeeded 简化为 `nordrassilNextSpellDiscountActive`，移除 `spellsInHand`。

---

### 5. 灌木巨龙托匹奥 (CORE_REV_314)
- **卡牌文本**: 战吼：在本局对战的剩余时间内，在你施放一个自然法术后，召唤一条3/3并具有突袭的雏龙。
- **当前建议 displayType**: persistent_effect_and_highlight
- **审核结论**: ⚠️ 需修正
- **问题**:
  - 当前 stateNeeded（`relatedCardsInHand` / `relatedCardsInDeck`）与 suggestedDisplayTextZhCN "高亮相关牌"方向尚可，但描述太泛、reasoning 完全套模板，没有点出"自然法术"这个关键过滤条件。
  - 这是一个会随每张自然法术持续触发的"对局剩余时间内"全局效果，本身需要在打出后**长期显示状态**（这点目前没写清楚）。
- **修正建议**:
  - displayType: `persistent_trigger_status_with_highlight`（持续触发器 + 牌库/手牌中高亮自然法术）
  - 应展示内容: 打出后顶栏显示"托匹奥已生效：施放自然法术 → 召唤3/3雏龙"；同时在牌库/手牌区把"自然法术"标签的卡片做高亮或加角标。
  - 备注: stateNeeded 增加 `topiorActive`（布尔）；`relatedCardsInHand/Deck` 按 spellSchool == NATURE 过滤。

---

### 6. 幽影猫头鹰 (CORE_DMF_060)
- **卡牌文本**: 突袭 在本局对战中，你每施放一个法术，本牌的法力值消耗便减少（1）点。
- **当前建议 displayType**: cost_progress
- **审核结论**: ✅ 保留
- **问题**: 注意"本局对战中"且减费在牌库/手牌中皆生效——这点 displaySurfaces 已经覆盖。
- **修正建议**:
  - displayType: 维持 `cost_progress`
  - 应展示内容: `当前费用：{currentCost}（已施放 {spellsCastThisGame} 个法术）`。
  - 备注: stateNeeded 明确为 `spellsCastThisGame` + `currentCost`。减费下限是 0，需在显示时夹断。

---

### 7. 哈多诺克斯 (CORE_ICC_835)
- **卡牌文本**: 亡语：召唤所有你在本局对战中死亡的，并具有嘲讽的随从。
- **当前建议 displayType**: graveyard_candidate_pool
- **审核结论**: ✅ 保留
- **问题**: 方向正确。注意效果指向的是"全局友方墓地"，不是"在手时死亡"——当前 stateNeeded 用的是 `friendlyGraveyardFilteredByThisEffect` 也对应全局墓地，没问题。
- **修正建议**:
  - displayType: 维持 `graveyard_candidate_pool`
  - 应展示内容: 列出本局已死亡的、带嘲讽关键字的友方随从（去重或带数量），形如"将召唤：{cardNames}（共 {count} 个）"。
  - 备注: 过滤条件 = 友方 + 已死亡 + 具有 TAUNT 关键字（注意需要包含临场被赋予嘲讽的随从，而不只是原卡带嘲讽的）。

---

### 8. 林地塑型者 (EDR_271)
- **卡牌文本**: 在你施放一个自然法术后，召唤一个2/2并具有"亡语：获取该法术的一张复制"的树人。
- **当前建议 displayType**: highlight_related_cards
- **审核结论**: ⚠️ 需修正
- **问题**:
  - 该牌效果**仅在自身在场存活时才触发**，并不是"打出后留下全局状态"。当前 reasoning 是模板，描述模糊。
  - 真正对玩家有用的是：在它在场时高亮手牌/牌库中的"自然法术"，提示出每张自然法术都能换一个2/2树人 + 法术复制。
- **修正建议**:
  - displayType: `on_board_trigger_highlight`
  - 应展示内容: 当此随从在场时，对手牌/牌库中所有自然法术标记高亮（不在场时不显示）。
  - 备注: stateNeeded 增加 `selfMinionOnBoard`（布尔，自身是否在场）；`relatedCardsInHand/Deck` 限定为 spellSchool == NATURE。

---

### 9. 哈缪尔·符文图腾 (EDR_845)
- **卡牌文本**: 对战开始时：如果你套牌中的每张法术牌均为自然法术，灌注你的英雄技能。你每施放3个法术，重复此效果。
- **当前建议 displayType**: spell_count_progress
- **审核结论**: ⚠️ 需修正
- **问题**:
  - "你每施放3个法术"是按 3 取模/取阶段的滚动进度，不是单一全局计数。`stateSummary` 太空泛。
  - 套牌"每张法术牌均为自然法术"这个前置条件在对战开始时就已经判定完毕，记牌器在游戏中无需再追踪——只要在生效后追踪"下一次灌注还差几个法术"即可。
- **修正建议**:
  - displayType: `modular_spell_count_progress`
  - 应展示内容: "距离下次灌注英雄技能：{ (3 - spellsCastThisGame % 3) } 个法术"；若效果未生效（套牌不全自然），则显示"未生效（套牌包含非自然法术）"。
  - 备注: stateNeeded 改为 `hamuulEffectActive`（布尔）+ `spellsCastThisGame`。仅当对战开始时英雄上场即可判定 active。

---

### 10. 洛，在世传奇 (TLC_257)
- **卡牌文本**: 战吼：在本局对战中，你的随从牌的法力值消耗为（5）点。
- **当前建议 displayType**: persistent_effect_status
- **审核结论**: ⚠️ 需修正
- **问题**:
  - `affectedCards` 字段意义不大——这是无差别作用于"所有友方随从牌"，把全部手牌/牌库随从枚举出来既臃肿也无信息增量；玩家自己一眼能看到。
  - 应当突出"已生效"这一全局状态。
- **修正建议**:
  - displayType: `global_cost_override`
  - 应展示内容: 顶栏/对局状态条显示"洛已生效：友方随从均为(5)费"；记牌器可同时将手牌/牌库中随从牌的费用角标改写为 5（视觉增强，可选）。
  - 备注: stateNeeded 简化为 `loEffectActive` 布尔；移除 `affectedCards`。displaySurfaces 移除 `hand/graveyard`，保留全局指示器。

---

### 11. 震地雷龙 (DINO_421)
- **卡牌文本**: 嘲讽。扰魔 亡语：使你的手牌和牌库里的所有随从牌获得+3/+3。
- **当前建议 displayType**: persistent_deck_hand_buff
- **审核结论**: ✅ 保留
- **问题**: 方向正确。但注意这是**一次性快照式 buff**（亡语触发时给当下手牌/牌库里的随从加 +3/+3），不会对之后新生成/抽到的随从生效——这点 reasoning 没说清。
- **修正建议**:
  - displayType: `deathrattle_buff_applied_set`
  - 应展示内容: 触发后，在手牌/牌库行的随从条目上显示 "+3/+3" 角标，标识哪些是已 buff 的实体。
  - 备注: stateNeeded 增加 `buffedEntityIds` 集合（按实体 ID 标记，而非按 cardId），避免对触发后新进入手牌/牌库的随从误加角标。

---

### 12. 潮起潮落 (TIME_702)
- **卡牌文本**: 造成3点伤害。如果你在本牌在你手中时使用过随从牌，获得5点护甲值。
- **当前建议 displayType**: while_holding_condition
- **审核结论**: ✅ 保留
- **问题**: 方向正确。条件按手牌实体作用域统计是对的。
- **修正建议**:
  - displayType: 维持 `while_holding_condition`
  - 应展示内容: "持有期间已使用随从：是/否；额外效果：{ready: 获得5点护甲 / 未触发}"。
  - 备注: stateNeeded 明确为 `minionPlayedWhileThisEntityInHand`（布尔即可，无需计数）。

---

### 13. 费伍德树人 (CATA_131)
- **卡牌文本**: 战吼：获得一个临时的法力水晶。如果你在本牌在你手中时消耗过4点法力值，该法力水晶变为永久获得。
- **当前建议 displayType**: while_holding_progress
- **审核结论**: ✅ 保留
- **问题**: 方向正确。
- **修正建议**:
  - displayType: 维持 `while_holding_progress`
  - 应展示内容: "持有期间已消耗法力：{spent}/4；{ready: 永久水晶就绪 / 还差 {4 - spent} 点}"。
  - 备注: stateNeeded 明确为 `manaSpentWhileThisEntityInHand`，需累计而非按回合重置；实体迁移时随实体走。

---

### 14. 护巢龙 (CATA_132)
- **卡牌文本**: 战吼：获取两张3/3并具有嘲讽的雏龙。如果你在本牌在你手中时消耗过8点法力值，召唤这两条雏龙。
- **当前建议 displayType**: while_holding_progress
- **审核结论**: ✅ 保留
- **问题**: 方向正确。
- **修正建议**:
  - displayType: 维持 `while_holding_progress`
  - 应展示内容: "持有期间已消耗法力：{spent}/8；{ready: 直接召唤两条雏龙 / 还差 {8 - spent} 点}"。
  - 备注: 同费伍德树人，stateNeeded = `manaSpentWhileThisEntityInHand`。

---

### 15. 梦境之龙麦琳瑟拉 (CATA_140)
- **卡牌文本**: 战吼：用随机的龙牌填满你的手牌。如果你在本牌在你手中时消耗过25点法力值，这些龙牌的法力值消耗为（1）点。
- **当前建议 displayType**: while_holding_progress
- **审核结论**: ✅ 保留
- **问题**: 方向正确。
- **修正建议**:
  - displayType: 维持 `while_holding_progress`
  - 应展示内容: "持有期间已消耗法力：{spent}/25；{ready: 龙牌将变为(1)费 / 还差 {25 - spent} 点}"。
  - 备注: 同上，统一 `manaSpentWhileThisEntityInHand` 状态。

---

### 16. 破碎现实 (END_009)
- **卡牌文本**: 召唤两个2/2的树人。在本局对战中，每有一个友方树人死亡，使这两个树人获得+1/+1。（已死亡个）
- **当前建议 displayType**: death_history_counter
- **审核结论**: ⚠️ 需修正
- **问题**:
  - 注意效果指的是"本局**已经**有多少友方树人死亡"的全局历史计数——这个计数从牌入手前就已开始累计，不是"在手时"窗口。
  - 当前 suggestedDisplayTextZhCN 太通用，没说"已死亡 N 个树人 → 召唤 2/2 + N"的具体含义。
  - 注意：该计数也会被这张牌**自己召唤的两个树人**未来的死亡计入下一张同名牌（卡牌带变量@计数）。
- **修正建议**:
  - displayType: `global_death_counter`
  - 应展示内容: "本局已死亡友方树人：{count} 个；当前召唤值：2/2 + {count}/+{count} → {2+count}/{2+count}"。
  - 备注: stateNeeded 改为 `friendlyTreantDeathsThisGame`（按 race == TREANT 过滤的友方墓地计数器），与"手牌实体作用域"无关，需在 deck/hand 两处都显示。

---

### 17. 火炭变色龙 (FIR_908)
- **卡牌文本**: 战吼：如果你在本回合中使用过英雄技能，使一个友方随从获得+1/+2和突袭。
- **当前建议 displayType**: condition_status
- **审核结论**: ✅ 保留
- **问题**: 方向正确。`heroPowerUsedThisTurn` 状态足够简单且实用。
- **修正建议**:
  - displayType: 维持 `condition_status`
  - 应展示内容: "本回合已用英雄技能：是/否；战吼加成：{ready: 可使一个随从+1/+2与突袭 / 未满足}"。
  - 备注: 仅本回合作用域，回合结束清零。

---

## 总结建议

1. **"下一个法术"类回合内一次性效果**（日蚀、诺达希尔德鲁伊）当前都被错误归入 `persistent_effect_and_highlight`，应改为新的 `pending_next_spell_effect` 类别，区别于"本局剩余时间"持续效果。这是最常见的命名混淆点，建议在 displayType 字典中单独立类。

2. **"持有期间进度"系列**（潮起潮落、费伍德树人、护巢龙、麦琳瑟拉、罪恶谋划）方向都很正确，但 stateNeeded 字段过于笼统（`entityScopedHistoryWhileInHand`）。建议拆分为更明确的具名状态：`manaSpentWhileThisEntityInHand`、`friendlyDeathsWhileThisEntityInHand`、`minionPlayedWhileThisEntityInHand`，便于后端复用、前端模板渲染。

3. **全局对局修饰类**（私法程序、洛在世传奇）的 `affectedCards` 列举意义不大——这些效果作用于一整类卡牌，逐张枚举只会让悬停信息冗余；应改为顶栏/状态条的"全局生效指示器"，并可选地在卡片角标改写费用。建议从 stateNeeded 中移除 `affectedCards`。

4. **"自然法术联动"卡**（灌木巨龙托匹奥、林地塑型者）当前都套用了 `relatedCardsInHand/Deck` 的模板文案，但没点出"自然法术（NATURE spell school）"这一过滤条件，建议在 stateNeeded 中显式标注 `spellSchool=NATURE` 的过滤。林地塑型者还需要额外的"自身是否在场"判断（不在场时不应高亮）。

5. **全局死亡计数（破碎现实）vs 在手死亡计数（罪恶谋划）** 这两类在 JSON 中容易混淆，建议明确：
   - 罪恶谋划 = "在手时友方死亡"（实体作用域，注能机制）
   - 破碎现实 = "本局友方树人死亡总数"（全局墓地按种族过滤）
   两者完全不同，不应共用 `friendlyDeathsWhileThisEntityInHand` 一类的字段。

6. **一次性快照 buff（震地雷龙）** 的关键是**按实体 ID 锁定**已 buff 的随从集合，而不是按 cardId——否则触发后新抽到的同名随从会被错误地加角标。建议引入 `buffedEntityIds` 集合状态。

7. **建议从候选集中观察后续是否需要新增 displayType 枚举**：
   - `pending_next_spell_effect`（回合内一次性）
   - `global_match_modifier`（全局对局状态条）
   - `on_board_trigger_highlight`（仅自身在场时高亮）
   - `modular_spell_count_progress`（按 N 取模的滚动计数）
   - `deathrattle_buff_applied_set`（按实体 ID 标记的快照 buff）
   现有 5~6 个 displayType 不足以覆盖德鲁伊全部场景，统一前应做一次枚举扩充。
