# 中立 (Neutral) 额外显示审核

## 概览
- 卡牌总数: 31
- 建议保留并显示: 24
- 建议移除: 2
- 需要修正: 5

注：以下"修正"含 stateNeeded 修正与文本/类型微调，未必影响是否显示。

## 逐卡审核

### 6. 亡者牧师 (CORE_REV_956)
- **卡牌文本**: 嘲讽，注能（）：获得+2/+2。
- **当前建议 displayType**: infuse_progress
- **审核结论**: 保留
- **问题**: 无。注能进度按"在手时友方随从死亡数"推进，需要在手牌悬停显示当前 X/Y。
- **修正建议**: 文案可改为 "注能 {progress}/{required}（达成后 +2/+2）"，更直接。

### 8. 冥界侍从 (CORE_MAW_031)
- **卡牌文本**: 你的注能牌在牌库中也会注能。
- **当前建议 displayType**: persistent_global_effect
- **审核结论**: 需修正（倾向移除）
- **问题**: 本随从的效果是一个"上场存在期间生效"的光环。该信息在战场上已通过随从是否在场直接可见，并且效果本身（"牌库中注能也推进"）是固定文字。记牌器是否需要单独悬停信息框？意义有限——更有价值的是把它的存在反映在"注能进度计算逻辑"里（属于内部计算修正），而不是在悬停上单独再次告诉玩家"持续效果存在"。
- **修正建议**: 建议从额外显示候选移除。如果保留，则只在它仍在战场时，在手牌中其它注能牌的进度旁加一个小图标提示"含牌库阶段"，而不为本牌本身做独立悬停信息框。

### 16. 绞肉车 (CORE_ICC_812)
- **卡牌文本**: 亡语：从你的牌库中召唤一个攻击力小于本随从攻击力的随从。
- **当前建议 displayType**: deck_candidate_pool
- **审核结论**: 保留
- **问题**: 候选池需用"本随从当前攻击力"作为阈值（受 buff/debuff 影响）。
- **修正建议**: stateNeeded 增加 `thisMinionCurrentAttackForFiltering`。文案 "牌库中攻击力<{currentAttack} 的随从：{cardNames}（{count} 张）"。

### 17. 鱼人吸血鬼 (CORE_REV_957)
- **卡牌文本**: 吸血，注能（）：法力值消耗为（0）点。
- **当前建议 displayType**: infuse_progress
- **审核结论**: 保留
- **问题**: 无。
- **修正建议**: 文案 "注能 {progress}/{required}（达成后费用变 0）"。

### 22. 邪骨骷髅 (CORE_ICC_904)
- **卡牌文本**: 战吼：在本回合中每有一个随从死亡，便获得+1/+1。
- **当前建议 displayType**: turn_counter
- **审核结论**: 保留
- **问题**: stateNeeded 写的是泛用 `historyCounterForThisEffect`，本牌应明确为"本回合双方随从死亡数"（注意是双方，不只是友方）。
- **修正建议**: stateNeeded 改为 `minionDeathsThisTurnBothPlayers`；文案 "本回合死亡随从：{count}（出牌后获得 +{count}/+{count}）"。

### 24. 饥饿的愚人 (CORE_REV_019)
- **卡牌文本**: 战吼：抽一张牌。注能（）：改为抽三张牌。
- **当前建议 displayType**: infuse_progress
- **审核结论**: 保留
- **修正建议**: 文案 "注能 {progress}/{required}（达成后抽 3 张）"。

### 28. 石裔指控者 (CORE_REV_013)
- **卡牌文本**: 注能（）：获得"战吼：造成5点伤害。"
- **当前建议 displayType**: infuse_progress
- **审核结论**: 保留
- **修正建议**: 文案 "注能 {progress}/{required}（达成后战吼造成 5 点伤害）"。

### 29. 墓穴潜伏者 (CORE_ICC_098)
- **卡牌文本**: 战吼：随机将一个在本局对战中死亡并具有亡语的随从置入你的手牌。
- **当前建议 displayType**: graveyard_candidate_pool
- **审核结论**: 保留
- **问题**: 范围应该是"双方本局死亡的所有亡语随从"（炉石此类文案通常包括双方墓地——需以实测为准；但记牌器至少应展示友方墓地中的亡语随从，且单独标示对方墓地候选）。建议默认包含双方。
- **修正建议**: stateNeeded 改为 `graveyardDeathrattleMinionsBothPlayers`；文案 "本局已死亡的亡语随从：{cardNames}（共 {count}）"。

### 33. 大检察官怀特迈恩 (CORE_EX1_190)
- **卡牌文本**: 战吼：召唤所有在本回合中死亡的友方随从。
- **当前建议 displayType**: turn_graveyard_pool
- **审核结论**: 保留
- **问题**: 候选池是"本回合友方墓地"。stateNeeded 用泛字段 `friendlyGraveyardFilteredByThisEffect` 没问题，但应说明该过滤器是 turn-scoped 且仅友方。
- **修正建议**: stateNeeded 改为 `friendlyGraveyardThisTurn`；文案 "本回合死亡的友方随从：{cardNames}（{count} 个）"。

### 34. 假面狂欢者 (CORE_REV_015)
- **卡牌文本**: 突袭，亡语：召唤你牌库中另一个随从的2/2的复制。
- **当前建议 displayType**: deck_candidate_pool
- **审核结论**: 保留
- **问题**: 候选池=牌库中所有随从（被召唤为 2/2 复制）。属性恒为 2/2，所以池只需展示哪些随从可能被选中即可。
- **修正建议**: stateNeeded 改为 `deckMinionsRemaining`；文案 "牌库中剩余随从：{cardNames}（{count} 张，召唤为 2/2 复制）"。

### 37. 被告希尔瓦娜斯 (CORE_MAW_033)
- **卡牌文本**: 战吼：消灭一个敌方随从。注能（）：改为夺取其控制权。
- **当前建议 displayType**: infuse_progress
- **审核结论**: 保留
- **修正建议**: 文案 "注能 {progress}/{required}（达成后改为夺取控制权）"。

### 39. 罪能魔像 (CORE_REV_843)
- **卡牌文本**: 注能（）：获得属性值，数值等同于为本随从注能的随从的攻击力。
- **当前建议 displayType**: infuse_accumulated_stats
- **审核结论**: 保留（需修正展示内容）
- **问题**: 这张牌的特殊点不是注能"进度"，而是注能"累计攻击力总和"——每个在它手中死亡的友方随从的攻击力都会加到它身上。stateNeeded 套用通用的 `friendlyDeathsWhileThisEntityInHand` 等不够具体；文案只展示 `{progress}/{required}` 也丢掉了关键信息。
- **修正建议**: stateNeeded 增加 `cumulativeAttackOfFriendlyMinionsDiedWhileInHand`；文案改为 "注能累计：+{cumulativeAttack}/+{cumulativeAttack}（共 {progress} 次友方死亡）"。

### 42. 贪食的吞噬者 (CORE_REV_017)
- **卡牌文本**: 战吼：吞食一个敌方随从并获得其属性值。注能（）：还会吞食相邻随从。
- **当前建议 displayType**: infuse_progress
- **审核结论**: 保留
- **修正建议**: 文案 "注能 {progress}/{required}（达成后吞食含相邻随从）"。

### 44. 德纳修斯大帝 (CORE_REV_906)
- **卡牌文本**: 吸血，战吼：对所有敌人造成总计5点伤害。无限注能（）：伤害增加1点。
- **当前建议 displayType**: infuse_counter
- **审核结论**: 保留
- **问题**: 这是"无限注能"，没有上限。展示成 `{progress}/{required}` 不合适。
- **修正建议**: 文案改为 "无限注能累计：{infiniteInfuseCount} 次（当前总伤害 {5 + infiniteInfuseCount}）"；stateNeeded 用 `infiniteInfuseStacks` 而不是 `infuseProgress/infuseRequired`。

### 53. 法夜欺诈者 (EDR_571)
- **卡牌文本**: 亡语：抽一张法力值消耗大于或等于（5）点的法术牌。
- **当前建议 displayType**: deck_candidate_pool
- **审核结论**: 保留
- **修正建议**: stateNeeded 注明 `deckSpellsCostGte5Remaining`；文案 "牌库中费用 ≥5 的法术：{cardNames}（{count} 张）"。

### 54. 花木护侍 (FIR_921)
- **卡牌文本**: 战吼：如果你已灌注过你的英雄技能两次，抽两张牌。
- **当前建议 displayType**: hero_power_infuse_progress
- **审核结论**: 需修正
- **问题**: displayType 名字勉强可接受，但 **stateNeeded 完全错误**——本牌与"在手时友方死亡数"无关，应跟踪"本局已灌注英雄技能的次数"。当前列出的 `friendlyDeathsWhileThisEntityInHand`、`infuseProgress`、`infuseRequired`、`infusedState` 全部不适用。
- **修正建议**: stateNeeded 改为 `heroPowerInfuseCountThisGame`、`heroPowerInfuseRequired`；文案 "已灌注英雄技能：{count}/2（达成后抽 2 张）"。

### 57. 明耀织梦者 (EDR_860)
- **卡牌文本**: 吸血。战吼：如果你已灌注过你的英雄技能两次，对一个随从造成4点伤害。
- **当前建议 displayType**: hero_power_infuse_progress
- **审核结论**: 需修正
- **问题**: 与 54 同——stateNeeded 错挂到注能死亡跟踪上。
- **修正建议**: 同 54。stateNeeded 改 `heroPowerInfuseCountThisGame`、`heroPowerInfuseRequired`；文案 "已灌注英雄技能：{count}/2（达成后造成 4 点伤害）"。

### 60. 受难的恐翼巨龙 (EDR_572)
- **卡牌文本**: 亡语：抽两张龙牌，其法力值消耗减少（1）点。
- **当前建议 displayType**: deck_candidate_pool
- **审核结论**: 保留
- **修正建议**: stateNeeded 注明 `deckDragonsRemaining`；文案 "牌库中剩余龙牌：{cardNames}（{count} 张）"。

### 62. 护路者玛洛恩 (EDR_888)
- **卡牌文本**: 战吼：发现一张传说荒野之神。如果你已灌注过你的英雄技能4次，则将发现的荒野之神的法力值消耗变为（1）点。
- **当前建议 displayType**: hero_power_infuse_progress
- **审核结论**: 需修正
- **问题**: 与 54、57 同——stateNeeded 错挂到死亡注能跟踪上。本牌阈值是 4 次。
- **修正建议**: stateNeeded 改为 `heroPowerInfuseCountThisGame`、`heroPowerInfuseRequired=4`；文案 "已灌注英雄技能：{count}/4（达成后发现的随从费用变为 1）"。

### 64. 莎拉达希尔 (EDR_846)
- **卡牌文本**: 获取全部5张梦境牌。如果你在本牌在你手中时使用过法力值消耗更高的牌，腐蚀这些梦境牌！
- **当前建议 displayType**: corrupt_condition
- **审核结论**: 保留
- **问题**: 条件是"在该实体处于手中期间，曾打出过费用 >8 的牌"。stateNeeded 用 `entityScopedHistoryWhileInHand` 太泛。
- **修正建议**: stateNeeded 改为 `playedCardMaxCostWhileThisEntityInHand`；文案 "持有期间最高消费的牌：{maxCost}（>8 将腐蚀梦境）"或 "持有期间已使用 ≥9 费的牌：{已/否}（{cardNames}）"。

### 65. 栉龙 (TLC_603)
- **卡牌文本**: 战吼：抽一张牌。亡语：弃掉该牌。
- **当前建议 displayType**: linked_card
- **审核结论**: 保留
- **问题**: 需绑定战吼抽到的那张实体；放在战场期间也应可悬停查看绑定牌。
- **修正建议**: displaySurfaces 增加 `play`/`board`（实体在场时悬停应可看绑定卡）；文案 "战吼抽到：{linkedCardName}（亡语弃掉）"。

### 69. 任务助理 (TLC_987)
- **卡牌文本**: 战吼：如果你在本局对战中使用过任务牌，对一个敌方随从造成3点伤害。
- **当前建议 displayType**: played_history_flag
- **审核结论**: 保留
- **问题**: 仅为布尔条件，文案模板 "已记录：{historySummary}" 不够直观。
- **修正建议**: stateNeeded 改为 `questCardPlayedThisGame: bool`；文案 "本局已使用任务牌：{是/否}（是则造成 3 点伤害）"。

### 76. 兽语者塔卡 (DINO_430)
- **卡牌文本**: 战吼：发现一只任意职业的传说野兽并获得其属性值。亡语：召唤该野兽。
- **当前建议 displayType**: linked_card
- **审核结论**: 保留
- **修正建议**: 文案 "已绑定野兽：{linkedCardName}（{atk}/{hp}）；亡语召唤该牌"。displaySurfaces 同样需含 `play`/`board`。

### 77. 末日使者安布拉 (TLC_106)
- **卡牌文本**: 战吼：触发本局对战中死亡的5个友方随从的亡语。
- **当前建议 displayType**: graveyard_deathrattle_pool
- **审核结论**: 保留
- **问题**: 池=本局已死亡的友方亡语随从。stateNeeded 用 `friendlyGraveyardFilteredByThisEffect` 可，但要明确"亡语过滤"。
- **修正建议**: stateNeeded 改为 `friendlyGraveyardDeathrattleMinionsThisGame`；文案 "本局已死亡的友方亡语随从：{cardNames}（共 {count}，将触发 5 个）"。

### 87. 旧时回响 (END_005)
- **卡牌文本**: 随机召唤一个法力值消耗为（4）的随从。消耗4份残骸以再召唤一个。流放：再召唤一个。
- **当前建议 displayType**: resource_counter
- **审核结论**: 保留
- **问题**: 但中立法术里出现"残骸"资源比较反常——残骸是死亡骑士专属。这张牌大概率是被某个职业改成中立分类后的边界数据。无论如何，残骸是死骑专属资源，本牌只有在死亡骑士套牌中才有意义。
- **修正建议**: stateNeeded `corpseCount` 是对的；文案 "残骸 {corpseCount}（消耗 4 个可再召唤一只 4 费随从）；流放可再召唤一只"。

### 88. 钟表发条暴怒者 (TIME_048)
- **卡牌文本**: 战吼：在本局对战中，你每进行过一个回合，便获得+1生命值。
- **当前建议 displayType**: dynamic_counter
- **审核结论**: 保留
- **问题**: stateNeeded 用 `historyCounterForThisEffect` 不够明确。
- **修正建议**: stateNeeded 改为 `friendlyTurnsTakenThisGame`；文案 "已进行回合：{turns}（出牌后身材 5/{5 + turns}）"。

### 89. 克罗米 (TIME_103)
- **卡牌文本**: 亡语：抽取你在本局对战中使用过的每张牌的另一张复制。
- **当前建议 displayType**: played_cards_pool
- **审核结论**: 保留
- **问题**: 池可能极大，悬停展示需注意截断；并且"另一张复制"意味着只抽你套牌中存在的副本——记牌器应区分"已使用过且原套牌中尚有副本"。
- **修正建议**: stateNeeded 补 `cardsPlayedThisGameDistinct`、`expectedDrawCount`；文案 "本局已使用 {distinctCount} 张不同的牌（预计抽 {drawCount} 张，前几张：{topCardNames}…）"。

### 92. 愤怒残魂 (END_004)
- **卡牌文本**: 在本回合中每有一个随从死亡，本牌的法力值消耗便减少（1）点。战吼：抽两张牌。
- **当前建议 displayType**: cost_progress
- **审核结论**: 保留
- **问题**: stateNeeded 写 `historyCounterForThisEffect` 太泛；需明确"本回合双方随从死亡数"。
- **修正建议**: stateNeeded 改为 `minionDeathsThisTurnBothPlayers`；文案 "本回合死亡随从：{count}（当前费用：{max(0, 7 - count)}）"。注：手牌中费用变化炉石客户端已实时显示，悬停补充进度数本身意义不大；但若不在手中（如在牌库展示）时，仍可有用。

### 94. 暮光龙卵 (CATA_210)
- **卡牌文本**: 亡语：召唤一条/的雏龙。（在你的回合开始时获得+1/+1！）
- **当前建议 displayType**: dynamic_token_stats
- **审核结论**: 移除
- **问题**: 蛋本身的效果是固定的（亡语必然召唤一条雏龙）。雏龙的成长属性在战场上随回合直接可见；蛋还没破时雏龙根本不存在，没有"已存储数据"可绑定。建议的 stateNeeded `linkedCardEntities`/`storedOrTransformedOriginalCards` 与本牌机制完全错位——蛋并未"存储"任何东西。从蛋自己的悬停信息框角度来看，没有需要追踪的状态。
- **修正建议**: 建议从额外显示候选移除。若坚持显示，应改为"预测召唤的雏龙当前回合属性"——但这需要计算"本局还剩多少回合"，价值低且复杂。

### 96. 宝石囤储者 (CATA_897)
- **卡牌文本**: 战吼：选择你手牌中的一张牌并弃掉。亡语：重新获取弃掉的牌，其法力值消耗减少（1）点。
- **当前建议 displayType**: linked_card
- **审核结论**: 保留
- **问题**: 需绑定战吼时被弃掉的那张牌。displaySurfaces 缺 `play`/`board`（在场时也应可悬停查看）。
- **修正建议**: displaySurfaces 增加 `play`；文案 "已弃掉：{linkedCardName}（亡语回收，费用 -1）"。

### 98. 戈隆巨人 (CATA_616)
- **卡牌文本**: 本随从的法力值消耗会随你使用的上一张牌的法力值消耗而降低。
- **当前建议 displayType**: cost_progress
- **审核结论**: 保留
- **问题**: stateNeeded 写 `historyCounterForThisEffect` 不准——需要的是"你上一张已使用牌的费用"（不是累计计数）。文案 "进度：{count}" 也不合适。
- **修正建议**: stateNeeded 改为 `lastPlayedCardCost`；文案 "上一张已使用牌的费用：{lastCost}（当前费用：{max(0, 9 - lastCost)}）"。注意"上一张已使用的牌"包括法术、随从、武器等所有可触发"play"事件的牌。

## 总结建议

**强烈需要修正的卡牌（5 张）**：54、57、62（三张"灌注英雄技能 N 次"系列被错挂到死亡注能 stateNeeded 上）、39（罪能魔像需展示累计攻击力而非简单 progress）、44（无限注能不应使用 progress/required 模板）。

**建议移除的卡牌（2 张）**：
- 8 冥界侍从：只是个固定文字光环，悬停信息无新增信息量；其影响应内化进其它注能牌的进度计算逻辑，不需要独立悬停信息框。
- 94 暮光龙卵：亡语效果固定，蛋本身没有任何动态状态可绑定；雏龙在战场上自身可见。

**建议明确显示池范围的卡牌**：22、29、92（需注明"双方随从死亡"而非仅友方——这是常见的误解点）；33、77（需明确为"友方"且"本回合/本局"）。

**stateNeeded 字段普遍过于泛化**：文件中大量牌沿用了"historyCounterForThisEffect"、"entityScopedHistoryWhileInHand"、"friendlyGraveyardFilteredByThisEffect" 等占位字段。实施前应替换为具体语义键名，以便记牌器内部建立精确状态机。

**显示面板（displaySurfaces）补充**：所有 `linked_card` 类（65、76、96）应在 `displaySurfaces` 中加入 `play`/`board`——这类牌出场后仍然在场上需要查询绑定信息，仅在 graveyard/hover 显示不够。

**资源类（87 旧时回响）的可疑职业归类**：该牌使用"残骸"机制（死骑专属资源），出现在中立池中应核实——可能是数据错误或者它确实是中立牌但需玩家自带死骑套牌才有意义。如果是后者，记牌器在非死骑套牌中应隐藏 corpseCount 悬停。
