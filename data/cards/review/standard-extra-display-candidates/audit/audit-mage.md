# 法师 (Mage) 额外显示审核

## 概览
- 卡牌总数: 11
- 建议保留并显示: 9
- 建议移除: 2（守护者艾格文、咒术图书管理员）
- 需要修正: 8（绝大多数 suggestedDisplayTextZhCN 占位符过于泛化，需要给出具体的、对玩家有用的悬停文案）

---

## 逐卡审核

### 2. 冰冻之触 (CORE_REV_601)
- **卡牌文本**: 造成3点伤害。注能（）：将一张冰冻之触置入你的手牌。
- **当前建议 displayType**: `infuse_progress`
- **审核结论**: ✅ 保留（需修正文案）
- **问题**:
  - 文件中 `cardTextZhCNPlain` 把"注能（X）"中的 X 数字丢了（应是"注能（3）"或具体数字，需要从原文 `@` 占位符还原）。审核以炉石实际规则为准：冰冻之触的注能条件是 3 个友方随从死亡，注能后增加额外效果（注能完成后会变成 4 点伤害且抽一张牌的版本，最终形态为"造成 4 点伤害，并抽一张牌"）。
  - displayType `infuse_progress` 是合适的，但 `suggestedDisplayTextZhCN` 中 `{effectPreview}` 含糊，应明确分两段显示：进度计数 + 注能完成后的实际效果。
- **修正建议**:
  - suggestedDisplayTextZhCN：`注能进度：{progress}/{required}（已注能：{infused ? '是' : '否'}）；完成后效果：造成 4 点伤害，并抽 1 张牌`
  - stateNeeded：保留 `friendlyDeathsWhileThisEntityInHand`、`infuseProgress`、`infuseRequired`、`infusedState`；另外建议添加 `entityIdScopedCounter`（不同手牌副本的进度独立）。
  - displaySurfaces：`hand`、`hover` 正确；不必加 deck（注能仅在手牌中推进，进入手牌前不计数）。

---

### 3. 守护者艾格文 (CS3_001)
- **卡牌文本**: 法术伤害+2，亡语：你抽到的下一张随从牌会继承这些能力。
- **当前建议 displayType**: `pending_draw_buff`
- **审核结论**: ❌ 移除（或大幅改写）
- **问题**:
  - 这是一个**已经触发后的延迟 buff**，而非"从牌库检索"。`displayType: pending_draw_buff` 名字勉强能用，但 `suggestedDisplayTextZhCN` 写的是"牌库候选：{cardNames}；剩余：{count}"——完全错误，它不会从牌库挑选特定随从，而是**对玩家自然抽到的下一张随从牌**追加"法术伤害+2 + 同样亡语"。
  - stateNeeded `remainingDeckCardsMatchingThisEffect` 也错误——这不是池子计数。
  - 真正需要追踪的是：艾格文是否已经死亡触发？玩家本局是否还没抽到随从牌（即 buff 是否仍待生效）？
  - 在艾格文本牌的悬停信息上，这些状态并不需要展示（玩家看的是牌库其他随从）。该 buff 状态可考虑通过其他记牌器机制（例如在牌库顶随从图标上挂角标）实现，**不在艾格文卡牌悬停上显示**。
- **修正建议**: 从本候选列表中移除。如果要保留，应改为：
  - displayType：`pending_inherited_buff_status`
  - suggestedDisplayTextZhCN：`亡语状态：{triggered ? '已触发，等待下一张抽到的随从' : '未触发'}；候选作用对象：你套牌中的所有随从牌`
  - 但这种状态更适合显示在被影响的随从牌上，而不是艾格文本牌。

---

### 5. 天定之灾克尔苏加德 (CORE_REV_514)
- **卡牌文本**: 战吼：复活你的不稳定的骷髅。战场上放不下的骷髅会立即爆炸。（复活个）
- **当前建议 displayType**: `graveyard_count`
- **审核结论**: ✅ 保留（需修正文案）
- **问题**:
  - 这张牌**只复活"不稳定的骷髅"**这一种特定随从，不是泛化的墓地候选池。`suggestedDisplayTextZhCN` 写成 `墓地候选：{cardNames}；预计数量：{count}` 过于泛化。
  - 实际玩家需要看到的只有一个数字：**本局死掉的友方"不稳定的骷髅"数量**。
- **修正建议**:
  - displayType：`graveyard_count` 可改为更具体的 `specific_minion_graveyard_count`
  - stateNeeded：`friendlyDeathsOfSpecificMinion`（精确到 `不稳定的骷髅 / CARD_ID`）
  - suggestedDisplayTextZhCN：`本局已死亡的不稳定的骷髅：{count}（将复活 {min(count, 空闲战场槽位)} 个，剩余 {超额数} 个立即爆炸）`
  - displaySurfaces：`hand`、`hover` 正确；deck 不必（在牌库时玩家也想知道，但这张是 8 费传说，通常在手上才考虑）；可保留 deck。

---

### 7. 星涌术 (EDR_941)
- **卡牌文本**: 对一个随从造成点伤害。（每有一个在本局对战中死亡的友方随从都会提升。）
- **当前建议 displayType**: `dynamic_death_count`
- **审核结论**: ✅ 保留（需修正文案）
- **问题**:
  - `dynamic_death_count` 类型合适，但 `suggestedDisplayTextZhCN` 写成 `相关状态：{stateSummary}` 完全是占位符，毫无信息量。
  - 玩家最关心的就是**当前伤害值**和**已死亡友方随从数**。
  - stateNeeded 写 `matchHistoryStateForThisEffect` 太抽象。
- **修正建议**:
  - stateNeeded：`friendlyMinionDeathsThisGame`、`currentSpellDamageValue`
  - suggestedDisplayTextZhCN：`当前伤害：{baseDamage + friendlyMinionDeathsThisGame}（基础 + 本局已死亡友方随从 {friendlyMinionDeathsThisGame} 个）`
  - displayType 改名为更明确：`death_count_scaling_damage`
  - displaySurfaces：`deck`、`hand`、`hover`（玩家在牌库阶段也想知道这张牌当前伤害会是多少，应加 deck）

---

### 8. 地狱火先锋 (FIR_913)
- **卡牌文本**: 在你施放一个火焰法术后，随机获取一张元素牌，其法力值消耗减少（3）点。
- **当前建议 displayType**: `related_trigger_and_random_pool`
- **审核结论**: ⚠️ 需修正
- **问题**:
  - 这是一张**进入战场后才生效的随从**，效果固定触发条件清晰（每次施放火焰法术后），随机池是"所有元素牌"。
  - 在**手牌悬停**时，玩家**真正可能想看的不是"随机池"**（元素牌池太大无意义），而是：**本局已经施放过多少个火焰法术**（提示触发频率），以及**当前手中是否有火焰法术**（接续 combo）。
  - 但严格地说这张牌效果是固定的（只要在场就生效），并不依赖打出前的历史状态。`reasoningZhCN` 写"低优先级"其实就是承认意义不大。
  - 实际上随机池显示对玩家几乎没有规划价值（元素池过大、随机减费）。
- **修正建议**:
  - 倾向 ❌ 移除：效果固定、随机池过大、不依赖历史计数。
  - 若一定保留，应改为 `spell_school_history_counter`，stateNeeded：`fireSpellsCastThisGame`、`fireSpellsInHand`，suggestedDisplayTextZhCN：`本局已施放火焰法术：{fireSpellsCastThisGame}；当前手中火焰法术：{fireSpellsInHand}`（用于辅助评估这张随从在场期间的预期触发次数）。但优先级低，可移除。

---

### 10. 艾森娜 (EDR_430)
- **卡牌文本**: 战吼：如果在本局对战中已有20个友方随从死亡，造成20点伤害，随机分配到所有敌人身上。（还剩{0}个！）（已经就绪！）
- **当前建议 displayType**: `threshold_death_count`
- **审核结论**: ✅ 保留（需修正文案）
- **问题**:
  - displayType `threshold_death_count` 非常合适。stateNeeded 写得抽象（`historyCounterForThisEffect`、`currentCostOrCurrentValue`），应具体化。
  - suggestedDisplayTextZhCN `进度：{count}；当前值：{currentValue}` 也含糊——这张牌没有"当前值"，只有"是否就绪"。注意游戏内本身就有该计数的提示（牌面 tooltip 自带"还剩 X 个"），但记牌器在牌库/手牌上展示进度更直观。
- **修正建议**:
  - stateNeeded：`friendlyMinionDeathsThisGame`、`thresholdValue: 20`
  - suggestedDisplayTextZhCN：`友方随从死亡：{friendlyMinionDeathsThisGame}/20（{friendlyMinionDeathsThisGame >= 20 ? '已就绪' : '还差 ' + (20 - friendlyMinionDeathsThisGame) + ' 个'}）`
  - displaySurfaces：`deck`、`hand`、`hover` 都合适。

---

### 11. 咒术图书管理员 (TLC_226)
- **卡牌文本**: 亡语：抽一张法术牌。延系：召唤一个本随从的复制。
- **当前建议 displayType**: `deck_tutor_pool`
- **审核结论**: ❌ 移除
- **问题**:
  - 这是一张**普通的"抽一张法术牌"亡语**+ 延系召唤复制。"抽一张法术牌"是检索类，但绝大多数记牌器（以及 HDT 主流认知）对这种泛类型检索**不另外显示候选**——玩家通过看自己的牌库剩余法术列表即可判断。
  - 没有任何依赖本局历史/隐藏状态的计数；延系召唤复制的目标也是该随从自身，没有候选池可言。
  - 把它列为 `deck_tutor_pool` 与守护者艾格文犯了同样的错——这并非"特定卡牌检索"。
- **修正建议**: 移除。如果要保留，仅可在墓地/亡语轨道上显示"亡语：抽一张法术（{deckSpellRemaining} 张候选）"，但这已经是通用法术计数，不属于"额外显示"。建议从该候选列表中移除。

---

### 13. 科技恐龙 (DINO_409)
- **卡牌文本**: 嘲讽。在本局对战中，你每使用一张你的套牌之外的卡牌，本牌的法力值消耗便减少（1）点。
- **当前建议 displayType**: `cost_progress`
- **审核结论**: ✅ 保留（需修正文案）
- **问题**:
  - displayType `cost_progress` 合适。`stateNeeded` 写得抽象。
  - suggestedDisplayTextZhCN `进度：{count}；当前值：{currentValue}` 太泛化。玩家最想知道：**当前实际费用**。
  - 注意游戏本身会动态修改卡牌的当前费用（手牌上的费用数字已经实时更新），所以**在手牌上重复显示费用意义不大**；真正有意义的是**在牌库**（牌库中的实例不显示费用变化，玩家想知道"抽到时大概会是几费"）以及**悬停时显示计数来源**（已使用多少张套牌外卡牌）。
- **修正建议**:
  - stateNeeded：`cardsPlayedNotFromInitialDeckThisGame`、`originalCost: 7`
  - suggestedDisplayTextZhCN：`本局已使用套牌外的卡牌：{cardsPlayedNotFromInitialDeck} 张；预计当前费用：{max(0, 7 - cardsPlayedNotFromInitialDeck)}`
  - displaySurfaces：`deck`、`hover` 重点；`hand` 可加但游戏已显示费用所以次要。

---

### 14. 秘魔刃豹 (MEND_506)
- **卡牌文本**: 扰魔。战吼：在本局对战中，你的魔网牌的效果提高1。
- **当前建议 displayType**: `persistent_effect_status`
- **审核结论**: ⚠️ 需修正（场景判断）
- **问题**:
  - 该牌打出后产生**本局持续状态**：所有魔网牌的效果 +1。但是：
    - 在**秘魔刃豹自己**的悬停上展示"持续效果激活中"几乎没意义——玩家关心的是其他魔网牌的实际数值。
    - `affectedSummary` 占位符过于泛化。
  - 这种状态更适合显示在**被影响的魔网牌**（其他卡牌）的悬停上，而不是秘魔刃豹本身。
  - 严格说秘魔刃豹本牌效果是**固定**的（无论何时打出都是 +1，不依赖历史）——所以单看本牌**不需要额外显示**。
- **修正建议**:
  - 倾向 ❌ 移除（就秘魔刃豹本牌而言）。
  - 但保留全局状态追踪供其他魔网牌使用：在魔网类卡牌（如魔力行者、湍流之针、各种"魔网术"）的悬停上显示 `当前魔网加成：+{persistentMendingStacks}`、`额外触发次数：{persistentMendingExtraTriggers}`。
  - 如果保留秘魔刃豹本牌的额外显示，则改为：
    - suggestedDisplayTextZhCN：`打出后：所有本局魔网牌效果 +1（当前已激活 {currentMendingBonusStacks} 层）`
    - 仅在该效果可叠加（多次打出累加）时才有意义；如果不可叠加，建议移除。

---

### 15. 魔力行者 (MEND_501)
- **卡牌文本**: 战吼：在本局对战中，你的魔网牌法力值消耗减少（1）点。亡语：随机获取一张魔网牌。
- **当前建议 displayType**: `persistent_effect_and_random_pool`
- **审核结论**: ⚠️ 需修正
- **问题**:
  - 与秘魔刃豹同理：本牌效果**固定**（打出就是 -1 费），亡语随机池为"全部魔网牌"（池子太大，参考价值低）。
  - 单看魔力行者本牌悬停意义不大；持续 buff 应在被影响的魔网牌上展示。
  - `persistent_effect_and_random_pool` 显示双类型混合，文案 `{activeText}；影响：{affectedSummary}` 完全是占位符。
- **修正建议**:
  - 倾向 ❌ 移除（就魔力行者本牌而言）。
  - 若保留，应改为：
    - suggestedDisplayTextZhCN：`打出后：本局魔网牌 -1 费（当前已激活 {persistentMendingCostReduction} 层）；亡语随机池：所有魔网牌（约 {mendingCardPoolSize} 张）`
  - 建议仅作全局状态追踪源，不在本牌悬停额外显示。

---

### 16. 湍流之针 (MEND_503)
- **卡牌文本**: 战吼：在本局对战中，你的魔网牌额外触发一次。
- **当前建议 displayType**: `persistent_effect_status`
- **审核结论**: ⚠️ 需修正
- **问题**:
  - 与上述两张魔网"启用器"同理——本牌效果固定，不依赖历史。
  - 本牌悬停展示"持续效果激活中"对玩家几乎无规划价值。
- **修正建议**:
  - 倾向 ❌ 移除（就湍流之针本牌而言）。
  - 若保留，应改为：
    - suggestedDisplayTextZhCN：`打出后：本局魔网牌额外触发 1 次（当前已激活 {persistentMendingExtraTriggers} 层）`
  - 同样，状态本身应在被影响的魔网牌悬停上展示。

---

## 总结建议

### 整体问题
1. **suggestedDisplayTextZhCN 大量使用泛化占位符**（如 `{stateSummary}`、`{activeText}`、`{affectedSummary}`、`{poolSummary}`、`{cardNames}`），实际审核中应针对每张卡的具体计数维度填写具体字段。建议在后续实现时，每张牌单独定义 placeholder 集合，而不是套用通用模板。

2. **"持续效果启用器"类卡牌（刃豹/魔力行者/湍流之针）误判**：这些牌**自身效果固定**，无历史依赖；它们产生的全局状态应展示在**被影响的魔网卡牌**的悬停上，而不是启用器本身。建议从本候选列表中移除三张魔网启用器，转而在其他魔网卡牌的额外显示规则中引用全局状态。

3. **"延迟 buff / 普通法术检索"误判**：守护者艾格文不是池子检索；咒术图书管理员是泛类型抽法术，主流记牌器都不会单独额外展示。建议移除这两张。

### 建议保留并精确化的卡牌（5 张）
| 卡牌 | 推荐 displayType | 核心计数 |
|------|-----------------|----------|
| 冰冻之触 | infuse_progress（按 entity） | friendlyDeathsWhileInHand / 3 |
| 天定之灾克尔苏加德 | specific_minion_graveyard_count | 友方"不稳定的骷髅"死亡数 |
| 星涌术 | death_count_scaling_damage | 友方随从死亡数 → 实时伤害 |
| 艾森娜 | threshold_death_count | 友方随从死亡数 / 20 |
| 科技恐龙 | cost_progress | 套牌外卡牌使用数 → 当前费用 |

### 建议移除的卡牌（2 张明确移除 + 4 张倾向移除）
- ❌ 守护者艾格文（误判：非池子检索）
- ❌ 咒术图书管理员（泛类型抽牌，主流记牌器不额外展示）
- ⚠️ 地狱火先锋（随机池过大，效果固定，价值低）
- ⚠️ 秘魔刃豹 / 魔力行者 / 湍流之针（本牌效果固定，全局 buff 应展示于被影响的魔网卡牌上而非启用器本身）

### 通用工程建议
- 引入"全局持续效果"概念：魔网启用器只负责**更新全局状态**，由所有魔网卡牌共享读取，避免在每张启用器上重复 UI。
- displayType 命名应避免"and"组合类型（`persistent_effect_and_random_pool`），拆为正交字段更易于实现与测试。
- stateNeeded 字段应精确到具体计数器键名，避免 `historyCounterForThisEffect` 这种含糊的占位描述。
