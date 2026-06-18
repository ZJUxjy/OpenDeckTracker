# macOS Deck Recognition — Design

- **Date:** 2026-06-17
- **Status:** Approved (design); pending implementation plan
- **Branch:** `feat/macos-deck-recognition` (off `feat/macos-overlay`)
- **Related:** `2026-06-17-macos-overlay-design.md` (the overlay window; this feature fills in the deck *data* the overlay renders)

## Context

On macOS the overlay window now shows over Hearthstone (separate feature), but the
deck panels are empty: the tracker reports `phase=IDLE deck=null friendlyDeckCount=0`
for the whole match. Two investigations (our own tracker + the HSTracker reference)
established why and what to do.

The HearthMirror memory reader is Windows-only and stubbed on macOS
(`getDecks`/`getSelectedDeckId`/`getMatchInfo`/`getDeckState` → null). Three things
depend on it and therefore break on macOS:

1. **Phase never advances.** `phase-machine.ts` `nextPhase` is driven only by mirror
   signals (`getMatchInfo`, `getDeckState`), evaluated in the core tracker's `tick()`.
   Both null on mac → phase stuck at `IDLE`, which gates match-start, deck-identify,
   the deck-select dialog, and match-end.
2. **No way to set the player's deck.** Every path to `originalDeck`
   (`selectDeckById`, auto-identify) resolves against `mirror.getDecks()`.
   `selectSavedDeck` sets only stats attribution, not `originalDeck`.
3. **Player identity is mirror-seeded.** `localPlayer.controllerId` comes from
   `applyMatchInfo` (`getMatchInfo`); on mac it stays at the default, so
   friendly/opposing bucketing is unreliable.

What already works mirror-free (confirmed): the Power.log → tracker event pipeline,
entity/zone reconstruction, the **remaining-count engine** (`originalDeck − seen`,
fully log-driven with null-`deckState` fallbacks), opponent revealed/graveyard, the
local deck library (`DeckStore`) + deckstring import, and the overlay visibility
signal.

**HSTracker confirms the approach:** HSTracker does *all* phase/state detection from
the Power.log (zero memory) and computes remaining purely from log zone-transitions.
Its *only* true memory dependency is *which constructed deck the player selected* —
because **Hearthstone never writes the selected deck to the Power.log**. HSTracker
reads it from process memory, which is possible on macOS only via the
`com.apple.security.cs.debugger` entitlement on a signed, un-sandboxed app — not an
option here. HSTracker's fallback (manually-set, persisted active deck) is exactly the
path we adopt.

## Goals

- On macOS, with no memory mirror, the tracker recognizes the player's deck and shows
  remaining cards during a match, plus opponent revealed cards — driven entirely by
  the Power.log + a user-selected active deck.
- Windows behavior is completely unchanged (mirror still authoritative).

## Non-goals

- No macOS port of the memory mirror.
- No auto-detection of the player's chosen deck from logs (impossible — HS doesn't log
  it). A manual active-deck step is required, by design.
- No spectator tracking on macOS (MVP).
- No packaging/CI changes (dev-first, consistent with the overlay milestone).

## Decisions

- **D1 — Activation: "mirror-absent mode."** A single predicate (mirror not
  alive / stub / `getMatchInfo` persistently null) switches the tracker to
  log-driven phase + log-seeded identity. The log-derived signals are used only as
  *fallbacks when the corresponding mirror signal is null*, so the merge is safe on
  both platforms and Windows is untouched.
- **D2 — Active deck UX: persisted "current deck" + graceful no-deck fallback**
  (HSTracker-style). The user imports decks via deck code (existing flow) and marks
  one as the current deck; it persists as last-used and auto-applies at the next
  match. No per-match popup. With no deck set, the overlay still shows "cards observed
  leaving your deck."
- **D3 — Route 1 for phase:** feed log-derived signals into the *existing* pure
  `nextPhase` rather than building a parallel phase system or a fake mirror.

## Architecture — four isolated bridges

Everything else (phase machine, remaining engine, DeckStore, deckstring import,
overlay) is reused unchanged. The new work is four small, independently-testable
bridges, active only in mirror-absent mode.

### Data flow (macOS, mirror absent)

```
Power.log ─▶ hearthwatcher ─▶ forwardPowerEventToDeckTracker
   ├─ (existing) entity/zone state + opponent revealed
   ├─ (Bridge 1) phase signals ─▶ nextPhase advances IDLE→PRE_MATCH→IN_MATCH→POST_MATCH
   │                                  └─ match-start ─▶ (Bridge 2) apply active deck ─▶ setOriginalDeck
   │                                        └─ (existing) remaining = originalDeck − seen ─▶ overlay
   └─ (Bridge 3) HAND entities w/ known cardId ─▶ localControllerId (friendly/opposing bucketing)
active deck: deckstring import ─▶ DeckStore (existing) ─▶ user "set current" (Bridge 2 persist) ─▶ apply at match-start
no active deck ─▶ (Bridge 4) show observed-leaving cards
```

### Bridge 1 — log-driven phase

`nextPhase(current, { hasMatchInfo, hasDeckState, isGameOver, isSpectating })` is pure
and unchanged. We change where the 4 signals come from when the mirror is absent:

| Signal | Mirror (Windows) | Log-derived (mac) |
|---|---|---|
| `hasMatchInfo` | `getMatchInfo() != null` | `create-game` seen AND not complete (the existing `liveMatchActive`/STEP gate) |
| `hasDeckState` | `getDeckState() != null` | a real-match STEP reached — reuse `isRealMatchStepValue` (deck-tracker.ts:712) |
| `isGameOver` | `isGameOver()` | GameEntity `STATE=COMPLETE` / `STEP=FINAL_GAMEOVER` — reuse `isPowerGameComplete` (hearthwatcher-host.ts:107) |
| `isSpectating` | `isSpectating()` | `false` (MVP) |

- The core `DeckTracker` maintains `logMatchState { created, inPlay, complete }`,
  updated from the Power.log events it already receives (`create-game` → created;
  real-match STEP → inPlay; complete tags → complete; reset on `create-game`).
- Phase evaluation merges per-signal: `mirrorSignal ?? logSignal`
  (e.g. `hasMatchInfo = mirrorMatchInfo != null || (logMatchState.created && !logMatchState.complete)`).
  Windows: mirror wins. mac: logs drive.
- **Evaluation trigger:** today phase is evaluated in the mirror poll `tick()`. To not
  depend on the mirror loop in mirror-absent mode, also evaluate `nextPhase` right
  after a phase-relevant log event (`create-game` / GameEntity `STEP`/`STATE`). The
  plan confirms whether `tick()` already runs on mac and chooses tick-only,
  event-driven, or both.

### Bridge 2 — active-deck persistence + apply, and no-deck fallback

Reuses the existing public `setOriginalDeck({ deckId, name, originalDeck })` and
`DeckSnapshot.fromDeckCards(DeckCard[])`; `DeckStore.getById(id)` already returns
`cards: DeckCard[]` — the exact shape.

- **Persist:** new `activeDeckId` setting (a `DeckStore` string id), restored on
  launch. New IPC `decks:set-active` / `decks:get-active`. The renderer Decks tab
  gains a **"Set as current deck"** action.
- **Apply (host-owned; core stays decoupled):** the desktop host subscribes to the
  tracker's phase transition; on match-start, when `originalDeck` is null and an
  `activeDeckId` is set:
  ```
  const d = deckStore.getById(activeDeckId)
  tracker.setOriginalDeck({ deckId: null, name: d.name,
                            originalDeck: DeckSnapshot.fromDeckCards(d.cards) })
  tracker.selectSavedDeck(d.id, d.version)   // stats attribution (additive)
  ```
  Windows is untouched: its mirror auto-identify still runs; this host bridge only
  acts when no deck was identified (mirror-absent).
- **Edge:** if the user sets/changes the current deck mid-match, apply immediately;
  otherwise it takes effect next match.
- **Bridge 4 — no-deck fallback:** with no `activeDeckId`, `originalDeck` stays null
  and the overlay shows "cards observed leaving your deck" (revealed/known), no full
  30-card list. The plan verifies the remaining engine yields this for null
  `originalDeck` and adds the small fallback if not.

### Bridge 3 — local player identity from logs (highest risk)

All bucketing keys off `localPlayer.controllerId`, currently seeded by
`applyMatchInfo` (mirror). Log-only heuristic:

> **`localControllerId` = the `controllerId` of the initial HAND-zone entities that
> have a non-empty `cardId`.** (The client logs *your* cards' ids; the opponent's
> hand/deck cards are logged with empty cardId.)

The host already exposes per-entity `{ zone, controllerId, cardId }`
(deck-tracker.ts:1063), so inputs exist.

- A small **`LocalPlayerResolver`**: after `create-game`, the first controller with a
  known cardId entering `HAND`/`DECK` is the local player; resolve once per game,
  reset on `create-game`.
- Seed `Game.localPlayer.controllerId` (and hearthwatcher's `localControllerId` if the
  snapshot path uses it) from the resolver — **only in mirror-absent mode**; mirror
  `applyMatchInfo` wins on Windows.
- **Pending state:** until resolved, hold bucketing rather than guess; in practice the
  local hand is revealed at mulligan, so resolution is early.
- **Risk & mitigation:** highest-uncertainty bridge (the Coin, mulligan replacement,
  reconnects, first-player). Must be validated against **real captured Power.log
  fixtures** (the repo supports this: `card-played-detector.live-log.test.ts`,
  `power-basic-game.log`). The plan captures a fresh mac-match fixture and asserts
  correct resolution + remaining. If shaky, fall back to the no-deck "observed-leaving"
  display.

## Error handling / degradation

- Each bridge degrades to "today's behavior" if it can't act: phase stays IDLE only if
  no log signals (then overlay simply doesn't populate); no active deck → observed-only
  display; unresolved local player → hold bucketing. No new crash paths; Windows
  unaffected (mirror-first merges).

## Testing

**Automated (vitest, all mirror-free):**
- **Bridge 1:** PowerEvent sequence → `logMatchState` → merged `PhaseSignals` →
  `nextPhase` advances IDLE→PRE_MATCH→IN_MATCH→POST_MATCH→IDLE in mirror-absent mode;
  and mirror-present → mirror wins (Windows path).
- **Bridge 2:** host apply-on-match-start calls `setOriginalDeck(fromDeckCards(cards))`
  (injected fake tracker + DeckStore); core: `setOriginalDeck` then DECK→HAND draw
  events → remaining decrements; `activeDeckId` set/get round-trip; no-deck fallback
  shows observed cards.
- **Bridge 3:** `LocalPlayerResolver` resolves correct `localControllerId` from HAND
  entities (one controller known cardIds, other empty); resets on `create-game`;
  pending until resolved.
- **Real-log fixture (key):** capture a Power.log from a real mac match; feed
  hearthwatcher-parse → deck-tracker (mirror-absent); assert phase advances, local
  player resolved, remaining decrements, opponent revealed grows.

**Manual verification (macOS — the real proof):**
1. Import a deck via deck code (existing `DeckImportDialog`).
2. Mark it the current deck (new Decks-tab action).
3. Open Hearthstone, enter a match.
4. Dev log: `[deck-tracker]` phase leaves IDLE (→PRE_MATCH→IN_MATCH);
   `deck=<your deck> friendlyDeckCount>0`; remaining decrements as you draw.
5. Overlay shows your remaining cards + opponent revealed cards.
6. Clear the current deck → overlay shows only observed-leaving cards.
7. Windows regression: mirror path still drives phase/deck (typecheck + unit tests;
   the mirror-first merge guarantees it).

**Test-infra prerequisite:** `esbuild@0.21.5` in the repo `node_modules` is corrupted
(the binary at that path reports `0.27.7`), so vitest fails to start. Run the TS suite
with `ESBUILD_BINARY_PATH` pointed at a working 0.21.5 binary
(`.worktrees/feat-card-image-bulk-download/node_modules/.pnpm/@esbuild+darwin-arm64@0.21.5/node_modules/@esbuild/darwin-arm64/bin/esbuild`),
or repair the install (`pnpm rebuild esbuild` / reinstall). Cargo/Rust is unaffected.

## Risks / open questions

- **Bridge 3 heuristic robustness** — the main risk; mitigated by real-log fixtures
  and the observed-only fallback.
- **`tick()` cadence in mirror-absent mode** — the plan confirms whether the poll loop
  runs on mac; if not, phase is evaluated event-driven.
- **Wrong-deck if the user forgets to switch the current deck** — accepted (HSTracker
  has the same limitation); a future enhancement could detect a drawn card not in the
  active deck and prompt.

## Out of scope / future

- Auto-prompt deck picker at match start; drawn-card mismatch detection.
- Spectator tracking; Battlegrounds/Arena specifics.
- Memory-mirror port; packaging.
