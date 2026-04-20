# HearthMirror Field Paths — 12 IReflection Methods

> **Date:** 2026-04-20
> **Ground truth:** [HearthSim/HearthMirror](https://github.com/HearthSim/HearthMirror) `Reflection.cs` (repo private — field chains reconstructed from [Rewrite_Design.md §7](../../../Rewrite_Design.md), [HDT C# main repo](https://github.com/HearthSim/Hearthstone-Deck-Tracker), and prior spike reports)
> **Hearthstone client:** Unity 2021.3.x / Mono runtime (32-bit)
> **Verified against:** Build inferred from spike reports ([spike 01](../spikes/0001-hearthmirror-spike-report.md), [spike 02](../spikes/0002-hearthmirror-mono-spike-report.md))

---

## getBattleTag

**C# source:** `Reflection.GetBattleTag()` → accesses `BattleNet.BnetBattleTag`

**Chain:**
```
ServiceManager.s_runtimeServices (or s_dynamicServices fallback)
  → lookup service "Blizzard.T5.NetCache.NetCache" (or class-based singleton NetCache.s_instance)
    → m_netCacheValues : Dictionary<System.Type, NetCacheBase>
      → lookup key = typeof(NetCacheBattleTag)
        → .BattleTag : BnetBattleTag
          → .m_name : string        → name
          → .m_string : string      → fullBattleTag (e.g. "Player#12345")
```

**Collections:** `Dictionary<Type, NetCacheBase>` — standard .NET Dictionary, entry_size = 16 (hash 4 + next 4 + key ptr 4 + value ptr 4)

**Simplified (singleton) approach:**
```
NetCache.s_instance
  → m_netCacheValues[NetCacheBattleTag]
    → BattleTag.m_name, BattleTag.m_string
```

---

## getAccountId

**C# source:** `Reflection.GetAccountId()`

**Chain:**
```
NetCache.s_instance
  → m_accountId : BnetAccountId
    → .m_hi : long (i64)      → hi
    → .m_lo : long (i64)      → lo
```

**Collections:** None (scalar fields)

---

## getMedalInfo

**C# source:** `Reflection.GetMedalInfo()` → `NetCacheMedalInfo`

**Chain:**
```
NetCache.s_instance
  → m_netCacheValues[NetCacheMedalInfo]
    → .Standard : MedalInfoData
      → .LeagueId : int
      → .StarLevel : int
      → .Stars : int (earned stars)
      → .LegendRank : int (0 if not legend)
      → .SeasonId : int
      → .SeasonWins : int
    → .Wild : MedalInfoData (same fields)
    → .Classic : MedalInfoData (same fields)
    → .Twist : MedalInfoData (same fields)
```

**Collections:** None (4 embedded sub-objects)

---

## getMatchInfo

**C# source:** `Reflection.GetMatchInfo()` → `GameMgr.Get().GetMatchInfo()`

**Chain:**
```
GameMgr.s_instance
  → m_lastMatchInfo : MatchInfo (or via GetLastMatchInfo())
    → .LocalPlayer : MatchPlayer
      → .m_id : int
      → .m_name : string
      → .m_accountId : BnetAccountId { m_hi, m_lo }
      → .m_battleTag : BnetBattleTag { m_name, m_string }
      → .m_standardRank : int
      → .m_wildRank : int
      → .m_classicRank : int
      → .m_twistRank : int
    → .OpposingPlayer : MatchPlayer (same fields)
    → .MissionId : int
    → .GameType : int (enum GameType)
    → .FormatType : int (enum FormatType)
```

**Collections:** None (2 embedded MatchPlayer sub-objects)

---

## getGameType

**C# source:** `Reflection.GetGameType()` → `GameState.Get().GetGameType()`

**Chain:**
```
GameState.s_instance
  → m_gameEntity : Entity (or direct field)
    → GetTag(GAME_TYPE) → int
  (Simplified: GameState.s_instance → m_gameType : int)
```

**Collections:** None (scalar)

---

## isSpectating

**C# source:** `Reflection.IsSpectating()` → `GameState.Get().IsSpectating()`

**Chain:**
```
GameState.s_instance
  → m_isSpectator : bool
```

**Collections:** None (scalar)

---

## isGameOver

**C# source:** `Reflection.IsGameOver()` → `GameState.Get().IsGameOver()`

**Chain:**
```
GameState.s_instance
  → m_gameOver : bool
```

**Collections:** None (scalar)

---

## getDecks

**C# source:** `Reflection.GetDecks()` → `CollectionManager.Get().GetDecks()`

**Chain:**
```
CollectionManager.s_instance
  → m_decks : Map<long, CollectionDeck> (or similar)
    → each CollectionDeck:
      → .m_id : long (i64)
      → .m_name : string
      → .HeroCardID : string (hero card dbf string)
      → .m_formatType : int (enum FormatType)
      → .m_deckType : int (enum DeckType)
      → .m_slots : List<DeckCardData>
        → each DeckCardData:
          → .m_cardId : string (or DbfId : int)
          → .m_count : int
          → .m_premium : int (golden/diamond/signature)
```

**Collections:** `Map<long, CollectionDeck>` (Hearthstone custom map) + `List<DeckCardData>` per deck

**Note:** This method requires MetadataReader for generic `List<T>` field resolution. Blocked on `add-hearthmirror-metadata-reader`.

---

## getCollection

**C# source:** `Reflection.GetCollection()` → `CollectionManager.Get().GetAccountCards()`

**Chain:**
```
CollectionManager.s_instance
  → m_collectibleCards : Map<string, CollectibleCard> (or similar)
    → each entry:
      → .DbfId : int      → dbfId
      → .Count : int      → count
      → .Premium : int    → premium
```

**Collections:** `Map` or `Dictionary` with card IDs as keys

**Note:** Requires MetadataReader for generic collection field resolution. Blocked on `add-hearthmirror-metadata-reader`.

---

## getArenaDeck

**C# source:** `Reflection.GetArenaDeck()` → `DraftManager.s_instance.GetDraftDeck()`

**Chain:**
```
DraftManager.s_instance
  → m_currentDeck : CollectionDeck (same as getDecks entry)
  → m_wins : int
  → m_losses : int
```

**Collections:** `List<DeckCardData>` inside the deck (same as getDecks)

---

## getBattlegroundRatingInfo

**C# source:** `Reflection.GetBattlegroundRatingInfo()`

**Chain:**
```
BaconRatingMgr.s_instance (or via ServiceLocator)
  → m_lastRatingResponse : BattlegroundRatingInfo
    → .Rating : int        → rating
    → .LeaderboardPlace : int  → rank (leaderboard position)
```

**Collections:** None (scalar fields)

---

## getServerInfo

**C# source:** `Reflection.GetServerInfo()` → `Network.s_instance`

**Chain:**
```
Network.s_instance
  → m_currentServerInfo : GameServerInfo
    → .Address : string      → address
    → .Port : int           → port
    → .Mission : int        → mission
    → .GameHandle : int     → gameHandle
    → .Version : string     → version
    → .Resumable : bool     → resumable
```

**Collections:** None (scalar fields)

---

## Summary: Singleton Classes Needed

| Method | Entry Class | Access Pattern |
|--------|------------|---------------|
| getBattleTag | `NetCache` | `s_instance → m_netCacheValues[NetCacheBattleTag]` |
| getAccountId | `NetCache` | `s_instance → m_accountId` |
| getMedalInfo | `NetCache` | `s_instance → m_netCacheValues[NetCacheMedalInfo]` |
| getMatchInfo | `GameMgr` | `s_instance → m_lastMatchInfo` |
| getGameType | `GameState` | `s_instance → m_gameType` |
| isSpectating | `GameState` | `s_instance → m_isSpectator` |
| isGameOver | `GameState` | `s_instance → m_gameOver` |
| getDecks | `CollectionManager` | `s_instance → m_decks` |
| getCollection | `CollectionManager` | `s_instance → m_collectibleCards` |
| getArenaDeck | `DraftManager` | `s_instance → m_currentDeck` |
| getBattlegroundRatingInfo | `BaconRatingMgr` | `s_instance → m_lastRatingResponse` |
| getServerInfo | `Network` | `s_instance → m_currentServerInfo` |

All use the **singleton pattern** via `ClassName.s_instance` static field read.
