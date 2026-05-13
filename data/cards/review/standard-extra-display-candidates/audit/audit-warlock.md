# 术士 (Warlock) 额外显示审核

## 概览
- 卡牌总数: 16
- 建议保留并显示: 12（其中 9 张需细节修正）
- 建议移除: 2（影裔魔、空灵召唤者）
- 需要修正（保留但需修改 displayType / stateNeeded / 悬停文本）: 9

说明：本次审核独立于原 JSON 已写的 `extraDisplay`，仅看卡牌文本与术士特有机制（恶魔/小鬼追踪、本局弃牌数、本局死亡的友方恶魔池、本局抽牌数、注能进度、上一个暗影法术等）。

---

## 逐卡审核

### 4. 尸身保护令 (CORE_MAW_002)
- **卡牌文本**: 发现并复活一个友方随从，使其获得突袭。该随从会在回合结束时死亡。
- **当前建议 displayType**: `graveyard_candidate_pool`
- **审核结论**: ✅ 保留（需修正候选池语义）
- **问题**:
  1. "复活"在炉石中的统一含义是**从本局全局友方墓地池**（去重）选取，而不是"在手时死亡的"或"上回合死亡的"。原 stateNeeded `friendlyGraveyardFilteredByThisEffect` 描述合理，但 `eligibleDeathrattleOrMinionPool` 字段名易被误读为只看亡语随从，实际是**所有死亡过的友方随从（去重）**。
  2. 文本未限制随从亚种，应是全部友方死亡随从池。
- **修正建议**:
  - displayType 保持 `graveyard_candidate_pool`
  - stateNeeded 改为 `friendlyDeadMinionPool`（全局，去重）
  - 悬停文本：`本局已死亡的友方随从（去重 {count}）：{cardNames}`
  - displaySurfaces 保留 `hand`/`hover`，`graveyard` 表面对此牌意义不大（玩家关注的是"我能 Discover 出哪些"，悬停在手牌上即可）。

---

### 5. 影裔魔 (CORE_REV_374)
- **卡牌文本**: 亡语：使你手牌中法力值消耗最高的暗影法术牌的法力值消耗减少（3）点。
- **当前建议 displayType**: `related_card_highlight`
- **审核结论**: ❌ 建议移除
- **问题**:
  1. 效果作用对象在**自己手牌**中，玩家本来就能直接看到手牌每张牌的费用与名称；记牌器无需重复显示。
  2. 不需要历史状态、墓地池、注能进度等隐藏信息。
  3. 哪张是"最贵的暗影法术"只是排序问题，价值非常边际，不足以触发额外悬停框。
- **修正建议**: 从候选清单中移除该牌，整张牌只用普通卡图悬停即可。

---

### 6. 调皮的小鬼 (CORE_REV_244)
- **卡牌文本**: 战吼：召唤一个本随从的复制。注能（）：改为召唤两个复制。
- **当前建议 displayType**: `infuse_progress`
- **审核结论**: ✅ 保留
- **问题**: 原 JSON 中 `suggestedDisplayTextZhCN` 含 `{effectPreview}` 占位符过笼统；注能所需数值（X）也未明确（应从卡牌资源数据读取，通常 `@` 标识符对应具体数字，此卡是 2）。
- **修正建议**:
  - displayType `infuse_progress` 正确。
  - stateNeeded 正确（`friendlyDeathsWhileThisEntityInHand` + `infuseProgress` + `infuseRequired` + `infusedState`）。
  - 悬停文本细化为："注能 {progress}/{required}（{notInfused?'召唤 1 个复制':'召唤 2 个复制'}）"。
  - 注能进度按手牌实体跟踪（每个副本独立计数），不要全局累加。

---

### 7. 空灵召唤者 (CORE_FP1_022)
- **卡牌文本**: 亡语：随机将一张恶魔牌从你的手牌置入战场。
- **当前建议 displayType**: `hand_candidate_pool`
- **审核结论**: ❌ 建议移除
- **问题**:
  1. 作用范围是**自己手牌**，且按种族（恶魔）筛选；玩家原本就能看到所有手牌及其种族图标。
  2. 不依赖任何历史状态或不可见信息。
  3. 列出"手牌里的恶魔"等于重复显示已经可见的内容。
- **修正建议**: 从候选清单中移除。若日后做"快速看哪些是恶魔"的辅助高亮，应作为通用机制（手牌种族高亮）实现，而非该牌的专属悬停框。

---

### 8. 鲜血女王兰娜瑟尔 (CORE_ICC_841)
- **卡牌文本**: 吸血。在本局对战中，你每弃掉一张牌，便拥有+1攻击力。
- **当前建议 displayType**: `dynamic_counter`
- **审核结论**: ⚠️ 保留并修正
- **问题**:
  1. displayType 正确，但 stateNeeded 中 `historyCounterForThisEffect` 太泛；该卡专需"本局已弃牌数"，应明确命名。
  2. trackingHints 包含 `spells_cast_this_game`、`cards_played_this_game` 等大量无关字段，会让数据采集层产生冗余；只需 `cardsDiscardedThisGame`。
- **修正建议**:
  - stateNeeded: `[cardsDiscardedThisGame]`
  - 悬停文本："本局已弃牌：{count}；当前攻击力：{baseAttack + count}"
  - 在牌库/手牌悬停时显示，便于配合弃牌联动决策。

---

### 9. 邪魂狱卒 (CORE_CS3_003)
- **卡牌文本**: 战吼：使你的对手弃掉一张随从牌。亡语：移回弃掉的牌。
- **当前建议 displayType**: `linked_card`
- **审核结论**: ✅ 保留
- **问题**:
  1. displaySurfaces 仅有 `graveyard`、`hover`，建议把**场上自身**也纳入悬停（玩家在场上悬停本随从时也想知道亡语会把哪张牌还给对手）。
  2. 该绑定对手牌是**对手的牌**，悬停文本应明确归属。
- **修正建议**:
  - displaySurfaces 增加 `board`/`battlefield`。
  - 悬停文本："亡语将归还给对手：{linkedCardName}"
  - stateNeeded 保留 `linkedCardEntities`；不需要 `storedOrTransformedOriginalCards`（这张牌只是记住实体，没有转化）。

---

### 10. 暗脉女勋爵 (CORE_REV_373)
- **卡牌文本**: 战吼：召唤两个2/1的阴影。每个阴影获得一个亡语以施放你的上一个暗影法术。
- **当前建议 displayType**: `last_relevant_card`
- **审核结论**: ⚠️ 保留并修正
- **问题**:
  1. "上一个暗影法术"是结算瞬间的快照，但玩家在出这张牌**之前**就想预判，所以悬停应显示"当前最近一次施放的暗影法术"。
  2. 原 stateNeeded `matchHistoryStateForThisEffect` 模糊，应明确为 `lastShadowSpellCastByYou`。
  3. 悬停文本太泛，未指出具体卡名。
  4. displaySurfaces 应包含 `board`（场上小鬼也需悬停查看，因为生成的阴影身上挂着同样的亡语）。
- **修正建议**:
  - stateNeeded: `[lastShadowSpellCastByYou]`
  - 悬停文本："上一个暗影法术：{cardName}（无则不触发）"
  - 此外，**两个阴影**都附带这个亡语，建议在场上悬停阴影时也提示。

---

### 11. 暗影华尔兹 (CORE_REV_372)
- **卡牌文本**: 召唤一个3/5并具有嘲讽的影子。如果在本回合中有随从死亡，再召唤一个。
- **当前建议 displayType**: `turn_condition`
- **审核结论**: ⚠️ 保留并修正
- **问题**:
  1. displayType `turn_condition` 合适，但 stateNeeded `matchHistoryStateForThisEffect` 太泛；该牌只关心一个布尔："本回合是否有随从死亡（任意一方）"。
  2. 悬停文本应清晰显示"已满足/未满足"，而不是 `{stateSummary}`。
  3. 注意：原文并未指明"友方"或"敌方"，应按通用规则识别——若实际为任意随从死亡，则只需观察本回合死亡事件流。
- **修正建议**:
  - stateNeeded: `[anyMinionDiedThisTurn]`（布尔）
  - 悬停文本："本回合是否已有随从死亡：{是 → 召唤两个 3/5 嘲讽 | 否 → 召唤一个}"
  - 该信息也可作为出牌排序提示（"先送一个换血再施放"）。

---

### 12. 小鬼大王拉法姆 (CORE_REV_835)
- **卡牌文本**: 战吼：复活四个友方小鬼。注能（）：使你的小鬼获得+2/+2。
- **当前建议 displayType**: `graveyard_pool_and_infuse_progress`
- **审核结论**: ✅ 保留（需细化为双段显示）
- **问题**:
  1. "复活四个友方小鬼"是**本局全局友方墓地池中的小鬼**（去重；不足四个则取所有，可能重复抽取 RNG 已是另一层）。原 stateNeeded 缺少这一池的筛选条件。
  2. 注能进度应独立显示。
  3. 池筛选条件应限定 `race=DEMON && subrace=IMP/或 minion.cardId === 小鬼` 之类。
- **修正建议**:
  - displayType 保留 `graveyard_pool_and_infuse_progress`，但拆为两段悬停内容。
  - stateNeeded: `[friendlyDeadImpPool, infuseProgress, infuseRequired, infusedState]`
  - 悬停文本：
    - 第一行："本局已死亡的友方小鬼（{poolCount}）：{cardNames}"
    - 第二行："注能 {progress}/{required}（{infused?'+2/+2 加成已激活':'未激活'}）"
  - 若池中小于 4 张，应提示"复活数量受限于墓地"。

---

### 14. 腐心树妖 (EDR_485)
- **卡牌文本**: 亡语：抽一张法力值消耗大于或等于（7）点的随从牌。
- **当前建议 displayType**: `deck_candidate_pool`
- **审核结论**: ✅ 保留
- **问题**: 悬停文本无具体筛选条件，对玩家不直观。
- **修正建议**:
  - stateNeeded: `[remainingDeckCardsMatchingThisEffect]`（条件：`type=MINION && cost>=7`）
  - 悬停文本："牌库中费用≥7 的随从（{count}）：{cardNames}"
  - 若 count=0 应高亮提示"无可抽目标"，玩家可决定是否还要送掉这张亡语。

---

### 15. 荆棘大德鲁伊 (EDR_491)
- **卡牌文本**: 战吼：获得在本回合中死亡的你的随从的亡语。
- **当前建议 displayType**: `turn_graveyard_deathrattle_pool`
- **审核结论**: ⚠️ 保留并修正
- **问题**:
  1. 这是**本回合范围**的友方死亡池，且只取"有亡语"的随从。原 stateNeeded `friendlyGraveyardFilteredByThisEffect` 名称没体现"本回合"维度，容易被误用为全局池——这是与"召唤本局对战中死亡的友方恶魔"等全局池机制的关键区别。
  2. 池子是动态的：本回合可能还会有随从死亡，悬停信息应实时刷新。
  3. 仅"亡语"随从有效；普通随从死亡不计入收益。
- **修正建议**:
  - displayType 保留 `turn_graveyard_deathrattle_pool`，但 stateNeeded 明确：
    - `friendlyMinionsDiedThisTurn`（按死亡时间顺序，含 entity 引用）
    - 过滤条件：`hasDeathrattle === true`
  - 悬停文本："本回合已死亡的友方亡语随从（{count}）：{cardNames}"
  - 若 count=0：提示"本回合暂无亡语随从死亡，可考虑先送一个再战吼"。

---

### 17. 饥饿古树 (EDR_494)
- **卡牌文本**: 在你的回合结束时，吞食一个你的牌库中的随从，并获得其属性值。亡语：将被吞食的随从置入手牌。
- **当前建议 displayType**: `deck_pool_and_linked_cards`
- **审核结论**: ✅ 保留（需细化）
- **问题**:
  1. 该牌**同时**需要两类信息：
     - 牌库剩余随从（下一个可能被吞食的候选）
     - 已被吞食的随从列表（亡语会还回手牌）
  2. 原 stateNeeded 只有 `remainingDeckCardsMatchingThisEffect`，缺少 `swallowedMinionsList`。
  3. 实体跟踪需要在每个回合结束时追加被吞食的具体卡。
- **修正建议**:
  - stateNeeded: `[remainingDeckMinions, swallowedMinionsThisGame]`
  - 悬停文本：
    - 第一行："牌库中可能被吞食的随从（{deckCount}）：{deckMinionNames}"
    - 第二行："已吞食（亡语返回手牌）：{swallowedNames}"
  - displaySurfaces：`hand`（已在手时）、`board`（已出场时）、`hover`。

---

### 19. 着魔的动物术师 (DINO_131)
- **卡牌文本**: 亡语：随机从你的牌库中召唤一只野兽。使其获得吸血。
- **当前建议 displayType**: `deck_candidate_pool`
- **审核结论**: ✅ 保留
- **问题**: 悬停文本未指出筛选条件（种族=野兽）；术士牌库通常野兽不多，count=0 的提示很有价值。
- **修正建议**:
  - stateNeeded: `[remainingDeckBeasts]`
  - 悬停文本："牌库中的野兽（{count}）：{cardNames}"
  - 若 count=0：高亮警告"牌库无野兽，亡语不触发"，避免玩家误判。

---

### 22. 无穷助祭 (END_018)
- **卡牌文本**: 战吼：将你手牌中一张随机卡牌的法力值消耗变为无穷大！亡语：将其变回原本消耗。
- **当前建议 displayType**: `linked_card`
- **审核结论**: ✅ 保留
- **问题**:
  1. 绑定的是**手牌中**的某张牌；该牌可能在亡语前被打出或弃掉，需要处理实体跟踪边界。
  2. displaySurfaces 应包含 `hand`（玩家想知道哪张被锁了）和 `board`（自身在场上时悬停亦应显示）。
  3. 同时，被锁住的那张牌**自身**在手牌悬停时也应有提示"此牌被无穷助祭锁定，亡语后恢复"。
- **修正建议**:
  - stateNeeded: `[linkedCardEntities, originalCostOfLinkedCard]`
  - 悬停（在无穷助祭上）："锁定手牌：{linkedCardName}（原费 {originalCost}）"
  - 悬停（在被锁的手牌上）："被『无穷助祭』锁定为∞费，亡语后恢复"
  - displaySurfaces: `hand`、`board`、`hover`。

---

### 23. 时空大盗拉法姆 (TIME_005)
- **卡牌文本**: 奇闻+ 你的套牌容量为40，但其中有10张拉法姆！战吼：如果你使用过其余拉法姆，消灭敌方英雄。（还剩{0}个！）（已经就绪！）
- **当前建议 displayType**: `quest_counter`
- **审核结论**: ⚠️ 保留并修正
- **问题**:
  1. 该卡自身文本已含 `{0}` 占位符显示剩余数，但游戏内显示出现在卡面文字上而非记牌器；记牌器额外显示**仍有用**（牌库内 9 张副本悬停时同样可见进度）。
  2. 计数对象需明确：是"已使用的其他拉法姆数量"（不包含自身），上限 9。
  3. stateNeeded `playedCardsHistoryMatchingThisEffect` 太泛。
- **修正建议**:
  - stateNeeded: `[rafaamCopiesPlayedThisGame, rafaamCopiesRemainingInDeck]`
  - 悬停文本："已使用拉法姆：{played}/9；牌库剩余：{remaining}；{played===9?'下一张可消灭对手':'还需 '+(9-played)+' 张'}"
  - displaySurfaces：`deck`、`hand`、`hover`（不需要 `graveyard`）。

---

### 25. 地狱公爵 (CATA_493)
- **卡牌文本**: 突袭。在本局对战中，你每弃掉一张牌，便拥有+2/+2。
- **当前建议 displayType**: `dynamic_counter`
- **审核结论**: ⚠️ 保留并修正
- **问题**:
  1. 与兰娜瑟尔相同：stateNeeded 字段过泛、trackingHints 含大量与此牌无关项（spells_cast / summons / overloads / spends 均不需要）。
  2. 当前 attack/health 表达式应同时计算（+2/+2，不只是攻击）。
- **修正建议**:
  - stateNeeded: `[cardsDiscardedThisGame]`
  - 悬停文本："本局已弃牌：{count}；当前 {baseAttack + 2*count}/{baseHealth + 2*count}"
  - displaySurfaces: `deck`、`hand`、`hover`。

---

## 总结建议

1. **应移除的卡（2 张）**
   - 影裔魔（CORE_REV_374）：作用对象在手牌，玩家本就能看，且无历史/隐藏信息依赖。
   - 空灵召唤者（CORE_FP1_022）：作用对象是手牌恶魔，全程可见，不需要额外悬停框。
   - 上述两张如果未来要做"手牌中按种族/学派高亮"，应作为**通用机制**实现，而非这两张牌专属。

2. **池子语义需在 schema 层区分（重要）**
   - **全局友方墓地池（去重，本局范围）**：尸身保护令（全部随从）、小鬼大王拉法姆（仅小鬼）。
   - **本回合友方死亡池**：荆棘大德鲁伊（且要求含亡语）。
   - **本局对手弃牌实体绑定**：邪魂狱卒（单实体，可能转化）。
   - **手牌实体绑定**：无穷助祭。
   - 现版本 `friendlyGraveyardFilteredByThisEffect` 同时被用于全局和回合两类语义，建议拆分为 `friendlyDeadMinionPoolThisGame`、`friendlyMinionsDiedThisTurn` 两个独立 state 键。

3. **本局弃牌数应作为独立的术士共享 state**
   - 兰娜瑟尔与地狱公爵都依赖 `cardsDiscardedThisGame`，未来还可能扩展到更多术士弃牌套路；不必每张牌独立维护。
   - 建议在术士分类下新增 `cardsDiscardedThisGame`（已弃牌总数，含实体列表/统计），多卡共用。

4. **注能（Infuse）进度需按手牌实体追踪**
   - 调皮的小鬼、小鬼大王拉法姆都是 `friendlyDeathsWhileThisEntityInHand`，每张副本独立计数，进入手牌时起算，离开手牌或注能完成则停止。
   - 拉法姆需要同时显示"注能进度"和"墓地小鬼池"两块信息——建议悬停信息框分两行渲染，而不是混在一个字符串里。

5. **"上一个暗影法术" / "本回合是否随从死亡" 这类条件**
   - 暗脉女勋爵需要 `lastShadowSpellCastByYou`（动态快照，可能为空）。
   - 暗影华尔兹需要 `anyMinionDiedThisTurn`（布尔）。
   - 建议这类轻量 state 独立命名，不要塞入泛型 `matchHistoryStateForThisEffect`，以便排版层直接 if/else 渲染明确文案。

6. **空 count 的提示**
   - 腐心树妖、着魔的动物术师等"从牌库筛选"的亡语，若候选 count=0 应高亮警告：玩家可能因此选择不送、不使用，避免亡语空转。这是记牌器优于游戏原生 UI 的核心价值之一。

7. **筛选语义建议沉淀为可复用规则**
   - `type=MINION && cost>=N`（腐心树妖）
   - `type=MINION && race=BEAST`（着魔的动物术师）
   - `type=MINION && race=DEMON && subrace=IMP / cardId=IMP_*`（小鬼大王拉法姆的"小鬼"判定）
   - 这些谓词建议形成可组合的过滤 DSL，避免每张牌写硬编码。

总体上，术士的额外显示需求集中在三类：**墓地/死亡池**、**弃牌历史计数**、**手牌实体绑定（含注能）**。本清单 16 张中 14 张可保留（其中 9 张需细化 schema），2 张建议移除。
