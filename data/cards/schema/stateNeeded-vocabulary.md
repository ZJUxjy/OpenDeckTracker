# stateNeeded Vocabulary

This document defines the state keys used by
`data/cards/review/standard-extra-display-candidates/*.json`.

The goal is to keep card review data implementable. A `stateNeeded` entry must
name a real tracker state source, not a generic placeholder such as
`historyCounterForThisEffect` or `matchHistoryStateForThisEffect`.

## Naming Rules

- Use concrete counters or pools: `felSpellsCastThisGame`, `corpseCount`,
  `friendlyDeadDemonsThisGameUnique`.
- Entity-scoped state must say so in the name: `...WhileThisEntityInHand`,
  `...ForThisEntity`, `...LinkedToThisEntity`.
- Global history must not be reused for entity-scoped Infuse progress.
- Pool state must imply owner, scope, and filter. If the filter is card-specific,
  use `graveyardPool.<cardCode>`, `deckPool.<cardCode>`, or
  `cardState.<cardCode>` until a reusable key is promoted.
- Pool displays should support `emptyWarning` when count `0` means the effect can
  whiff or underperform.

## Shared Counters

| Key | Meaning |
|---|---|
| `corpseCount` | Current friendly corpse count. |
| `corpsesSpentThisGame` | Corpses spent by the player this game. |
| `corpsesSpentForQuest` | Corpses counted toward a corpse-spend Quest. |
| `friendlyMinionsDiedThisTurn` | Friendly minions that died this turn. |
| `minionDeathsThisTurnBothPlayers` | Minions from both players that died this turn. |
| `friendlyMinionDeathsThisGame` | Friendly minion death count this game. |
| `friendlyDemonDeathsThisGame` | Friendly Demon minion death count this game. |
| `cardsPlayedThisTurn` | Cards played by the player this turn. |
| `otherCardsPlayedThisTurn` | Cards played this turn excluding the inspected card. |
| `spellsCastThisGame` | Spells cast by the player this game. |
| `friendlySpellsCastThisTurn` | Spells cast by the player this turn. |
| `felSpellsCastThisGame` | Fel spells cast by the player this game. |
| `fireSpellsCastThisTurnByYou` | Fire spells cast by the player this turn. |
| `holySpellsCastThisTurn` | Holy spells cast by the player this turn. |
| `shadowSpellsCastThisTurn` | Shadow spells cast by the player this turn. |
| `totalOverloadedCrystalsThisGame` | Total mana crystals overloaded by the player this game. |
| `friendlyTotemsSummonedThisGame` | Friendly Totems summoned this game. |
| `heroPowerUsesThisGame` | Hero Power uses by the player this game. |
| `heroPowerUsedThisTurn` | Whether the player used the Hero Power this turn. |
| `heroPowerInfuseCountThisGame` | Times the player's Hero Power has been infused this game. |
| `cardsDiscardedThisGame` | Cards discarded by the player this game. |
| `friendlyCharacterAttacksThisGame` | Friendly character attacks this game. |
| `lastPlayedCardCost` | Cost of the player's most recently played card. |
| `friendlyTurnsTakenThisGame` | Number of turns taken by the player this game. |

## Entity-Scoped Progress

| Key | Meaning |
|---|---|
| `entityIdScopedCounter` | Marker that progress is stored per card entity, not per card id. |
| `infuseProgressByFriendlyDeathsWhileThisEntityInHand` | Standard Infuse progress for one hand entity. Implementation: `extraDisplay.infuseProgressByCardId[cardId].friendlyDeaths`. |
| `infuseProgressByFriendlyDemonDeathsWhileThisEntityInHand` | Demon-only Infuse progress for one hand entity. Implementation: `extraDisplay.infuseProgressByCardId[cardId].friendlyDemonDeaths`. |
| `friendlyBeastDeathsWhileThisEntityInHand` | Beast-only Infuse/progress while this entity is in hand. |
| `friendlyTotemDeathsWhileThisEntityInHand` | Totem-only Infuse progress while this entity is in hand. |
| `manaSpentWhileThisEntityInHand` | Mana spent while this hand entity has been held. |
| `minionPlayedWhileThisEntityInHand` | Whether a minion card was played while this hand entity was held. |
| `natureSpellCastWhileThisEntityInHand` | Whether a Nature spell was cast while this entity was held. |
| `playedCardMaxCostWhileThisEntityInHand` | Highest cost of a card played while this entity was held. |

## Graveyard Pools

| Key | Meaning |
|---|---|
| `friendlyDeadMinionPoolThisGameUnique` | Distinct friendly minion card ids that died this game. |
| `distinctFriendlyDeadMinionsThisGame` | Distinct friendly dead minions, used by effects requiring different minions. |
| `friendlyDeadDemonsThisGameUnique` | Distinct friendly Demons that died this game. |
| `friendlyDeadImpsThisGameUnique` | Distinct friendly Imps that died this game. |
| `friendlyDeadBeastsThisGameWeighted` | Friendly Beast death instances this game. |
| `friendlyDeadDragonsThisGameUnique` | Distinct friendly Dragons that died this game. |
| `friendlyDeadUndeadHighestCostPoolThisGame` | Highest-cost friendly Undead death pool. |
| `friendlyDeadTauntMinionsThisGameUnique` | Distinct friendly Taunt minions that died this game. |
| `friendlyDeadDeathrattleMinionsThisGameUnique` | Distinct friendly Deathrattle minions that died this game. |
| `friendlyDeadDeathrattleMinionsCostLte4Unique` | Friendly Deathrattle minions with cost <= 4 that died this game. |
| `friendlyDeadDeathrattleMinionsCostGte5Unique` | Friendly Deathrattle minions with cost >= 5 that died this game. |
| `graveyardDeathrattleMinionsBothPlayers` | Deathrattle minions from either player that died this game. |
| `friendlyGraveyardDeathrattleMinionsThisGame` | Friendly Deathrattle minions that died this game. |
| `friendlyGraveyardThisTurn` | Friendly minions that died this turn. |
| `friendlyMinionsDiedThisTurnWithDeathrattles` | Friendly minions that died this turn and had Deathrattle text. |
| `friendlyDeadMinionsCost1` | Friendly dead minions with cost 1. |
| `friendlyDeadMinionsCost2` | Friendly dead minions with cost 2. |
| `friendlyDeadMinionsCost3` | Friendly dead minions with cost 3. |
| `distinctFriendlyDeadMinionsCostGte8` | Distinct friendly dead minions with cost >= 8. |

## Deck Pools

| Key | Meaning |
|---|---|
| `deckPool.<cardCode>` | Card-specific deck pool. Use when no reusable pool key exists yet. |
| `beastsRemainingInDeck` | Beast cards remaining in the player's deck. |
| `deckMinionsRemaining` | Minion cards remaining in the player's deck. |
| `deathrattleMinionsRemainingInDeck` | Deathrattle minions remaining in deck. |
| `deathrattleCardsRemainingInDeck` | Deathrattle cards remaining in deck. |
| `holySpellsRemainingInDeck` | Holy spells remaining in deck. |
| `shadowSpellsRemainingInDeck` | Shadow spells remaining in deck. |

## Related-Card Highlights

| Key | Meaning |
|---|---|
| `felSpellsInHand` | Fel spells in hand. |
| `felSpellsInDeck` | Fel spells in deck. |
| `natureSpellsInHand` | Nature spells in hand. |
| `natureSpellsInDeck` | Nature spells in deck. |
| `spellsInHand` | Spell cards currently in hand. |
| `oneCostMinionsInHandAndDeck` | One-cost minions in hand and deck. |
| `oneCostSpellsInHandAndDeck` | One-cost spells in hand and deck. |
| `matchingMinionsInHand` | Hand minions matching a history condition. |

## Persistent And Linked State

| Key | Meaning |
|---|---|
| `topiorEffectActive` | Topior rest-of-game effect is active. |
| `dewProcessActiveCount` | Active Dew Process stacks. |
| `loRestOfGameEffectActive` | Lo, the Living Legend cost override is active. |
| `silverHandRecruitBaseAttack` | Current base attack for future Silver Hand Recruits. |
| `silverHandRecruitBaseHealth` | Current base health for future Silver Hand Recruits. |
| `silverHandRecruitBuffSources` | Sources contributing to Silver Hand Recruit status. |
| `stewartNextRecruitBuffStacks` | Pending Stewart buff stacks for the next Silver Hand Recruit. |
| `linkedDrawnCardForThisEntity` | Card drawn and linked to this entity. |
| `discardedCardLinkedToThisEntity` | Card discarded and linked to this entity. |
| `linkedLegendaryBeastForThisEntity` | Legendary Beast linked to this entity. |
| `transformedMinionOriginalEntityMap` | Mapping from transformed entities to original minions. |
| `absorbedSpellEntity` | Spell absorbed by this entity. |
| `bloodsportMinionsInHand` | Bloodsport-tagged minions in hand. |

## Card-Specific Fallbacks

The cleanup keeps some low-priority or edge candidates with namespaced fallback
keys:

- `cardState.<cardCode>`
- `counter.<cardCode>`
- `graveyardPool.<cardCode>`
- `linkedCard.<cardCode>`
- `globalEffect.<cardCode>`
- `relatedCards.<cardCode>`

These are acceptable in review data, but implementation should promote them to a
shared key once the exact state shape is known.
