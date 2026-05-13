# 恶魔猎手 (Demon Hunter) 额外显示审核

## 概览
- 卡牌总数: 8
- 建议保留并显示: 8
- 建议移除（不需要额外显示）: 0
- 需要修正建议: 6

## 逐卡审核

### 1. 灵魂盛宴 (CORE_BT_427)
- **卡牌文本**: 在本回合中每有一个友方随从死亡，抽一张牌。（抽张牌）
- **当前建议 displayType**: counter
- **审核结论**: ✅ 保留
- **问题**: 无明显错误。建议合理。
- **修正建议**:
  - displayType: `counter`（保持）
  - 应展示内容: 当前回合内已死亡的友方随从数量。可附带本回合死亡随从的简短列表（卡名 + 死亡顺序）以便玩家复核。
  - 备注: stateNeeded 应明确为 `friendlyMinionsDiedThisTurn`（已正确）。回合结束时归零。无需追踪本局历史。

### 2. 邪能之乱 (CORE_MAW_012)
- **卡牌文本**: 召唤一个在本局对战中死亡的友方恶魔。 注能（个恶魔）：改为召唤三个。
- **当前建议 displayType**: graveyard_pool_and_infuse_progress
- **审核结论**: ⚠️ 需修正
- **问题**:
  1. `stateNeeded` 中的 `friendlyDeathsWhileThisEntityInHand` 错误。卡牌效果是「本局对战中死亡的友方恶魔」，并不要求"本牌在手时"死亡。这是召唤池来源的根本性误读。
  2. 注能条件「死亡的恶魔达到 X 个」才是按"该实体在手时计数"——这两个机制必须分开：召唤池 = 本局全程；注能进度 = 该实体进入手牌之后开始计的友方恶魔死亡数。
- **修正建议**:
  - displayType: `graveyard_pool_and_infuse_progress`（保持，复合型合理）
  - 应展示内容:
    - 池：本局所有**死亡过的友方恶魔**列表（按种族 DEMON 过滤的友方墓地，**按 cardId 去重**，展示卡名 + 出现次数）。同一回合可能多次复活/重死，但召唤候选只看"卡牌种类"。
    - 注能进度：自该实体进入玩家手牌（或被生成时）起，所记的友方恶魔死亡数 / 所需值（注能阈值，目前游戏数据为 1，仍需运行时读取）。
    - 效果预览：未注能 → 召唤 1 个；已注能 → 召唤 3 个。
  - stateNeeded 调整为：`friendlyDemonsEverDiedThisGameUnique`（召唤池）+ `infuseProgress` + `infuseRequired` + `infusedState`（去掉 `friendlyDeathsWhileThisEntityInHand`，或仅在内部用于推进 infuseProgress，不暴露到 UI 文案）。
  - 备注: 召唤池本身不受"是否注能"影响，注能只改变召唤数量。

### 3. 圣物匠赛·墨克斯 (CORE_REV_937)
- **卡牌文本**: 战吼：发现并施放一个圣物。注能（）：改为施放全部三个。
- **当前建议 displayType**: infuse_progress
- **审核结论**: ⚠️ 需修正
- **问题**:
  1. `stateNeeded` 中的 `friendlyDeathsWhileThisEntityInHand` 与本牌注能条件不符——赛的注能条件并非"友方死亡"，而是其卡牌数据所定义的具体计数条件（炉石中 INFUSE 的具体计数维度因卡而异，需以游戏 tag 为准；多数注能仍是死亡计数，但请确认）。
  2. 即便其注能条件确实是友方死亡，state 名应是 `friendlyDeathsWhileThisEntityInHand`（保留），并改名为更通用的 `infuseTriggerCountWhileInHand`，与"召唤池"语义解耦。
- **修正建议**:
  - displayType: `infuse_progress`（保持）
  - 应展示内容:
    - 注能：{progress}/{required}（按该实体 entityId 单独计数，进入手牌后开始累加）。
    - 效果预览：未注能 → 发现并施放一个圣物；已注能 → 施放全部三个圣物。
    - 可选辅助：列出三张圣物的简明名称提示（圣物来自固定池，且每局每张圣物使用一次，玩家不一定记得当前可用进度）。
  - stateNeeded: `infuseProgress`, `infuseRequired`, `infusedState`（保留），把 `friendlyDeathsWhileThisEntityInHand` 重命名/抽象为 `infuseCounterWhileInHand`。
  - 备注: 不需要"墓地池"维度。该牌池子是固定的（圣物系列），不是动态墓地，可在静态提示中展示。

### 4. 邪火爆焰 (FIR_904)
- **卡牌文本**: 在你施放一个邪能法术后，消灭本随从并对所有敌人造成 2点伤害。
- **当前建议 displayType**: highlight_related_cards
- **审核结论**: ⚠️ 需修正
- **问题**:
  1. 该牌是场上的随从，触发条件是"你施放一个邪能法术后"——它的存在主要影响**手牌中邪能法术的价值**。`highlight_related_cards` 方向正确，但 stateNeeded 不必同时包含 `relatedCardsInHand` 和 `relatedCardsInDeck`：玩家关心的是手中可立即施放的邪能法术（决定下一次触发），牌库中的邪能法术仅作参考。
  2. 该牌仅在**场上**触发；放在手牌/牌库中无效果。所以 displaySurfaces 中"deck/hand/hover"针对这张爆焰本身的悬停意义不大，反而应该在该随从存在于场上时，对"手牌中的邪能法术"做悬停/侧栏提示——即提示**目标**而非本牌。
- **修正建议**:
  - displayType: `highlight_related_cards`（保持，但用法需要明确）
  - 应展示内容: 当本随从在场时，在手牌/牌库中**标记所有邪能法术**（带"将触发邪火爆焰：消灭本随从 + 全体敌人 2 伤"的小图标/提示）。对本牌本身悬停时，可附带"手牌中邪能法术数：{n}；牌库剩余邪能法术数：{m}"。
  - stateNeeded: `felSpellsInHand`, `felSpellsInDeck`, `selfOnBoard`（用于条件展示）。
  - 备注: 优先级宜降为 medium-low；信息密度不大，多张该随从同时在场时仍是同样的触发关系。

### 5. 贪婪的地狱猎犬 (EDR_891)
- **卡牌文本**: 亡语：复活一个法力值消耗小于或等于（4）点的友方亡语随从，并召唤一个它的复制。
- **当前建议 displayType**: graveyard_candidate_pool
- **审核结论**: ✅ 保留（小幅修正）
- **问题**: 建议合理。`stateNeeded` 命名稍模糊：`eligibleDeathrattleOrMinionPool` 太宽，应精确到"友方亡语随从 且 原始 mana ≤ 4"。
- **修正建议**:
  - displayType: `graveyard_candidate_pool`
  - 应展示内容: 本局**已死亡的友方随从**中，满足「带亡语 关键字（原始牌面亡语）且 原始法力值消耗 ≤ 4」的所有实体列表（**不去重**——同一张牌死了两次代表两个可复活实例）；可附"候选数：{n}"。注意：以原始 mana 为准（受过费用调整的随从仍按基础 cost 4 判定），亡语关键字以**原始牌面**为准。
  - stateNeeded: `friendlyDeathrattleMinionsDiedThisGame_costLE4`（重命名替换 `eligibleDeathrattleOrMinionPool`）。
  - 备注: 该牌本身是亡语，仅在它自己被消灭后触发；显示池应实时更新，包含"本牌死前的全部死亡记录"。

### 6. 残暴的魔蝠 (EDR_892)
- **卡牌文本**: 亡语：复活一个不同的法力值消耗大于或等于（5）点的友方亡语随从，并召唤一个它的复制。
- **当前建议 displayType**: graveyard_candidate_pool
- **审核结论**: ⚠️ 需修正
- **问题**:
  1. 「**不同的**」是关键约束——指"与该牌本身（残暴的魔蝠）不同"，因此池中应**排除残暴的魔蝠自身**。当前建议未提到此排除。
  2. `stateNeeded` 同 EDR_891，需精确化命名。
- **修正建议**:
  - displayType: `graveyard_candidate_pool`
  - 应展示内容: 本局已死亡的友方随从中，满足「带亡语关键字（原始）且 原始法力值消耗 ≥ 5 且 cardId ≠ EDR_892（残暴的魔蝠）」的实体列表。同样不去重于实例，但 cardId 维度上要排除自身。
  - stateNeeded: `friendlyDeathrattleMinionsDiedThisGame_costGE5_excludingSelf`。
  - 备注: 若场上/墓地有多个残暴的魔蝠相继触发亡语，每次都需重新计算可用池（已经被复活的实例若再次死亡仍可作为候选）。

### 7. 奈瑟匹拉，蒙难古灵 (CATA_527)
- **卡牌文本**: 造成1点伤害。在你施放一个邪能法术后，重新开启。亡语：召唤奈瑟匹拉，脱困古灵。
- **当前建议 displayType**: highlight_related_cards
- **审核结论**: ✅ 保留（小幅修正）
- **问题**: 方向正确。文案中"可重新开启：{felSpellCount}张"略有歧义——应明确指"手牌中可立即用于重新开启的邪能法术数"。该牌只在场（作为地标）时关心此信息。
- **修正建议**:
  - displayType: `highlight_related_cards`
  - 应展示内容: 当本地标在场时，在手牌/牌库中标记所有邪能法术；悬停信息框附"手牌邪能法术：{handFelCount} / 牌库剩余邪能法术：{deckFelCount}"。亡语固定召唤奈瑟匹拉，脱困古灵（无需追踪）。
  - stateNeeded: `felSpellsInHand`, `felSpellsInDeck`, `selfOnBoard`（作为是否展示的开关）。
  - 备注: 亡语效果完全固定，不需要为亡语额外做信息框；提示焦点仅在"邪能法术联动"。

### 8. 贪婪的邪能钓鱼者 (CATA_529)
- **卡牌文本**: 在本局对战中，你每施放一个邪能法术，本牌的法力值消耗便减少（1）点。
- **当前建议 displayType**: cost_progress
- **审核结论**: ✅ 保留
- **问题**: 建议合理。注意：本局的「邪能法术施放计数」是**全局**计数（无论钓鱼者是否在手），无需绑定到实体 ID。当玩家从牌库抽到该牌、或被生成时，应直接读取当前全局计数。
- **修正建议**:
  - displayType: `cost_progress`
  - 应展示内容: "本局已施放邪能法术：{n}；当前费用：max(0, 6 − n)"。可在牌库（牌库内时显示预计落手费用）与手牌（实际当前费用）均展示。
  - stateNeeded: `felSpellsCastThisGame`（全局；非 per-entity）, `currentCardCost`（派生，可不存）。
  - 备注: 费用下限按炉石规则不低于 0；当 n ≥ 6 时显示为 0。

## 总结建议

### 共性问题
1. **"在手时死亡计数" vs "本局历史" 混淆**：原 JSON 在多张卡上无差别地写入 `friendlyDeathsWhileThisEntityInHand`，但只有**注能（Infuse）机制**才真正需要"在手时计数"。涉及"召唤本局死亡过的某类实体"的牌（如邪能之乱的召唤池）应使用本局全局墓地池（按 cardId 去重），与注能进度分开存储和展示。
2. **复合卡机制需要拆分 state**：邪能之乱同时具备「召唤池（本局历史）」与「注能进度（在手计数）」两套独立状态，必须分两个字段，且在 UI 上分行展示，避免相互污染。
3. **池过滤条件需精确**：EDR_891 / EDR_892 等"复活类亡语"应明确：①以**原始牌面**判定亡语关键字与 mana 值；②"不同的"要求需排除自身 cardId；③候选池不按 cardId 去重（同一卡死两次=两个实例）。
4. **触发型随从/地标的 displaySurfaces 用法**：FIR_904、CATA_527 这种"在场触发"的卡，"悬停本牌"的信息价值有限；真正需要的是当其在场时，**对手牌/牌库中的相关卡做标注**。建议把它们从 hover-on-self 重点改为 highlight-related-in-hand-and-deck，并以 `selfOnBoard` 作为开关条件。
5. **全局计数 vs 实体计数**：邪能钓鱼者是全局计数，不依赖实体；与注能（实体级）逻辑要严格区分。

### 可执行的修正模式
- 引入清晰的 state 命名规范：
  - `friendlyDemonsEverDiedThisGameUnique`（cardId 去重，召唤池）
  - `friendlyDeathrattleMinionsDiedThisGame_costLE4`（实例不去重，按属性过滤）
  - `infuseCounterWhileInHand[entityId]`（按实体追踪）
  - `felSpellsCastThisGame`（全局计数）
- 显示文案分两段呈现：第一段为静态规则提示（效果未注能 / 已注能），第二段为动态数值（进度、池大小、候选列表）。
- 列表型展示（池）建议默认折叠为"候选数 + 前 3 张代表卡"，悬停展开完整列表，避免遮挡卡图。
- 优先级建议：邪能之乱、地狱猎犬、魔蝠、邪能钓鱼者为 high；圣物匠赛为 high（注能反馈直接改变战斗决策）；邪火爆焰、奈瑟匹拉的相关卡高亮为 medium；灵魂盛宴的本回合 counter 为 high（决定本回合是否施放）。
