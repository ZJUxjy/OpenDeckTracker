# 记牌器额外显示候选卡牌 · 总审核报告

> 审核范围：`data/cards/review/standard-extra-display-candidates/` 下的 12 个职业 JSON 候选清单。
> 审核日期：2026-05-14
> 审核方式：12 个子代理并行逐卡核对，每职业一份详细报告，本文为汇总。
> 详细分卡审核结果请见同目录下 `audit-<class>.md`。

## 1. 总览统计

| 职业 | 候选数 | 建议保留 | 建议移除 | 需要修正建议 |
|---|---:|---:|---:|---:|
| 死亡骑士 (Death Knight) | 15 | 14 | 1 | 10 |
| 恶魔猎手 (Demon Hunter) | 8 | 8 | 0 | 6 |
| 德鲁伊 (Druid) | 17 | 17 | 0 | 9 |
| 猎人 (Hunter) | 32 | 25 | 7 | 12 |
| 法师 (Mage) | 11 | 5 | 6 (含倾向) | 5 |
| 中立 (Neutral) | 31 | 24 | 2 | 5 |
| 圣骑士 (Paladin) | 15 | 12 | 3 | 9 (含合并) |
| 牧师 (Priest) | 13 | 10 | 2 | 8 |
| 潜行者 (Rogue) | 13 | 12 | 1 | 7 |
| 萨满祭司 (Shaman) | 19 | 17 | 2 | 9 |
| 术士 (Warlock) | 16 | 14 | 2 | 9 |
| 战士 (Warrior) | 8 | 7 | 1 | 5 |
| **合计** | **198** | **165** | **27** | **94** |

> 注：「建议移除」指审核认为该卡不适合做额外悬停（效果固定/可见/池太大无规划价值/纯静态参考）。
> 「需要修正建议」指卡本身值得保留，但当前 `extraDisplay` 配置中至少有一个字段（displayType / stateNeeded / 文案 / displaySurfaces）需要修改。

---

## 2. 全局共性问题（按严重性排序）

### 2.1 ❗ 关键语义错误：滥用 `friendlyDeathsWhileThisEntityInHand`

**问题**：原 JSON 把"召唤本局对战中死亡的友方 X"（如 `邪能之乱`、`小鬼大王拉法姆`、`末日使者安布拉`、`怀特迈恩`、`温和卜算者`等多张）一律配置为 `stateNeeded: friendlyDeathsWhileThisEntityInHand`。这是 **机制误读**：

- 此类卡的召唤池 = **本局全程**死亡过的友方（某种族）随从（按 cardId 去重）。与"该卡是否在手时死亡"无关。
- `friendlyDeathsWhileThisEntityInHand` 这个字段**只在「注能」(Infuse) 机制下成立**——它是 Infuse 的进度计数器，不能复用为墓地池。

**涉及职业**：恶魔猎手、术士、牧师、中立（多张）、死亡骑士部分误标。

**修正方向**：
- 召唤池请使用 `friendly<Tribe>EverDiedThisGameUnique`（去重）或 `friendly<Tribe>DeathInstancesThisGame`（加权），按卡的"去重 vs 加权"语义二选一。
- Infuse 计数器仍保留 `friendlyDeathsWhileThisEntityInHand`，但必须以 `[entityId]` 维度存储（每张实例独立计数）。

### 2.2 ❗ `stateNeeded` / `displayType` 大量使用泛化占位符

**问题**：原 JSON 在多张卡上反复出现：
- `historyCounterForThisEffect`
- `matchHistoryStateForThisEffect`
- `eligibleDeathrattleOrMinionPool`
- `entityScopedHistoryWhileInHand`
- `relatedCardsInHand` / `relatedCardsInDeck`
- `persistentEffectActive` / `affectedCards`

以及文案中：
- `{stateSummary}` / `{activeText}` / `{affectedSummary}` / `{effectPreview}`

这些字段名/占位符对实现毫无指导意义，无法直接映射到具体计数器或数据源。

**涉及职业**：几乎全部，尤其法师、德鲁伊、潜行者、术士、中立。

**修正方向**：每张卡的 `stateNeeded` 必须给出**具体计数器键**（如 `heroPowerInfuseCountThisGame`、`fireSpellsCastThisTurn`、`cardsDiscardedThisGame`、`friendlyTotemsSummonedThisGame`），文案使用具名变量。

### 2.3 ❗ "持续效果启用器"挂在错的卡上

**问题**：一些卡本身效果是**一次性、永久生效的全局 buff**（魔网 / 私法程序 / 洛在世 / 私法效果开关），打出后该卡本身就完成使命，玩家不需要再悬停查看；真正需要悬停展示当前 buff 状态的是**被启用的目标卡**。

**典型例子**：
- 法师：`秘魔刃豹` / `魔力行者` / `湍流之针` — 启用魔网，应展示在魔网目标牌上而非启用器
- 法师：`守护者艾格文` — 延迟 buff，应展示在被影响的随从上
- 德鲁伊：`私法程序` / `洛在世传奇` — 全局修饰，应作为顶栏状态条

**修正方向**：新增 `global_buff_active_state` / `top_bar_status` 类型；并在被影响卡的悬停上展示具体 buff 数值。

### 2.4 ⚠ 静态全集随机池的卡不该做悬停

**问题**：若候选池是"全游戏 X 学派法术（除本职业）"、"全游戏 N 费随从"等**静态/不依赖本局历史**的全集，悬停展示的价值极低，等价于客户端原生 tooltip。

**典型例子**：
- 法师：`咒术图书管理员`、`地狱火先锋`
- 牧师：`"太阳裂片"莱拉`、`擎天雷龙`
- 圣骑士：`圣光护盾`、`蛇颈龙骑手的祝福`、`填鳃暴龙`
- 潜行者：`混沌祈求者`
- 猎人：`布罗尔·熊皮`、`迅猛龙巢护工`、`甲龙`、`三纪暴龙`

**修正方向**：一律建议**移除**额外显示。可在审核通用准则中纳入「静态全集随机池一律不做悬停」一条。

### 2.5 ⚠ "玩家可见区域内的效果"不需要额外悬停

**问题**：作用对象在己方手牌 / 当前战场，玩家在游戏内已能直接看到的，不需要悬停再列一遍。

**典型例子**：
- 术士：`影裔魔`、`空灵召唤者`（作用对象在己方手牌）
- 猎人：`装死`、`结网蛛`（场面可见，无候选池）
- 死亡骑士：`乌索克`（候选池在结算瞬间才生成）

**修正方向**：建议移除额外显示。

### 2.6 ⚠ "白银之手新兵"持久增益应合并显示

**问题**：圣骑士有 6 张牌都对白银之手新兵施加永久 buff（正义追击、洛萨克森、莽撞的战场军官、坚定的救援者、砺胆重剑、执事者斯图尔特）。如果每张牌独立显示，玩家在场面上很难快速得知"我现在的白银之手新兵到底是几几"。

**修正方向**：新建一个**汇总组件** `silver_hand_recruit_status`，显示"白银之手新兵当前基础属性 + 来源列表"，由这 6 张牌共享触发显示。

### 2.7 ⚠ `displaySurfaces` 命名不一致 / 缺失关键面

- 战士、萨满（雷鸣流云、升腾）多张卡漏写 `play` 表面；持续效果绑定到场上随从时，**场上悬停必须能查到原牌**。
- 潜行者多张 `cost_progress` 类卡可以从 `hand` 表面中移除（客户端原生已显示当前费用），保留 `deck + hover` 即可。
- linked_card 类（中立栉龙、塔卡、宝石囤储者）应补 `play`/`board`。

### 2.8 ⚠ "去重 vs 加权 vs 分桶"语义未区分

**问题**：墓地池/历史池根据卡牌不同，可能需要：
- **按 cardId 去重**（永恒奴役、小钻石、小鬼大王拉法姆复活池）
- **按实例加权**（卡特琳娜复活池）
- **按费用分桶**（轮回转生 1/2/3 费三桶，任一桶为空必须高亮警告）
- **按种族过滤**（恶魔/野兽/亡灵）

原 JSON 通通混入 `eligibleDeathrattleOrMinionPool` / `friendlyGraveyardFilteredByThisEffect`，未区分语义。

**修正方向**：明确数据模型 —— 友方墓地池数据源应同时支持 4 种视图（去重/加权/分桶/种族筛选），各卡按自身机制选定。

### 2.9 ⚠ 空池警告（empty-pool warning）

**问题**：若亡语/战吼是"从满足条件的池中随机抽取"，**候选 count = 0 时玩家最需要被警告**（亡语会空转）。

**典型例子**：术士 `腐心树妖` / `着魔的动物术师`、牧师 `轮回转生`（任一费用桶为空）、圣骑士 `捐助`。

**修正方向**：所有 `pool_count` / `*_pool` 类 displayType 必须支持 `emptyWarning: true`，count=0 时高亮提示。

### 2.10 ⚠ 文案占位符不能体现具体效果

- 战士 `灌能战斧`：当前 `{effectPreview}` 抽象，应直接显示当前是 +1/+2 还是 +2/+2
- 潜行者 `罪碑坟场`：`currentValue` 不足以表达 X/X 身材，应给 `召唤 {atk}/{hp}`
- 中立 `罪能魔像`：是"累计死亡随从攻击力总和"，不是 `{progress}/{required}`，文案应为 `+{cumulativeAttack}/+{cumulativeAttack}`
- 中立 `德纳修斯大帝`：是**无限注能**，无上限，不应套用 `{progress}/{required}` 模板

---

## 3. 各职业要点（详见各分文档）

### 死亡骑士 [audit-deathknight.md](audit-deathknight.md)
- 1 张移除：`乌索克`（复活池结算瞬间才生成）
- 真正依赖"残骸累计消耗"的只有 `缝合巨人` 与 `恐怖再起任务`，其他大多数残骸卡只需展示"当前残骸 ≥ N"，不需要历史累计
- `僵尸新娘` / `玛洛加尔领主` / `永时收割者哈斯克` / `塔兰吉` 4 张被错误打上 `graveyard_pool` 标签；真正需要墓地池过滤的只有 `悼念成真`
- `塔兰吉` 是 `linked_card_location` 类（只跟 `邦桑迪` 这张具名卡挂钩）的标杆案例

### 恶魔猎手 [audit-demonhunter.md](audit-demonhunter.md)
- 0 张移除；`邪能之乱` 是 §2.1 错误最典型的案例（注能进度 vs 全局墓地池必须拆开）
- `残暴的魔蝠` 的"不同的"约束需排除自身 cardId
- `邪火爆焰` 与 `奈瑟匹拉` 是"在场触发"，焦点应转为"高亮手牌/牌库中的邪能法术"
- `邪能钓鱼者` 是**全局计数**，不要按实体 ID 跟踪

### 德鲁伊 [audit-druid.md](audit-druid.md)
- 0 张移除，但 9 张需修正
- `日蚀` / `诺达希尔德鲁伊` 应是 `pending_next_spell_effect`（一次性"下一个法术"），不是 `persistent_effect_*`
- `私法程序` / `洛在世传奇` 应改为顶栏状态条
- `林地塑型者` 缺"自身在场才高亮自然法术"的条件
- `哈缪尔·符文图腾` 的 `spell_count_progress` 没体现"每 3 个触发一次"的取模特性
- `破碎现实`（全局友方树人死亡数）vs `罪恶谋划`（在手时友方死亡数 / 注能）必须严格区分
- `震地雷龙` 一次性快照 buff 必须按 entityId 锁定，否则后抽到的同名随从会被误标
- 总结提出了 5 个建议新增的 displayType 枚举值

### 猎人 [audit-hunter.md](audit-hunter.md)
- 7 张移除（`装死`、`结网蛛`、`恐鳞追猎者`、`布罗尔·熊皮`、`迅猛龙巢护工`、`甲龙`、`三纪暴龙`）
- 主要问题：原 JSON 的 trackingHints 列得过宽（动辄 5-10 项 played_history 全局追踪），未与卡实际效果对齐
- `影犬` 注能按"野兽死亡"过滤；`憎恶弓箭手` 的池子是"友方野兽墓地"非"亡语池"
- `奇异训犬师` 被错误归入 `infuse_death_counter`（实际无注能）
- `失时往生` 需单独建模"己方奥秘装备 + 候选触发随从清单"

### 法师 [audit-mage.md](audit-mage.md)
- 2 张明确移除 + 4 张倾向移除（`守护者艾格文`、`咒术图书管理员`、`地狱火先锋`、3 张魔网启用器）
- 魔网启用器是 §2.3 最典型案例：本卡固定，应展示在被影响的魔网目标牌上

### 中立 [audit-neutral.md](audit-neutral.md)
- 2 张移除：`冥界侍从`（固定光环）、`暮光龙卵`（无存储/绑定状态）
- §2.1 的典型多发地：`花木护侍`、`明耀织梦者`、`护路者玛洛恩` 都把"已灌注英雄技能 N 次"错挂到注能死亡字段；应改为 `heroPowerInfuseCountThisGame`
- `罪能魔像` 是攻击力累计而非简单 progress
- `德纳修斯大帝` 是无限注能，不应套 `{progress}/{required}`
- 数据可疑：`旧时回响 (END_005)` 用残骸机制但归为中立牌，应核实

### 圣骑士 [audit-paladin.md](audit-paladin.md)
- 3 张移除（`圣光护盾`、`蛇颈龙骑手的祝福`、`填鳃暴龙`，均为静态全集随机池）
- **§2.6 白银之手新兵合并显示是本职业最大设计建议**

### 牧师 [audit-priest.md](audit-priest.md)
- 2 张移除（`"太阳裂片"莱拉`、`擎天雷龙`，静态全集）
- `轮回转生` 必须分 1/2/3 费三桶，任一桶为空时高亮警告
- `林歌海妖` 是"神圣 AND 暗影 同回合都用过"的复合布尔条件，要拆为两个布尔 + 当前实际费用
- 牧师跨卡基础设施建议：友方墓地池（4 种视图）、法术学派回合计数器、本局治疗总量徽章

### 潜行者 [audit-rogue.md](audit-rogue.md)
- 1 张移除：`混沌祈求者`（静态分桶池）
- `厄索拉斯`：信息公开性问题——被吞食的对手手牌默认不可见，记牌器只能展示"数量+休眠回合数"

### 萨满祭司 [audit-shaman.md](audit-shaman.md)
- 2 张移除：`锻石师`（一次性场面可见 buff）、`熔爪巨龙`（当前场面信息）
- 萨满级共享计数器清单：过载、图腾召唤、英雄技能、攻击次数、上回合法术学派分桶、按实体跟踪的持有期间法术
- `图腾物证` 的 displayType 名义正确但需把 stateNeeded 换为 `friendlyTotemDeathsWhileThisEntityInHand`

### 术士 [audit-warlock.md](audit-warlock.md)
- 2 张移除：`影裔魔`、`空灵召唤者`（作用在己方手牌可见）
- §2.1 的另一多发地：`尸身保护令`、`小鬼大王拉法姆`
- `本局弃牌数` 是术士级共享 state `cardsDiscardedThisGame`（兰娜瑟尔 + 地狱公爵）
- `无穷助祭` 需双向悬停：本随从上看锁定的手牌；被锁手牌上反向提示
- `暗脉女勋爵` 生成的两个阴影也挂同款亡语，场上悬停阴影也应显示

### 战士 [audit-warrior.md](audit-warrior.md)
- 1 张移除：`洛戈什的奋战`（无筛选条件的随机召唤手牌随从）
- `埃博克` 必须收窄为"对手上回合打出且**仍在场**的随从"
- `血斗士洛戈什` 必须精准按 `BLOODSPORT` 标签筛选
- 共享 state：`fireSpellsCastThisTurn`（`怨毒焰魔` + `喷发火山`）、`friendlyMinionsDiedThisGame`（按 race/type 分类）

---

## 4. 后续行动建议

1. **优先解决 §2.1 误读**：批量修正所有"召唤本局死亡 X"类卡的 `stateNeeded`，分离 Infuse 进度与墓地池两个数据源。
2. **统一 `stateNeeded` 字段命名规范**：消除所有泛化占位符。建议在 `data/cards/schema/` 下沉淀一个 `stateNeeded-vocabulary.md` 文档，列出全部合法键名与定义。
3. **基础设施先行**：在记牌器内核中先实现 5 个共享数据源：
   - 友方墓地池（4 种视图：去重 / 加权 / 按费用分桶 / 按种族过滤）
   - 法术学派按回合/全局分桶计数
   - 英雄技能使用次数（含 Infuse 专用计数）
   - 过载水晶（当前/上回合/累计）
   - 实体作用域计数器（`<state>[entityId]`）
4. **建立 displayType 枚举白名单**：从各职业审核归纳出统一的 displayType 集合，避免临时新造。当前已识别的关键类型：
   - `counter` / `cost_progress` / `attribute_progress`
   - `graveyard_pool`（带视图配置）
   - `infuse_progress`（含 `byTribe` / `byHeroPower` 变体）
   - `linked_card_location` / `linked_card`
   - `pending_next_spell_effect`
   - `global_buff_active_state` / `top_bar_status`
   - `silver_hand_recruit_status`（领域专用合并组件）
5. **空池警告统一为公共能力**：所有 pool 类型 displayType 默认提供 `emptyWarning`。
6. **移除审核否决的 27 张**：建议直接从 candidates 列表删除，或迁移到一个 `rejected.json` 留作记录。
7. **`displaySurfaces` 规范化**：制定一份"哪些场景必须包含 play/board/hand/hover/deck/graveyard"的指南。

---

## 5. 文件索引

| 文件 | 职业 |
|---|---|
| [audit-deathknight.md](audit-deathknight.md) | 死亡骑士 |
| [audit-demonhunter.md](audit-demonhunter.md) | 恶魔猎手 |
| [audit-druid.md](audit-druid.md) | 德鲁伊 |
| [audit-hunter.md](audit-hunter.md) | 猎人 |
| [audit-mage.md](audit-mage.md) | 法师 |
| [audit-neutral.md](audit-neutral.md) | 中立 |
| [audit-paladin.md](audit-paladin.md) | 圣骑士 |
| [audit-priest.md](audit-priest.md) | 牧师 |
| [audit-rogue.md](audit-rogue.md) | 潜行者 |
| [audit-shaman.md](audit-shaman.md) | 萨满祭司 |
| [audit-warlock.md](audit-warlock.md) | 术士 |
| [audit-warrior.md](audit-warrior.md) | 战士 |
