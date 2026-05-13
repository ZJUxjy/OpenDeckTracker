param(
  [string]$CandidateDir = "data/cards/review/standard-extra-display-candidates"
)

$ErrorActionPreference = "Stop"
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$SourceDir = Join-Path (Split-Path $CandidateDir -Parent) "standard-history-sensitive"

function Read-JsonFile {
  param([string]$Path)
  return [System.IO.File]::ReadAllText($Path, $Utf8NoBom) | ConvertFrom-Json
}

function Write-JsonFile {
  param(
    [string]$Path,
    $Value,
    [int]$Depth = 40
  )
  $json = $Value | ConvertTo-Json -Depth $Depth
  [System.IO.File]::WriteAllText($Path, $json, $Utf8NoBom)
}

$removeReasons = @{
  "EDR_819" = "乌索克的复活池在结算时按该实体消灭的随从生成，提前悬停没有稳定候选。"
  "CORE_ICC_052" = "装死的目标来自当前可见场面，不需要记牌器额外列出。"
  "CORE_FP1_011" = "结网蛛生成的是静态全局野兽池，池过大且不依赖对局历史。"
  "CORE_UNG_800" = "恐鳞追猎者目标来自当前可见场面，不需要额外悬停。"
  "EDR_853" = "布罗尔·熊皮使用固定动物伙伴池，作为额外悬停价值低。"
  "DINO_434" = "迅猛龙巢护工使用静态全局 1 费随从/法术池，池过大且不可规划。"
  "DINO_422" = "甲龙使用静态全局 3 费野兽池，池过大且不可规划。"
  "END_015" = "三纪暴龙使用静态全局亡语随从池，额外显示价值低。"
  "CS3_001" = "守护者艾格文不是检索池效果，延迟 buff 更适合显示在受影响随从上。"
  "TLC_226" = "咒术图书管理员只是普通法术检索和自身复制，不属于额外历史显示。"
  "CORE_MAW_031" = "冥界侍从是场上固定光环，其影响应内化进注能计算，而不是本牌独立 hover。"
  "CATA_210" = "暮光龙卵没有存储/绑定状态，亡语效果固定。"
  "EDR_264" = "圣光护盾为静态全局 2 费随从池，额外显示价值低。"
  "TLC_477" = "蛇颈龙骑手的祝福为静态全局 4 费随从池，额外显示价值低。"
  "TLC_240" = "填鳃暴龙为固定随机额外效果，不依赖历史状态。"
  "CORE_UNG_963" = "太阳裂片莱拉使用静态牧师法术池，额外池展示价值低。"
  "DINO_431" = "擎天雷龙使用静态全局高费嘲讽池，额外展示价值低。"
  "CATA_786" = "混沌祈求者使用静态同费另一职业法术池，不需要记牌器额外悬停。"
  "CORE_REV_921" = "锻石师为固定场面/全局图腾攻击 buff，不应挂在本牌 hover。"
  "TLC_482" = "熔爪巨龙依赖当前可见场面，作为专属悬停价值低。"
  "CORE_REV_374" = "影裔魔目标位于己方手牌且可见，记牌器重复列出价值低。"
  "CORE_FP1_022" = "空灵召唤者候选位于己方手牌且可见，记牌器重复列出价值低。"
  "CATA_610" = "洛戈什的奋战随机召唤任意手牌随从，无筛选条件且信息冗余。"
}

$specific = @{}

function Add-Spec {
  param(
    [string]$Code,
    [string]$DisplayType,
    [string]$Priority,
    [string[]]$Surfaces,
    [string[]]$State,
    [string]$Text,
    [string]$Reason,
    [switch]$EmptyWarning,
    [string[]]$Notes = @()
  )

  $specific[$Code] = [ordered]@{
    schemaVersion = 2
    auditDecision = "keep"
    displayType = $DisplayType
    implementationPriority = $Priority
    displaySurfaces = @($Surfaces)
    stateNeeded = @($State)
    suggestedDisplayTextZhCN = $Text
    reasoningZhCN = $Reason
  }

  if ($EmptyWarning) {
    $specific[$Code].emptyWarning = $true
  }
  if ($Notes.Count -gt 0) {
    $specific[$Code].notesZhCN = @($Notes)
  }
}

function New-DefaultExtra {
  param($Card)

  $code = [string]$Card.cardCode
  $oldType = [string]$Card.extraDisplay.displayType
  $displayType = $oldType
  $priority = "medium"
  $surfaces = @("hand", "hover")
  $state = @("cardState.$code")
  $text = "状态：{value}"
  $reason = "audit 后保留；实现侧按本卡专属状态键读取。"

  if ($oldType -match "infuse") {
    $displayType = "infuse_progress"
    $priority = "high"
    $state = @("infuseProgressByFriendlyDeathsWhileThisEntityInHand", "infuseRequired", "infusedState", "entityIdScopedCounter")
    $text = "注能 {progress}/{required}（{infusedText}）"
    $reason = "注能按手牌实体独立推进，需要显示当前进度和完成效果。"
  } elseif ($oldType -match "graveyard|deathrattle_pool") {
    $displayType = "graveyard_pool"
    $priority = "high"
    $surfaces = @("hand", "graveyard", "hover")
    $state = @("graveyardPool.$code")
    $text = "候选池：{cardNames}（{count}）"
    $reason = "效果依赖本局死亡池，当前牌面无法直接得出候选。"
  } elseif ($oldType -match "deck") {
    $displayType = "deck_pool"
    $surfaces = @("deck", "hover")
    $state = @("deckPool.$code")
    $text = "牌库候选：{cardNames}（{count}）"
    $reason = "效果命中牌库中的特定子集，显示剩余候选能辅助规划。"
  } elseif ($oldType -match "cost|counter|dynamic|threshold|turn") {
    $displayType = "counter"
    $priority = "high"
    $surfaces = @("deck", "hand", "hover")
    $state = @("counter.$code")
    $text = "计数：{count}；当前效果：{currentText}"
    $reason = "效果数值由对局计数决定，需要显示当前可用数值。"
  } elseif ($oldType -match "linked|stored|original") {
    $displayType = "linked_card"
    $priority = "high"
    $surfaces = @("play", "board", "graveyard", "hover")
    $state = @("linkedCard.$code")
    $text = "绑定牌：{linkedCardName}"
    $reason = "效果绑定具体实体，后续亡语或回归需要查看该绑定。"
  } elseif ($oldType -match "persistent|global") {
    $displayType = "top_bar_status"
    $surfaces = @("top_bar", "hover")
    $state = @("globalEffect.$code")
    $text = "全局状态：{activeText}"
    $reason = "本牌产生跨回合状态，应作为全局状态或受影响卡角标展示。"
  } elseif ($oldType -match "highlight") {
    $displayType = "related_card_highlight"
    $surfaces = @("deck", "hand", "hover")
    $state = @("relatedCards.$code")
    $text = "高亮相关牌：{cardNames}"
    $reason = "相关牌会触发或受本牌影响，需要在手牌/牌库中高亮。"
  }

  return [ordered]@{
    schemaVersion = 2
    auditDecision = "keep"
    displayType = $displayType
    implementationPriority = $priority
    displaySurfaces = @($surfaces)
    stateNeeded = @($state)
    suggestedDisplayTextZhCN = $text
    reasoningZhCN = $reason
  }
}

# Key audit corrections and all user-provided examples.
Add-Spec "CORE_BT_427" "turn_death_counter" "high" @("hand", "hover") @("friendlyMinionsDiedThisTurn") "本回合友方随从死亡：{friendlyMinionsDiedThisTurn}；预计抽牌：{drawCount}" "灵魂盛宴完全依赖本回合友方随从死亡数。"
Add-Spec "CORE_MAW_012" "graveyard_pool_and_infuse_progress" "high" @("hand", "graveyard", "hover") @("friendlyDeadDemonsThisGameUnique", "infuseProgressByFriendlyDemonDeathsWhileThisEntityInHand", "infuseRequired", "infusedState") "死亡友方恶魔：{demonNames}；恶魔注能 {progress}/{required}；预计召唤 {summonCount} 个" "邪能之乱同时需要本局恶魔墓地池和在手恶魔注能进度，二者必须分开。" -EmptyWarning
Add-Spec "CATA_527" "on_board_trigger_highlight" "high" @("hand", "deck", "board", "hover") @("nespirahOnBoard", "felSpellsInHand", "felSpellsInDeck") "奈瑟匹拉在场：{activeText}；高亮邪能法术 {felSpellCount} 张" "邪能法术会重新开启奈瑟匹拉。"
Add-Spec "CATA_529" "cost_progress" "high" @("deck", "hand", "hover") @("felSpellsCastThisGame", "currentCost") "本局已施放邪能法术：{felSpellsCastThisGame}；费用减少 {discount}；当前费用 {currentCost}" "邪能钓鱼者费用是全局邪能法术计数，不按实体追踪。"
Add-Spec "CATA_526" "rejected_by_user" "low" @() @() "" "用户明确说明布洛克斯加的奋战不需要额外显示。"

# Death Knight.
Add-Spec "RLK_744" "cost_progress" "high" @("deck", "hand", "hover") @("corpsesSpentThisGame", "currentCost") "本局已消耗残骸：{corpsesSpentThisGame}；当前费用：{currentCost}" "缝合巨人的费用依赖累计消耗残骸，而不是当前残骸。"
Add-Spec "TLC_433" "quest_progress" "high" @("hand", "hover") @("corpsesSpentForQuest") "任务进度：{corpsesSpentForQuest}/15；还需 {remaining}" "任务推进依赖累计消耗残骸。"
Add-Spec "TIME_616" "graveyard_pool" "high" @("hand", "graveyard", "hover") @("friendlyDeadUndeadHighestCostPoolThisGame") "最高费死亡友方亡灵：{cardNames}" "悼念成真只看死亡友方亡灵中的最高费候选。" -EmptyWarning
Add-Spec "TIME_619" "linked_card_location" "high" @("deck", "hand", "graveyard", "hover") @("bwonsamdiLocation", "bwonsamdiDiedThisGame") "邦桑迪：{location}；战吼将{drawOrResurrect}" "塔兰吉只绑定邦桑迪的位置/死亡状态。"

# Druid.
Add-Spec "CORE_DMF_058" "pending_next_spell_effect" "medium" @("top_bar", "hand", "hover") @("solarEclipseNextSpellActive", "spellsInHand") "日蚀待触发：{activeText}；下一个法术将施放两次" "日蚀是一次性的下一个法术效果，不是本局持续效果。"
Add-Spec "CORE_MAW_024" "top_bar_status" "medium" @("top_bar", "hover") @("dewProcessActiveCount") "私法程序：{dewProcessActiveCount} 层；双方回合开始额外抽牌 +{dewProcessActiveCount}" "私法程序离开手牌后成为全局状态，更适合顶栏汇总。"
Add-Spec "CORE_CS3_012" "pending_next_spell_effect" "medium" @("top_bar", "hand", "hover") @("nordrassilNextSpellDiscountActive", "spellsInHand") "诺达希尔待触发：{activeText}；下一个法术费用 -3" "该效果是一次性的下一个法术减费。"
Add-Spec "CORE_REV_314" "on_board_trigger_highlight" "high" @("top_bar", "hand", "deck", "hover") @("topiorEffectActive", "natureSpellsInHand", "natureSpellsInDeck") "托匹奥效果：{activeText}；高亮自然法术 {natureSpellCount} 张" "托匹奥生效后，自然法术会额外召唤雏龙。"
Add-Spec "CORE_DMF_060" "cost_progress" "high" @("deck", "hand", "hover") @("spellsCastThisGame", "currentCost") "本局已施放法术：{spellsCastThisGame}；当前费用 {currentCost}" "猫头鹰费用依赖本局施法总数。"
Add-Spec "EDR_271" "on_board_trigger_highlight" "medium" @("hand", "deck", "board", "hover") @("woodlandShaperOnBoard", "natureSpellsInHand", "natureSpellsInDeck") "林地塑型者在场：{activeText}；高亮自然法术 {natureSpellCount} 张" "林地塑型者只有自身在场时才让自然法术产生额外价值。"
Add-Spec "EDR_845" "modular_spell_count_progress" "medium" @("top_bar", "hand", "deck", "hover") @("hamuulEffectActive", "spellsCastThisGame", "spellsCastSinceLastHamuulTrigger") "哈缪尔条件：{activeText}；施法进度 {spellsCastSinceLastTrigger}/3" "哈缪尔需要按每 3 次施法滚动触发。"
Add-Spec "TLC_257" "top_bar_status" "medium" @("top_bar", "deck", "hand", "hover") @("loRestOfGameEffectActive") "洛效果：{activeText}；你的随从牌费用视为 5" "这是本局全局费用覆盖，适合顶栏和受影响随从角标。"
Add-Spec "DINO_421" "deathrattle_buff_applied_set" "high" @("deck", "hand", "graveyard", "hover") @("thundertailBuffedEntityIds", "handAndDeckMinionBuffStats") "震地雷龙增益：{activeText}；已标记随从 +3/+3" "该亡语是一次性快照 buff，必须按 entityId 锁定被 buff 的手牌/牌库随从。"
Add-Spec "END_009" "death_history_counter" "high" @("deck", "hand", "hover") @("friendlyTreantDeathsThisGame") "本局死亡友方树人：{friendlyTreantDeathsThisGame}；召唤树人 {attack}/{health}" "破碎现实使用全局友方树人死亡数，不是手牌注能计数。"

# Hunter and Mage.
Add-Spec "CORE_MAW_009" "infuse_progress_by_tribe" "high" @("hand", "hover") @("friendlyBeastDeathsWhileThisEntityInHand", "infuseRequired", "infusedState") "野兽注能 {progress}/{required}；{infusedText}" "影犬注能只统计友方野兽死亡。"
Add-Spec "CORE_MAW_011" "graveyard_pool" "high" @("hand", "graveyard", "hover") @("friendlyDeadDeathrattleMinionsThisGameUnique") "发现池：死亡友方亡语随从 {cardNames}" "纳萨诺斯发现池来自友方死亡亡语随从。" -EmptyWarning
Add-Spec "CORE_ICC_825" "graveyard_pool" "high" @("hand", "graveyard", "hover") @("friendlyDeadBeastsThisGameWeighted") "复活野兽池：{cardNames}" "憎恶弓箭手只看友方野兽墓地。" -EmptyWarning
Add-Spec "EDR_226" "deck_pool" "medium" @("deck", "hand", "hover") @("beastsRemainingInDeck") "牌库中可抽野兽：{cardNames}（{count}）" "奇异训犬师不是注能牌，只需要牌库野兽候选。" -EmptyWarning
Add-Spec "TIME_620" "secret_eligible_minion_tracker" "high" @("play", "board", "hover") @("friendlySecretActiveLostInTime", "friendlyMinionsPlayedPreviousTurnStillTrackable") "可被奥秘复活的随从：{cardNames}" "失时往生需要追踪己方奥秘与上回合使用的随从标记。" -EmptyWarning
Add-Spec "CATA_560" "replay_pool" "high" @("deck", "hand", "hover") @("oneCostCardsPlayedThisGameDistinct") "将再次使用的 1 费牌：{cardNames}" "直面托维尔重放池来自本局已使用过的 1 费牌。" -EmptyWarning
Add-Spec "CORE_REV_514" "specific_minion_graveyard_count" "high" @("deck", "hand", "hover") @("friendlyUnstableSkeletonDeathsThisGame", "friendlyBoardSpace") "本局死亡不稳定的骷髅：{count}；复活 {summonCount} 个，溢出爆炸 {overflow} 个" "克尔苏加德只关心特定衍生随从死亡数。"
Add-Spec "EDR_941" "death_count_scaling_damage" "high" @("deck", "hand", "hover") @("friendlyMinionDeathsThisGame", "currentSpellDamageValue") "当前伤害：{damage}（本局死亡友方随从 {friendlyMinionDeathsThisGame}）" "星涌术伤害随友方随从死亡数提升。"
Add-Spec "EDR_430" "threshold_death_count" "high" @("deck", "hand", "hover") @("friendlyMinionDeathsThisGame") "友方随从死亡：{friendlyMinionDeathsThisGame}/20；{readyText}" "艾森娜需要 20 个友方随从死亡阈值。"
Add-Spec "DINO_409" "cost_progress" "high" @("deck", "hover") @("cardsPlayedNotFromInitialDeckThisGame", "currentCost") "已使用套牌外卡牌：{count}；预计当前费用：{currentCost}" "科技恐龙费用由本局套牌外卡牌使用数决定。"
Add-Spec "MEND_506" "global_buff_source" "low" @("top_bar", "hover") @("mendingEffectBonusThisGame") "魔网效果提高：+{mendingEffectBonusThisGame}" "audit 倾向不在启用器本牌上显示；如保留，只作为魔网全局状态来源。" -Notes @("audit 倾向移除本牌 hover，状态应展示在被影响的魔网牌上。")
Add-Spec "MEND_501" "global_buff_source" "low" @("top_bar", "hover") @("mendingCostReductionThisGame") "魔网费用减少：-{mendingCostReductionThisGame}" "audit 倾向不在启用器本牌上显示；如保留，只作为魔网全局状态来源。" -Notes @("亡语随机魔网池不展示。")
Add-Spec "MEND_503" "global_buff_source" "low" @("top_bar", "hover") @("mendingExtraTriggersThisGame") "魔网额外触发：+{mendingExtraTriggersThisGame}" "audit 倾向不在启用器本牌上显示；如保留，只作为魔网全局状态来源。" -Notes @("状态应展示在被影响的魔网牌上。")

# Neutral, Paladin, Priest.
Add-Spec "CORE_ICC_904" "turn_death_counter" "high" @("hand", "hover") @("minionDeathsThisTurnBothPlayers") "本回合死亡随从：{count}；战吼加成 +{count}/+{count}" "邪骨骷髅统计双方本回合死亡随从。"
Add-Spec "CORE_ICC_098" "graveyard_pool" "medium" @("hand", "graveyard", "hover") @("graveyardDeathrattleMinionsBothPlayers") "本局已死亡亡语随从：{cardNames}（{count}）" "墓穴潜伏者候选来自本局死亡亡语随从，需标出双方池。" -EmptyWarning
Add-Spec "CORE_EX1_190" "turn_graveyard_pool" "high" @("hand", "graveyard", "hover") @("friendlyGraveyardThisTurn") "本回合死亡友方随从：{cardNames}（{count}）" "怀特迈恩只复活本回合死亡友方随从。" -EmptyWarning
Add-Spec "CORE_REV_843" "attribute_progress" "high" @("hand", "hover") @("cumulativeAttackOfFriendlyMinionsDiedWhileThisEntityInHand", "infuseProgressByFriendlyDeathsWhileThisEntityInHand") "注能累计：+{cumulativeAttack}/+{cumulativeAttack}（友方死亡 {progress} 次）" "罪能魔像关键是累计死亡随从攻击力，而非简单进度。"
Add-Spec "CORE_REV_906" "infinite_infuse_counter" "high" @("deck", "hand", "hover") @("infiniteInfuseStacks", "currentBattlecryDamage") "无限注能累计：{infiniteInfuseStacks} 次；当前总伤害 {currentBattlecryDamage}" "德纳修斯是无限注能，没有 required 上限。"
Add-Spec "FIR_921" "hero_power_infuse_progress" "high" @("hand", "hover") @("heroPowerInfuseCountThisGame") "已灌注英雄技能：{heroPowerInfuseCountThisGame}/2；达成后抽 2 张" "该条件依赖英雄技能灌注次数，不是手牌注能死亡数。"
Add-Spec "EDR_860" "hero_power_infuse_progress" "high" @("hand", "hover") @("heroPowerInfuseCountThisGame") "已灌注英雄技能：{heroPowerInfuseCountThisGame}/2；达成后造成 4 点伤害" "该条件依赖英雄技能灌注次数。"
Add-Spec "EDR_888" "hero_power_infuse_progress" "high" @("hand", "hover") @("heroPowerInfuseCountThisGame") "已灌注英雄技能：{heroPowerInfuseCountThisGame}/4；达成后发现牌费用变为 1" "护路者玛洛恩阈值是英雄技能灌注 4 次。"
Add-Spec "TLC_603" "linked_card" "high" @("play", "board", "hand", "hover") @("linkedDrawnCardForThisEntity") "战吼抽到：{linkedCardName}；亡语会弃掉该牌" "栉龙亡语绑定战吼抽到的具体牌。"
Add-Spec "DINO_430" "linked_card" "high" @("play", "board", "graveyard", "hover") @("linkedLegendaryBeastForThisEntity") "已绑定野兽：{linkedCardName}（{attack}/{health}）；亡语召唤该牌" "塔卡亡语召唤战吼发现并绑定的具体野兽。"
Add-Spec "TLC_106" "graveyard_deathrattle_pool" "high" @("hand", "graveyard", "hover") @("friendlyGraveyardDeathrattleMinionsThisGame") "死亡友方亡语随从：{cardNames}（{count}，将触发最多 5 个）" "安布拉战吼质量由友方亡语墓地池决定。" -EmptyWarning
Add-Spec "END_004" "cost_progress" "high" @("deck", "hand", "hover") @("minionDeathsThisTurnBothPlayers", "currentCost") "本回合死亡随从：{count}；当前费用 {currentCost}" "愤怒残魂费用由双方本回合死亡随从数降低。"
Add-Spec "CATA_897" "linked_card" "high" @("play", "board", "graveyard", "hover") @("discardedCardLinkedToThisEntity") "已弃掉：{linkedCardName}；亡语回收并费用 -1" "宝石囤储者亡语返还战吼选中的具体弃牌。"
Add-Spec "CATA_616" "cost_progress" "high" @("deck", "hand", "hover") @("lastPlayedCardCost", "currentCost") "上一张已使用牌费用：{lastCost}；当前费用 {currentCost}" "戈隆巨人费用由上一张使用牌的费用决定。"
Add-Spec "CORE_CS3_029" "silver_hand_recruit_status" "medium" @("top_bar", "hover") @("silverHandRecruitBaseAttack", "silverHandRecruitBaseHealth", "silverHandRecruitBuffSources") "白银之手新兵：{attack}/{health}（来源：{buffSourceList}）" "圣骑士新兵永久增益需要合并显示，不应逐张分散。"
Add-Spec "CORE_REV_955" "silver_hand_recruit_pending_buff" "medium" @("top_bar", "hover") @("stewartNextRecruitBuffStacks") "待应用：下一个白银之手新兵 +3/+3 及亡语（{stacks} 层）" "斯图尔特是新兵汇总组件的待应用状态。"
Add-Spec "CORE_DMF_240" "silver_hand_recruit_status" "medium" @("top_bar", "hover") @("lothraxionEffectActive", "silverHandRecruitBuffSources") "白银之手新兵获得圣盾：{activeText}" "洛萨克森属于新兵汇总状态。"
Add-Spec "MEND_800" "silver_hand_recruit_status" "medium" @("top_bar", "hover") @("silverHandRecruitBaseAttack", "silverHandRecruitBuffSources") "白银之手新兵：{attack}/{health}（来源：{buffSourceList}）" "莽撞的战场军官并入新兵汇总组件。"
Add-Spec "MEND_801" "silver_hand_recruit_status" "medium" @("top_bar", "hover") @("silverHandRecruitBaseHealth", "silverHandRecruitBuffSources") "白银之手新兵：{attack}/{health}（来源：{buffSourceList}）" "坚定的救援者并入新兵汇总组件。"
Add-Spec "MEND_803" "silver_hand_recruit_status" "medium" @("top_bar", "hover") @("silverHandRecruitBaseAttack", "silverHandRecruitBaseHealth", "silverHandRecruitBuffSources") "白银之手新兵：{attack}/{health}（来源：{buffSourceList}）" "砺胆重剑并入新兵汇总组件。"
Add-Spec "CORE_BT_334" "played_spell_pool" "high" @("hand", "hover") @("spellsCastOnFriendlyCharactersThisGame") "将加入手牌的法术：{cardNames}（{count}）" "莉亚德琳依赖本局对友方角色施放过的法术。" -EmptyWarning
Add-Spec "TLC_430" "current_turn_holy_spells_cast" "medium" @("hand", "hover") @("holySpellsCastThisTurn") "本回合神圣法术：{cardNames}（{count}）" "圣窟生物需要本回合神圣法术池。"
Add-Spec "MEND_805" "turn_graveyard_pool" "high" @("hand", "graveyard", "hover") @("friendlyMinionsDiedThisTurn") "本回合死亡友方随从：{cardNames}（{count}）" "捐助依赖本回合友方随从死亡池。" -EmptyWarning
Add-Spec "CORE_ICC_213" "graveyard_pool" "high" @("hand", "graveyard", "hover") @("friendlyDeadMinionPoolThisGameUnique") "发现候选（本局死亡友方随从，去重）：{cardNames}；共 {distinctCount} 种" "永恒奴役发现池来自本局死亡友方随从。" -EmptyWarning
Add-Spec "CORE_AV_328" "deck_school_pool" "medium" @("deck", "hand", "hover") @("holySpellsRemainingInDeck", "shadowSpellsRemainingInDeck") "牌库剩余神圣法术 {holyCount} 张 / 暗影法术 {shadowCount} 张" "灵魂向导按法术派系定向抽牌。" -EmptyWarning
Add-Spec "CORE_LOOT_507" "graveyard_pool_and_upgrade_progress" "high" @("hand", "graveyard", "hover") @("spellsCastWhileThisEntityInHand", "spellstoneUpgradeState", "distinctFriendlyDeadMinionsThisGame") "升级 {progress}/4；可复活不同随从：{cardNames}" "小型法术钻石同时依赖手牌升级进度和不同死亡随从池。" -EmptyWarning
Add-Spec "TLC_819" "cost_condition_progress" "high" @("deck", "hand", "hover") @("holySpellsCastThisTurn", "shadowSpellsCastThisTurn", "currentCost") "本回合：神圣 {holyYesNo} / 暗影 {shadowYesNo}；当前费用 {currentCost}" "林歌海妖需要同回合神圣和暗影两个布尔条件。"
Add-Spec "TLC_818" "graveyard_pool_by_cost" "high" @("hand", "graveyard", "hover") @("friendlyDeadMinionsCost1", "friendlyDeadMinionsCost2", "friendlyDeadMinionsCost3") "1费：{cost1Names}；2费：{cost2Names}；3费：{cost3Names}" "轮回转生必须分 1/2/3 费三桶，空桶需要警告。" -EmptyWarning

# Rogue, Shaman, Warlock, Warrior.
Add-Spec "CORE_REV_750" "current_turn_stat_preview" "high" @("hand", "hover") @("otherCardsPlayedThisTurn") "本回合其他牌：{count}；幽灵 {attack}/{health}" "罪碑坟场身材由本回合其他出牌数决定。"
Add-Spec "CORE_REV_940" "current_turn_stat_preview" "high" @("hand", "hover") @("otherCardsPlayedThisTurn") "本回合其他牌：{count}；匕首 {attack}/3" "德拉卡武器攻击力由本回合其他出牌数决定。"
Add-Spec "CORE_GIL_598" "played_history_list" "high" @("deck", "hand", "hover") @("otherClassCardsPlayedThisGame") "将重放另一职业牌：{cardNames}" "苔丝依赖本局已使用另一职业牌列表。" -EmptyWarning
Add-Spec "EDR_540" "hand_card_history_highlight" "medium" @("hand", "hover") @("friendlyMinionCardsPlayedThisGame", "matchingMinionsInHand") "手牌中已使用过的随从：{cardNames}" "织网蛛抽牌触发依赖随从牌名是否已使用过。"
Add-Spec "CATA_481" "stored_opponent_cards" "high" @("play", "board", "hover") @("ursolathDevouredOpponentCardCount", "ursolathDormantTurnsRemaining", "knownDevouredOpponentCardsIfRevealed") "吞食数量：{count}；已知牌：{knownCardNames}；休眠剩余 {turns} 回合" "被吞食的对手手牌默认不可见，只能展示数量和已知信息。"
Add-Spec "CORE_MAW_003" "infuse_progress_by_tribe" "high" @("hand", "hover") @("friendlyTotemDeathsWhileThisEntityInHand", "infuseRequired", "infusedState") "图腾注能 {progress}/{required}；{effectText}" "图腾物证只统计在手期间友方图腾死亡。"
Add-Spec "CORE_BT_115" "last_turn_condition" "medium" @("hand", "hover") @("friendlySpellCastLastTurn") "上回合施放法术：{yesNo}" "沼泽之子战吼依赖上回合己方法术记录。"
Add-Spec "Core_UNG_211" "last_turn_condition" "medium" @("hand", "hover") @("elementalPlayedLastTurn") "上回合使用元素牌：{yesNo}" "卡利莫斯战吼依赖上回合元素使用记录。"
Add-Spec "CORE_ICC_090" "cost_progress" "high" @("deck", "hand", "hover") @("totalOverloadedCrystalsThisGame", "currentCost") "本局过载水晶：{count}；当前费用 {currentCost}" "雪怒巨人费用由累计过载水晶数决定。"
Add-Spec "END_030" "cost_progress" "high" @("deck", "hand", "hover") @("totalOverloadedCrystalsThisGame", "currentCost") "本局过载水晶：{count}；当前费用 {currentCost}" "失控龙蛙费用由累计过载水晶数决定。"
Add-Spec "CATA_563" "stored_card_state" "high" @("hand", "play", "board", "hover") @("eligibleSpellsInHandCostLte4", "absorbedSpellEntity") "可吸收法术：{eligibleSpells}；已吸收：{absorbedSpell}" "雷鸣流云打出前要知道可吸收目标，打出后要记住亡语法术。" -EmptyWarning
Add-Spec "CATA_567" "original_mapping" "high" @("play", "board", "hover") @("transformedMinionOriginalEntityMap") "死亡后召唤原随从：{originalMappings}" "升腾结算后需要记住每个变形随从对应的原随从。"
Add-Spec "CATA_568" "cost_progress" "high" @("deck", "hand", "hover") @("friendlyCharacterAttacksThisGame", "currentCost") "本局友方角色攻击：{count}；当前费用 {currentCost}" "穆拉丁的奋战费用由友方角色攻击次数决定。"
Add-Spec "CORE_MAW_002" "graveyard_pool" "high" @("hand", "graveyard", "hover") @("friendlyDeadMinionPoolThisGameUnique") "可发现复活：{cardNames}" "尸身保护令发现池来自本局死亡友方随从。" -EmptyWarning
Add-Spec "CORE_ICC_841" "attribute_progress" "high" @("deck", "hand", "hover") @("cardsDiscardedThisGame") "已弃牌：{cardsDiscardedThisGame}；当前攻击力加成 +{cardsDiscardedThisGame}" "兰娜瑟尔攻击力依赖本局弃牌次数。"
Add-Spec "CORE_REV_373" "last_relevant_card" "high" @("hand", "play", "board", "hover") @("lastShadowSpellCastByYou", "shadowWaltzTokenDeathrattleSpell") "上一个暗影法术：{cardName}" "暗脉女勋爵生成的阴影亡语会施放上一个暗影法术。"
Add-Spec "CORE_REV_372" "turn_condition" "medium" @("hand", "hover") @("minionDeathsThisTurnBothPlayers") "本回合已有随从死亡：{yesNo}；预计召唤 {summonCount} 个影子" "暗影华尔兹的额外召唤依赖本回合是否有随从死亡。"
Add-Spec "CORE_REV_835" "graveyard_pool_and_infuse_progress" "high" @("hand", "graveyard", "hover") @("friendlyDeadImpsThisGameUnique", "infuseProgressByFriendlyDeathsWhileThisEntityInHand", "infuseRequired", "infusedState") "可复活小鬼：{impCount}；注能 {progress}/{required}" "小鬼大王拉法姆需要分离小鬼墓地池和实体注能进度。" -EmptyWarning
Add-Spec "EDR_491" "turn_graveyard_deathrattle_pool" "high" @("hand", "graveyard", "hover") @("friendlyMinionsDiedThisTurnWithDeathrattles") "将获得亡语：{deathrattleTexts}" "荆棘大德鲁伊获得本回合死亡己方随从亡语。" -EmptyWarning
Add-Spec "END_018" "linked_card" "high" @("play", "board", "hand", "hover") @("infiniteCostLinkedHandCard", "linkedCardOriginalCost") "绑定牌：{linkedCardName}；原始费用 {originalCost}" "无穷助祭亡语恢复战吼绑定的手牌费用。"
Add-Spec "CATA_493" "attribute_progress" "high" @("deck", "hand", "hover") @("cardsDiscardedThisGame") "已弃牌：{cardsDiscardedThisGame}；当前加成 +{buff}/+{buff}" "地狱公爵身材由本局弃牌次数决定。"
Add-Spec "CATA_EVENT_002" "turn_condition" "high" @("hand", "hover") @("fireSpellsCastThisTurnByYou") "本回合已施放火焰法术：{yesNo}；战吼消灭：{readyText}" "怨毒焰魔战吼依赖本回合火焰法术状态。"
Add-Spec "EDR_455" "graveyard_pool" "high" @("hand", "graveyard", "hover") @("friendlyDeadDragonsThisGameUnique") "可发现龙：{cardNames}" "屈从疯狂发现池来自本局死亡友方龙。" -EmptyWarning
Add-Spec "EDR_465" "specific_minion_death_counter" "high" @("deck", "hand", "graveyard", "hover") @("ysendraDeathsThisGame") "伊森德雷已死亡：{count} 次；将召唤 {count} 条龙" "伊森德雷亡语规模随自身死亡次数增长。"
Add-Spec "TIME_714" "last_turn_history" "high" @("hand", "hover") @("opponentMinionsPlayedLastTurnStillInPlay") "可消灭：{cardNames}" "埃博克只消灭对手上回合打出且仍在场的随从。" -EmptyWarning
Add-Spec "TIME_850" "hand_pool" "high" @("hand", "play", "board", "hover") @("bloodsportMinionsInHand") "手牌中的血斗士：{cardNames}（{count}）" "血斗士洛戈什亡语需要按 BLOODSPORT 标签筛选手牌。" -EmptyWarning
Add-Spec "CATA_584" "turn_condition" "high" @("hand", "hover") @("fireSpellsCastThisTurnByYou") "本回合已施放火焰法术：{yesNo}；当前伤害 {damage}" "喷发火山与怨毒焰魔共用本回合火焰法术状态。"

$generatedAt = (Get-Date).ToUniversalTime().ToString("o")
$rejected = @()
$rejectedSeen = @{}
$totalKept = 0

Get-ChildItem -Path $CandidateDir -Filter "*.json" |
  Where-Object { $_.Name -notin @("rejected.json", "cleanup-summary.json") } |
  Sort-Object Name |
  ForEach-Object {
    $doc = Read-JsonFile $_.FullName
    if (-not $doc.cards) { return }
    $sourcePath = Join-Path $SourceDir $_.Name
    $sourceDoc = Read-JsonFile $sourcePath
    $sourceByCode = @{}
    foreach ($sourceCard in @($sourceDoc.cards)) {
      $sourceByCode[[string]$sourceCard.cardCode] = $sourceCard
    }

    $kept = @()
    foreach ($card in @($doc.cards)) {
      $code = [string]$card.cardCode
      $sourceCard = if ($sourceByCode.ContainsKey($code)) { $sourceByCode[$code] } else { $card }
      if ($removeReasons.ContainsKey($code)) {
        if (-not $rejectedSeen.ContainsKey($code)) {
          $rejected += [ordered]@{
            cardCode = $sourceCard.cardCode
            cardNameZhCN = $sourceCard.cardNameZhCN
            cardTextZhCNPlain = $sourceCard.cardTextZhCNPlain
            cardClass = $sourceCard.cardClass
            sourceFile = $_.Name
            rejectionReasonZhCN = $removeReasons[$code]
            auditSource = "data/cards/review/standard-extra-display-candidates/audit/audit-$($_.BaseName).md"
          }
          $rejectedSeen[$code] = $true
        }
        continue
      }

      $extra = if ($specific.ContainsKey($code)) { $specific[$code] } else { New-DefaultExtra $card }
      $kept += [ordered]@{
        rank = $sourceCard.rank
        sourceRank = $sourceCard.cardRank
        cardCode = $sourceCard.cardCode
        cardNameZhCN = $sourceCard.cardNameZhCN
        cardTextZhCN = $sourceCard.cardTextZhCN
        cardTextZhCNPlain = $sourceCard.cardTextZhCNPlain
        cardClass = $sourceCard.cardClass
        type = $sourceCard.type
        cost = $sourceCard.cost
        rarity = $sourceCard.rarity
        mechanics = @($sourceCard.mechanics)
        extraDisplay = $extra
      }
    }

    $doc.schemaVersion = 2
    $doc.generatedAt = $generatedAt
    $doc.purpose = "Actionable Standard extra-display candidate list after audit cleanup. Rejected cards are moved to rejected.json."
    $doc.source.inputDir = "data/cards/review/standard-history-sensitive"
    $doc.source.basedOn = "User audit under data/cards/review/standard-extra-display-candidates/audit plus follow-up cleanup."
    $doc.source.exclusionPolicy = "Remove cards whose extra display was explicitly rejected by audit; keep low-priority edge cases with audit notes."
    $doc.source.PSObject.Properties.Remove("explicitExclusionsNote")
    $doc.count = $kept.Count
    $doc.cards = @($kept | Sort-Object rank)
    $doc.reviewFields = @(
      "extraDisplay.schemaVersion: currently 2",
      "extraDisplay.auditDecision: keep for actionable candidates",
      "extraDisplay.displayType: canonical UI behavior category",
      "extraDisplay.implementationPriority: high/medium/low for implementation ordering",
      "extraDisplay.displaySurfaces: top_bar/hand/deck/play/board/graveyard/hover surfaces where state should appear",
      "extraDisplay.stateNeeded: concrete state keys from data/cards/schema/stateNeeded-vocabulary.md",
      "extraDisplay.emptyWarning: pool displays should warn when count is zero",
      "extraDisplay.notesZhCN: audit caveats and low-priority notes"
    )

    Write-JsonFile $_.FullName $doc 40
    $totalKept += $kept.Count
  }

Get-ChildItem -Path $SourceDir -Filter "*.json" | Sort-Object Name | ForEach-Object {
  $sourceDoc = Read-JsonFile $_.FullName
  foreach ($sourceCard in @($sourceDoc.cards)) {
    $code = [string]$sourceCard.cardCode
    if ($removeReasons.ContainsKey($code) -and -not $rejectedSeen.ContainsKey($code)) {
      $rejected += [ordered]@{
        cardCode = $sourceCard.cardCode
        cardNameZhCN = $sourceCard.cardNameZhCN
        cardTextZhCNPlain = $sourceCard.cardTextZhCNPlain
        cardClass = $sourceCard.cardClass
        sourceFile = $_.Name
        rejectionReasonZhCN = $removeReasons[$code]
        auditSource = "data/cards/review/standard-extra-display-candidates/audit/audit-$($_.BaseName).md"
      }
      $rejectedSeen[$code] = $true
    }
  }
}

$rejectedDoc = [ordered]@{
  schemaVersion = 1
  generatedAt = $generatedAt
  purpose = "Cards removed from standard-extra-display-candidates by audit cleanup."
  count = $rejected.Count
  cards = @($rejected | Sort-Object sourceFile, cardCode)
}
Write-JsonFile (Join-Path $CandidateDir "rejected.json") $rejectedDoc 20

[ordered]@{
  kept = $totalKept
  rejected = $rejected.Count
  outputDir = $CandidateDir
} | ConvertTo-Json -Depth 8
